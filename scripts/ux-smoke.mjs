import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx','utf8')
const css = fs.readFileSync('src/bergfex-ui.css','utf8')
const main = fs.readFileSync('src/main.jsx','utf8')

const mustApp = [
  'bf-planning-screen',
  'berg-track-grid',
  'bf-search-screen',
  'settings-page',
  'WeatherChip',
  'BottomNav'
]
const mustCss = [
  '--bf-nav-h:66px',
  '.nk-bottom-nav',
  '.berg-track-grid',
  '.bf-filter-row',
  '.settings-card',
  '.bf-weather-chip'
]

for (const token of mustApp) if (!app.includes(token)) throw new Error('Missing app UX token: '+token)
for (const token of mustCss) if (!css.includes(token)) throw new Error('Missing CSS UX token: '+token)
if (!main.includes("import './bergfex-ui.css'")) throw new Error('UX stylesheet is not imported')
if (!css.includes('height:calc(var(--bf-nav-h) + env(safe-area-inset-bottom))')) {
  throw new Error('Bottom navigation is not safe-area bounded')
}
if (!app.includes('midRatio={session ? .27 : .25}')) {
  throw new Error('Tracking sheet default proportion changed unexpectedly')
}
console.log('App-wide Bergfex UX smoke test OK')
