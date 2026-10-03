import { enrichRoute } from './geo'

async function json(url, options) {
  const r = await fetch(url, options)
  if (!r.ok) throw new Error((await r.text().catch(() => '')) || `Erreur HTTP ${r.status}`)
  return r.json()
}

export async function geocode(q) {
  if (!q || q.trim().length < 2) return []
  try {
    return await json(`/api/search?q=${encodeURIComponent(q.trim())}`)
  } catch {
    const data = await json(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&accept-language=fr&q=${encodeURIComponent(q.trim())}`)
    return data.map(x => ({ id: String(x.place_id), name: x.display_name, lat: Number(x.lat), lon: Number(x.lon), type: x.type }))
  }
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
  const points = coords.map((c, i) => ({ lon: Number(c[0]), lat: Number(c[1]), ele: Number.isFinite(Number(c[2])) ? Number(c[2]) : undefined, ts: i }))
  if (points.length < 2) throw new Error('Aucun itinéraire pédestre trouvé entre ces deux points.')
  return {
    id: crypto.randomUUID(),
    name: `${start.shortName || start.name || 'Départ'} → ${end.shortName || end.name || 'Arrivée'}`,
    points: enrichRoute(points),
    createdAt: Date.now(),
    source: 'brouter'
  }
}
