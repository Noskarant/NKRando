import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

const vectorStyles = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  terrain: 'https://tiles.openfreemap.org/styles/fiord'
}

const bergfexStyle = {
  version: 8,
  sources: {
    bergfex: {
      type: 'raster',
      tiles: ['https://tiles.bergfex.at/styles/bergfex-osm/{z}/{x}/{y}@2x.jpg'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 20,
      attribution: '© bergfex · © OpenStreetMap contributors'
    }
  },
  layers: [{ id:'bergfex', type:'raster', source:'bergfex', paint:{ 'raster-fade-duration':0, 'raster-opacity':1 } }]
}

const satelliteStyle = {
  version: 8,
  sources: {
    sat: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Imagery © Esri'
    },
    labels: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256
    },
    roads: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256
    }
  },
  layers: [
    { id: 'sat', type: 'raster', source: 'sat' },
    { id: 'roads', type: 'raster', source: 'roads', paint: { 'raster-opacity': 0.78 } },
    { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.95 } }
  ]
}

const fcLine = points => ({
  type: 'FeatureCollection',
  features: points?.length > 1 ? [{
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: points.map(p => [p.lon, p.lat]) },
    properties: {}
  }] : []
})

const fcHistory = tracks => ({
  type:'FeatureCollection',
  features:(tracks || []).filter(t => t?.points?.length > 1).map(t => ({
    type:'Feature',
    geometry:{ type:'LineString', coordinates:t.points.map(p => [p.lon, p.lat]) },
    properties:{
      id:t.id || '',
      count:Math.max(1, Number(t.count) || 1),
      name:t.name || ''
    }
  }))
})

const fcTours = tours => ({
  type: 'FeatureCollection',
  features: (tours || []).filter(t => t?.points?.length > 1).map(t => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: t.points.map(p => [p.lon, p.lat]) },
    properties: { id: t.id, name: t.name || '' }
  }))
})

const fcNavigationPoints = points => ({
  type:'FeatureCollection',
  features:(points || []).map((p, index) => ({
    type:'Feature',
    geometry:{ type:'Point', coordinates:[p.lon, p.lat] },
    properties:{
      index,
      checkpointIndex:Number.isFinite(p.checkpointIndex) ? p.checkpointIndex : index,
      checkpointNumber:Number.isFinite(p.checkpointNumber) ? p.checkpointNumber : index + 1
    }
  }))
})

const fcTourPoints = tours => ({
  type: 'FeatureCollection',
  features: (tours || []).map((t, index) => {
    const p = t.center || t.points?.[Math.floor((t.points?.length || 1) / 2)]
    if (!p) return null
    return {
      type:'Feature',
      geometry:{ type:'Point', coordinates:[p.lon, p.lat] },
      properties:{ id:t.id, index:index + 1, name:t.name || '' }
    }
  }).filter(Boolean)
})

