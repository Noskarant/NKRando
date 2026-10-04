import { displayLocationForRoute, filterGpsFix, gpsPointFromPosition, gpsQuality } from '../src/lib/gps.js'

const first = gpsPointFromPosition({
  coords:{ latitude:45.460000, longitude:6.440000, altitude:1135, accuracy:8, altitudeAccuracy:5, speed:1.2, heading:20 },
  timestamp:1000
})
if (!first || first.accuracy !== 8) throw new Error('gpsPointFromPosition failed')

const accepted = filterGpsFix(null, first)
if (!accepted) throw new Error('First good GPS fix rejected')

const smoother = filterGpsFix(accepted, {
  ...first, lat:45.460018, lon:6.440020, accuracy:11, ts:3000
})
if (!smoother) throw new Error('Good moving fix rejected')

const bad = filterGpsFix(smoother, {
  ...first, lat:45.465, lon:6.45, accuracy:90, ts:4000
})
if (bad) throw new Error('Coarse implausible jump was not rejected')

const routePoint = { lat:smoother.lat + 0.00004, lon:smoother.lon + 0.00003, ele:1137 }
const matched = displayLocationForRoute({ ...smoother, accuracy:15 }, routePoint)
if (!matched?.mapMatched) throw new Error('Nearby route should map-match')
if (matched.lat !== routePoint.lat || matched.lon !== routePoint.lon) throw new Error('Map-matched display point is wrong')

const far = displayLocationForRoute({ ...smoother, accuracy:10 }, { lat:smoother.lat + .001, lon:smoother.lon + .001 })
if (far?.mapMatched) throw new Error('Far route should not map-match')

if (gpsQuality(8) !== 'excellent' || gpsQuality(18) !== 'good' || gpsQuality(30) !== 'fair' || gpsQuality(60) !== 'poor') {
  throw new Error('GPS quality bands failed')
}

console.log('GPS filter/map-matching smoke test OK')
