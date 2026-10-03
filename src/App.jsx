import { useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView'
import ProfileChart from './components/ProfileChart'
import { geocode, buildHikingRoute, ensureElevation, searchHikingTours } from './lib/api'
import { parseGPX, toGPX } from './lib/gpx'
import { deleteRoute, getActivities, getRoutes, saveActivity, saveRoute } from './lib/db'
import {
  activityStats, enrichRoute, formatKm, formatM, formatTime, haversine,
  nearestRouteIndex, progressStats, routeTotals
} from './lib/geo'

const LS_SESSION = 'nkrando-active-session-v1'
const LS_ROUTE = 'nkrando-current-route-v1'
const LS_MAP_MODE = 'nkrando-map-mode-v1'
const LS_KEEP_AWAKE = 'nkrando-keep-awake-v1'
const LS_AUTO_FOLLOW = 'nkrando-auto-follow-v1'

function NavIcon({ type }) {
  const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (type === 'my') return <svg {...common}><circle cx="12" cy="7" r="3"/><path d="M5.5 20c.7-4 2.8-6 6.5-6s5.8 2 6.5 6"/></svg>
  if (type === 'planning') return <svg {...common}><path d="M5 18 18 5"/><circle cx="5" cy="18" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8 15h4m-1-1v4"/></svg>
  if (type === 'track') return <svg {...common}><path d="m4 12 16-7-7 16-2.1-6.9L4 12Z"/></svg>
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
  return <svg {...common}><path d="M4 18V9m5 9V5m5 13v-7m5 7V3"/></svg>
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
    ['my', 'Mes sorties'],
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

function Toggle({ checked, onChange, disabled = false }) {
  return <button className={checked ? 'nk-toggle on' : 'nk-toggle'} disabled={disabled} onClick={() => !disabled && onChange(!checked)} aria-pressed={checked}>
    <span />
  </button>
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
        <div><small>ACTIVITÉ TERMINÉE</small><h2>Enregistrer la sortie</h2></div>
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
  const [heading, setHeading] = useState(0)
  const [headingEnabled, setHeadingEnabled] = useState(false)
  const [follow, setFollow] = useState(false)
  const [rotateMap, setRotateMap] = useState(false)
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
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_SESSION)) } catch { return null }
  })
  const [tick, setTick] = useState(Date.now())
  const [progressIndex, setProgressIndex] = useState(0)
  const [completion, setCompletion] = useState(null)
  const [selectedActivity, setSelectedActivity] = useState(null)
  const tourAutoKey = useRef('')
  const wakeLock = useRef(null)

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
    navigator.geolocation?.getCurrentPosition(p => {
      const loc = {
        lat:p.coords.latitude, lon:p.coords.longitude,
        ele:p.coords.altitude, accuracy:p.coords.accuracy,
        speed:p.coords.speed, ts:p.timestamp
      }
      setLocation(loc)
      setPlanFrom({ ...loc, name:'Ma position', shortName:'Ma position' })
    }, () => {}, { enableHighAccuracy:true, timeout:12000, maximumAge:15000 })
  }, [])

  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

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
    if (!session || !['active','paused'].includes(session.status) || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(pos => {
      const p = {
        lat: pos.coords.latitude, lon: pos.coords.longitude,
        ele: Number.isFinite(pos.coords.altitude) ? pos.coords.altitude : undefined,
        accuracy: pos.coords.accuracy, speed: pos.coords.speed,
        heading: pos.coords.heading, ts: pos.timestamp || Date.now()
      }
      setLocation(p)
      if (session.status !== 'active' || p.accuracy > 80) return
      setSession(s => {
        if (!s || s.status !== 'active') return s
        const prev = s.points?.at(-1)
        if (prev && haversine(prev, p) < 1.8 && p.ts - prev.ts < 4000) return s
        return { ...s, points: [...(s.points || []), p] }
      })
    }, () => {}, { enableHighAccuracy:true, maximumAge:0, timeout:20000 })
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

  const requestHeading = async () => {
    try {
      if (!headingEnabled && typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const ok = await DeviceOrientationEvent.requestPermission()
        if (ok !== 'granted') return
      }
      if (!headingEnabled) {
        const handler = e => {
          const h = Number.isFinite(e.webkitCompassHeading)
            ? e.webkitCompassHeading
            : (Number.isFinite(e.alpha) ? (360 - e.alpha) % 360 : 0)
          setHeading(h)
        }
        window.addEventListener('deviceorientation', handler, true)
        setHeadingEnabled(true)
      }
      setRotateMap(v => !v)
    } catch {}
  }

  const importFile = async file => {
    try {
      const parsed = parseGPX(await file.text())
      parsed.points = await ensureElevation(parsed.points)
      await saveRoute(parsed)
      setRoutes(rs => [parsed, ...rs.filter(r => r.id !== parsed.id)])
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
      const found = await searchHikingTours(center.lat, center.lon, 16000)
      setPublicTours(found)
      if (!found.length) setTourError('Aucun circuit public trouvé dans un rayon de 18 km.')
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
      setRoute(r)
      setRoutes(list => [r, ...list.filter(x => x.id !== r.id)])
    } catch (e) {
      setPlanningError(e.message || 'Impossible de calculer cet itinéraire.')
    } finally {
      setPlanningBusy(false)
    }
  }

  const startSession = async () => {
    try {
      const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy:true, timeout:15000, maximumAge:3000
      }))
      setLocation({
        lat:pos.coords.latitude, lon:pos.coords.longitude,
        ele:pos.coords.altitude, accuracy:pos.coords.accuracy,
        speed:pos.coords.speed, ts:pos.timestamp
      })
    } catch {}
    const hasRoute = !!route?.points?.length
    const s = {
      id:crypto.randomUUID(), routeId:hasRoute ? route.id : null,
      freeActivity:!hasRoute,
      startedAt:Date.now(), pausedMs:0,
      pauseStartedAt:null, status:'active', points:[]
    }
    setSession(s)
    setTab('track')
    setFollow(autoFollow)
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
    const stats = activityStats(session.points || [], session.startedAt, endedAt, pausedMs)
    const a = {
      id:session.id, name:route?.name || 'Activité libre',
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

  const sessionStats = useMemo(() => {
    if (!session) return null
    const pausedNow = (session.pausedMs || 0) +
      (session.status === 'paused' && session.pauseStartedAt ? tick - session.pauseStartedAt : 0)
    return activityStats(session.points || [], session.startedAt, tick, pausedNow)
  }, [session, tick])

  const routeStats = useMemo(() => route?.points ? routeTotals(route.points) : null, [route])
  const prog = useMemo(() => route?.points ? progressStats(route.points, progressIndex) : null, [route, progressIndex])
  const deviation = useMemo(() => location && route?.points?.[progressIndex]
    ? haversine(location, route.points[progressIndex]) : 0, [location, route, progressIndex])

  if (selectedActivity) return <ActivityDetail activity={selectedActivity} onBack={() => setSelectedActivity(null)} />

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
    {tab === 'planning' && <main className="map-screen">
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
      <MapRail mapMode={mapMode} setMapMode={setMapMode} follow={follow} setFollow={setFollow} rotateMap={rotateMap} requestHeading={requestHeading} />
      <section className="map-bottom-sheet planning-sheet">
        <div className="nk-sheet-handle" />
        <div className="planner-modes">
          <div><span>Activité</span><b>Randonnée</b></div>
          <div><span>Allure</span><b>Normale</b></div>
          <div><span>Trajet</span><b>Aller simple</b></div>
        </div>

        <div className="planner-route-line">
          <span className="route-number">1</span>
          <button className="planner-origin" onClick={() => {
            if (location) {
              setPlanFrom({ ...location, name:'Ma position', shortName:'Ma position' })
              setPlanFromText('Ma position')
            }
          }}>
            <b>{planFromText}</b>
          </button>
          <span className="planner-connector">···</span>
          <div className="planner-destination">
            <SearchBox value={planToText} onChange={v => { setPlanToText(v); setPlanTo(null); setRoute(null) }} placeholder="Nouvelle destination" onSelect={r => {
              setPlanTo(r)
              setPlanToText(r.shortName || r.name)
              setRoute(null)
              calculatePlan(r)
            }} />
          </div>
          <button className="planner-clear" disabled={!planTo && !route} aria-label="Effacer l’itinéraire" onClick={() => {
            setPlanTo(null)
            setPlanToText('')
            setRoute(null)
            setPlanningError('')
          }}><MiniIcon type="trash" /></button>
        </div>

        {planningError && <div className="nk-error">{planningError}</div>}
        {routeCard}

        <div className="planner-footer bergfex-footer">
          <button className="planner-search-link" onClick={() => { setTab('search'); loadPublicTours(location || planFrom) }}><MiniIcon type="search" /> Circuits</button>
          <label className="planner-gpx"><MiniIcon type="import" /><span>GPX</span><input hidden type="file" accept=".gpx,application/gpx+xml" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
          <span className="planner-help">{planningBusy ? 'Calcul du tracé…' : route ? 'Tracé prêt' : 'Touchez la carte pour ajouter une destination'}</span>
          {route && <button className="planner-go-track" onClick={() => setTab('track')}>Suivi ›</button>}
        </div>
      </section>
    </main>}

    {tab === 'track' && <main className="map-screen">
      <MapView
        route={route?.points || []}
        track={session?.points || []}
        location={location}
        heading={heading}
        mode={mapMode}
        follow={follow}
        rotateWithHeading={rotateMap}
      />
      <MapRail mapMode={mapMode} setMapMode={setMapMode} follow={follow} setFollow={setFollow} rotateMap={rotateMap} requestHeading={requestHeading} />
      {session && <div className="tracking-status-pill"><i className={session.status === 'paused' ? 'paused' : ''} /><span>{session.status === 'paused' ? 'En pause' : 'Enregistrement'}</span></div>}
      <section className={session ? "map-bottom-sheet tracking-sheet-dark active-session" : "map-bottom-sheet tracking-sheet-dark idle-session"}>
        <div className="nk-sheet-handle" />
        {!session ? <>
          <div className="tracking-ready">
            <small>{route ? 'AVEC ITINÉRAIRE' : 'ACTIVITÉ LIBRE'}</small>
            <h2>{route ? route.name : 'Suivi GPS'}</h2>
          </div>
          <button className="nk-primary full tracking-start" onClick={startSession}>▶ Démarrer</button>
        </> : <>
          {route?.points?.length ? <div className="tracking-topline">
            <span className={deviation > 80 ? 'route-state warn' : 'route-state'}>{deviation < 50 ? '✓ Tracé OK' : Math.round(deviation) + ' m hors tracé'}</span>
            <span className="progress-mini">{Math.round(prog?.percent || 0)}%</span>
          </div> : null}
          <div className="nk-quad tracking-quad">
            <StatBox label="Temps" value={formatTime(sessionStats?.totalSeconds)} accent />
            <StatBox label="Distance" value={formatKm(sessionStats?.distance)} />
            <StatBox label="D+" value={'+' + formatM(sessionStats?.up)} />
            <StatBox label="Altitude" value={formatM(location?.ele)} />
          </div>
          {route?.points?.length && <div className="tracking-remaining">
            <span><b>{formatKm(prog?.distanceRemaining)}</b><small>reste</small></span>
            <span><b>+{formatM(prog?.upRemaining)}</b><small>D+ reste</small></span>
            <span><b>{formatTime(sessionStats?.movingSeconds)}</b><small>mouvement</small></span>
          </div>}
          <div className="tracking-buttons">
            <button className="pause-square" onClick={pauseResume}>{session.status === 'paused' ? '▶' : 'Ⅱ'}</button>
            <button className="stop-tour" onClick={() => confirm('Terminer et enregistrer cette activité ?') && finish()}>
              {session.status === 'paused' ? 'Terminer l’activité' : 'Terminer'}
            </button>
            <button className="more-square">•••</button>
          </div>
        </>}
      </section>
    </main>}

    {tab === 'search' && <main className="map-screen">
      <MapView route={route?.points || []} tourOverlays={publicTours} location={location} focusPoint={focusPlace} mode={mapMode} follow={follow} />
      <MapRail mapMode={mapMode} setMapMode={setMapMode} follow={follow} setFollow={setFollow} rotateMap={rotateMap} requestHeading={requestHeading} />
      <section className="map-bottom-sheet search-sheet tour-browser-sheet">
        <div className="nk-sheet-handle" />
        <SearchBox value={search} onChange={setSearch} placeholder="Lieu, sommet, col…" onSelect={r => {
          const center = { lat:r.lat, lon:r.lon }
          setFocusPlace(center)
          setSearch(r.shortName || r.name)
          setPlanTo(r)
          setPlanToText(r.shortName || r.name)
          loadPublicTours(center)
        }} />
        <div className="tour-browser-head">
          <div><small>CIRCUITS PUBLICS</small><b>{tourCenter ? 'Autour de la zone' : 'Autour de ma position'}</b></div>
          <button onClick={() => loadPublicTours(location || focusPlace || planFrom)} disabled={tourBusy}>{tourBusy ? 'Recherche…' : 'Actualiser'}</button>
        </div>
        {tourError && <div className="tour-error">{tourError}</div>}
        <div className="tour-list">
          {publicTours.map(t => <button key={t.id} onClick={() => usePublicTour(t)}>
            <div className="tour-badge">{t.roundTrip ? '↻' : '↗'}</div>
            <div className="tour-main"><b>{t.name}</b><span>{formatKm(t.distance)} · {t.roundTrip ? 'Boucle' : 'Itinéraire'}{t.ref ? ' · ' + t.ref : ''}</span></div>
            <span className="chev">›</span>
          </button>)}
          {!tourBusy && !publicTours.length && <div className="tour-empty">Appuie sur <b>Actualiser</b> pour charger les circuits de randonnée publics autour de toi.</div>}
        </div>
        {!!routes.length && <div className="saved-route-strip">
          <span>Mes itinéraires</span>
          {routes.slice(0,3).map(r => <button key={r.id} onClick={() => { setRoute(r); setTab('planning') }}>{r.name}</button>)}
        </div>}
      </section>
    </main>}

    {tab === 'my' && <main className="dark-page">
      <header className="dark-page-header">
        <div><small>NKRANDO</small><h1>Mes sorties</h1></div>
        <label className="header-import">＋<input hidden type="file" accept=".gpx" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
      </header>
      <div className="dashboard-cards">
        <div><span>Activités</span><b>{activities.length}</b></div>
        <div><span>Itinéraires</span><b>{routes.length}</b></div>
        <div><span>Distance</span><b>{formatKm(activities.reduce((a,x) => a + (x.stats?.distance || 0), 0))}</b></div>
      </div>
      <section className="dark-section">
        <h2>Activités récentes</h2>
        {!activities.length && <div className="dark-empty">Ta première activité enregistrée apparaîtra ici.</div>}
        {activities.map(a => <button className="dark-list-row" key={a.id} onClick={() => setSelectedActivity(a)}>
          <span className="list-icon">⌁</span>
          <div><b>{a.name}</b><small>{new Date(a.endedAt).toLocaleDateString('fr-FR')} · {formatKm(a.stats.distance)} · +{formatM(a.stats.up)}</small></div>
          <span>›</span>
        </button>)}
      </section>
      <section className="dark-section">
        <h2>Itinéraires sauvegardés</h2>
        {!routes.length && <div className="dark-empty">Importe un GPX ou planifie un parcours.</div>}
        {routes.map(r => {
          const s = routeTotals(r.points || [])
          return <div className="dark-route-row" key={r.id}>
            <button onClick={() => { setRoute(r); setTab('planning') }}>
              <span className="list-icon">▲</span>
              <div><b>{r.name}</b><small>{formatKm(s.distance)} · +{formatM(s.up)}</small></div>
            </button>
            <button className="delete-route" onClick={async () => {
              await deleteRoute(r.id)
              setRoutes(x => x.filter(v => v.id !== r.id))
              if (route?.id === r.id) setRoute(null)
            }}>×</button>
          </div>
        })}
      </section>
    </main>}

    {tab === 'settings' && <main className="dark-page settings-page">
      <header className="settings-header"><small>NKRANDO</small><h1>Réglages</h1></header>

      <section className="settings-hero">
        <div className="mountain-logo"><span>▲</span><span>▲</span><span>▲</span></div>
        <h2>NKRando Outdoor</h2>
        <p>Cartes, GPX, suivi GPS et navigation montagne dans une interface pensée pour le terrain.</p>
      </section>

      <section className="settings-group">
        <label className="settings-section-label">CARTES</label>
        <div className="settings-card">
          <label className="settings-row import-row">
            <span className="settings-icon"><MiniIcon type="import" /></span><div><b>Importer un GPX</b><small>Ajouter un itinéraire à NKRando</small></div><span>›</span>
            <input hidden type="file" accept=".gpx" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} />
          </label>
          <div className="settings-row">
            <span className="settings-icon"><MiniIcon type="map" /></span>
            <div><b>Apparence de la carte</b><small>{mapMode === 'satellite' ? 'Satellite' : mapMode === 'terrain' ? 'Relief' : mapMode === 'light' ? 'Clair' : 'Topo'}</small></div>
            <select value={mapMode} onChange={e => setMapMode(e.target.value)}>
              <option value="topo">Topo</option>
              <option value="terrain">Relief</option>
              <option value="light">Clair</option>
              <option value="satellite">Satellite</option>
            </select>
          </div>
          <div className="settings-row">
            <span className="settings-icon"><MiniIcon type="offline" /></span>
            <div><b>Cartes hors ligne</b><small>Cache automatique des zones consultées</small></div>
            <span className="status-pill">Actif</span>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <label className="settings-section-label">SUIVI</label>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-icon"><MiniIcon type="locate" /></span>
            <div><b>Suivre ma position</b><small>Recentrage automatique au démarrage</small></div>
            <Toggle checked={autoFollow} onChange={setAutoFollow} />
          </div>
          <div className="settings-row">
            <span className="settings-icon"><MiniIcon type="screen" /></span>
            <div><b>Garder l’écran allumé</b><small>Réduit le risque de suspension de la PWA</small></div>
            <Toggle checked={keepAwake} onChange={setKeepAwake} />
          </div>
          <div className="settings-row">
            <span className="settings-icon"><MiniIcon type="compass" /></span>
            <div><b>Orientation boussole</b><small>La flèche suit la direction de l’iPhone</small></div>
            <button className="settings-action" onClick={requestHeading}>{headingEnabled ? 'Activée' : 'Activer'}</button>
          </div>
        </div>
      </section>

      <section className="settings-group">
        <label className="settings-section-label">STOCKAGE</label>
        <div className="settings-card">
          <div className="settings-row">
            <span className="settings-icon"><MiniIcon type="data" /></span>
            <div><b>Données locales</b><small>{activities.length} activité(s) · {routes.length} itinéraire(s)</small></div>
            <span>›</span>
          </div>
          <div className="settings-row disabled-row">
            <span className="settings-icon"><MiniIcon type="weekly" /></span>
            <div><b>Résumé hebdomadaire</b><small>Bientôt disponible</small></div>
            <Toggle checked={false} onChange={() => {}} disabled />
          </div>
        </div>
      </section>

      <div className="settings-warning">
        Le suivi GPS en arrière-plan reste limité par iOS pour une PWA. Pour une sortie longue, garde l’écran allumé ou utilise l’app en complément d’un outil de navigation dédié.
      </div>
    </main>}

    <BottomNav tab={tab} setTab={setTab} session={session} />

    {completion && <CompletionEditor activity={completion} onSaved={a => {
      setActivities(x => [a, ...x.filter(v => v.id !== a.id)])
      setCompletion(null)
      setSelectedActivity(a)
      setTab('my')
    }} onClose={() => setCompletion(null)} />}
  </div>
}
