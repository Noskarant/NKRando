export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
  const points = Array.isArray(req.body?.points) ? req.body.points.slice(0, 100) : []
  if (!points.length || points.some(p => !Number.isFinite(p?.lat) || !Number.isFinite(p?.lon))) {
    return res.status(400).json({ error: 'Valid coordinates required' })
  }

  const url = new URL('https://api.open-meteo.com/v1/elevation')
  url.searchParams.set('latitude', points.map(p => Number(p.lat).toFixed(6)).join(','))
  url.searchParams.set('longitude', points.map(p => Number(p.lon).toFixed(6)).join(','))
  const r = await fetch(url, { headers: { 'User-Agent': 'NKRando/0.1 personal hiking PWA' } })
  if (!r.ok) return res.status(r.status).send(await r.text())
  const data = await r.json()
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
  return res.status(200).json({ elevation: data.elevation || [] })
}
