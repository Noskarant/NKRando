import { useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView'
import ProfileChart from './components/ProfileChart'
import { geocode, buildHikingRoute, ensureElevation, searchHikingTours } from './lib/api'
import { computeSheetSnaps, draggedSheetHeight, nearestSheetSnap, nextSheetSnap } from './lib/sheet'
import { displayLocationForRoute, filterGpsFix, gpsPointFromPosition, gpsQuality } from './lib/gps.js'
import { parseGPX, toGPX } from './lib/gpx'
import { deleteRoute, getActivities, getRoutes, saveActivity, saveRoute } from './lib/db'
import {
  activityStats, bearing, enrichRoute, formatKm, formatM, formatTime, haversine,
  navigationCheckpoints, nearestRouteIndex, progressStats, routeTotals
} from './lib/geo'

const LS_SESSION = 'nkrando-active-session-v1'
const LS_ROUTE = 'nkrando-current-route-v1'
const LS_MAP_MODE = 'nkrando-map-mode-v1'
const LS_KEEP_AWAKE = 'nkrando-keep-awake-v1'
const LS_AUTO_FOLLOW = 'nkrando-auto-follow-v1'
const LS_FAVORITES = 'nkrando-favorite-routes-v1'
const LS_SPORT = 'nkrando-sport-v1'

const SPORT_CONFIGS = [
  { id:'hiking', label:'Randonnée', icon:'🥾', movingThreshold:.45, speedFocus:false, defaultSpeedKmh:4.5 },
  { id:'walking', label:'Marche', icon:'🚶', movingThreshold:.35, speedFocus:false, defaultSpeedKmh:4.8 },
  { id:'running', label:'Course', icon:'🏃', movingThreshold:.75, speedFocus:true, defaultSpeedKmh:9.5 },
  { id:'trail', label:'Trail', icon:'⛰️', movingThreshold:.65, speedFocus:true, defaultSpeedKmh:7.5 },
  { id:'cycling', label:'Vélo', icon:'🚲', movingThreshold:1.2, speedFocus:true, defaultSpeedKmh:18 },
  { id:'mtb', label:'VTT', icon:'🚵', movingThreshold:.85, speedFocus:true, defaultSpeedKmh:13 },
  { id:'ski', label:'Ski alpin', icon:'⛷️', movingThreshold:1.0, speedFocus:true, defaultSpeedKmh:22 },
  { id:'skitour', label:'Ski de randonnée', icon:'🎿', movingThreshold:.55, speedFocus:true, defaultSpeedKmh:5 },
  { id:'nordic', label:'Ski de fond', icon:'🎿', movingThreshold:.75, speedFocus:true, defaultSpeedKmh:10 },
  { id:'snowboard', label:'Snowboard', icon:'🏂', movingThreshold:1.0, speedFocus:true, defaultSpeedKmh:20 },
  { id:'snowshoe', label:'Raquettes', icon:'❄️', movingThreshold:.32, speedFocus:false, defaultSpeedKmh:3.5 },
  { id:'roller', label:'Roller', icon:'🛼', movingThreshold:1.0, speedFocus:true, defaultSpeedKmh:14 },
  { id:'kayak', label:'Kayak', icon:'🛶', movingThreshold:.65, speedFocus:true, defaultSpeedKmh:6 },
  { id:'paddle', label:'Paddle', icon:'🏄', movingThreshold:.45, speedFocus:true, defaultSpeedKmh:4.5 },
  { id:'horse', label:'Équitation', icon:'🐎', movingThreshold:.7, speedFocus:true, defaultSpeedKmh:8 },
  { id:'other', label:'Autre activité GPS', icon:'📍', movingThreshold:.3, speedFocus:true, defaultSpeedKmh:5 }
]

const sportById = id => SPORT_CONFIGS.find(s => s.id === id) || SPORT_CONFIGS[0]
const weatherGlyph = code => {
  const c = Number(code)
  if (c === 0) return '☀︎'
  if (c <= 3) return '☁︎'
  if (c >= 71 && c <= 77) return '❄︎'
  if (c >= 95) return 'ϟ'
  if (c >= 51) return '☂︎'
  return '☁︎'
}

function NavIcon({ type }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'my') return <svg {...common}><circle cx="12" cy="7" r="3"/><path d="M5.5 20c.7-4 2.8-6 6.5-6s5.8 2 6.5 6"/></svg>
  if (type === 'planning') return <svg {...common}><path d="M12 3 21 12 12 21 3 12Z"/><path d="M8.5 13.5 12 10h5"/><path d="m14.5 7.5 2.5 2.5-2.5 2.5"/></svg>
  if (type === 'track') return <svg {...common}><path d="m3.5 12 17-7.5-7.5 17-2.3-7.2L3.5 12Z"/></svg>
  if (type === 'search') return <svg {...common}><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/></svg>
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1A7 7 0 0 0 14.8 6L14.5 3h-5L9.2 6A7 7 0 0 0 7.6 7L5.1 6 3 9.4 5.1 11a7 7 0 0 0 0 2L3 14.6 5.1 18l2.5-1A7 7 0 0 0 9.2 18l.3 3h5l.3-3a7 7 0 0 0 1.6-1l2.5 1 2-3.4-2-1.6c.1-.3.1-.7.1-1Z"/></svg>
}

function MiniIcon({ type }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'import') return <svg {...common}><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 19h14"/></svg>
  if (type === 'map') return <svg {...common}><path d="m3 6 5-2 8 3 5-2v13l-5 2-8-3-5 2Z"/><path d="M8 4v13m8-10v13"/></svg>
  if (type === 'offline') return <svg {...common}><path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.5 8.6 4.5 4.5 0 0 0 7 18Z"/><path d="M12 11v5m-2-2 2 2 2-2"/></svg>
  if (type === 'locate') return <svg {...common}><path d="m4 12 16-7-7 16-2.1-6.9L4 12Z"/></svg>
  if (type === 'screen') return <svg {...common}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/><path d="M12 7v6m-3-3h6"/></svg>
  if (type === 'compass') return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="m15 9-2 4-4 2 2-4Z"/></svg>
  if (type === 'data') return <svg {...common}><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"/><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>
  if (type === 'search') return <svg {...common}><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/></svg>
  if (type === 'trash') return <svg {...common}><path d="M4 7h16m-10 4v6m4-6v6M8 7l1-3h6l1 3m2 0-1 14H7L6 7"/></svg>
  if (type === 'walk') return <svg {...common}><circle cx="13" cy="4" r="1.8"/><path d="m11 8 3 2 2 4m-5-6-2 5-3 3m5-3 3 3 1 5m-5-8-1 4-3 4"/></svg>
  return <svg {...common}><path d="M4 18V9m5 9V5m5 13v-7m5 7V3"/></svg>
}

function MenuIcon({ type }) {
  const common = { width: 27, height: 27, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'activity') return <svg {...common}><path d="m4 12 16-7-7 16-2.1-6.9L4 12Z"/></svg>
  if (type === 'friends') return <svg {...common}><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3 20c.5-4 2.6-6 6-6s5.5 2 6 6"/><path d="M15 14c3 0 5 1.6 5.5 4.5"/></svg>
  if (type === 'heart') return <svg {...common}><path d="M20 8c0 5-8 11-8 11S4 13 4 8a4 4 0 0 1 7-2.6A4 4 0 0 1 20 8Z"/></svg>
  if (type === 'pin') return <svg {...common}><path d="M8 3h8l-1 5 3 3H6l3-3-1-5Z"/><path d="M12 11v10"/></svg>
  if (type === 'tour') return <svg {...common}><path d="M4 6h14l2 3-2 3H4Z"/><path d="M7 12v9"/></svg>
  if (type === 'peak') return <svg {...common}><path d="m3 19 6-9 4 5 3-4 5 8Z"/></svg>
  if (type === 'challenge') return <svg {...common}><circle cx="12" cy="12" r="8"/><path d="M12 4v4m0 4 3-2"/></svg>
  if (type === 'rating') return <svg {...common}><path d="M4 4h16v12H9l-5 4Z"/><path d="m12 7 1.2 2.5 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4Z"/></svg>
  if (type === 'stats') return <svg {...common}><rect x="3" y="11" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="17" rx="1"/></svg>
  if (type === 'heat') return <svg {...common}><path d="M13 3c1 5-4 5-2 9 1 2 4 2 4-1 3 2 4 7 1 9-4 3-10 0-10-5 0-4 4-6 7-12Z"/></svg>
  if (type === 'offline') return <svg {...common}><path d="M7 18h10a4 4 0 0 0 .8-7.9A6 6 0 0 0 6.5 8.6 4.5 4.5 0 0 0 7 18Z"/><path d="M12 10v6m-2-2 2 2 2-2"/></svg>
  if (type === 'watch') return <svg {...common}><path d="M7 6h7a4 4 0 0 1 0 8H9a3 3 0 0 1 0-6h5"/><path d="M17 10h1a3 3 0 0 1 0 6h-7"/></svg>
  if (type === 'more') return <svg {...common}><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
  return <svg {...common}><path d="m4 19 5-5 3 3 4-6 4 8Z"/></svg>
}

