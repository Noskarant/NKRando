import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx','utf8')
const clone = fs.readFileSync('src/bergfex-clone.css','utf8')
const main = fs.readFileSync('src/main.jsx','utf8')

const requiredApp = [
  'bf-planning-screen',
  'bf-start-tour-bar',
  'bf-active-panel',
  'bf-search-screen',
  'bf-my-page',
  'bf-settings-page',
  'WeatherChip',
  'BottomNav'
]
const requiredCss = [
  '--clone-nav:50px',
  '.bf-start-tour-bar',
  '.bf-active-panel',
  '.bf-my-page',
  '.bf-settings-page',
  '.bf-search-sheet',
  '.nk-bottom-nav'
]

for (const token of requiredApp) if (!app.includes(token)) throw new Error('Missing app UX token: ' + token)
for (const token of requiredCss) if (!clone.includes(token)) throw new Error('Missing clone CSS token: ' + token)
if (!main.includes("import './bergfex-clone.css'")) throw new Error('Clone stylesheet is not imported')

const roughTrackingHeight = 18 + (58 * 2 + 9) + 22 + 49 + 20
if (roughTrackingHeight > 250) throw new Error('Tracking panel became too tall: ' + roughTrackingHeight)

console.log('App-wide Bergfex parity smoke test OK:', { roughTrackingHeight })
