import { haversine } from './geo.js'

const finite = v => Number.isFinite(Number(v))
const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

export function gpsPointFromPosition(pos) {
  if (!pos?.coords || !finite(pos.coords.latitude) || !finite(pos.coords.longitude)) return null
  return {
    lat: Number(pos.coords.latitude),
    lon: Number(pos.coords.longitude),
    ele: finite(pos.coords.altitude) ? Number(pos.coords.altitude) : undefined,
    accuracy: finite(pos.coords.accuracy) ? Number(pos.coords.accuracy) : 999,
    altitudeAccuracy: finite(pos.coords.altitudeAccuracy) ? Number(pos.coords.altitudeAccuracy) : undefined,
    speed: finite(pos.coords.speed) && Number(pos.coords.speed) >= 0 ? Number(pos.coords.speed) : undefined,
    heading: finite(pos.coords.heading) ? Number(pos.coords.heading) : undefined,
    ts: Number(pos.timestamp) || Date.now()
  }
}

export function filterGpsFix(previous, next) {
  if (!next || !finite(next.lat) || !finite(next.lon)) return null
  const accuracy = finite(next.accuracy) ? Number(next.accuracy) : 999

  if (!previous) return accuracy <= 100 ? { ...next, filtered:true } : null

  const dt = Math.max(.25, ((next.ts || Date.now()) - (previous.ts || 0)) / 1000)
  const distance = haversine(previous, next)
  const prevAccuracy = finite(previous.accuracy) ? Number(previous.accuracy) : 50

  // Safari can briefly emit coarse/cell fixes. Keep the last good GPS fix instead.
  if (accuracy > 70 && prevAccuracy <= 45 && dt < 20) return null

  // Reject implausible jumps when the new fix is also less accurate.
  const plausibleDistance = Math.max(35, dt * 10 + accuracy + prevAccuracy)
  if (distance > plausibleDistance && accuracy > prevAccuracy * .9) return null

  let alpha
  if (accuracy <= 8) alpha = .92
  else if (accuracy <= 15) alpha = .82
  else if (accuracy <= 25) alpha = .68
  else if (accuracy <= 40) alpha = .52
  else alpha = .36

  // Don't let smoothing visibly lag behind genuine movement.
  if (distance > 18 || dt > 5) alpha = Math.max(alpha, .78)

  return {
    ...next,
    lat: previous.lat + (next.lat - previous.lat) * alpha,
    lon: previous.lon + (next.lon - previous.lon) * alpha,
    ele: finite(next.ele)
      ? (finite(previous.ele) ? previous.ele + (next.ele - previous.ele) * clamp(alpha + .08, .45, .95) : next.ele)
      : previous.ele,
    accuracy,
    filtered:true
  }
}

export function displayLocationForRoute(location, routePoint) {
  if (!location || !routePoint) return location
  const d = haversine(location, routePoint)
  const accuracy = finite(location.accuracy) ? Number(location.accuracy) : 25
  const snapThreshold = clamp(Math.max(14, accuracy * 1.15), 14, 32)

  if (d > snapThreshold) return location

  return {
    ...location,
    lat: routePoint.lat,
    lon: routePoint.lon,
    ele: finite(routePoint.ele) ? Number(routePoint.ele) : location.ele,
    mapMatched:true,
    rawLat:location.lat,
    rawLon:location.lon,
    routeDistance:d
  }
}

export function gpsQuality(accuracy) {
  const a = Number(accuracy)
  if (!Number.isFinite(a)) return 'unknown'
  if (a <= 10) return 'excellent'
  if (a <= 20) return 'good'
  if (a <= 35) return 'fair'
  return 'poor'
}
