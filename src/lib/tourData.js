const rad = d => d * Math.PI / 180

export function tourDistance(a, b) {
  const R = 6371000
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const la1 = rad(a.lat)
  const la2 = rad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function buildTourQuery(lat, lon, radius = 16000, limit = 60) {
  return `[out:json][timeout:12];
    relation(around:${Math.round(radius)},${lat},${lon})["type"="route"]["route"~"^(hiking|foot)$"];
    out body geom ${limit};`
}

// OpenStreetMap relations contain unordered ways. Join only geometrically connected
// endpoints, never invent straight-line links across missing trail sections.
export function stitchSegments(members = []) {
  const remaining = members
    .filter(m => Array.isArray(m.geometry) && m.geometry.length > 1)
    .map(m => m.geometry
      .map(p => ({ lat:Number(p.lat), lon:Number(p.lon) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180))
    .filter(p => p.length > 1)
  if (!remaining.length) return { points:[], coverage:0 }

  const overallLength = remaining.reduce((sum, points) => sum + routeLength(points), 0)
  const chains = []
  while (remaining.length) {
    let first = 0
    for (let i = 1; i < remaining.length; i++) {
      if (routeLength(remaining[i]) > routeLength(remaining[first])) first = i
    }
    let points = [...remaining.splice(first, 1)[0]]
    let connectedLength = routeLength(points)
    while (remaining.length) {
      let candidate = null
      for (let i = 0; i < remaining.length; i++) {
        const part = remaining[i]
        const start = points[0], end = points[points.length - 1]
        for (const match of [
          { i, side:'end', reverse:false, gap:tourDistance(end, part[0]) },
          { i, side:'end', reverse:true, gap:tourDistance(end, part[part.length - 1]) },
          { i, side:'start', reverse:false, gap:tourDistance(start, part[part.length - 1]) },
          { i, side:'start', reverse:true, gap:tourDistance(start, part[0]) }
        ]) if (match.gap <= 60 && (!candidate || match.gap < candidate.gap)) candidate = match
      }
      if (!candidate) break
      const part = remaining.splice(candidate.i, 1)[0]
      connectedLength += routeLength(part)
      const joined = candidate.reverse ? part.reverse() : part
      if (candidate.side === 'end') points.push(...(candidate.gap <= 10 ? joined.slice(1) : joined))
      else points = [...(candidate.gap <= 10 ? joined.slice(0, -1) : joined), ...points]
    }
    chains.push({ points, length:routeLength(points), connectedLength })
  }
  chains.sort((a, b) => b.length - a.length)
  const best = chains[0]
  const coverage = overallLength ? Math.min(1, best.connectedLength / overallLength) : 0
  const points = best.points.length <= 1200 ? best.points : Array.from(
    { length:1200 }, (_, i) => best.points[Math.round(i * (best.points.length - 1) / 1199)]
  )
  return { points, coverage }
}

function routeLength(points = []) {
  let total = 0
  for (let i = 1; i < points.length; i++) total += tourDistance(points[i - 1], points[i])
  return total
}

export function normalizeTourData(data, center = null, searchRadius = Infinity) {
  return (data?.elements || [])
    .map(el => {
      const tags = el.tags || {}
      // Only named/ref'd OSM hiking-route relations, not invented proposals.
      if (!tags.name && !tags.ref) return null
      const { points, coverage } = stitchSegments(el.members || [])
      if (points.length < 2 || coverage < 0.65) return null
      const distance = routeLength(points)
      if (distance < 1000 || distance > 45000) return null
      const first = points[0], last = points[points.length - 1]
      let closest = points[Math.floor(points.length / 2)]
      let closestDistance = center ? Infinity : 0
      if (center) {
        for (const p of points) {
          const d = tourDistance(center, p)
          if (d < closestDistance) { closestDistance = d; closest = p }
        }
        if (closestDistance > searchRadius + 1500) return null
      }
      const partial = coverage < .95
      return {
        id:'osm-' + el.id,
        osmId:el.id,
        named:true,
        name:tags.name || tags.ref,
        ref:tags.ref || '',
        network:tags.network || '',
        operator:tags.operator || '',
        distance,
        roundTrip:!partial && tourDistance(first, last) < 250,
        partial,
        center:closest,
        centerDistance:center ? closestDistance : Infinity,
        points
      }
    })
    .filter(Boolean)
    .sort((a, b) => {
      const ad = Number.isFinite(a.centerDistance) ? a.centerDistance : Infinity
      const bd = Number.isFinite(b.centerDistance) ? b.centerDistance : Infinity
      if (Math.abs(ad - bd) > 1200) return ad - bd
      if (a.partial !== b.partial) return a.partial ? 1 : -1
      if (a.roundTrip !== b.roundTrip) return a.roundTrip ? -1 : 1
      return a.distance - b.distance
    })
    .slice(0, 60)
}

export async function fetchOverpassTours(lat, lon, radius = 16000, {
  timeoutMs = 12000,
  fetchImpl = fetch
} = {}) {
  const query = buildTourQuery(lat, lon, radius, 60)
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
  ]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const data = await Promise.any(endpoints.map(async endpoint => {
      const r = await fetchImpl(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'user-agent': 'NKRando/0.1 hiking route browser'
        },
        body: new URLSearchParams({ data: query }).toString()
      })
      if (!r.ok) throw new Error(`${endpoint}: HTTP ${r.status}`)
      return r.json()
    }))
    controller.abort()
    return normalizeTourData(data, { lat, lon }, radius)
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}


