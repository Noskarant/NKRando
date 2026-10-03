import { enrichRoute } from './geo'

export function parseGPX(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml')
  if (xml.querySelector('parsererror')) throw new Error('Fichier GPX invalide')
  const name = xml.querySelector('metadata > name, trk > name, rte > name')?.textContent?.trim() || 'Itinéraire importé'
  const nodes = [...xml.querySelectorAll('trkpt, rtept')]
  const points = nodes.map((n, i) => ({
    lat: Number(n.getAttribute('lat')),
    lon: Number(n.getAttribute('lon')),
    ele: n.querySelector('ele') ? Number(n.querySelector('ele').textContent) : undefined,
    ts: n.querySelector('time') ? new Date(n.querySelector('time').textContent).getTime() : i
  })).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
  if (points.length < 2) throw new Error('Aucun tracé exploitable trouvé dans ce GPX')
  return { id: crypto.randomUUID(), name, points: enrichRoute(points), createdAt: Date.now(), source: 'gpx' }
}

export function toGPX(name, points = []) {
  const esc = s => String(s || '').replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]))
  const rows = points.map(p => `<trkpt lat="${p.lat}" lon="${p.lon}">${Number.isFinite(Number(p.ele)) ? `<ele>${Number(p.ele).toFixed(1)}</ele>` : ''}${p.ts ? `<time>${new Date(p.ts).toISOString()}</time>` : ''}</trkpt>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="NKRando" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>${esc(name)}</name><trkseg>${rows}</trkseg></trk></gpx>`
}
