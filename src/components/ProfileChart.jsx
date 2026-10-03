import { routeTotals } from '../lib/geo'

export default function ProfileChart({ route = [], progressIndex = 0, compact = false }) {
  const pts = route.filter(p => Number.isFinite(Number(p.ele)))
  if (pts.length < 2) return <div className="profile-empty">Profil altimétrique indisponible</div>
  const width = 640, height = compact ? 120 : 180, pad = compact ? 8 : 14
  const min = Math.min(...pts.map(p => Number(p.ele)))
  const max = Math.max(...pts.map(p => Number(p.ele)))
  const total = routeTotals(route).distance || 1
  const y = e => height - pad - ((e - min) / Math.max(1, max - min)) * (height - pad * 2)
  const x = p => pad + ((p.cum || 0) / total) * (width - pad * 2)
  const line = pts.map((p, i) => `${i ? 'L' : 'M'} ${x(p).toFixed(1)} ${y(Number(p.ele)).toFixed(1)}`).join(' ')
  const area = `${line} L ${x(pts.at(-1))} ${height-pad} L ${x(pts[0])} ${height-pad} Z`
  const current = route[Math.max(0, Math.min(progressIndex, route.length - 1))]
  const cx = x(current)
  const cy = Number.isFinite(Number(current?.ele)) ? y(Number(current.ele)) : height / 2
  return (
    <div className={compact ? 'profile compact' : 'profile'}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Profil altimétrique">
        <path d={area} className="profile-area" />
        <path d={line} className="profile-line" fill="none" />
        <line x1={cx} x2={cx} y1={pad} y2={height-pad} className="profile-progress-line" />
        <circle cx={cx} cy={cy} r="7" className="profile-dot" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="profile-labels"><span>{Math.round(min)} m</span><span>{Math.round(max)} m</span></div>
    </div>
  )
}
