import { fetchOverpassTours, fetchTrailSplitsTours } from '../src/lib/tourData.js'

export default async function handler(req, res) {
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  const radius = Math.min(30000, Math.max(2000, Number(req.query.radius) || 16000))
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error:'Valid coordinates required' })
  }

  const results = await Promise.allSettled([
    fetchOverpassTours(lat, lon, radius, { timeoutMs:7500 }),
    fetchTrailSplitsTours(lat, lon, radius, { timeoutMs:8500 })
  ])
  const available = results.filter(r => r.status === 'fulfilled')
  if (!available.length) return res.status(503).json({ error:'Hiking route providers unavailable' })

  const tours = new Map()
  available.forEach(({ value }) => value.forEach(t => {
    if (!t?.points?.length) return
    const key = String(t.osmId || t.id)
    if (!tours.has(key) || (tours.get(key).partial && !t.partial)) tours.set(key, t)
  }))
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
  return res.status(200).json({ tours:[...tours.values()].sort((a,b) =>
    (a.centerDistance || 0) - (b.centerDistance || 0)
  ).slice(0, 40) })
}