function SearchBox({ value, onChange, placeholder, onSelect, dark = true }) {
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const id = setTimeout(async () => {
      if (!value || value.trim().length < 2) return setResults([])
      setBusy(true)
      try { setResults(await geocode(value)) } catch { setResults([]) }
      finally { setBusy(false) }
    }, 320)
    return () => clearTimeout(id)
  }, [value])

  return <div className={dark ? 'nk-search dark' : 'nk-search'}>
    <div className="nk-search-field">
      <span className="nk-search-icon">⌕</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {busy && <span className="nk-spinner">◌</span>}
    </div>
    {!!results.length && <div className="nk-search-results">
      {results.map(r => <button key={r.id} onClick={() => {
        onSelect(r)
        setResults([])
      }}>
        <b>{r.shortName || r.name.split(',')[0]}</b>
        <span>{r.name}</span>
      </button>)}
    </div>}
  </div>
}

function MapRail({ mapMode, setMapMode, follow, setFollow, rotateMap, requestHeading }) {
  return <div className="map-rail">
    <button className={follow ? 'active' : ''} onClick={() => setFollow(v => !v)} aria-label="Centrer sur ma position"><MiniIcon type="locate" /></button>
    <button className={mapMode === 'satellite' ? 'active' : ''} onClick={() => setMapMode(v => v === 'satellite' ? 'topo' : 'satellite')} aria-label="Changer le fond de carte"><MiniIcon type="map" /></button>
    <button className={rotateMap ? 'active' : ''} onClick={requestHeading} aria-label="Orienter la carte"><MiniIcon type="compass" /></button>
  </div>
}

function BottomNav({ tab, setTab, session }) {
  const items = [
    ['my', 'Mon NKRando'],
    ['planning', 'Planifier'],
    ['track', 'Suivi'],
    ['search', 'Rechercher'],
    ['settings', 'Réglages']
  ]
  return <nav className="nk-bottom-nav">
    {items.map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
      <span className={key === 'track' && session ? 'nav-glyph recording' : 'nav-glyph'}><NavIcon type={key} /></span>
      <span>{label}</span>
    </button>)}
  </nav>
}

function StatBox({ label, value, accent = false }) {
  return <div className={accent ? 'nk-stat accent' : 'nk-stat'}>
    <span>{label}</span>
    <b>{value}</b>
  </div>
}


function TrackingStat({ label, value, unit = '' }) {
  return <div className="berg-track-stat">
    <span>{label}</span>
    <div><b>{value}</b>{unit && <em>{unit}</em>}</div>
  </div>
}


function WeatherChip({ weather, onClick }) {
  if (!weather || !Number.isFinite(weather.temperature)) return null
  return <button className="bf-weather-chip" aria-label="Ouvrir la météo sur 7 jours" onClick={onClick}>
    <span>{weatherGlyph(weather.code)}</span><b>{Math.round(weather.temperature)}°</b>
  </button>
}

function WeatherForecastModal({ point, name, onClose }) {
  const [forecast, setForecast] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!point?.lat || !point?.lon) return
    const controller = new AbortController()
    const url = new URL('https://api.open-meteo.com/v1/forecast')
    url.searchParams.set('latitude', point.lat)
    url.searchParams.set('longitude', point.lon)
    url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum')
    url.searchParams.set('forecast_days', '7')
    url.searchParams.set('timezone', 'auto')
    fetch(url, { signal:controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Météo indisponible')))
      .then(setForecast)
      .catch(e => { if (e?.name !== 'AbortError') setError('Prévisions indisponibles pour le moment.') })
    return () => controller.abort()
  }, [point?.lat, point?.lon])

  const days = forecast?.daily?.time || []
  return <div className="bf-modal-backdrop" onClick={onClose}>
    <section className="bf-weather-modal" onClick={e => e.stopPropagation()}>
      <div className="bf-modal-handle" />
      <header><div><small>MÉTÉO · 7 JOURS</small><h2>{name || 'Lieu actuel'}</h2></div><button onClick={onClose}>×</button></header>
      {error && <div className="bf-modal-error">{error}</div>}
      {!forecast && !error && <div className="bf-weather-loading">Chargement des prévisions…</div>}
      {!!days.length && <div className="bf-weather-days">
        {days.map((date, i) => <div key={date}>
          <div className="bf-weather-day"><b>{i === 0 ? 'Aujourd’hui' : new Date(date+'T12:00').toLocaleDateString('fr-FR',{weekday:'short'})}</b><small>{new Date(date+'T12:00').toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}</small></div>
          <span className="bf-weather-glyph">{weatherGlyph(forecast.daily.weather_code?.[i])}</span>
          <div className="bf-weather-temp"><b>{Math.round(forecast.daily.temperature_2m_max?.[i])}°</b><span>{Math.round(forecast.daily.temperature_2m_min?.[i])}°</span></div>
          <div className="bf-weather-rain">☂ {Math.round(forecast.daily.precipitation_probability_max?.[i] || 0)}%<small>{(forecast.daily.precipitation_sum?.[i] || 0).toFixed(1)} mm</small></div>
        </div>)}
      </div>}
    </section>
  </div>
}

function navigationEtaLabel(seconds) {
  const s = Math.max(0, Number(seconds) || 0)
  if (s < 50) return s < 10 ? '<10 s' : `~${Math.round(s / 5) * 5} s`
  if (s < 3600) return `~${Math.max(1, Math.round(s / 60))} min`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return `~${h} h ${m ? m + ' min' : ''}`.trim()
}

function GuidanceCompass({ guidance, heading = 0, headingEnabled, deviation = 0, onEnableHeading }) {
  if (!guidance) return null
  const relative = ((guidance.bearing - (headingEnabled ? heading : 0) + 540) % 360) - 180
  return <button className="nk-guidance-compass" onClick={() => !headingEnabled && onEnableHeading?.()} aria-label="Guidage vers le prochain point">
    <div className="nk-guidance-dial">
      <span className="nk-guidance-north">N</span>
      <svg viewBox="0 0 48 48" style={{ transform:`rotate(${relative}deg)` }} aria-hidden="true">
        <path d="M24 6 34 30 24 25 14 30Z" fill="currentColor"/>
        <circle cx="24" cy="24" r="3.2" fill="#fff"/>
      </svg>
    </div>
    <div className="nk-guidance-copy">
      <small>PROCHAIN POINT {guidance.number}/{guidance.total}</small>
      <div><b>{formatKm(guidance.distance)}</b><span>{navigationEtaLabel(guidance.etaSeconds)}</span></div>
      <em>{headingEnabled ? 'Direction en temps réel' : 'Toucher pour activer la boussole'}</em>
      {deviation > 35 && <strong>Hors tracé · {formatKm(deviation)}</strong>}
    </div>
  </button>
}

function SportPicker({ value, onSelect, onClose }) {
  return <div className="bf-modal-backdrop" onClick={onClose}>
    <section className="bf-sport-picker" onClick={e => e.stopPropagation()}>
      <div className="bf-modal-handle" />
      <header><div><small>TYPE D’ACTIVITÉ</small><h2>Choisir un sport</h2></div><button onClick={onClose}>×</button></header>
      <div className="bf-sport-grid">
        {SPORT_CONFIGS.map(s => <button key={s.id} className={value === s.id ? 'active' : ''} onClick={() => { onSelect(s.id); onClose() }}>
          <span>{s.icon}</span><b>{s.label}</b>
        </button>)}
      </div>
    </section>
  </div>
}

