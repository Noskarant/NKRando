import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx','utf8')
const css = fs.readFileSync('src/bergfex-clone.css','utf8')
const map = fs.readFileSync('src/components/MapView.jsx','utf8')
const main = fs.readFileSync('src/main.jsx','utf8')
const sw = fs.readFileSync('public/sw.js','utf8')

const requiredApp = [
  'bf-profile-head',
  'bf-stats-card',
  'bf-menu-list',
  'bf-start-tour-bar',
  'bf-active-panel',
  'bf-stop-popover',
  'bf-search-sheet',
  'bf-settings-page',
  'nk-plan-route-card',
  'MySubpage'
]
const requiredCss = [
  '.bf-my-page',
  '.bf-start-tour-bar',
  '.bf-active-panel',
  '.bf-stop-popover',
  '.bf-search-sheet',
  '.bf-settings-page',
  '.bf-subpage',
  '.nk-plan-route-card',
  '--clone-nav:50px'
]

for (const token of requiredApp) if (!app.includes(token)) throw new Error('Missing rebuilt UI token: ' + token)
for (const token of requiredCss) if (!css.includes(token)) throw new Error('Missing clone CSS token: ' + token)
if (!main.includes("import './bergfex-clone.css'")) throw new Error('Clone stylesheet not imported')
if (!sw.includes("nkrando-shell-v13")) throw new Error('PWA cache version not bumped')
if (app.includes('bf-pro-card')) throw new Error('Private app still contains the PRO upsell')
if (app.includes(",()=>{}]")) throw new Error('Dead My NKRando menu handler remains')
if (!map.includes('tileSize: 256')) throw new Error('Detailed raster map is not using sharp 256 logical tile sizing')
if (!map.includes("'raster-fade-duration':0")) throw new Error('Raster fade blur is still enabled')
if (app.includes('confirm(\'Terminer et enregistrer cette activité ?\')')) throw new Error('Legacy browser confirm remains in tracking flow')

console.log('Functional Bergfex-style structural rebuild smoke test OK')
