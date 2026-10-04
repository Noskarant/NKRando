import fs from 'node:fs'
import { navigationCheckpoints } from '../src/lib/geo.js'

const app = fs.readFileSync('src/App.jsx','utf8')
const map = fs.readFileSync('src/components/MapView.jsx','utf8')
const css = fs.readFileSync('src/bergfex-clone.css','utf8')

for (const token of [
  'planningFocusPoint',
  'planningFitRoute',
  'searchFocusPoint',
  'GuidanceCompass',
  'navigationPoints',
  'guidance={guidance}',
  'void enableHeading()',
  'void refreshPreciseLocation()'
]) {
  if (!app.includes(token)) throw new Error('Missing navigation feature token: '+token)
}

if (app.includes('const startSession = async () =>')) throw new Error('Start session still blocks on GPS refresh')
if (!app.includes('focusZoom={14.35}')) throw new Error('Planner moderate initial zoom missing')
if (!app.includes('focusPoint={searchFocusPoint}')) throw new Error('Search still follows automatic tour center')
if (!map.includes("map.on('zoomstart', userMoved)")) throw new Error('Map does not detect manual zoom')
if (!map.includes("navigation-points")) throw new Error('Navigation checkpoint layer missing')
if (!css.includes('.nk-guidance-compass')) throw new Error('Guidance compass CSS missing')

const route = Array.from({length:11}, (_,i) => ({ lat:45 + i*0.0005, lon:6, cum:i*55 }))
const checkpoints = navigationCheckpoints(route, 55)
if (checkpoints.length < 5) throw new Error('Navigation checkpoints too sparse')
if (checkpoints.at(-1).routeIndex !== route.length - 1) throw new Error('Final checkpoint missing')

console.log('Planner focus + instant start + live guidance smoke test OK')
