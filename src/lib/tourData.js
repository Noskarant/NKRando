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

function stitchSegments(members = []) {
  const segments = members
    .filter(m => Array.isArray(m.geometry) && m.geometry.length > 1)
    .map(m => m.geometry
      .map(p => ({ lat: Number(p.lat), lon: Number(p.lon) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon)))
    .filter(s => s.length > 1)

  if (!segments.length) return []

  const points = [...segments.shift()]
  while (segments.length) {
    const last = points[points.length - 1]
    let best = 0
    let reverse = false
    let bestD = Infinity

    for (let i = 0; i < segments.length; i++) {
      const a = tourDistance(last, segments[i][0])
      const b = tourDistance(last, segments[i][segments[i].length - 1])
      if (a < bestD) { bestD = a; best = i; reverse = false }
      if (b < bestD) { bestD = b; best = i; reverse = true }
    }

    let seg = segments.splice(best, 1)[0]
    if (reverse) seg = seg.reverse()
    if (tourDistance(points[points.length - 1], seg[0]) < 40) seg = seg.slice(1)
    points.push(...seg)
  }

  if (points.length <= 1200) return points
  const step = (points.length - 1) / 1199
  return Array.from({ length: 1200 }, (_, i) => points[Math.round(i * step)])
}

function routeLength(points = []) {
  let total = 0
  for (let i = 1; i < points.length; i++) total += tourDistance(points[i - 1], points[i])
  return total
}

export function normalizeTourData(data, center = null) {
  return (data?.elements || [])
    .map(el => {
      const points = stitchSegments(el.members || [])
      if (points.length < 2) return null
      const tags = el.tags || {}
      const first = points[0]
      const last = points[points.length - 1]
      let closest = points[Math.floor(points.length / 2)]
      let closestDistance = center ? Infinity : 0
      if (center) {
        const stride = Math.max(1, Math.floor(points.length / 240))
        for (let i = 0; i < points.length; i += stride) {
          const d = tourDistance(center, points[i])
          if (d < closestDistance) { closestDistance = d; closest = points[i] }
        }
      }
      return {
        id: 'osm-' + el.id,
        osmId: el.id,
        named: Boolean(tags.name || tags.ref),
        name: tags.name || tags.ref || 'Itinéraire randonnée',
        ref: tags.ref || '',
        network: tags.network || '',
        operator: tags.operator || '',
        distance: routeLength(points),
        roundTrip: tourDistance(first, last) < 250,
        center: closest,
        centerDistance: center ? closestDistance : Infinity,
        points
      }
    })
    .filter(Boolean)
    .filter(t => t.distance >= 800)
    .sort((a, b) => {
      const ad = Number.isFinite(a.centerDistance) ? a.centerDistance : Infinity
      const bd = Number.isFinite(b.centerDistance) ? b.centerDistance : Infinity
      if (Math.abs(ad - bd) > 1200) {
        return ad - bd
      }
      if (a.named !== b.named) return a.named ? -1 : 1
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
    return normalizeTourData(data, { lat, lon })
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}
