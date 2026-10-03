import { fetchOverpassTours } from '../src/lib/tourData.js'

export default async function handler(req, res) {
  const lat = Number(req.query.lat)
  const lon = Number(req.query.lon)
  const radius = Math.min(30000, Math.max(2000, Number(req.query.radius) || 16000))

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'Coordinates required' })
  }

  try {
    const tours = await fetchOverpassTours(lat, lon, radius, { timeoutMs: 11000 })
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
    return res.status(200).json({ tours })
  } catch (e) {
    return res.status(504).json({ error: e?.message || 'Tour database unavailable' })
  }
}
