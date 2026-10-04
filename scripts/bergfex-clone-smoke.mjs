import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx','utf8')
const css = fs.readFileSync('src/bergfex-clone.css','utf8')
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
  'bf-pro-card'
]
const requiredCss = [
  '.bf-my-page',
  '.bf-start-tour-bar',
  '.bf-active-panel',
  '.bf-stop-popover',
  '.bf-search-sheet',
  '.bf-settings-page',
  '--clone-nav:72px'
]

for (const token of requiredApp) if (!app.includes(token)) throw new Error('Missing rebuilt UI token: ' + token)
for (const token of requiredCss) if (!css.includes(token)) throw new Error('Missing clone CSS token: ' + token)
if (!main.includes("import './bergfex-clone.css'")) throw new Error('Clone stylesheet not imported')
if (!sw.includes("nkrando-shell-v6")) throw new Error('PWA cache version not bumped')
if (app.includes('confirm(\'Terminer et enregistrer cette activité ?\')')) {
  throw new Error('Legacy browser confirm remains in tracking flow')
}

console.log('1-to-1 Bergfex-style structural rebuild smoke test OK')