function addRouteLayers(map) {
  if (!map.getSource('history')) map.addSource('history', { type:'geojson', data:fcHistory([]) })
  if (!map.getLayer('history-lines')) map.addLayer({
    id:'history-lines',
    type:'line',
    source:'history',
    paint:{
      'line-color':'#20a9ff',
      'line-width':['interpolate',['linear'],['get','count'],1,2.1,2,3.4,4,5.2,8,7.2],
      'line-opacity':['interpolate',['linear'],['get','count'],1,.25,2,.36,4,.50,8,.64],
      'line-blur':.15
    }
  })
  if (!map.getSource('tours')) map.addSource('tours', { type: 'geojson', data: fcTours([]) })
  if (!map.getSource('tourpoints')) map.addSource('tourpoints', {
    type:'geojson', data:fcTourPoints([]), cluster:true, clusterRadius:42, clusterMaxZoom:14
  })
  if (!map.getLayer('tour-lines')) map.addLayer({
    id: 'tour-lines', type: 'line', source: 'tours',
    paint: { 'line-color': '#22bdf3', 'line-width': 4, 'line-opacity': .88 }
  })
  if (!map.getLayer('tour-clusters')) map.addLayer({
    id:'tour-clusters', type:'circle', source:'tourpoints', filter:['has','point_count'],
    paint:{ 'circle-color':'#fff', 'circle-radius':19, 'circle-stroke-color':'#168cff', 'circle-stroke-width':3 }
  })
  if (!map.getLayer('tour-cluster-count')) map.addLayer({
    id:'tour-cluster-count', type:'symbol', source:'tourpoints', filter:['has','point_count'],
    layout:{ 'text-field':['get','point_count_abbreviated'], 'text-size':12 },
    paint:{ 'text-color':'#168cff' }
  })
  if (!map.getLayer('tour-points')) map.addLayer({
    id:'tour-points', type:'circle', source:'tourpoints', filter:['!',['has','point_count']],
    paint:{ 'circle-color':'#fff', 'circle-radius':13, 'circle-stroke-color':'#15a9ff', 'circle-stroke-width':3 }
  })
  if (!map.getSource('planned')) map.addSource('planned', { type: 'geojson', data: fcLine([]) })
  if (!map.getSource('navigation-points')) map.addSource('navigation-points', { type:'geojson', data:fcNavigationPoints([]) })
  if (!map.getLayer('planned-shadow')) map.addLayer({
    id: 'planned-shadow', type: 'line', source: 'planned',
    paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .85 }
  })
  if (!map.getLayer('planned-line')) map.addLayer({
    id: 'planned-line', type: 'line', source: 'planned',
    paint: { 'line-color': '#19b933', 'line-width': 5.2, 'line-opacity': .96 }
  })
  if (!map.getLayer('navigation-point-halo')) map.addLayer({
    id:'navigation-point-halo', type:'circle', source:'navigation-points',
    paint:{
      'circle-radius':5.5,
      'circle-color':'rgba(255,255,255,.92)',
      'circle-stroke-color':'rgba(21,157,240,.98)',
      'circle-stroke-width':2
    }
  })
  if (!map.getLayer('navigation-point-core')) map.addLayer({
    id:'navigation-point-core', type:'circle', source:'navigation-points',
    paint:{
      'circle-radius':2.2,
      'circle-color':'#159df0'
    }
  })
  if (!map.getSource('track')) map.addSource('track', { type: 'geojson', data: fcLine([]) })
  if (!map.getLayer('track-shadow')) map.addLayer({
    id: 'track-shadow', type: 'line', source: 'track',
    paint: { 'line-color': '#ffffff', 'line-width': 8, 'line-opacity': .96 }
  })
  if (!map.getLayer('track-line')) map.addLayer({
    id: 'track-line', type: 'line', source: 'track',
    paint: { 'line-color': '#f22620', 'line-width': 5.2, 'line-opacity': 1 }
  })
}

