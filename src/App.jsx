import { useEffect, useMemo, useRef, useState } from 'react'
import MapView from './components/MapView'
import ProfileChart from './components/ProfileChart'
import { geocode, buildHikingRoute, ensureElevation } from './lib/api'
import { parseGPX, toGPX } from './lib/gpx'
import { deleteRoute, getActivities, getRoutes, saveActivity, saveRoute } from './lib/db'
import {
  activityStats, enrichRoute, formatKm, formatM, formatTime, haversine,
  nearestRouteIndex, progressStats, routeTotals
} from './lib/geo'

const LS_SESSION = 'nkrando-active-session-v1'
const LS_ROUTE = 'nkrando-current-route-v1'

const Icon = ({ children }) => <span className="icon">{children}</span>
const Stat = ({ label, value, strong }) => <div className={strong ? 'stat strong' : 'stat'}><b>{value}</b><span>{label}</span></div>

function SearchBox({ value, onChange, placeholder, onSelect, compact }) {
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const id = setTimeout(async () => {
      if (!value || value.trim().length < 2) return setResults([])
      setBusy(true)
      try { setResults(await geocode(value)) } catch { setResults([]) }
      finally { setBusy(false) }
    }, 350)
    return () => clearTimeout(id)
  }, [value])
  return <div className={compact ? 'search-box compact' : 'search-box'}>
    <div className="search-input-wrap">
      <span>⌕</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {busy && <span className="spinner">◌</span>}
    </div>
    {!!results.length && <div className="search-results">
      {results.map(r => <button key={r.id} onClick={() => { onSelect(r); setResults([]) }}>
        <b>{r.shortName || r.name.split(',')[0]}</b><span>{r.name}</span>
      </button>)}
    </div>}
  </div>
}

function RoutePlanner({ location, onClose, onRoute }) {
  const [fromText, setFromText] = useState('')
  const [toText, setToText] = useState('')
  const [from, setFrom] = useState(null)
  const [to, setTo] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const useMyPosition = () => {
    if (!location) return setError('Position GPS indisponible pour le moment.')
    const p = { lat: location.lat, lon: location.lon, name: 'Ma position', shortName: 'Ma position' }
    setFrom(p); setFromText('Ma position')
  }
  const go = async () => {
    if (!from || !to) return setError('Choisis un départ et une arrivée.')
    setBusy(true); setError('')
    try {
      const route = await buildHikingRoute(from, to)
      await saveRoute(route)
      onRoute(route)
      onClose()
    } catch (e) { setError(e.message || 'Impossible de calculer cet itinéraire.') }
    finally { setBusy(false) }
  }
  return <div className="sheet-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className="sheet planner">
      <div className="sheet-handle" />
      <div className="sheet-title"><div><small>PLANIFIER</small><h2>Créer un itinéraire</h2></div><button className="round ghost" onClick={onClose}>×</button></div>
      <label>Départ</label>
      <div className="planner-row">
        <SearchBox compact value={fromText} onChange={v => { setFromText(v); setFrom(null) }} placeholder="Valmorel, parking, sommet…" onSelect={r => { setFrom(r); setFromText(r.shortName || r.name) }} />
        <button className="gps-mini" onClick={useMyPosition}>◎</button>
      </div>
      <label>Arrivée</label>
      <SearchBox compact value={toText} onChange={v => { setToText(v); setTo(null) }} placeholder="Pointe du Niélard…" onSelect={r => { setTo(r); setToText(r.shortName || r.name) }} />
      <div className="route-hint">Routage pédestre/montagne via OpenStreetMap. Altitudes terrain : Open-Meteo / Copernicus DEM. Vérifie toujours le terrain et le balisage sur place.</div>
      {error && <div className="error">{error}</div>}
      <button className="primary big" disabled={busy || !from || !to} onClick={go}>{busy ? 'Calcul du tracé…' : 'Calculer l’itinéraire'}</button>
    </div>
  </div>
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
  return <div className="sheet-backdrop">
    <div className="sheet completion">
      <div className="sheet-handle" />
      <div className="sheet-title"><div><small>ACTIVITÉ TERMINÉE</small><h2>Enregistrer la sortie</h2></div>{onClose && <button className="round ghost" onClick={onClose}>×</button>}</div>
      <div className="completion-stats">
        <Stat value={formatKm(activity.stats.distance)} label="Distance" />
        <Stat value={formatM(activity.stats.up)} label="D+" />
        <Stat value={formatTime(activity.stats.movingSeconds)} label="En mouvement" />
      </div>
      <label>Nom de la sortie</label>
      <input className="field" value={name} onChange={e => setName(e.target.value)} />
      <label>Difficulté ressentie</label>
      <div className="difficulty">
        {[['facile','Facile'],['moderee','Modérée'],['difficile','Difficile'],['expert','Très difficile']].map(([k,l]) =>
          <button key={k} className={difficulty === k ? 'active' : ''} onClick={() => setDifficulty(k)}>{l}</button>
        )}
      </div>
      <label>Photos</label>
      <label className="photo-add">＋ Ajouter des photos<input type="file" accept="image/*" multiple onChange={addPhotos} hidden /></label>
      {!!photos.length && <div className="photo-strip">{photos.map((p,i) => <div className="photo-chip" key={i}>{p.name || `Photo ${i+1}`}<button onClick={() => setPhotos(x => x.filter((_,j) => j !== i))}>×</button></div>)}</div>}
      <label>Commentaire</label>
      <textarea className="field textarea" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Conditions, sensations, passage à retenir…" />
      <button className="primary big" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer dans mes activités'}</button>
    </div>
  </div>
}

