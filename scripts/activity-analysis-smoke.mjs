import fs from 'node:fs'

const app = fs.readFileSync('src/App.jsx','utf8')
const map = fs.readFileSync('src/components/MapView.jsx','utf8')
const chart = fs.readFileSync('src/components/ProfileChart.jsx','utf8')
const styles = fs.readFileSync('src/styles.css','utf8')

for (const token of [
  'fitTrack',
  'selectedPoint={pointStats?.point || null}',
  'activity-summary-grid',
  'activity-scrub-grid',
  'robustActivityMetrics',
  'activityPointMetrics',
  'activityHistoryOverlays',
  'historyOverlays={historyOverlays}',
  'trackMapCenter'
]) {
  if (!app.includes(token)) throw new Error('Missing activity analysis feature: '+token)
}

for (const token of [
  'fcHistory',
  'history-lines',
  'inspection-location',
  'onViewportChange',
  'fitTrack'
]) {
  if (!map.includes(token)) throw new Error('Missing map analysis feature: '+token)
}

if (!chart.includes('interactive')) throw new Error('Elevation chart is not interactive')
if (!chart.includes('onPointerDown')) throw new Error('Elevation chart touch selection missing')
if (!styles.includes('.activity-summary-grid')) throw new Error('Activity summary styles missing')
if (!styles.includes('.inspection-location')) throw new Error('Inspection marker styles missing')

console.log('Completed activity + history + map-weather smoke test OK')
