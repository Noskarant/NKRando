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

const fcTours = tours => ({
  type: 'FeatureCollection',
  features: (tours || []).filter(t => t?.points?.length > 1).map(t => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: t.points.map(p => [p.lon, p.lat]) },
    properties: { id: t.id, name: t.name || '' }
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
  if (!map.getLayer('planned-shadow')) map.addLayer({
    id: 'planned-shadow', type: 'line', source: 'planned',
    paint: { 'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .85 }
  })
  if (!map.getLayer('planned-line')) map.addLayer({
    id: 'planned-line', type: 'line', source: 'planned',
    paint: { 'line-color': '#19b933', 'line-width': 5.2, 'line-opacity': .96 }
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
  route = [], track = [], tourOverlays = [], location, rawLocation, focusPoint, heading = 0, mode = 'topo',
  follow = false, rotateWithHeading = false, fitRoute = false, tracking = false, onMapReady
}) {
  const node = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const lastFitKey = useRef('')

  useEffect(() => {
    if (!node.current) return
    const map = new maplibregl.Map({
      container: node.current,
      style: mode === 'satellite' ? satelliteStyle : mode === 'topo' ? bergfexStyle : vectorStyles[mode] || bergfexStyle,
      center: focusPoint ? [focusPoint.lon, focusPoint.lat] : location ? [location.lon, location.lat] : [6.442, 45.46],
      zoom: (focusPoint || location) ? 14 : 11.5,
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
    mapRef.current = map

    const el = document.createElement('div')
    el.className = 'user-location'
    el.innerHTML = '<div class="user-location-cone"></div><div class="user-location-halo"></div><div class="user-location-dot"></div>'
    markerRef.current = new maplibregl.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' })

    return () => {
      markerRef.current?.remove()
      map.remove()
      mapRef.current = null
    }
  }, [mode])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => {
      map.getSource('tours')?.setData(fcTours(tourOverlays))
      map.getSource('tourpoints')?.setData(fcTourPoints(tourOverlays))
      map.getSource('planned')?.setData(fcLine(route))
      map.getSource('track')?.setData(fcLine(track))
      if (route.length > 1 && fitRoute) {
        const key = `${route.length}-${route[0]?.lat}-${route.at(-1)?.lat}`
        if (lastFitKey.current !== key) {
          const b = new maplibregl.LngLatBounds()
          route.forEach(p => b.extend([p.lon, p.lat]))
          map.fitBounds(b, { padding: { top: 110, bottom: 190, left: 35, right: 35 }, maxZoom: 15, duration: 650 })
          lastFitKey.current = key
        }
      }
    }
    if (map.isStyleLoaded()) update()
    else map.once('load', update)
  }, [route, track, tourOverlays, fitRoute, mode])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusPoint) return
    map.easeTo({ center: [focusPoint.lon, focusPoint.lat], zoom: Math.max(map.getZoom(), 14), duration: 650 })
  }, [focusPoint, mode])

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
