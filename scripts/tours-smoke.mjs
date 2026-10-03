import handler from '../api/tours.js'

const req = { query: { lat: '45.46', lon: '6.44', radius: '16000' } }
let statusCode = 200
let payload = null
const res = {
  status(code) { statusCode = code; return this },
  json(value) { payload = value; return this },
  setHeader() {}
}

const started = Date.now()
await handler(req, res)
const seconds = ((Date.now() - started) / 1000).toFixed(1)

if (statusCode !== 200) {
  console.error('Tour API failed:', statusCode, payload)
  process.exit(1)
}
if (!Array.isArray(payload?.tours) || payload.tours.length === 0) {
  console.error('Tour API returned no tours near Valmorel:', payload)
  process.exit(1)
}
if (!payload.tours.some(t => Array.isArray(t.points) && t.points.length > 10 && t.distance >= 1000)) {
  console.error('Tour API returned no usable route of at least 1 km')
  process.exit(1)
}
console.log(`Tour API OK: ${payload.tours.length} tour(s) near Valmorel in ${seconds}s`)
console.log(payload.tours.slice(0, 5).map(t => ({ name:t.name, km:(t.distance/1000).toFixed(1), points:t.points.length })))
