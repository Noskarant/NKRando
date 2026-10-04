import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx','utf8')
const api = fs.readFileSync('src/lib/api.js','utf8')
const gps = fs.readFileSync('src/lib/gps.js','utf8')
const geo = fs.readFileSync('src/lib/geo.js','utf8')
const css = fs.readFileSync('src/bergfex-clone.css','utf8')

const required = [
  'SPORT_CONFIGS',
  'WeatherForecastModal',
  'SportPicker',
  "statsMetric === 'distance'",
  'refreshPreciseLocation',
  'navigator.geolocation.watchPosition',
  'bf-around-me',
  'centerDistance',
  'filteredTours',
  'activeSport.speedFocus'
]
for (const token of required) if (!app.includes(token)) throw new Error('Missing feature token: '+token)
if (!api.includes('28000') || !api.includes('Promise.allSettled')) throw new Error('Progressive route search not enabled')
if (!gps.includes('dt > 20') || !gps.includes('relocated')) throw new Error('Stale GPS relocation recovery missing')
if (!geo.includes('movingThreshold')) throw new Error('Sport-aware movement threshold missing')
for (const cls of ['.bf-sport-picker','.bf-weather-modal','.bf-search-filters','.nk-plan-route-card']) {
  if (!css.includes(cls)) throw new Error('Missing feature CSS: '+cls)
}
console.log('GPS + sports + nearby search + weather feature smoke test OK')


const bergfexUi = fs.readFileSync('src/bergfex-ui.css','utf8')
if (!css.includes('pointer-events:auto!important')) throw new Error('Weather chip is not tappable')
if (!app.includes('nk-plan-route-card')) throw new Error('New Planning route card missing')
if (!app.includes('nk-plan-shortcuts')) throw new Error('Planning shortcuts missing')
if (!app.includes('nk-plan-follow')) throw new Error('Planning follow CTA missing')
if (!css.includes('.nk-plan-route-row')) throw new Error('Planning route rows are not styled')
if (!css.includes('grid-template-columns:36px minmax(0,1fr) 36px')) throw new Error('Planning route rows do not use stable columns')
if (!fs.readFileSync('public/sw.js','utf8').includes('nkrando-shell-v10')) throw new Error('PWA cache not bumped to v10')
console.log('Planning v3 + weather tap regression test OK')