function ActivityDetail({ activity, onBack, onEdit }) {
  const route = activity.track || []
  return <div className="page activity-detail">
    <header className="topbar"><button className="round ghost" onClick={onBack}>‹</button><div><small>ACTIVITÉ</small><b>{activity.name}</b></div><button className="round ghost" onClick={onEdit}>•••</button></header>
    <div className="activity-map"><MapView track={route} route={activity.plannedRoute || []} fitRoute mode="topo" /></div>
    <section className="detail-body">
      <div className="date-line">{new Date(activity.endedAt).toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
      <div className="big-stat-grid">
        <Stat strong value={formatKm(activity.stats.distance)} label="Distance" />
        <Stat strong value={formatM(activity.stats.up)} label="Dénivelé +" />
        <Stat value={formatTime(activity.stats.totalSeconds)} label="Temps total" />
        <Stat value={formatTime(activity.stats.movingSeconds)} label="En mouvement" />
        <Stat value={`${activity.stats.avgSpeed.toFixed(1).replace('.', ',')} km/h`} label="Vitesse moyenne" />
        <Stat value={formatM(activity.stats.maxEle)} label="Altitude max" />
      </div>
      <h3>Profil</h3>
      <ProfileChart route={enrichRoute(route)} progressIndex={Math.max(0, route.length - 1)} />
      <div className="activity-meta"><span className="pill">{activity.difficulty || 'Non renseignée'}</span></div>
      {activity.notes && <><h3>Commentaire</h3><p className="notes">{activity.notes}</p></>}
      {!!activity.photos?.length && <><h3>Photos</h3><div className="photos-grid">{activity.photos.map((p,i) => <img key={i} src={URL.createObjectURL(p)} alt="" />)}</div></>}
      <button className="secondary big" onClick={() => {
        const blob = new Blob([toGPX(activity.name, route)], { type: 'application/gpx+xml' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${activity.name.replace(/\W+/g,'-')}.gpx`; a.click(); URL.revokeObjectURL(a.href)
      }}>Exporter en GPX</button>
    </section>
  </div>
}

export default function App() {
  const [tab, setTab] = useState('map')
  const [mapMode, setMapMode] = useState('topo')
  const [route, setRoute] = useState(null)
  const [routes, setRoutes] = useState([])
  const [activities, setActivities] = useState([])
  const [location, setLocation] = useState(null)
  const [heading, setHeading] = useState(0)
  const [headingEnabled, setHeadingEnabled] = useState(false)
  const [follow, setFollow] = useState(false)
  const [rotateMap, setRotateMap] = useState(false)
  const [planner, setPlanner] = useState(false)
  const [layerMenu, setLayerMenu] = useState(false)
  const [search, setSearch] = useState('')
  const [focusPlace, setFocusPlace] = useState(null)
  const [session, setSession] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_SESSION)) } catch { return null }
  })
  const [tick, setTick] = useState(Date.now())
  const [progressIndex, setProgressIndex] = useState(0)
  const [completion, setCompletion] = useState(null)
  const [selectedActivity, setSelectedActivity] = useState(null)
  const wakeLock = useRef(null)

  useEffect(() => {
    getRoutes().then(x => setRoutes(x.sort((a,b) => b.createdAt-a.createdAt))).catch(() => {})
    getActivities().then(x => setActivities(x.sort((a,b) => b.endedAt-a.endedAt))).catch(() => {})
    try {
      const id = localStorage.getItem(LS_ROUTE)
      if (id) getRoutes().then(rs => { const r = rs.find(x => x.id === id); if (r) setRoute(r) })
    } catch {}
    navigator.geolocation?.getCurrentPosition(p => setLocation({
      lat:p.coords.latitude, lon:p.coords.longitude, ele:p.coords.altitude, accuracy:p.coords.accuracy, speed:p.coords.speed, ts:p.timestamp
    }), () => {}, { enableHighAccuracy:true, timeout:12000, maximumAge:15000 })
  }, [])

  useEffect(() => {
    const i = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  useEffect(() => {
    if (route?.id) localStorage.setItem(LS_ROUTE, route.id)
  }, [route])

  useEffect(() => {
    if (session) localStorage.setItem(LS_SESSION, JSON.stringify(session))
    else localStorage.removeItem(LS_SESSION)
  }, [session])

  useEffect(() => {
    if (!location || !route?.points?.length) return
    setProgressIndex(prev => nearestRouteIndex(location, route.points, prev))
  }, [location, route])

  useEffect(() => {
    if (!session || !['active','paused'].includes(session.status) || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(pos => {
      const p = {
        lat: pos.coords.latitude, lon: pos.coords.longitude,
        ele: Number.isFinite(pos.coords.altitude) ? pos.coords.altitude : undefined,
        accuracy: pos.coords.accuracy, speed: pos.coords.speed, heading: pos.coords.heading, ts: pos.timestamp || Date.now()
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
      if (session?.status === 'active' && 'wakeLock' in navigator) {
        try { wakeLock.current = await navigator.wakeLock.request('screen') } catch {}
      } else {
        try { await wakeLock.current?.release() } catch {}
        wakeLock.current = null
      }
    }
    manageWake()
    return () => { try { wakeLock.current?.release() } catch {} }
  }, [session?.status])

  const requestHeading = async () => {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const ok = await DeviceOrientationEvent.requestPermission()
        if (ok !== 'granted') return
      }
      const handler = e => {
        const h = Number.isFinite(e.webkitCompassHeading) ? e.webkitCompassHeading : (Number.isFinite(e.alpha) ? (360 - e.alpha) % 360 : 0)
        setHeading(h)
      }
      window.addEventListener('deviceorientation', handler, true)
      setHeadingEnabled(true)
      setRotateMap(true)
    } catch {}
  }

  const importFile = async file => {
    try {
      const parsed = parseGPX(await file.text())
      parsed.points = await ensureElevation(parsed.points)
      await saveRoute(parsed)
      setRoutes(rs => [parsed, ...rs.filter(r => r.id !== parsed.id)])
      setRoute(parsed); setTab('map')
    } catch (e) { alert(e.message) }
  }

  const chooseRoute = r => { setRoute(r); setTab('map'); setFollow(false) }

  const startSession = async () => {
    if (!route?.points?.length) return
    try {
      const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy:true, timeout:15000, maximumAge:3000 }))
      setLocation({ lat:pos.coords.latitude, lon:pos.coords.longitude, ele:pos.coords.altitude, accuracy:pos.coords.accuracy, speed:pos.coords.speed, ts:pos.timestamp })
    } catch {}
    const s = { id:crypto.randomUUID(), routeId:route.id, startedAt:Date.now(), pausedMs:0, pauseStartedAt:null, status:'active', points:[] }
    setSession(s); setTab('track'); setFollow(true)
  }

  const pauseResume = () => setSession(s => {
    if (!s) return s
    if (s.status === 'active') return { ...s, status:'paused', pauseStartedAt:Date.now() }
    const extra = s.pauseStartedAt ? Date.now() - s.pauseStartedAt : 0
    return { ...s, status:'active', pausedMs:(s.pausedMs||0)+extra, pauseStartedAt:null }
  })

  const finish = async () => {
    if (!session) return
    const endedAt = Date.now()
    const pausedMs = (session.pausedMs || 0) + (session.status === 'paused' && session.pauseStartedAt ? endedAt - session.pauseStartedAt : 0)
    const stats = activityStats(session.points || [], session.startedAt, endedAt, pausedMs)
    const a = {
      id:session.id, name:route?.name || 'Ma randonnée', startedAt:session.startedAt, endedAt,
      pausedMs, track:session.points || [], plannedRoute:route?.points || [], routeId:route?.id,
      stats, difficulty:'moderee', notes:'', photos:[], createdAt:endedAt
    }
    await saveActivity(a)
    setActivities(x => [a, ...x.filter(v => v.id !== a.id)])
    setCompletion(a)
    setSession(null)
    setFollow(false)
  }

  const sessionStats = useMemo(() => {
    if (!session) return null
    const pausedNow = (session.pausedMs || 0) + (session.status === 'paused' && session.pauseStartedAt ? tick - session.pauseStartedAt : 0)
    return activityStats(session.points || [], session.startedAt, tick, pausedNow)
  }, [session, tick])

  const routeStats = useMemo(() => route?.points ? routeTotals(route.points) : null, [route])
  const prog = useMemo(() => route?.points ? progressStats(route.points, progressIndex) : null, [route, progressIndex])
  const deviation = useMemo(() => location && route?.points?.[progressIndex] ? haversine(location, route.points[progressIndex]) : 0, [location, route, progressIndex])

  if (selectedActivity) return <ActivityDetail activity={selectedActivity} onBack={() => setSelectedActivity(null)} onEdit={() => setCompletion(selectedActivity)} />

  return <div className="app-shell">
    {tab === 'map' && <main className="map-page">
      <MapView route={route?.points || []} location={location} focusPoint={focusPlace} heading={heading} mode={mapMode} follow={follow} rotateWithHeading={rotateMap} fitRoute={!!route} />
      <div className="floating-header">
        <div className="brand"><span className="brand-mark">▲</span><b>NKRando</b><span className="offline-dot">●</span></div>
        <div className="map-actions">
          <button className="round glass" onClick={() => setLayerMenu(x => !x)}>▱</button>
          <button className={follow ? 'round glass active' : 'round glass'} onClick={() => setFollow(x => !x)}>➤</button>
        </div>
      </div>
      {layerMenu && <div className="layer-menu">
        {[['topo','Topo'],['terrain','Relief'],['light','Clair'],['satellite','Satellite']].map(([k,l]) =>
          <button className={mapMode===k?'active':''} key={k} onClick={() => { setMapMode(k); setLayerMenu(false) }}>{l}</button>
        )}
      </div>}
      <div className="map-search">
        <SearchBox value={search} onChange={setSearch} placeholder="Rechercher un lieu, sommet…" onSelect={r => {
          setSearch(r.shortName || r.name); setFocusPlace({lat:r.lat,lon:r.lon}); setFollow(false)
        }} />
        <div className="search-shortcuts">
          <button onClick={() => setPlanner(true)}>⌁ Planifier</button>
          <label>⇩ Importer GPX<input hidden type="file" accept=".gpx,application/gpx+xml" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} /></label>
          {!headingEnabled && <button onClick={requestHeading}>⌖ Boussole</button>}
        </div>
      </div>
      {route && <div className="route-card">
        <div className="route-card-top">
          <div><small>ITINÉRAIRE CHARGÉ</small><h2>{route.name}</h2></div>
          <button className="round ghost" onClick={() => setRoute(null)}>×</button>
        </div>
        <div className="route-stats-row">
          <Stat value={formatKm(routeStats.distance)} label="Distance" />
          <Stat value={`+${formatM(routeStats.up)}`} label="D+" />
          <Stat value={formatM(routeStats.maxEle)} label="Alt. max" />
        </div>
        <ProfileChart route={route.points} progressIndex={location ? progressIndex : 0} compact />
        <div className="route-actions">
          <button className="secondary" onClick={() => {
            const blob = new Blob([toGPX(route.name, route.points)], {type:'application/gpx+xml'})
            const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='itineraire.gpx';a.click();URL.revokeObjectURL(a.href)
          }}>GPX</button>
          <button className="primary" onClick={startSession}>Démarrer la randonnée</button>
        </div>
        <div className="offline-note">⌁ Le tracé reste disponible hors ligne. Les secteurs de carte déjà consultés sont mis en cache automatiquement.</div>
      </div>}
      {!route && <div className="empty-map-cta"><b>Où vas-tu aujourd’hui ?</b><span>Planifie un itinéraire ou importe un GPX.</span><button className="primary" onClick={() => setPlanner(true)}>Créer un itinéraire</button></div>}
    </main>}

    {tab === 'track' && <main className="tracking-page">
      <div className="tracking-map">
        <MapView route={route?.points || []} track={session?.points || []} location={location} heading={heading} mode={mapMode} follow={follow} rotateWithHeading={rotateMap} />
        <div className="recording-pill"><i className={session?.status==='paused'?'paused':''}></i>{session?.status==='paused'?'En pause':'Enregistrement'} <b>{formatTime(sessionStats?.totalSeconds)}</b></div>
        <div className="tracking-float">
          <button className={follow?'round glass active':'round glass'} onClick={() => setFollow(x=>!x)}>➤</button>
          <button className={rotateMap?'round glass active':'round glass'} onClick={() => headingEnabled ? setRotateMap(x=>!x) : requestHeading()}>⌖</button>
        </div>
      </div>
      <section className="tracking-panel">
        <div className="progress-head">
          <div><small>PROGRESSION ITINÉRAIRE</small><b>{Math.round(prog?.percent || 0)}%</b></div>
          <span className={deviation > 80 ? 'deviation warn' : 'deviation'}>{deviation < 50 ? 'Sur le tracé' : `${Math.round(deviation)} m du tracé`}</span>
        </div>
        <ProfileChart route={route?.points || []} progressIndex={progressIndex} compact />
        <div className="remaining-grid">
          <Stat strong value={formatKm(prog?.distanceRemaining)} label="km restants" />
          <Stat strong value={`+${formatM(prog?.upRemaining)}`} label="D+ restant" />
          <Stat value={formatKm(prog?.distanceDone)} label="tracé parcouru" />
          <Stat value={`+${formatM(prog?.upDone)}`} label="D+ du tracé" />
        </div>
        <div className="live-grid">
          <Stat value={formatKm(sessionStats?.distance)} label="Distance réelle" />
          <Stat value={`+${formatM(sessionStats?.up)}`} label="D+ réel" />
          <Stat value={formatM(location?.ele)} label="Altitude" />
          <Stat value={formatTime(sessionStats?.movingSeconds)} label="En mouvement" />
        </div>
        <div className="tracking-controls">
          <button className="control pause" onClick={pauseResume}><span>{session?.status==='paused'?'▶':'Ⅱ'}</span>{session?.status==='paused'?'Reprendre':'Pause'}</button>
          <button className="control stop" onClick={() => confirm('Terminer et enregistrer cette activité ?') && finish()}><span>■</span>Terminer</button>
        </div>
      </section>
    </main>}

    {tab === 'saved' && <main className="page saved-page">
      <header className="page-header"><div><small>NKRANDO</small><h1>Mes randonnées</h1></div><label className="round soft">＋<input hidden type="file" accept=".gpx" onChange={e => e.target.files?.[0] && importFile(e.target.files[0])}/></label></header>
      <div className="segmented"><button className="active">Activités</button><button onClick={() => document.getElementById('saved-routes')?.scrollIntoView({behavior:'smooth'})}>Itinéraires</button></div>
      <section className="list-section">
        <h2>Activités enregistrées</h2>
        {!activities.length && <div className="empty-card">Tes activités terminées apparaîtront ici avec carte, profil, photos et commentaires.</div>}
        {activities.map(a => <button className="activity-row" key={a.id} onClick={() => setSelectedActivity(a)}>
          <div className="activity-symbol">⌁</div><div className="row-main"><b>{a.name}</b><span>{new Date(a.endedAt).toLocaleDateString('fr-FR')} · {formatKm(a.stats.distance)} · +{formatM(a.stats.up)}</span></div><span>›</span>
        </button>)}
      </section>
      <section className="list-section" id="saved-routes">
        <h2>Itinéraires sauvegardés</h2>
        {!routes.length && <div className="empty-card">Planifie ou importe un GPX pour l’avoir ici et le retrouver hors ligne.</div>}
        {routes.map(r => {
          const s=routeTotals(r.points||[])
          return <div className="route-row" key={r.id}>
            <button onClick={() => chooseRoute(r)}><div className="route-symbol">▲</div><div className="row-main"><b>{r.name}</b><span>{formatKm(s.distance)} · +{formatM(s.up)}</span></div></button>
            <button className="delete" onClick={async()=>{await deleteRoute(r.id);setRoutes(x=>x.filter(v=>v.id!==r.id));if(route?.id===r.id)setRoute(null)}}>×</button>
          </div>
        })}
      </section>
    </main>}

    <nav className="bottom-nav">
      <button className={tab==='map'?'active':''} onClick={() => setTab('map')}><Icon>⌖</Icon><span>Explorer</span></button>
      <button className={tab==='track'?'active record-nav':''} disabled={!session} onClick={() => session && setTab('track')}><Icon>●</Icon><span>Suivi</span></button>
      <button className={tab==='saved'?'active':''} onClick={() => setTab('saved')}><Icon>♡</Icon><span>Mes randos</span></button>
    </nav>

    {planner && <RoutePlanner location={location} onClose={() => setPlanner(false)} onRoute={r => { setRoute(r); setRoutes(x => [r,...x.filter(v=>v.id!==r.id)]) }} />}
    {completion && <CompletionEditor activity={completion} onSaved={a => {
      setActivities(x => [a,...x.filter(v=>v.id!==a.id)]); setCompletion(null); setSelectedActivity(a); setTab('saved')
    }} onClose={() => setCompletion(null)} />}
  </div>
}
