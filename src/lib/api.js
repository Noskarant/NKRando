import { enrichRoute } from './geo'
import { fetchOverpassTours } from './tourData'

async function json(url, options) {
  const r = await fetch(url, options)
  if (!r.ok) throw new Error((await r.text().catch(() => '')) || `Erreur HTTP ${r.status}`)
  return r.json()
}

async function jsonWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await json(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export async function geocode(q) {
  if (!q || q.trim().length < 2) return []
  try {
    return await jsonWithTimeout(`/api/search?q=${encodeURIComponent(q.trim())}`, {}, 5500)
  } catch {
    const data = await jsonWithTimeout(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=fr&q=${encodeURIComponent(q.trim())}`, {}, 6500)
    return data.map(x => ({
      id: String(x.place_id),
      name: x.display_name,
      shortName: x.name || x.display_name.split(',')[0],
      lat: Number(x.lat),
      lon: Number(x.lon),
      type: x.type
    }))
  }
}

async function requestElevations(points) {
  try {
    return await json('/api/elevation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ points })
    })
  } catch {
    const u = new URL('https://api.open-meteo.com/v1/elevation')
    u.searchParams.set('latitude', points.map(p => p.lat.toFixed(6)).join(','))
    u.searchParams.set('longitude', points.map(p => p.lon.toFixed(6)).join(','))
    return json(u)
  }
}

export async function ensureElevation(points = []) {
  if (points.length < 2) return enrichRoute(points)
  const valid = points.filter(p => Number.isFinite(Number(p.ele))).length
  if (valid / points.length >= 0.9) return enrichRoute(points)

  const count = Math.min(100, points.length)
  const sampleIndices = [...new Set(Array.from({ length: count }, (_, i) =>
    Math.round(i * (points.length - 1) / Math.max(1, count - 1))
  ))]
  const samples = sampleIndices.map(i => points[i])
  let data
  try {
    data = await requestElevations(samples)
  } catch {
    return enrichRoute(points)
  }
  const elevations = Array.isArray(data?.elevation) ? data.elevation.map(Number) : []
  if (elevations.length !== samples.length || elevations.some(v => !Number.isFinite(v))) {
    return enrichRoute(points)
  }

  const out = points.map(p => ({ ...p }))
  sampleIndices.forEach((idx, i) => { out[idx].ele = elevations[i] })

  for (let s = 0; s < sampleIndices.length - 1; s++) {
    const aIdx = sampleIndices[s]
    const bIdx = sampleIndices[s + 1]
    const aEle = elevations[s]
    const bEle = elevations[s + 1]
    const span = Math.max(1, bIdx - aIdx)
    for (let i = aIdx + 1; i < bIdx; i++) {
      const t = (i - aIdx) / span
      out[i].ele = aEle + (bEle - aEle) * t
    }
  }
  return enrichRoute(out)
}

export async function buildHikingRoute(start, end) {
  let data
  try {
    data = await json('/api/route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ start, end })
    })
  } catch {
    const u = new URL('https://brouter.de/brouter')
    u.searchParams.set('lonlats', `${start.lon},${start.lat}|${end.lon},${end.lat}`)
    u.searchParams.set('profile', 'hiking-mountain')
    u.searchParams.set('alternativeidx', '0')
    u.searchParams.set('format', 'geojson')
    data = await json(u)
  }
  const f = data.type === 'FeatureCollection' ? data.features?.[0] : data
  const coords = f?.geometry?.coordinates || []
  const points = coords.map((c, i) => ({
    lon: Number(c[0]),
    lat: Number(c[1]),
    ele: Number.isFinite(Number(c[2])) ? Number(c[2]) : undefined,
    ts: i
  }))
  if (points.length < 2) throw new Error('Aucun itinéraire pédestre trouvé entre ces deux points.')
  return {
    id: crypto.randomUUID(),
    name: `${start.shortName || start.name || 'Départ'} → ${end.shortName || end.name || 'Arrivée'}`,
    points: await ensureElevation(points),
    createdAt: Date.now(),
    source: 'brouter'
  }
}


export async function searchHikingTours(lat, lon, radius = 16000) {
  const u = new URL('/api/tours', window.location.origin)
  u.searchParams.set('lat', String(lat))
  u.searchParams.set('lon', String(lon))
  u.searchParams.set('radius', String(radius))

  try {
    const data = await jsonWithTimeout(u.pathname + u.search, {}, 7000)
    if (Array.isArray(data?.tours)) return data.tours
  } catch {}

  return fetchOverpassTours(lat, lon, radius, { timeoutMs: 12000 })
}