function trackingDuration(seconds = 0) {
  const s = Math.max(0, Math.round(seconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h
    ? { value:`${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`, unit:'h' }
    : { value:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`, unit:'min' }
}

function trackingDistance(meters = 0) {
  const m = Math.max(0, Number(meters) || 0)
  return m < 1000
    ? { value:String(Math.round(m)), unit:'m' }
    : { value:(m / 1000).toFixed(m < 10000 ? 2 : 1).replace('.', ','), unit:'km' }
}

function Toggle({ checked, onChange, disabled = false }) {
  return <button className={checked ? 'nk-toggle on' : 'nk-toggle'} disabled={disabled} onClick={() => !disabled && onChange(!checked)} aria-pressed={checked}>
    <span />
  </button>
}


function BottomSheet({
  children,
  className = '',
  collapsedHeight = 92,
  midRatio = .36,
  maxRatio = .72,
  initialSnap = 1,
  expandSignal = 0
}) {
  const sheetRef = useRef(null)
  const gesture = useRef(null)
  const [snapIndex, setSnapIndex] = useState(initialSnap)
  const [height, setHeight] = useState(null)
  const [dragging, setDragging] = useState(false)

  const getSnaps = () => computeSheetSnaps(
    sheetRef.current?.parentElement?.clientHeight || window.innerHeight,
    collapsedHeight,
    midRatio,
    maxRatio
  )

  const applySnap = index => {
    const snaps = getSnaps()
    const safeIndex = Math.max(0, Math.min(2, index))
    setSnapIndex(safeIndex)
    setHeight(snaps[safeIndex])
  }

  useEffect(() => {
    const sync = () => applySnap(snapIndex)
    sync()
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
    }
  }, [])


  useEffect(() => {
    if (!expandSignal) return
    applySnap(2)
  }, [expandSignal])

  const onPointerDown = e => {
    e.currentTarget.setPointerCapture?.(e.pointerId)
    gesture.current = {
      y: e.clientY,
      height: sheetRef.current?.getBoundingClientRect().height || getSnaps()[snapIndex],
      moved: false
    }
    setDragging(true)
  }

  const onPointerMove = e => {
    if (!gesture.current) return
    const delta = gesture.current.y - e.clientY
    if (Math.abs(delta) > 4) gesture.current.moved = true
    const snaps = getSnaps()
    setHeight(draggedSheetHeight(gesture.current.height, gesture.current.y, e.clientY, snaps))
  }

  const onPointerUp = e => {
    const g = gesture.current
    gesture.current = null
    setDragging(false)
    if (!g) return
    if (!g.moved) {
      applySnap(nextSheetSnap(snapIndex))
      return
    }
    const current = sheetRef.current?.getBoundingClientRect().height || height || 0
    const snaps = getSnaps()
    applySnap(nearestSheetSnap(current, snaps))
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch {}
  }

  return <section
    ref={sheetRef}
    className={`map-bottom-sheet nk-draggable-sheet ${className} ${dragging ? 'is-dragging' : ''}`}
    style={{ height: height ? `${height}px` : undefined }}
    data-snap={snapIndex}
  >
    <button
      type="button"
      className="sheet-grabber"
      aria-label={snapIndex === 2 ? 'Replier le panneau' : 'Déplier le panneau'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { gesture.current = null; setDragging(false); applySnap(snapIndex) }}
    >
      <span className="nk-sheet-handle" />
      <span className="sheet-chevron">{snapIndex === 2 ? '⌄' : '⌃'}</span>
    </button>
    <div className="sheet-body">{children}</div>
  </section>
}

function CompletionEditor({ activity, onSaved, onClose }) {
  const [name, setName] = useState(activity.name || 'Ma randonnée')
  const [notes, setNotes] = useState(activity.notes || '')
  const [difficulty, setDifficulty] = useState(activity.difficulty || 'moderee')
  const [photos, setPhotos] = useState(activity.photos || [])
  const [saving, setSaving] = useState(false)

  const addPhotos = e => {
    const fs = Array.from(e.target.files || []).slice(0, 12)
    setPhotos(p => [...p, ...fs].slice(0, 12))
  }

  const save = async () => {
    setSaving(true)
    const next = { ...activity, name, notes, difficulty, photos, updatedAt: Date.now() }
    await saveActivity(next)
    onSaved(next)
    setSaving(false)
  }

  return <div className="nk-modal-backdrop">
    <div className="nk-modal-sheet">
      <div className="nk-sheet-handle" />
      <div className="nk-modal-title">
        <div><small>{sportById(activity.sport).label.toUpperCase()} TERMINÉE</small><h2>Enregistrer la sortie</h2></div>
        <button onClick={onClose}>×</button>
      </div>
      <div className="nk-quad compact">
        <StatBox label="Distance" value={formatKm(activity.stats.distance)} />
        <StatBox label="D+" value={'+' + formatM(activity.stats.up)} />
        <StatBox label="Temps total" value={formatTime(activity.stats.totalSeconds)} />
        <StatBox label="En mouvement" value={formatTime(activity.stats.movingSeconds)} />
      </div>

      <label className="nk-label">Nom</label>
      <input className="nk-input" value={name} onChange={e => setName(e.target.value)} />

      <label className="nk-label">Difficulté ressentie</label>
      <div className="difficulty-grid">
        {[['facile','Facile'],['moderee','Modérée'],['difficile','Difficile'],['expert','Très difficile']].map(([k,l]) =>
          <button key={k} className={difficulty === k ? 'active' : ''} onClick={() => setDifficulty(k)}>{l}</button>
        )}
      </div>

      <label className="nk-label">Photos</label>
      <label className="nk-photo-add">＋ Ajouter des photos<input hidden type="file" accept="image/*" multiple onChange={addPhotos} /></label>
      {!!photos.length && <div className="nk-photo-list">{photos.map((p, i) => <span key={i}>{p.name || 'Photo ' + (i + 1)}<button onClick={() => setPhotos(x => x.filter((_,j) => j !== i))}>×</button></span>)}</div>}

      <label className="nk-label">Commentaire</label>
      <textarea className="nk-input nk-textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Conditions, sensations, passage à retenir…" />

      <button className="nk-primary full" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer l’activité'}</button>
    </div>
  </div>
}

function ActivityDetail({ activity, onBack }) {
  const track = activity.track || []
  return <div className="activity-detail-dark">
    <div className="activity-detail-map">
      <MapView track={track} route={activity.plannedRoute || []} fitRoute mode="topo" />
      <button className="activity-back" onClick={onBack}>‹</button>
    </div>
    <div className="activity-detail-sheet">
      <div className="nk-sheet-handle" />
      <small>{new Date(activity.endedAt).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</small>
      <h1>{activity.name}</h1>
      <div className="nk-quad">
        <StatBox label="Distance" value={formatKm(activity.stats.distance)} accent />
        <StatBox label="Dénivelé +" value={'+' + formatM(activity.stats.up)} />
        <StatBox label="Temps total" value={formatTime(activity.stats.totalSeconds)} />
        <StatBox label="En mouvement" value={formatTime(activity.stats.movingSeconds)} />
      </div>
      <ProfileChart route={enrichRoute(track)} progressIndex={Math.max(0, track.length - 1)} compact />
      <div className="detail-meta">
        <span>{activity.difficulty || 'Non renseignée'}</span>
        <span>{formatM(activity.stats.maxEle)} max</span>
        <span>{(activity.stats.avgSpeed || 0).toFixed(1).replace('.', ',')} km/h</span>
      </div>
      {activity.notes && <p className="activity-note">{activity.notes}</p>}
      {!!activity.photos?.length && <div className="activity-photos">{activity.photos.map((p,i) => <img key={i} src={URL.createObjectURL(p)} alt="" />)}</div>}
      <button className="nk-secondary full" onClick={() => {
        const blob = new Blob([toGPX(activity.name, track)], { type: 'application/gpx+xml' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = activity.name.replace(/\W+/g,'-') + '.gpx'
        a.click()
        URL.revokeObjectURL(a.href)
      }}>Exporter le GPX</button>
    </div>
  </div>
}

function MySubpage({
  section, onBack, activities, routes, favorites, toggleFavorite, onActivity, onUseRoute, onSettings, onImport
}) {
  const year = new Date().getFullYear()
  const yearActivities = activities.filter(a => new Date(a.endedAt || 0).getFullYear() === year)
  const totalDistance = activities.reduce((s,a) => s + (a.stats?.distance || 0), 0)
  const totalUp = activities.reduce((s,a) => s + (a.stats?.up || 0), 0)
  const totalTime = activities.reduce((s,a) => s + (a.stats?.totalSeconds || 0), 0)
  const yearDistance = yearActivities.reduce((s,a) => s + (a.stats?.distance || 0), 0)
  const yearUp = yearActivities.reduce((s,a) => s + (a.stats?.up || 0), 0)
  const month = new Date().getMonth()
  const monthActivities = activities.filter(a => {
    const d = new Date(a.endedAt || 0)
    return d.getFullYear() === year && d.getMonth() === month
  })
  const monthDistance = monthActivities.reduce((s,a) => s + (a.stats?.distance || 0), 0)
  const monthUp = monthActivities.reduce((s,a) => s + (a.stats?.up || 0), 0)
  const favoriteRoutes = routes.filter(r => favorites.includes(r.id))
  const highlights = activities.filter(a => a.notes || a.photos?.length)
  const rated = activities.filter(a => a.difficulty)
  const peaks = []
  ;[...routes.map(r => r.points || []), ...activities.map(a => a.track || [])].forEach(points => {
    points.forEach(p => {
      if (!Number.isFinite(p.ele)) return
      peaks.push({ ele:p.ele, lat:p.lat, lon:p.lon })
    })
  })
  const topPeaks = peaks.sort((a,b) => b.ele-a.ele).filter((p,i,arr) => i===0 || Math.abs(p.ele-arr[i-1].ele)>12).slice(0,12)
  const titleMap = {
    activities:'Activités', friendActivities:'Activités des amis', favorites:'Favoris', highlights:'Mes temps forts',
    tours:'Mes circuits', peaks:'Noms des sommets', friends:'Amis', challenges:'Défis', ratings:'Mes évaluations',
    stats:'Statistiques', heatmap:'Heatmap', offline:'Cartes hors ligne', watch:'Montre GPS', tools:'Outils',
    yearly:'Bilan annuel', summits:'Registre des sommets'
  }
  const title = titleMap[section] || 'Mon NKRando'

  const activityRows = list => <div className="bf-sub-list">
    {!list.length && <div className="bf-sub-empty">Aucune donnée pour le moment.</div>}
    {list.map(a => <button key={a.id} onClick={() => onActivity(a)}>
      <span className="bf-sub-icon"><MenuIcon type="activity" /></span>
      <span><b>{a.name || 'Randonnée'}</b><small>{new Date(a.endedAt).toLocaleDateString('fr-FR')} · {formatKm(a.stats?.distance || 0)} · +{formatM(a.stats?.up || 0)}</small></span>
      <span>›</span>
    </button>)}
  </div>

  const routeRows = list => <div className="bf-sub-list">
    {!list.length && <div className="bf-sub-empty">Aucun circuit enregistré.</div>}
    {list.map(r => {
      const s = routeTotals(r.points || [])
      const fav = favorites.includes(r.id)
      return <div className="bf-route-item" key={r.id}>
        <button className="bf-route-main" onClick={() => onUseRoute(r)}>
          <span className="bf-sub-icon"><MenuIcon type="tour" /></span>
          <span><b>{r.name}</b><small>{formatKm(s.distance)} · +{formatM(s.up)} · {formatM(s.maxEle)} max</small></span>
          <span>›</span>
        </button>
        <button className={fav ? 'bf-fav active' : 'bf-fav'} onClick={() => toggleFavorite(r.id)}>{fav ? '♥' : '♡'}</button>
      </div>
    })}
  </div>

  return <main className="bf-subpage">
    <header className="bf-sub-head"><button onClick={onBack}>‹</button><h1>{title}</h1></header>

    {section === 'activities' && activityRows(activities)}
    {section === 'favorites' && routeRows(favoriteRoutes)}
    {section === 'highlights' && activityRows(highlights)}
    {section === 'tours' && routeRows(routes)}
    {section === 'ratings' && activityRows(rated)}

    {section === 'friendActivities' && <div className="bf-info-card">
      <MenuIcon type="friends" /><h2>Activités des amis</h2>
      <p>Cette installation fonctionne localement. Les activités de Kélian apparaîtront ici dès qu’une synchronisation entre vos deux appareils sera ajoutée.</p>
    </div>}

    {section === 'friends' && <div className="bf-sub-list">
      <div className="bf-friend-card"><span className="bf-friend-avatar">K</span><div><b>Kélian</b><small>Ami NKRando · synchronisation locale à venir</small></div></div>
    </div>}

    {section === 'peaks' && <div className="bf-sub-list">
      {!topPeaks.length && <div className="bf-sub-empty">Aucune altitude enregistrée.</div>}
      {topPeaks.map((p,i) => <div className="bf-peak-row" key={i}><MenuIcon type="peak"/><span><b>Sommet #{i+1}</b><small>{Math.round(p.ele)} m · {p.lat?.toFixed?.(4)}, {p.lon?.toFixed?.(4)}</small></span></div>)}
    </div>}

    {section === 'summits' && <div className="bf-stat-stack">
      <div><span>Plus haute altitude enregistrée</span><b>{topPeaks[0] ? Math.round(topPeaks[0].ele) + ' m' : '—'}</b></div>
      <div><span>Points hauts distincts</span><b>{topPeaks.length}</b></div>
      <div><span>Sorties enregistrées</span><b>{activities.length}</b></div>
    </div>}

    {section === 'stats' && <div className="bf-stat-stack">
      <div><span>Distance totale</span><b>{formatKm(totalDistance)}</b></div>
      <div><span>Dénivelé positif</span><b>+{formatM(totalUp)}</b></div>
      <div><span>Temps total</span><b>{formatTime(totalTime)}</b></div>
      <div><span>Activités</span><b>{activities.length}</b></div>
    </div>}

    {section === 'yearly' && <div className="bf-stat-stack">
      <div><span>Distance {year}</span><b>{formatKm(yearDistance)}</b></div>
      <div><span>D+ {year}</span><b>+{formatM(yearUp)}</b></div>
      <div><span>Activités {year}</span><b>{yearActivities.length}</b></div>
    </div>}

    {section === 'challenges' && <div className="bf-challenges">
      {[
        ['20 km ce mois', monthDistance/20000],
        ['1 000 m D+ ce mois', monthUp/1000],
        ['4 sorties ce mois', monthActivities.length/4]
      ].map(([label,ratio]) => <div key={label}><div><b>{label}</b><span>{Math.min(100,Math.round(ratio*100))}%</span></div><progress max="1" value={Math.min(1,ratio)} /></div>)}
    </div>}

    {section === 'heatmap' && <div className="bf-heatmap-wrap">
      <MapView tourOverlays={activities.filter(a => a.track?.length).map(a => ({ id:a.id, name:a.name, points:a.track }))} fitRoute mode="topo" />
      {!activities.some(a => a.track?.length) && <div className="bf-heatmap-empty">Enregistre des sorties pour remplir ta heatmap.</div>}
    </div>}

    {section === 'offline' && <div className="bf-info-card">
      <MenuIcon type="offline" /><h2>Cartes hors ligne actives</h2>
      <p>Les tuiles consultées sont conservées automatiquement sur l’iPhone. Parcours la zone avant de partir pour la rendre disponible sans réseau.</p>
      <button onClick={onSettings}>Ouvrir les réglages carte</button>
    </div>}

    {section === 'watch' && <div className="bf-info-card">
      <MenuIcon type="watch" /><h2>Montre GPS</h2>
      <p>La PWA ne peut pas dialoguer directement avec Garmin/Polar comme une app native. Tu peux déjà importer n’importe quel fichier GPX exporté par une montre.</p>
      <label className="bf-sub-primary">Importer un GPX<input hidden type="file" accept=".gpx,application/gpx+xml" onChange={e => e.target.files?.[0] && onImport(e.target.files[0])}/></label>
    </div>}

    {section === 'tools' && <div className="bf-tools-grid">
      <label>Importer GPX<input hidden type="file" accept=".gpx,application/gpx+xml" onChange={e => e.target.files?.[0] && onImport(e.target.files[0])}/></label>
      <button onClick={() => onSettings()}>Réglages carte</button>
      <button onClick={() => navigator.clipboard?.writeText(JSON.stringify({activities:activities.length,routes:routes.length}))}>Copier le résumé</button>
    </div>}
  </main>
}

export default function App() {
  const [tab, setTab] = useState('planning')
  const [mapMode, setMapMode] = useState(() => {
    try { return localStorage.getItem(LS_MAP_MODE) || 'topo' } catch { return 'topo' }
  })
  const [keepAwake, setKeepAwake] = useState(() => {
    try { return localStorage.getItem(LS_KEEP_AWAKE) !== 'false' } catch { return true }
  })
  const [autoFollow, setAutoFollow] = useState(() => {
    try { return localStorage.getItem(LS_AUTO_FOLLOW) !== 'false' } catch { return true }
  })
  const [route, setRoute] = useState(null)
  const [routes, setRoutes] = useState([])
  const [activities, setActivities] = useState([])
  const [location, setLocation] = useState(null)
  const [weather, setWeather] = useState(null)
  const [showWeather, setShowWeather] = useState(false)
  const [selectedSport, setSelectedSport] = useState(() => {
    try { return localStorage.getItem(LS_SPORT) || 'hiking' } catch { return 'hiking' }
  })
  const [showSportPicker, setShowSportPicker] = useState(false)
  const [statsMetric, setStatsMetric] = useState('distance')
  const [gpsError, setGpsError] = useState('')
  const [heading, setHeading] = useState(0)
  const [headingEnabled, setHeadingEnabled] = useState(false)
  const [follow, setFollow] = useState(false)
  const [rotateMap, setRotateMap] = useState(false)
  const [planningFocusPoint, setPlanningFocusPoint] = useState(null)
  const [planningFitRoute, setPlanningFitRoute] = useState(false)
  const [searchFocusPoint, setSearchFocusPoint] = useState(null)
  const [search, setSearch] = useState('')
  const [focusPlace, setFocusPlace] = useState(null)
  const [planFromText, setPlanFromText] = useState('Ma position')
  const [planFrom, setPlanFrom] = useState(null)
  const [planToText, setPlanToText] = useState('')
  const [planTo, setPlanTo] = useState(null)
  const [planningBusy, setPlanningBusy] = useState(false)
  const [planningError, setPlanningError] = useState('')
  const [publicTours, setPublicTours] = useState([])
  const [tourBusy, setTourBusy] = useState(false)
  const [tourError, setTourError] = useState('')
  const [tourCenter, setTourCenter] = useState(null)
  const [searchExpandKey, setSearchExpandKey] = useState(0)
  const [routeFilter, setRouteFilter] = useState('all')
  const [distanceFilter, setDistanceFilter] = useState('all')
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_SESSION)) } catch { return null }
  })
  const [tick, setTick] = useState(Date.now())
  const [progressIndex, setProgressIndex] = useState(0)
  const [completion, setCompletion] = useState(null)
  const [selectedActivity, setSelectedActivity] = useState(null)
  const [showLegend, setShowLegend] = useState(false)
  const [showStopMenu, setShowStopMenu] = useState(false)
  const [mySection, setMySection] = useState(null)
  const [favoriteRouteIds, setFavoriteRouteIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_FAVORITES) || '[]') } catch { return [] }
  })
  const tourAutoKey = useRef('')
  const wakeLock = useRef(null)
  const lastGpsFix = useRef(null)

  useEffect(() => {
    getRoutes().then(x => setRoutes(x.sort((a,b) => b.createdAt-a.createdAt))).catch(() => {})
    getActivities().then(x => setActivities(x.sort((a,b) => b.endedAt-a.endedAt))).catch(() => {})
    try {
      const id = localStorage.getItem(LS_ROUTE)
      if (id) getRoutes().then(rs => {
        const r = rs.find(x => x.id === id)
        if (r) setRoute(r)
      })
    } catch {}

  }, [])

  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])


  const weatherPoint = tab === 'search'
    ? (focusPlace || tourCenter || location)
    : tab === 'planning'
      ? (planTo || location)
      : location
  const weatherName = tab === 'search'
    ? (search || 'Zone recherchée')
    : tab === 'planning' && planTo
      ? (planTo.shortName || planTo.name || planToText || 'Destination')
      : 'Ma position'

  useEffect(() => {
    if (!weatherPoint?.lat || !weatherPoint?.lon) return
    const controller = new AbortController()
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${weatherPoint.lat}&longitude=${weatherPoint.lon}&current=temperature_2m,weather_code&timezone=auto`
    fetch(url, { signal:controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        const current = data?.current
        if (Number.isFinite(current?.temperature_2m)) {
          setWeather({ temperature:current.temperature_2m, code:current.weather_code })
        }
      })
      .catch(() => {})
    return () => controller.abort()
  }, [weatherPoint?.lat && Number(weatherPoint.lat).toFixed(2), weatherPoint?.lon && Number(weatherPoint.lon).toFixed(2), tab])

  useEffect(() => {
    if (route?.id) localStorage.setItem(LS_ROUTE, route.id)
  }, [route])

  useEffect(() => {
    try { localStorage.setItem(LS_MAP_MODE, mapMode) } catch {}
  }, [mapMode])

  useEffect(() => {
    try { localStorage.setItem(LS_KEEP_AWAKE, String(keepAwake)) } catch {}
  }, [keepAwake])

  useEffect(() => {
    try { localStorage.setItem(LS_AUTO_FOLLOW, String(autoFollow)) } catch {}
  }, [autoFollow])

  useEffect(() => {
    try { localStorage.setItem(LS_SPORT, selectedSport) } catch {}
  }, [selectedSport])

  useEffect(() => {
    if (!location || planFromText !== 'Ma position') return
    setPlanFrom({ ...location, name:'Ma position', shortName:'Ma position' })
  }, [location?.lat, location?.lon, location?.accuracy, planFromText])

  useEffect(() => {
    if (tab !== 'track') setFollow(false)
  }, [tab])

  useEffect(() => {
    if (tab !== 'planning' || planningFitRoute || planningFocusPoint || !location) return
    setPlanningFocusPoint({ lat:location.lat, lon:location.lon, focusKey:Date.now() })
  }, [tab, planningFitRoute, planningFocusPoint, location?.lat, location?.lon])

  useEffect(() => {
    if (session) localStorage.setItem(LS_SESSION, JSON.stringify(session))
    else localStorage.removeItem(LS_SESSION)
  }, [session])

  useEffect(() => {
    if (!location || !route?.points?.length) return
    setProgressIndex(prev => nearestRouteIndex(location, route.points, prev))
  }, [location, route])


  useEffect(() => {
    if (tab !== 'search' || !location) return
    const key = `${location.lat.toFixed(3)}:${location.lon.toFixed(3)}`
    if (tourAutoKey.current === key) return
    tourAutoKey.current = key
    loadPublicTours(location)
  }, [tab, location?.lat, location?.lon])

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError('GPS indisponible sur cet appareil.')
      return
    }
    const onPosition = pos => {
      const raw = gpsPointFromPosition(pos)
      if (!raw) return
      const p = filterGpsFix(lastGpsFix.current, raw)
      if (!p) return
      lastGpsFix.current = p
      setLocation(p)
      setGpsError('')

      if (session?.status !== 'active' || p.accuracy > 65) return
      setSession(s => {
        if (!s || s.status !== 'active') return s
        const prev = s.points?.at(-1)
        if (prev) {
          const d = haversine(prev, p)
          const dt = Math.max(0, (p.ts - prev.ts) / 1000)
          if (d < 1.2 && dt < 5) return s
          if (dt > 0 && d / dt > 22 && p.accuracy > 18) return s
        }
        return { ...s, points: [...(s.points || []), p] }
      })
    }
    const onError = err => {
      if (err?.code === 1) setGpsError('Autorise la localisation précise pour NKRando dans les réglages iOS.')
      else setGpsError('Recherche d’un signal GPS précis…')
    }
    navigator.geolocation.getCurrentPosition(onPosition, onError, { enableHighAccuracy:true, maximumAge:0, timeout:15000 })
    const id = navigator.geolocation.watchPosition(onPosition, onError, { enableHighAccuracy:true, maximumAge:0, timeout:20000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [session?.status, session?.id])

  useEffect(() => {
    const manageWake = async () => {
      if (keepAwake && session?.status === 'active' && 'wakeLock' in navigator) {
        try { wakeLock.current = await navigator.wakeLock.request('screen') } catch {}
      } else {
        try { await wakeLock.current?.release() } catch {}
        wakeLock.current = null
      }
    }
    manageWake()
    return () => { try { wakeLock.current?.release() } catch {} }
  }, [session?.status, keepAwake])

  useEffect(() => {
    if (!headingEnabled) return
    const handler = e => {
      const h = Number.isFinite(e.webkitCompassHeading)
        ? e.webkitCompassHeading
        : (Number.isFinite(e.alpha) ? (360 - e.alpha) % 360 : 0)
      if (Number.isFinite(h)) setHeading(h)
    }
    window.addEventListener('deviceorientation', handler, true)
    return () => window.removeEventListener('deviceorientation', handler, true)
  }, [headingEnabled])

  const enableHeading = async () => {
    try {
      if (headingEnabled) return true
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const ok = await DeviceOrientationEvent.requestPermission()
        if (ok !== 'granted') return false
      }
      setHeadingEnabled(true)
      return true
    } catch {
      return false
    }
  }

  const requestHeading = async () => {
    const ok = await enableHeading()
    if (ok) setRotateMap(v => !v)
  }

  const refreshPreciseLocation = async () => {
    if (!navigator.geolocation) return null
    setGpsError('Affinage du GPS…')
    return new Promise(resolve => {
      let best = null
      let settled = false
      let watchId = null
      const finishBest = () => {
        if (settled) return
        settled = true
        if (watchId !== null) navigator.geolocation.clearWatch(watchId)
        if (best) {
          const p = filterGpsFix(lastGpsFix.current, best) || { ...best, filtered:true }
          lastGpsFix.current = p
          setLocation(p)
          setGpsError(p.accuracy > 35 ? `GPS encore imprécis : ±${Math.round(p.accuracy)} m` : '')
          resolve(p)
        } else {
          setGpsError('Impossible d’obtenir un point GPS précis.')
          resolve(null)
        }
      }
      const onPos = pos => {
        const raw = gpsPointFromPosition(pos)
        if (!raw) return
        if (!best || raw.accuracy < best.accuracy) best = raw
        if (raw.accuracy <= 10) finishBest()
      }
      const onErr = () => finishBest()
      watchId = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy:true, maximumAge:0, timeout:12000 })
      navigator.geolocation.getCurrentPosition(onPos, () => {}, { enableHighAccuracy:true, maximumAge:0, timeout:8000 })
      setTimeout(finishBest, 9000)
    })
  }

  const importFile = async file => {
    try {
      const parsed = parseGPX(await file.text())
      parsed.points = await ensureElevation(parsed.points)
      await saveRoute(parsed)
      setRoutes(rs => [parsed, ...rs.filter(r => r.id !== parsed.id)])
      setPlanningFocusPoint(null)
      setPlanningFitRoute(true)
      setRoute(parsed)
      setTab('planning')
    } catch (e) {
      alert(e.message)
    }
  }


  const loadPublicTours = async center => {
    if (!center?.lat || !center?.lon) return
    setTourBusy(true)
    setTourError('')
    setTourCenter(center)
    try {
      const found = await searchHikingTours(center.lat, center.lon, 7000)
      setPublicTours(found)
      if (!found.length) setTourError('Aucun itinéraire de randonnée OSM trouvé jusqu’à 28 km autour de cette zone.')
    } catch {
      setPublicTours([])
      setTourError('La base de circuits est momentanément indisponible.')
    } finally {
      setTourBusy(false)
    }
  }

  const usePublicTour = async tour => {
    const r = {
      id: crypto.randomUUID(),
      name: tour.name || 'Circuit randonnée',
      points: await ensureElevation(tour.points || []),
      createdAt: Date.now(),
      source: 'osm-tour',
      sourceId: tour.osmId
    }
    await saveRoute(r)
    setPlanningFocusPoint(null)
    setPlanningFitRoute(true)
    setRoute(r)
    setRoutes(list => [r, ...list.filter(x => x.id !== r.id)])
    setTab('planning')
  }

  const calculatePlan = async (destination = planTo) => {
    const from = planFrom || (location ? { ...location, name:'Ma position', shortName:'Ma position' } : null)
    if (!from || !destination) {
      setPlanningError('Choisis une destination.')
      return
    }
    setPlanningBusy(true)
    setPlanningError('')
    try {
      const r = await buildHikingRoute(from, destination)
      await saveRoute(r)
      setPlanningFocusPoint(null)
      setPlanningFitRoute(true)
      setRoute(r)
      setRoutes(list => [r, ...list.filter(x => x.id !== r.id)])
    } catch (e) {
      setPlanningError(e.message || 'Impossible de calculer cet itinéraire.')
    } finally {
      setPlanningBusy(false)
    }
  }

  const startSession = () => {
    void enableHeading()
    const hasRoute = !!route?.points?.length
    const startedAt = Date.now()
    const firstPoint = location && (location.accuracy || 999) <= 80
      ? [{ ...location, ts:location.ts || startedAt }]
      : []
    const s = {
      id:crypto.randomUUID(), routeId:hasRoute ? route.id : null,
      freeActivity:!hasRoute,
      sport:selectedSport,
      startedAt, pausedMs:0,
      pauseStartedAt:null, status:'active', points:firstPoint
    }
    setSession(s)
    setTab('track')
    setFollow(autoFollow)
    setRotateMap(false)
    void refreshPreciseLocation()
  }

  const pauseResume = () => setSession(s => {
    if (!s) return s
    if (s.status === 'active') return { ...s, status:'paused', pauseStartedAt:Date.now() }
    const extra = s.pauseStartedAt ? Date.now() - s.pauseStartedAt : 0
    return { ...s, status:'active', pausedMs:(s.pausedMs || 0) + extra, pauseStartedAt:null }
  })

  const finish = async () => {
    if (!session) return
    const endedAt = Date.now()
    const pausedMs = (session.pausedMs || 0) +
      (session.status === 'paused' && session.pauseStartedAt ? endedAt - session.pauseStartedAt : 0)
    const sport = sportById(session.sport || selectedSport)
    const stats = activityStats(session.points || [], session.startedAt, endedAt, pausedMs, { movingThreshold:sport.movingThreshold })
    const a = {
      id:session.id, name:route?.name || sport.label, sport:sport.id,
      startedAt:session.startedAt, endedAt, pausedMs,
      track:session.points || [], plannedRoute:route?.points || [],
      routeId:route?.id || null, stats, difficulty:'moderee',
      notes:'', photos:[], createdAt:endedAt
    }
    await saveActivity(a)
    setActivities(x => [a, ...x.filter(v => v.id !== a.id)])
    setCompletion(a)
    setSession(null)
    setFollow(false)
  }

  useEffect(() => {
    try { localStorage.setItem(LS_FAVORITES, JSON.stringify(favoriteRouteIds)) } catch {}
  }, [favoriteRouteIds])

  const toggleFavorite = id => setFavoriteRouteIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id])

  const activeSport = sportById(session?.sport || selectedSport)
  const sessionStats = useMemo(() => {
    if (!session) return null
    const pausedNow = (session.pausedMs || 0) +
      (session.status === 'paused' && session.pauseStartedAt ? tick - session.pauseStartedAt : 0)
    const sport = sportById(session.sport || selectedSport)
    return activityStats(session.points || [], session.startedAt, tick, pausedNow, { movingThreshold:sport.movingThreshold })
  }, [session, tick, selectedSport])

  const routeStats = useMemo(() => route?.points ? routeTotals(route.points) : null, [route])
  const prog = useMemo(() => route?.points ? progressStats(route.points, progressIndex) : null, [route, progressIndex])
  const deviation = useMemo(() => location && route?.points?.[progressIndex]
    ? haversine(location, route.points[progressIndex]) : 0, [location, route, progressIndex])
  const navigationPoints = useMemo(() => {
    if (!route?.points?.length) return []
    const spacing = activeSport.id === 'cycling' || activeSport.id === 'ski' || activeSport.id === 'snowboard'
      ? 100
      : activeSport.speedFocus ? 75 : 55
    return navigationCheckpoints(route.points, spacing)
  }, [route, activeSport.id, activeSport.speedFocus])
  const nextNavigationPoint = useMemo(() => {
    if (!navigationPoints.length) return null
    return navigationPoints.find(p => p.routeIndex > progressIndex + 1) || navigationPoints.at(-1)
  }, [navigationPoints, progressIndex])
  const guidance = useMemo(() => {
    if (!session || !location || !nextNavigationPoint || !route?.points?.length) return null
    const routePoint = route.points[Math.max(0, Math.min(progressIndex, route.points.length - 1))]
    const directDistance = haversine(location, nextNavigationPoint)
    const routeDistance = Math.max(0, (Number(nextNavigationPoint.cum) || 0) - (Number(routePoint?.cum) || 0))
    const offRoute = routePoint ? haversine(location, routePoint) : 0
    const distance = offRoute > 35 ? directDistance : Math.max(directDistance, routeDistance)
    const liveSpeed = Number(location.speed)
    const avgSpeedMs = Number(sessionStats?.avgSpeed) > 0 ? Number(sessionStats.avgSpeed) / 3.6 : 0
    const fallbackSpeedMs = (activeSport.defaultSpeedKmh || 4.5) / 3.6
    const speedMs = Number.isFinite(liveSpeed) && liveSpeed > activeSport.movingThreshold
      ? liveSpeed
      : avgSpeedMs > activeSport.movingThreshold
        ? avgSpeedMs
        : fallbackSpeedMs
    return {
      point:nextNavigationPoint,
      number:nextNavigationPoint.checkpointNumber || 1,
      total:nextNavigationPoint.checkpointTotal || navigationPoints.length,
      distance,
      etaSeconds:distance / Math.max(.25, speedMs),
      bearing:bearing(location, nextNavigationPoint)
    }
  }, [session, location, nextNavigationPoint, route, progressIndex, navigationPoints, sessionStats?.avgSpeed, activeSport])

  const displayLocation = useMemo(() => {
    if (!location) return null
    if (!session || !route?.points?.[progressIndex]) return location
    return displayLocationForRoute(location, route.points[progressIndex])
  }, [location, route, progressIndex, session])
  const gpsState = gpsQuality(location?.accuracy)
  const durationPart = trackingDuration(sessionStats?.totalSeconds)
  const distancePart = trackingDistance(sessionStats?.distance)
  const recent28 = useMemo(() => activities.filter(a => (a.endedAt || 0) >= Date.now() - 28 * 86400000), [activities])
  const recentDistance = useMemo(() => recent28.reduce((sum, a) => sum + (a.stats?.distance || 0), 0), [recent28])
  const recentUp = useMemo(() => recent28.reduce((sum, a) => sum + (a.stats?.up || 0), 0), [recent28])
  const recentDuration = useMemo(() => recent28.reduce((sum, a) => sum + (a.stats?.totalSeconds || 0), 0), [recent28])
  const recentChart = useMemo(() => {
    const bins = Array.from({ length:12 }, () => 0)
    const span = 28 / 12
    for (const a of recent28) {
      const ageDays = Math.max(0, (Date.now() - (a.endedAt || Date.now())) / 86400000)
      const idx = Math.max(0, Math.min(11, 11 - Math.floor(ageDays / span)))
      if (statsMetric === 'distance') bins[idx] += (a.stats?.distance || 0) / 1000
      else if (statsMetric === 'up') bins[idx] += a.stats?.up || 0
      else bins[idx] += (a.stats?.totalSeconds || 0) / 60
    }
    const max = Math.max(1, ...bins)
    return bins.map(v => ({ value:v, height:Math.max(5, Math.round(v / max * 100)) }))
  }, [recent28, statsMetric])
  const metricDisplay = statsMetric === 'distance'
    ? { value:(recentDistance / 1000).toFixed(1).replace('.', ','), unit:'km', side:'D+ total', sideValue:`${Math.round(recentUp)} m` }
    : statsMetric === 'up'
      ? { value:String(Math.round(recentUp)), unit:'m', side:'Distance', sideValue:`${(recentDistance/1000).toFixed(1).replace('.', ',')} km` }
      : { value:recentDuration >= 3600 ? (recentDuration/3600).toFixed(1).replace('.', ',') : String(Math.round(recentDuration/60)), unit:recentDuration >= 3600 ? 'h' : 'min', side:'Sorties', sideValue:String(recent28.length) }
  const latestActivity = activities[0] || null
  const filteredTours = useMemo(() => publicTours.filter(t => {
    if (routeFilter === 'loop' && !t.roundTrip) return false
    if (routeFilter === 'point' && t.roundTrip) return false
    const km = (t.distance || 0) / 1000
    if (distanceFilter === 'short' && km > 6) return false
    if (distanceFilter === 'medium' && (km < 6 || km > 14)) return false
    if (distanceFilter === 'long' && km < 14) return false
    return true
  }), [publicTours, routeFilter, distanceFilter])
  const currentSpeedKmh = Number.isFinite(Number(location?.speed)) ? Math.max(0, Number(location.speed) * 3.6) : (sessionStats?.avgSpeed || 0)

  if (selectedActivity) return <ActivityDetail activity={selectedActivity} onBack={() => setSelectedActivity(null)} />
  if (tab === 'my' && mySection) return <>
    <MySubpage
      section={mySection}
      onBack={() => setMySection(null)}
      activities={activities}
      routes={routes}
      favorites={favoriteRouteIds}
      toggleFavorite={toggleFavorite}
      onActivity={setSelectedActivity}
      onUseRoute={r => { setRoute(r); setMySection(null); setTab('planning') }}
      onSettings={() => { setMySection(null); setTab('settings') }}
      onImport={importFile}
    />
    <BottomNav tab={tab} setTab={t => { setMySection(null); setTab(t) }} session={session} />
  </>

  const routeCard = route && <div className="selected-route-card">
    <div className="selected-route-head">
      <div><small>ITINÉRAIRE PRÊT</small><b>{route.name}</b></div>
      <button onClick={() => setRoute(null)}>×</button>
    </div>
    <div className="route-summary-inline">
      <span><b>{formatKm(routeStats?.distance)}</b> distance</span>
      <span><b>+{formatM(routeStats?.up)}</b> D+</span>
      <span><b>{formatM(routeStats?.maxEle)}</b> max</span>
    </div>
  </div>

  return <div className="nk-app">
    {tab === 'planning' && <main className="map-screen bf-planning-screen nk-plan-screen">
      <MapView
        route={route?.points || []}
        location={location}
        heading={heading}
        mode={mapMode}
        follow={follow}
        rotateWithHeading={rotateMap}
        fitRoute={!!route}
        onMapReady={map => {
          map.on('click', e => {
            const destination = { lat:e.lngLat.lat, lon:e.lngLat.lng, name:'Point sur la carte', shortName:'Point sur la carte' }
            setPlanTo(destination)
            setPlanToText('Point sur la carte')
            setRoute(null)
            calculatePlan(destination)
          })
        }}
      />
      <WeatherChip weather={weather} onClick={() => setShowWeather(true)} />
      <MapRail mapMode={mapMode} setMapMode={setMapMode} follow={follow} setFollow={setFollow} rotateMap={rotateMap} requestHeading={requestHeading} />

      <BottomSheet key={route?.id ? 'planned-route' : 'empty-plan'} className="nk-plan-sheet" collapsedHeight={190} midRatio={route ? .48 : .41} maxRatio={.66} initialSnap={1}>
        <div className="nk-plan-header">
          <div>
            <small>PLANIFIER</small>
            <h2>Créer un itinéraire</h2>
          </div>
          <button className="nk-plan-nearby" onClick={() => {
            setTab('search')
            loadPublicTours(location || planFrom)
          }}>
            <MiniIcon type="search" />
            <span>Randos autour</span>
          </button>
        </div>

        <div className="nk-plan-route-card">
          <div className="nk-plan-route-row">
            <span className="nk-plan-point start"><span /></span>
            <button className="nk-plan-origin" onClick={async () => {
              setPlanFromText('Ma position')
              const loc = await refreshPreciseLocation()
              if (loc) setPlanFrom({ ...loc, name:'Ma position', shortName:'Ma position' })
            }}>
              <small>DÉPART</small>
              <b>{planFromText}</b>
              <span>{location ? `GPS ±${Math.round(location.accuracy || 0)} m · toucher pour affiner` : 'Recherche GPS…'}</span>
            </button>
            <button className="nk-plan-row-action" onClick={refreshPreciseLocation} aria-label="Rafraîchir le GPS">
              <MiniIcon type="locate" />
            </button>
          </div>

          <div className="nk-plan-route-connector" />

          <div className="nk-plan-route-row destination">
            <span className="nk-plan-point end"><span /></span>
            <div className="nk-plan-destination">
              <small>ARRIVÉE</small>
              <SearchBox
                value={planToText}
                onChange={v => {
                  setPlanToText(v)
                  setPlanTo(null)
                  setRoute(null)
                  setPlanningError('')
                }}
                placeholder="Rechercher un lieu ou un sommet…"
                onSelect={r => {
                  setPlanTo(r)
                  setPlanToText(r.shortName || r.name)
                  setRoute(null)
                  calculatePlan(r)
                }}
              />
            </div>
            <button className="nk-plan-row-action" disabled={!planTo && !route} onClick={() => {
              setPlanTo(null)
              setPlanToText('')
              setRoute(null)
              setPlanningError('')
            }} aria-label="Effacer l’arrivée">
              <MiniIcon type="trash" />
            </button>
          </div>
        </div>

        {!route && <>
          <div className="nk-plan-shortcuts">
            <button onClick={() => {
              setTab('search')
              loadPublicTours(location || planFrom)
            }}>
              <MiniIcon type="search" />
              <span>Circuits proches</span>
            </button>
            <label>
              <MiniIcon type="import" />
              <span>Importer GPX</span>
              <input hidden type="file" accept=".gpx,application/gpx+xml" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} />
            </label>
            <button onClick={() => setFollow(true)}>
              <MiniIcon type="locate" />
              <span>Me recentrer</span>
            </button>
          </div>
          <div className="nk-plan-map-hint">Ou touche directement la carte pour choisir l’arrivée.</div>
        </>}

        {planningBusy && <div className="nk-plan-status">Calcul de l’itinéraire…</div>}
        {planningError && <div className="nk-error nk-plan-error">{planningError}</div>}

        {route && routeStats && <div className="nk-plan-result">
          <div className="nk-plan-result-title">
            <div><small>ITINÉRAIRE PRÊT</small><b>{route.name || planToText || 'Itinéraire'}</b></div>
            <button onClick={() => {
              setPlanTo(null)
              setPlanToText('')
              setRoute(null)
              setPlanningError('')
            }}>×</button>
          </div>
          <div className="nk-plan-result-stats">
            <span><b>{formatKm(routeStats.distance)}</b><small>Distance</small></span>
            <span><b>+{formatM(routeStats.up)}</b><small>D+</small></span>
            <span><b>{formatM(routeStats.maxEle)}</b><small>Altitude max</small></span>
          </div>
          <button className="nk-plan-follow" onClick={() => setTab('track')}>
            <span>Ouvrir dans Suivi</span><b>›</b>
          </button>
        </div>}
      </BottomSheet>
    </main>}

    {tab === 'track' && <main className="map-screen tracking-map-screen bf-track-screen">
      <MapView
        route={route?.points || []}
        track={session?.points || []}
        location={displayLocation}
        rawLocation={location}
        heading={heading}
        mode={mapMode}
        follow={follow}
        rotateWithHeading={rotateMap}
        tracking={!!session}
        fitRoute={!!route && !session}
      />
      <WeatherChip weather={weather} onClick={() => setShowWeather(true)} />
      <MapRail mapMode={mapMode} setMapMode={setMapMode} follow={follow} setFollow={setFollow} rotateMap={rotateMap} requestHeading={requestHeading} />

      {!session ? <div className="bf-start-tour-wrap">
        <div className="bf-selected-sport"><span>{activeSport.icon}</span><b>{activeSport.label}</b>{location && <small>GPS ±{Math.round(location.accuracy || 0)} m</small>}</div>
        <div className="bf-start-tour-bar">
          <button className="bf-side-square bf-sport-button" onClick={() => setShowSportPicker(true)} aria-label="Choisir le sport"><span>{activeSport.icon}</span></button>
          <button className="bf-start-tour" onClick={startSession}>▶ <span>Démarrer</span></button>
          <button className="bf-side-square" onClick={refreshPreciseLocation} aria-label="Rafraîchir le GPS"><MiniIcon type="locate" /></button>
        </div>
      </div> : <>
        <button className="track-center-chip" onClick={() => setFollow(true)}><MiniIcon type="locate" /> CENTER</button>
        <section className="bf-active-panel">
          <div className="bf-active-sport"><span>{activeSport.icon}</span>{activeSport.label}</div>
          <div className="berg-track-grid">
            <TrackingStat label="Durée" value={durationPart.value} unit={durationPart.unit} />
            <TrackingStat label="Distance" value={distancePart.value} unit={distancePart.unit} />
            <TrackingStat label="Ascension" value={Math.round(sessionStats?.up || 0)} unit="m" />
            <TrackingStat label={activeSport.speedFocus ? 'Vitesse' : 'Altitude'} value={activeSport.speedFocus ? currentSpeedKmh.toFixed(1).replace('.', ',') : Math.round(location?.ele || 0)} unit={activeSport.speedFocus ? 'km/h' : 'm'} />
          </div>
          <div className="berg-page-dots"><i /><i /></div>
          <div className="berg-actions">
            <button className="berg-side-action" onClick={pauseResume}>{session.status === 'paused' ? '▶' : <span>{activeSport.icon}</span>}</button>
            <button className="berg-stop" onClick={() => setShowStopMenu(true)}>Stop Tour</button>
            <button className="berg-side-action" onClick={() => setShowStopMenu(true)}>•••</button>
          </div>
        </section>

        {showStopMenu && <div className="bf-stop-popover-backdrop" onClick={() => setShowStopMenu(false)}>
          <div className="bf-stop-popover" onClick={e => e.stopPropagation()}>
            {(sessionStats?.totalSeconds || 0) < 60 && <small>Ta sortie semble très courte</small>}
            <button className="danger" onClick={() => {
              if (confirm('Supprimer cette activité ?')) {
                localStorage.removeItem(LS_SESSION)
                setSession(null)
                setShowStopMenu(false)
              }
            }}>Supprimer l’activité <span>⌫</span></button>
            {(sessionStats?.totalSeconds || 0) >= 60 && <button onClick={() => { setShowStopMenu(false); finish() }}>Terminer et enregistrer <span>✓</span></button>}
            <button onClick={() => { if (session.status === 'paused') pauseResume(); setShowStopMenu(false) }}>Reprendre le suivi <span>▶</span></button>
          </div>
        </div>}
      </>}
    </main>}

    {tab === 'search' && <main className="map-screen bf-search-screen">
      <MapView route={route?.points || []} tourOverlays={filteredTours} location={location} focusPoint={focusPlace || tourCenter} mode={mapMode} follow={follow} />
      <WeatherChip weather={weather} onClick={() => setShowWeather(true)} />
      <MapRail mapMode={mapMode} setMapMode={setMapMode} follow={follow} setFollow={setFollow} rotateMap={rotateMap} requestHeading={requestHeading} />
      <BottomSheet className="search-sheet tour-browser-sheet bf-search-sheet" collapsedHeight={270} midRatio={.40} maxRatio={.58} initialSnap={0} expandSignal={searchExpandKey}>
        <div className="bf-search-topline">
          <SearchBox value={search} onChange={setSearch} placeholder="Lieu, sommet, col…" onSelect={r => {
            const center = { lat:r.lat, lon:r.lon }
            setFocusPlace(center)
            setSearch(r.shortName || r.name)
            setPlanTo(r)
            setPlanToText(r.shortName || r.name)
            setSearchExpandKey(k => k + 1)
            loadPublicTours(center)
          }} />
          <button className="bf-around-me" onClick={async () => {
            const loc = await refreshPreciseLocation()
            if (!loc) return
            setFocusPlace(null)
            setSearch('')
            setSearchExpandKey(k => k + 1)
            loadPublicTours(loc)
          }}><MiniIcon type="locate" /><span>Autour de moi</span></button>
        </div>

        <div className="bf-search-filters">
          <label>Type
            <select value={routeFilter} onChange={e => setRouteFilter(e.target.value)}>
              <option value="all">Tous</option>
              <option value="loop">Boucles</option>
              <option value="point">Itinéraires</option>
            </select>
          </label>
          <label>Distance
            <select value={distanceFilter} onChange={e => setDistanceFilter(e.target.value)}>
              <option value="all">Toutes</option>
              <option value="short">≤ 6 km</option>
              <option value="medium">6–14 km</option>
              <option value="long">≥ 14 km</option>
            </select>
          </label>
          <div className="bf-search-gps">{location ? `GPS ±${Math.round(location.accuracy || 0)} m` : 'GPS…'}</div>
        </div>

        <button className="bf-show-tours" onClick={() => {
          setSearchExpandKey(k => k + 1)
          loadPublicTours(focusPlace || location || planFrom)
        }} disabled={tourBusy}>
          {tourBusy ? 'Recherche des randonnées autour…' : `${filteredTours.length} randonnée${filteredTours.length > 1 ? 's' : ''} autour de la zone`}
        </button>

        <div className="tour-browser-head">
          <div><small>RANDONNÉES À PROXIMITÉ</small><b>{tourCenter ? (search || 'Autour de ma position') : 'Autour de ma position'}</b></div>
          <button onClick={() => loadPublicTours(focusPlace || location || planFrom)} disabled={tourBusy}>{tourBusy ? '…' : 'Actualiser'}</button>
        </div>

        {tourError && <div className="tour-error">{tourError}</div>}

        <div className="tour-list bf-nearby-tour-list">
          {filteredTours.map(t => <button key={t.id} onClick={() => usePublicTour(t)}>
            <div className="tour-badge">{t.roundTrip ? '↻' : '↗'}</div>
            <div className="tour-main"><b>{t.name}</b><span>{formatKm(t.distance)} · {t.roundTrip ? 'Boucle' : 'Itinéraire'}{Number.isFinite(t.centerDistance) ? ` · à ${formatKm(t.centerDistance)}` : ''}{t.ref ? ' · ' + t.ref : ''}</span></div>
            <span className="chev">›</span>
          </button>)}
          {!tourBusy && !filteredTours.length && !tourError && <div className="tour-empty">Aucune randonnée ne correspond aux filtres. Essaie “Toutes”.</div>}
        </div>
      </BottomSheet>
    </main>}

    {tab === 'my' && <main className="bf-my-page">
      <section className="bf-profile-head">
        <div className="bf-avatar"><NavIcon type="my" /></div>
        <div className="bf-profile-name">NKRando</div>
        <button className="bf-head-icon" aria-label="Notifications">♢</button>
        <button className="bf-head-icon" onClick={() => setTab('settings')} aria-label="Réglages"><NavIcon type="settings" /></button>
      </section>

      <section className="bf-watch-card">
        <div className="bf-watch-art"><MiniIcon type="compass" /></div>
        <div><b>Connecter une montre GPS</b><span>Connecte Garmin ou Polar pour importer tes activités.</span></div>
      </section>

      <section className="bf-stats-card">
        <div className="bf-stats-top"><span>STATISTIQUES : 4 DERNIÈRES SEMAINES</span><b>⌃</b></div>
        <div className="bf-stats-main">
          <div><strong>{metricDisplay.value}</strong><em>{metricDisplay.unit}</em></div>
          <div className="bf-prev"><small>{metricDisplay.side}</small><b>{metricDisplay.sideValue}</b></div>
        </div>
        <div className="bf-segment">
          <button className={statsMetric === 'distance' ? 'active' : ''} onClick={() => setStatsMetric('distance')}>Distance</button>
          <button className={statsMetric === 'up' ? 'active' : ''} onClick={() => setStatsMetric('up')}>Dénivelé</button>
          <button className={statsMetric === 'duration' ? 'active' : ''} onClick={() => setStatsMetric('duration')}>Durée</button>
        </div>
        <div className="bf-mini-chart">
          {recentChart.map((bar,i)=><i key={i} title={String(Math.round(bar.value*10)/10)} style={{height:`${bar.height}%`}} />)}
        </div>
      </section>

      {latestActivity && <button className="bf-latest-card" onClick={() => setSelectedActivity(latestActivity)}>
        <small>{sportById(latestActivity.sport).label.toUpperCase()} · {new Date(latestActivity.endedAt).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</small>
        <div><b>{formatKm(latestActivity.stats?.distance)}</b><b>↑ {formatM(latestActivity.stats?.up)}</b><b>◷ {formatTime(latestActivity.stats?.totalSeconds)}</b></div>
      </button>}

      <section className="bf-menu-list">
        {[
          ['activity','Activités',activities.length,()=>setMySection('activities')],
          ['friends','Activités des amis',0,()=>setMySection('friendActivities')],
          ['heart','Favoris',favoriteRouteIds.length,()=>setMySection('favorites')],
          ['pin','Mes temps forts',activities.filter(a => a.notes || a.photos?.length).length,()=>setMySection('highlights')],
          ['tour','Mes circuits',routes.length,()=>setMySection('tours')],
          ['peak','Noms des sommets','',()=>setMySection('peaks')],
          ['friends','Amis',1,()=>setMySection('friends')],
          ['challenge','Défis',0,()=>setMySection('challenges')],
          ['rating','Mes évaluations','',()=>setMySection('ratings')],
          ['stats','Statistiques','',()=>setMySection('stats')],
          ['heat','Heatmap','',()=>setMySection('heatmap')],
          ['offline','Cartes hors ligne','',()=>setMySection('offline')],
          ['watch','Connecter une montre GPS','',()=>setMySection('watch')],
          ['more','Outils','',()=>setMySection('tools')],
          ['challenge','Bilan annuel','',()=>setMySection('yearly')],
          ['peak','Registre des sommets','',()=>setMySection('summits')]
        ].map(([icon,label,count,onClick]) => <button key={label} onClick={onClick}>
          <span className="bf-list-icon"><MenuIcon type={icon} /></span>
          <span className="bf-list-label">{label}</span>
          {count !== '' && <span className="bf-list-count">{count}</span>}
          <span className="bf-chevron">›</span>
        </button>)}
      </section>
    </main>}

    {tab === 'settings' && <main className="bf-settings-page">
      <header className="bf-settings-title"><h1>Réglages</h1></header>

      <section className="bf-settings-list bf-settings-first">
        <label>
          <span className="settings-icon"><MiniIcon type="import" /></span>
          <div><b>Importer un GPX</b><small>Ajouter un itinéraire à NKRando</small></div><span>›</span>
          <input hidden type="file" accept=".gpx" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} />
        </label>
      </section>

      <span className="bf-settings-section">CARTE</span>
      <section className="bf-settings-list">
        <div>
          <span className="settings-icon"><MiniIcon type="map" /></span>
          <div><b>Apparence</b><small>{mapMode === 'satellite' ? 'Satellite' : mapMode === 'terrain' ? 'Relief' : mapMode === 'light' ? 'Clair' : 'Randonnée détaillée'}</small></div>
          <select value={mapMode} onChange={e => setMapMode(e.target.value)}>
            <option value="topo">Randonnée</option><option value="terrain">Relief</option><option value="light">Clair</option><option value="satellite">Satellite</option>
          </select>
        </div>
        <button onClick={() => setShowLegend(v => !v)}>
          <span className="settings-icon"><MiniIcon type="compass" /></span><div><b>Légende</b><small>Symboles de la carte</small></div><span>{showLegend ? '⌃' : '›'}</span>
        </button>
        <button onClick={() => { setTab('my'); setMySection('offline') }}>
          <span className="settings-icon"><MiniIcon type="offline" /></span><div><b>Cartes hors ligne</b><small>Cache automatique des zones consultées</small></div><span>›</span>
        </button>
      </section>

      <span className="bf-settings-section">SUIVI</span>
      <section className="bf-settings-list">
        <div><span className="settings-icon"><MiniIcon type="locate" /></span><div><b>Suivre ma position</b><small>Recentrage automatique pendant une sortie</small></div><Toggle checked={autoFollow} onChange={setAutoFollow} /></div>
        <div><span className="settings-icon"><MiniIcon type="screen" /></span><div><b>Garder l’écran allumé</b><small>Recommandé pendant une randonnée</small></div><Toggle checked={keepAwake} onChange={setKeepAwake} /></div>
        <div><span className="settings-icon"><MiniIcon type="compass" /></span><div><b>Orientation boussole</b><small>La carte suit la direction de l’iPhone</small></div><button className="settings-action" onClick={requestHeading}>{headingEnabled?'Activée':'Activer'}</button></div>
      </section>

      <span className="bf-settings-section">DONNÉES</span>
      <section className="bf-settings-list">
        <button onClick={() => { setTab('my'); setMySection('tours') }}>
          <span className="settings-icon"><MenuIcon type="tour" /></span><div><b>Mes circuits</b><small>{routes.length} enregistré(s)</small></div><span>›</span>
        </button>
        <button onClick={() => { setTab('my'); setMySection('stats') }}>
          <span className="settings-icon"><MenuIcon type="stats" /></span><div><b>Statistiques</b><small>{activities.length} activité(s)</small></div><span>›</span>
        </button>
      </section>

      {showLegend && <section className="bf-settings-list bf-legend-inline">
        <div><span className="legend-red" /><span>Tracé enregistré</span></div>
        <div><span className="legend-blue" /><span>Itinéraire</span></div>
        <div><span className="legend-dash" /><span>Sentier</span></div>
      </section>}
    </main>}

    <BottomNav tab={tab} setTab={setTab} session={session} />

    {completion && <CompletionEditor activity={completion} onSaved={a => {
      setActivities(x => [a, ...x.filter(v => v.id !== a.id)])
      setCompletion(null)
      setSelectedActivity(a)
      setTab('my')
    }} onClose={() => setCompletion(null)} />}

    {showSportPicker && <SportPicker value={selectedSport} onSelect={setSelectedSport} onClose={() => setShowSportPicker(false)} />}
    {showWeather && weatherPoint && <WeatherForecastModal point={weatherPoint} name={weatherName} onClose={() => setShowWeather(false)} />}
  </div>
}
