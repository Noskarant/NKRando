import { routeTotals } from '../lib/geo'

export default function ProfileChart({
  route = [],
  progressIndex = 0,
  selectedIndex = null,
  onSelect,
  compact = false,
  interactive = false
}) {
  const pts = route
    .map((p, routeIndex) => ({ ...p, routeIndex }))
    .filter(p => Number.isFinite(Number(p.ele)))

  if (pts.length < 2) return <div className="profile-empty">Profil altimétrique indisponible</div>

  const width = 640
  const height = compact ? 120 : 190
  const pad = compact ? 8 : 14
  const min = Math.min(...pts.map(p => Number(p.ele)))
  const max = Math.max(...pts.map(p => Number(p.ele)))
  const total = routeTotals(route).distance || 1
  const y = e => height - pad - ((e - min) / Math.max(1, max - min)) * (height - pad * 2)
  const x = p => pad + ((p.cum || 0) / total) * (width - pad * 2)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(p).toFixed(1)} ${y(Number(p.ele)).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(pts.at(-1))} ${height-pad} L ${x(pts[0])} ${height-pad} Z`

  const activeRouteIndex = Number.isFinite(Number(selectedIndex))
    ? Math.max(0, Math.min(Number(selectedIndex), route.length - 1))
    : Math.max(0, Math.min(progressIndex, route.length - 1))
  const active = route[activeRouteIndex] || pts.at(-1)
  const cx = x(active)
  const cy = Number.isFinite(Number(active?.ele)) ? y(Number(active.ele)) : height / 2

  const selectAt = e => {
    if (!interactive || !onSelect) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)))
    const targetCum = ratio * total
    let best = pts[0]
    let bestD = Infinity
    for (const p of pts) {
      const d = Math.abs((p.cum || 0) - targetCum)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    onSelect(best.routeIndex)
  }

  return (
    <div className={`profile ${compact ? 'compact ' : ''}${interactive ? 'interactive' : ''}`.trim()}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        aria-label="Profil altimétrique"
        onPointerDown={e => {
          if (!interactive) return
          e.currentTarget.setPointerCapture?.(e.pointerId)
          selectAt(e)
        }}
        onPointerMove={e => {
          if (!interactive || e.buttons !== 1) return
          selectAt(e)
        }}
        onClick={selectAt}
      >
        <path d={area} className="profile-area" />
        <path d={line} className="profile-line" fill="none" />
        <line x1={cx} x2={cx} y1={pad} y2={height-pad} className="profile-progress-line" />
        <circle cx={cx} cy={cy} r="7" className="profile-dot" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="profile-labels"><span>{Math.round(min)} m</span><span>{Math.round(max)} m</span></div>
      {interactive && <div className="profile-distance-labels"><span>0</span><span>{(total/2000).toFixed(1).replace('.', ',')} km</span><span>{(total/1000).toFixed(1).replace('.', ',')} km</span></div>}
    </div>
  )
}