// Independent public OSM trail index. Used when Overpass is overloaded.
// Limit requested route geometries to keep within TrailSplits' keyless fair-use budget.
export async function fetchTrailSplitsTours(lat, lon, radius = 16000, {
  timeoutMs = 8500,
  fetchImpl = fetch
} = {}) {
  const latDelta = Math.min(0.4, radius / 111000)
  const lonDelta = Math.min(0.6, radius / (111000 * Math.max(.2, Math.cos(rad(lat)))))
  const bbox = new URL('https://api.trailsplits.com/trails/v1/bbox')
  bbox.searchParams.set('min_lat', String(lat - latDelta))
  bbox.searchParams.set('max_lat', String(lat + latDelta))
  bbox.searchParams.set('min_lng', String(lon - lonDelta))
  bbox.searchParams.set('max_lng', String(lon + lonDelta))
  bbox.searchParams.set('type', 'hiking')
  bbox.searchParams.set('limit', '45')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const getJson = async url => {
    const response = await fetchImpl(url, { signal:controller.signal })
    if (!response.ok) throw new Error('Trail index: HTTP ' + response.status)
    return response.json()
  }
  try {
    const listed = await getJson(bbox)
    const center = { lat, lon }
    const candidates = (listed?.features || [])
      .filter(feature => {
        const props = feature.properties || {}
        return Number.isInteger(Number(props.osm_relation_id)) && !!props.name &&
          (!Number.isFinite(Number(props.distance_m)) || Number(props.distance_m) <= 45000)
      })
      .sort((a, b) => {
        const distance = feature => {
          const coords = feature.geometry?.coordinates
          return Array.isArray(coords) && coords.length >= 2
            ? tourDistance(center, {lon:Number(coords[0]),lat:Number(coords[1])}) : Infinity
        }
        return distance(a) - distance(b)
      })
      .slice(0, 6)

    const relations = []
    // Two batches of up to three; the unauthenticated endpoint is rate limited.
    for (let i = 0; i < candidates.length; i += 3) {
      const batch = await Promise.allSettled(candidates.slice(i, i + 3).map(async feature => {
        const osmId = Number(feature.properties.osm_relation_id)
        const detail = await getJson('https://api.trailsplits.com/trails/v1/relation/' + osmId)
        const geom = detail?.geometry
        const coords = geom?.type === 'MultiLineString'
          ? geom.coordinates : geom?.type === 'LineString' ? [geom.coordinates] : []
        return {
          id:osmId,
          tags:{
            name:detail?.properties?.name || feature.properties.name,
            ref:detail?.properties?.ref || '',
            network:detail?.properties?.network || ''
          },
          members:coords.map(line => ({
            geometry:line.map(c => ({ lon:Number(c[0]), lat:Number(c[1]) }))
          }))
        }
      }))
      batch.forEach(result => { if (result.status === 'fulfilled') relations.push(result.value) })
    }
    return normalizeTourData({ elements:relations }, center, radius)
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}
