const rad = d => d * Math.PI / 180

function dist(a, b) {
  const R = 6371000
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const la1 = rad(a.lat), la2 = rad(b.lat)
  const h = Math.sin(dLat/2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon/2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function stitchSegments(members = []) {
  const segments = members
    .filter(m => Array.isArray(m.geometry) && m.geometry.length > 1)
    .map(m => m.geometry.map(p => ({ lat: Number(p.lat), lon: Number(p.lon) }))
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
      const a = dist(last, segments[i][0])
      const b = dist(last, segments[i][segments[i].length - 1])
      if (a < bestD) { bestD = a; best = i; reverse = false }
      if (b < bestD) { bestD = b; best = i; reverse = true }
    }

    let seg = segments.splice(best, 1)[0]
    if (reverse) seg = seg.reverse()
    if (dist(points[points.length - 1], seg[0]) < 40) seg = seg.slice(1)
    points.push(...seg)
  }

  if (points.length <= 1200) return points
  const step = (points.length - 1) / 1199
  return Array.from({ length: 1200 }, (_, i) => points[Math.round(i * step)])
}

function routeDistance(points = []) {
  let total = 0
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i])
  return total
}

export default async function handler(req, res) {
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  const radius = Math.min(30000, Math.max(2000, Number(req.query.radius) || 15000))
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'Coordinates required' })
  }

  const query = `[out:json][timeout:12];
    relation(around:${Math.round(radius)},${lat},${lon})["type"="route"]["route"~"^(hiking|foot)$"];
    out body geom 20;`

  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.nchc.org.tw/api/interpreter'
  ]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 14000)
  let data = null
  let lastError = ''

  try {
    data = await Promise.any(endpoints.map(async endpoint => {
      const r = await fetch(endpoint, {
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
  } catch (e) {
    lastError = e?.message || 'Overpass timeout'
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }

  if (!data) return res.status(504).json({ error: lastError || 'Tour database unavailable' })

  const tours = (data.elements || [])
    .map(el => {
      const points = stitchSegments(el.members || [])
      if (points.length < 2) return null
      const tags = el.tags || {}
      const first = points[0]
      const last = points[points.length - 1]
      return {
        id: 'osm-' + el.id,
        osmId: el.id,
        name: tags.name || tags.ref || 'Itinéraire randonnée',
        ref: tags.ref || '',
        network: tags.network || '',
        operator: tags.operator || '',
        distance: routeDistance(points),
        roundTrip: dist(first, last) < 250,
        center: el.center ? { lat: Number(el.center.lat), lon: Number(el.center.lon) } : points[Math.floor(points.length / 2)],
        points
      }
    })
    .filter(Boolean)
    .sort((a,b) => a.distance - b.distance)
    .slice(0, 20)

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
  return res.status(200).json({ tours })
}
