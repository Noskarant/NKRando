export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required' })
  const { start, end } = req.body || {}
  if (![start?.lat,start?.lon,end?.lat,end?.lon].every(Number.isFinite)) return res.status(400).json({ error: 'Coordinates missing' })
  const profiles = ['hiking-mountain', 'trekking']
  let lastError = ''
  for (const profile of profiles) {
    const url = new URL('https://brouter.de/brouter')
    url.searchParams.set('lonlats', `${start.lon},${start.lat}|${end.lon},${end.lat}`)
    url.searchParams.set('profile', profile)
    url.searchParams.set('alternativeidx', '0')
    url.searchParams.set('format', 'geojson')
    const r = await fetch(url)
    if (r.ok) {
      res.setHeader('Cache-Control', 's-maxage=3600')
      return res.status(200).send(await r.text())
    }
    lastError = await r.text().catch(() => '')
  }
  return res.status(502).json({ error: lastError || 'Routing unavailable' })
}
