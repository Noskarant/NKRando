export default async function handler(req, res) {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.status(200).json([])
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '6')
  url.searchParams.set('addressdetails', '1')
  url.searchParams.set('accept-language', 'fr')
  url.searchParams.set('q', q)
  const r = await fetch(url, { headers: { 'User-Agent': 'NKRando/0.1 personal hiking PWA' } })
  if (!r.ok) return res.status(r.status).send(await r.text())
  const data = await r.json()
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600')
  return res.status(200).json(data.map(x => ({
    id: String(x.place_id),
    name: x.display_name,
    shortName: x.name || x.display_name.split(',')[0],
    lat: Number(x.lat),
    lon: Number(x.lon),
    type: x.type
  })))
}
