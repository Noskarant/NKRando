import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx','utf8')
const css = fs.readFileSync('src/bergfex-clone.css','utf8')

for (const token of [
  'nk-plan-header',
  'nk-plan-route-card',
  'nk-plan-route-row',
  'nk-plan-shortcuts',
  'nk-plan-result',
  'nk-plan-follow',
  "key={route?.id ? 'planned-route' : 'empty-plan'}"
]) {
  if (!app.includes(token)) throw new Error('Missing Planning v3 token: '+token)
}

for (const token of [
  '.nk-plan-route-card',
  '.nk-plan-route-row',
  '.nk-plan-origin',
  '.nk-plan-destination',
  '.nk-plan-shortcuts',
  '.nk-plan-result-stats',
  '.nk-plan-follow'
]) {
  if (!css.includes(token)) throw new Error('Missing Planning v3 CSS: '+token)
}

if (app.includes('bf-plan-mode-cell')) throw new Error('Legacy planner mode row still rendered')
if (app.includes('bf-route-editor')) throw new Error('Legacy planner route editor still rendered')

console.log('Planning v3 structural smoke test OK')


if (!app.includes('initialSnap={1}')) throw new Error('Planning does not open at readable mid state')
if (!app.includes("midRatio={route ? .48 : .41}")) throw new Error('Planning readable ratios missing')
if (!fs.readFileSync('public/sw.js','utf8').includes('nkrando-shell-v12')) throw new Error('PWA cache not bumped to v11')
console.log('Planning default viewport regression test OK')
