const url = 'https://tiles.bergfex.at/styles/bergfex-osm/15/16970/11728@2x.jpg'
const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 12000)
try {
  const r = await fetch(url, {
    signal:controller.signal,
    headers:{ 'user-agent':'NKRando/0.1 personal hiking PWA map smoke test' }
  })
  if (!r.ok) throw new Error('HTTP ' + r.status)
  const type = r.headers.get('content-type') || ''
  const bytes = (await r.arrayBuffer()).byteLength
  if (!type.startsWith('image/') || bytes < 1000) {
    throw new Error(`Unexpected tile response: ${type}, ${bytes} bytes`)
  }
  console.log('Bergfex tile smoke test OK:', { type, bytes })
} finally {
  clearTimeout(timeout)
}
