export const EARTH = 6371000

const rad = d => d * Math.PI / 180
export const haversine = (a, b) => {
  if (!a || !b) return 0
  const dLat = rad(b.lat - a.lat)
  const dLon = rad(b.lon - a.lon)
  const la1 = rad(a.lat), la2 = rad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH * Math.asin(Math.sqrt(h))
}

export const bearing = (a, b) => {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat))
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export const formatKm = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ',')} km`
export const formatM = m => `${Math.max(0, Math.round(m || 0))} m`
export const formatTime = s => {
  s = Math.max(0, Math.round(s || 0))
  const h = Math.floor(s / 3600)
  const min = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${min}:${String(sec).padStart(2,'0')}`
}

export function smoothElevations(points) {
  return points.map((p, i) => {
    const vals = []
    for (let j = Math.max(0, i - 2); j <= Math.min(points.length - 1, i + 2); j++) {
      const e = Number(points[j].ele)
      if (Number.isFinite(e)) vals.push(e)
    }
    vals.sort((a,b) => a-b)
    return { ...p, ele: vals.length ? vals[Math.floor(vals.length / 2)] : p.ele }
  })
}

export function enrichRoute(points = []) {
  if (!points.length) return []
  const smoothed = smoothElevations(points)
  let cum = 0, up = 0, down = 0
  return smoothed.map((p, i) => {
    if (i) {
      cum += haversine(smoothed[i - 1], p)
      const a = Number(smoothed[i - 1].ele), b = Number(p.ele)
      if (Number.isFinite(a) && Number.isFinite(b)) {
        const d = b - a
        if (Math.abs(d) >= 2.5) {
          if (d > 0) up += d
          else down += -d
        }
      }
    }
    return { ...p, cum, up, down }
  })
}

export function routeTotals(route = []) {
  if (!route.length) return { distance: 0, up: 0, down: 0, minEle: 0, maxEle: 0 }
  const r = route[route.length - 1]
  const elevations = route.map(p => Number(p.ele)).filter(Number.isFinite)
  return {
    distance: r.cum || 0,
    up: r.up || 0,
    down: r.down || 0,
    minEle: elevations.length ? Math.min(...elevations) : 0,
    maxEle: elevations.length ? Math.max(...elevations) : 0
  }
}

export function nearestRouteIndex(location, route, hint = 0) {
  if (!location || !route.length) return 0
  let best = Math.max(0, Math.min(hint || 0, route.length - 1))
  let bestD = Infinity
  const start = Math.max(0, best - 400)
  const end = Math.min(route.length - 1, best + 1600)
  for (let i = start; i <= end; i++) {
    const d = haversine(location, route[i])
    if (d < bestD) { bestD = d; best = i }
  }
  if (bestD > 1000) {
    for (let i = 0; i < route.length; i += Math.max(1, Math.floor(route.length / 1000))) {
      const d = haversine(location, route[i])
      if (d < bestD) { bestD = d; best = i }
    }
  }
  return best
}

export function progressStats(route, idx = 0) {
  if (!route.length) return { distanceDone: 0, distanceRemaining: 0, upDone: 0, upRemaining: 0, percent: 0 }
  const total = route[route.length - 1]
  const p = route[Math.max(0, Math.min(idx, route.length - 1))]
  return {
    distanceDone: p.cum || 0,
    distanceRemaining: Math.max(0, (total.cum || 0) - (p.cum || 0)),
    upDone: p.up || 0,
    upRemaining: Math.max(0, (total.up || 0) - (p.up || 0)),
    percent: total.cum ? Math.min(100, Math.max(0, (p.cum / total.cum) * 100)) : 0
  }
}

export function activityStats(points = [], startedAt, endedAt = Date.now(), pausedMs = 0) {
  const route = enrichRoute(points)
  const totals = routeTotals(route)
  let movingSeconds = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    const dt = Math.max(0, (b.ts - a.ts) / 1000)
    const d = haversine(a, b)
    if (dt <= 30 && d / Math.max(dt, 1) > 0.45) movingSeconds += dt
  }
  const totalSeconds = Math.max(0, ((endedAt || Date.now()) - (startedAt || endedAt || Date.now()) - pausedMs) / 1000)
  const elevations = points.map(p => Number(p.ele)).filter(Number.isFinite)
  const speeds = points.map(p => Number(p.speed)).filter(v => Number.isFinite(v) && v >= 0)
  return {
    ...totals,
    movingSeconds,
    totalSeconds,
    avgSpeed: movingSeconds > 0 ? (totals.distance / movingSeconds) * 3.6 : 0,
    maxSpeed: speeds.length ? Math.max(...speeds) * 3.6 : 0,
    minEle: elevations.length ? Math.min(...elevations) : totals.minEle,
    maxEle: elevations.length ? Math.max(...elevations) : totals.maxEle
  }
}

export const mapPoint = p => [p.lon, p.lat]