export default function MapView({
  route = [], track = [], tourOverlays = [], historyOverlays = [], navigationPoints = [], location, rawLocation,
  focusPoint, selectedPoint, heading = 0, mode = 'topo',
  follow = false, rotateWithHeading = false, fitRoute = false, fitTrack = false, tracking = false, onMapReady,
  initialZoom, focusZoom, fitPadding, onUserInteraction, onViewportChange
}) {
  const node = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const selectedMarkerRef = useRef(null)
  const lastFitKey = useRef('')
  const userInteractionRef = useRef(onUserInteraction)
  const viewportChangeRef = useRef(onViewportChange)

  useEffect(() => { userInteractionRef.current = onUserInteraction }, [onUserInteraction])
  useEffect(() => { viewportChangeRef.current = onViewportChange }, [onViewportChange])

  useEffect(() => {
    if (!node.current) return
    const map = new maplibregl.Map({
      container: node.current,
      style: mode === 'satellite' ? satelliteStyle : mode === 'topo' ? bergfexStyle : vectorStyles[mode] || bergfexStyle,
      center: focusPoint ? [focusPoint.lon, focusPoint.lat] : location ? [location.lon, location.lat] : [6.442, 45.46],
      zoom: Number.isFinite(initialZoom) ? initialZoom : ((focusPoint || location) ? 14 : 11.5),
      attributionControl: false,
      pitchWithRotate: true,
      dragRotate: true
    })
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left')
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit:'metric' }), 'top-left')
    map.on('load', () => {
      addRouteLayers(map)
      onMapReady?.(map)
    })
    const userMoved = e => {
      if (!e?.originalEvent) return
      userInteractionRef.current?.()
    }
    map.on('dragstart', userMoved)
    map.on('zoomstart', userMoved)
    map.on('rotatestart', userMoved)
    map.on('moveend', () => {
      const center = map.getCenter()
      viewportChangeRef.current?.({
        lat:center.lat,
        lon:center.lng,
        zoom:map.getZoom(),
        bearing:map.getBearing(),
        pitch:map.getPitch()
      })
    })
    mapRef.current = map

    const el = document.createElement('div')
    el.className = 'user-location'
    el.innerHTML = '<div class="user-location-cone"></div><div class="user-location-halo"></div><div class="user-location-dot"></div>'
    markerRef.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })

    const selectedEl = document.createElement('div')
    selectedEl.className = 'inspection-location'
    selectedEl.innerHTML = '<div class="inspection-location-ring"></div><div class="inspection-location-dot"></div>'
    selectedMarkerRef.current = new maplibregl.Marker({ element:selectedEl, anchor:'center' })

    return () => {
      markerRef.current?.remove()
      selectedMarkerRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [mode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => {
      map.getSource('history')?.setData(fcHistory(historyOverlays))
      map.getSource('tours')?.setData(fcTours(tourOverlays))
      map.getSource('tourpoints')?.setData(fcTourPoints(tourOverlays))
      map.getSource('planned')?.setData(fcLine(route))
      map.getSource('navigation-points')?.setData(fcNavigationPoints(navigationPoints))
      map.getSource('track')?.setData(fcLine(track))
      const fitPoints = fitRoute && route.length > 1
        ? route
        : fitTrack && track.length > 1
          ? track
          : null
      if (fitPoints?.length > 1) {
        const key = `${mode}-${fitRoute ? "route" : "track"}-${fitPoints.length}-${fitPoints[0]?.lat}-${fitPoints.at(-1)?.lat}`
        if (lastFitKey.current !== key) {
          const b = new maplibregl.LngLatBounds()
          fitPoints.forEach(p => b.extend([p.lon, p.lat]))
          map.fitBounds(b, {
            padding:fitPadding || { top:110, bottom:190, left:35, right:35 },
            maxZoom:15.8,
            duration:650
          })
          lastFitKey.current = key
        }
      }
    }
    if (map.isStyleLoaded()) update()
    else map.once('load', update)
  }, [route, track, tourOverlays, historyOverlays, navigationPoints, fitRoute, fitTrack, fitPadding, mode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusPoint) return
    map.easeTo({
      center: [focusPoint.lon, focusPoint.lat],
      zoom: Number.isFinite(focusZoom) ? focusZoom : Math.max(map.getZoom(), 14),
      duration: 650
    })
  }, [focusPoint, focusZoom, mode])

  useEffect(() => {
    const map = mapRef.current
    const marker = selectedMarkerRef.current
    if (!map || !marker) return
    if (!selectedPoint || !Number.isFinite(Number(selectedPoint.lat)) || !Number.isFinite(Number(selectedPoint.lon))) {
      marker.remove()
      return
    }
    marker.setLngLat([selectedPoint.lon, selectedPoint.lat]).addTo(map)
  }, [selectedPoint?.lat, selectedPoint?.lon, mode])

  useEffect(() => {
    const map = mapRef.current
    const marker = markerRef.current
    if (!map || !marker || !location) return
    const el = marker.getElement()
    const cone = el.querySelector('.user-location-cone')
    if (cone) cone.style.transform = `translate(-50%,-84%) rotate(${heading || 0}deg)`
    el.classList.toggle('matched', !!location.mapMatched)
    marker.setLngLat([location.lon, location.lat]).addTo(map)
    if (follow) {
      map.easeTo({
        center: [location.lon, location.lat],
        zoom: tracking
          ? Math.min(15.25, Math.max(14.8, map.getZoom()))
          : Math.max(map.getZoom(), 15.5),
        bearing: rotateWithHeading ? (heading || 0) : map.getBearing(),
        duration: 350
      })
    }
  }, [location, heading, follow, rotateWithHeading, tracking])

  return <div ref={node} className="map-canvas" />
}
