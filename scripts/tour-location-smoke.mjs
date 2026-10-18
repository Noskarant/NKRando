import assert from 'node:assert/strict'
import { chooseTourCenter } from '../src/lib/tourSearchState.js'
import { normalizeTourData, stitchSegments, tourDistance, fetchTrailSplitsTours } from '../src/lib/tourData.js'

const gps = { lat:45.72, lon:4.81, name:'Oullins' }
const valmorel = { lat:45.46, lon:6.44, name:'Valmorel' }
assert.equal(chooseTourCenter(valmorel, gps), valmorel, 'Chosen destination wins over GPS')
assert.equal(chooseTourCenter(null, gps), gps, 'GPS remains a valid fallback')
assert.equal(chooseTourCenter({ lat:999, lon:5 }, valmorel), valmorel)
assert.equal(chooseTourCenter({ lat:undefined, lon:5 }, valmorel), valmorel)

const p = (lat, lon) => ({ lat, lon })
const a = [p(45.46,6.44),p(45.465,6.44),p(45.47,6.44)]
const b = [p(45.48,6.44),p(45.475,6.44),p(45.47,6.44)]
const c = [p(45.48,6.44),p(45.485,6.44),p(45.49,6.44)]
const remote = [p(46.7,6.44),p(46.71,6.44)]
const relation = (id, name, paths) => ({ id, tags:{ name, route:'hiking' }, members:paths.map(geometry => ({ geometry })) })
const joined = stitchSegments(relation(1,'Randonnée Valmorel',[c,b,a]).members)
assert.equal(joined.coverage,1)
assert.ok(joined.points.length >= 6)
for (let i=1; i<joined.points.length; i++) assert.ok(tourDistance(joined.points[i-1],joined.points[i]) < 700, 'No invented OSM connector')
const fragmented = stitchSegments(relation(2,'Broken',[a,remote]).members)
assert.ok(fragmented.coverage < .65, 'Disconnected segments must not be stitched')
const results = normalizeTourData({elements:[
  relation(1,'Randonnée Valmorel',[c,b,a]),
  relation(2,'Broken',[a,remote]),
  relation(3,'Outside search zone',[remote])
]}, valmorel, 7000)
assert.deepEqual(results.map(x => x.name),['Randonnée Valmorel'])
assert.ok(results[0].distance >= 1000 && results[0].centerDistance < 200)

const mockedTrailData = async url => {
  const isListing = String(url).includes('/bbox')
  const payload = isListing ? {
    type:'FeatureCollection',features:[{
      type:'Feature',
      properties:{ osm_relation_id:88, name:'Sentier Valmorel', distance_m:3300 },
      geometry:{ type:'Point', coordinates:[6.44,45.46] }
    }]
  } : {
    type:'Feature',
    properties:{osm_relation_id:88,name:'Sentier Valmorel'},
    geometry:{type:'MultiLineString',coordinates:[
      c.map(p=>[p.lon,p.lat]),b.map(p=>[p.lon,p.lat]),a.map(p=>[p.lon,p.lat])
    ]}
  }
  return new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}})
}
const fallback = await fetchTrailSplitsTours(45.46,6.44,7000,{fetchImpl:mockedTrailData})
assert.deepEqual(fallback.map(t=>t.name),['Sentier Valmorel'])
assert.ok(fallback[0].points.length >= 6 && fallback[0].distance >= 1000)

console.log('Selected-place priority, continuous authentic OSM routes and independent trail-index fallback OK')
