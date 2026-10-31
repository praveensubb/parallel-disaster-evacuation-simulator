import { useEffect, useMemo, useState } from 'react'

import {

  Activity, AlertTriangle, CheckCircle2, Clock3, Cpu, Flame, Gauge,

  MapPinned, Play, RotateCcw, ShieldCheck, Waves, Zap, Users, Timer,

  ShieldAlert, Route, Building2, MapPin, LocateFixed, Navigation, Map as MapIcon

} from 'lucide-react'

import {

  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,

  CartesianGrid, LineChart, Line

} from 'recharts'

import PopulationPanel from './PopulationPanel'
import PopulationGpsPanel from './PopulationGpsPanel';



const API = 'http://127.0.0.1:8000'



function Metric({ icon: Icon, label, value, suffix = '', tone = '' }) {

  return (

    <div className={`metric ${tone}`}>

      <div className="metric-top"><span>{label}</span><Icon size={18} /></div>

      <div className="metric-value">{value}<small>{suffix}</small></div>

    </div>

  )

}



function PageHeading({ number, title, subtitle }) {

  return (

    <div className="section-title">

      <div><span className="section-number">{number}</span><h2>{title}</h2></div>

      {subtitle && <span className="muted">{subtitle}</span>}

    </div>

  )

}



function CityMap({ data, size, animationFrame = 0 }) {
  const grid = data?.grid
  const people = data?.people_positions || []
  const paths = data?.movement_paths || []
  const safe = data?.safe_zones || []

  const peopleSet = useMemo(() => {
    if (paths.length) {
      return new Set(paths.map(({ path }) => {
        const point = path[Math.min(animationFrame, path.length - 1)]
        return point ? point[0] * size + point[1] : -1
      }))
    }
    return new Set(people.map(([r, c]) => r * size + c))
  }, [people, paths, size, animationFrame])

  const safeSet = useMemo(

    () => new Set(safe.map(([r, c]) => r * size + c)),

    [safe, size]

  )



  if (!grid?.length) {

    return <div className="map-placeholder"><MapPinned size={36} /><p>Run a simulation to generate the city grid</p></div>

  }



  return (

    <div className="map-wrap">

      <div className="city-grid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>

        {grid.map((cell, i) => {

          let cls = 'cell road'

          if (cell === 1) cls = 'cell obstacle'

          if (cell === 2 || safeSet.has(i)) cls = 'cell safe'

          if (cell === 3) cls = 'cell hazard'

          if (peopleSet.has(i) && cell !== 2) cls += ' has-person'

          return <div key={i} className={cls} title={`Cell ${Math.floor(i / size)}, ${i % size}`} />

        })}

      </div>

      <div className="legend">

        <span><i className="swatch road-swatch" />Road</span>

        <span><i className="swatch obstacle-swatch" />Obstacle</span>

        <span><i className="swatch hazard-swatch" />Hazard</span>

        <span><i className="swatch safe-swatch" />Safe zone</span>

        <span><i className="person-dot" />Evacuee</span>

      </div>

    </div>

  )

}



function EmptyState({ icon: Icon, children }) {

  return <div className="chart-empty"><Icon size={27} /><span>{children}</span></div>

}



export default function App() {

  const [activePage, setActivePage] = useState('dashboard')

  const [gridSize, setGridSize] = useState(50)

  const [people, setPeople] = useState(1500)

  const [obstacles, setObstacles] = useState(12)

  const [threads, setThreads] = useState(4)

  const [disaster, setDisaster] = useState('flood')

  const [data, setData] = useState(null)

  const [loading, setLoading] = useState(false)

  const [error, setError] = useState('')

  const [health, setHealth] = useState(null)
  const [benchmarkData, setBenchmarkData] = useState(null)
  const [benchmarking, setBenchmarking] = useState(false)
  const [benchmarkError, setBenchmarkError] = useState('')
  const [workloadData, setWorkloadData] = useState(null)
  const [workloadRunning, setWorkloadRunning] = useState(false)
  const [workloadError, setWorkloadError] = useState('')
  const [gpsPosition, setGpsPosition] = useState(null)
  const [gpsStatus, setGpsStatus] = useState('idle')
  const [gpsError, setGpsError] = useState('')
  const [gpsTracking, setGpsTracking] = useState(false)
  const [gpsAccuracy, setGpsAccuracy] = useState(null)
  const [gpsUpdatedAt, setGpsUpdatedAt] = useState(null)
  const [gpsWatchId, setGpsWatchId] = useState(null)
  const [nearbyShelters, setNearbyShelters] = useState([])
  const [shelterLoading, setShelterLoading] = useState(false)
  const [shelterError, setShelterError] = useState('')
  const [selectedShelterId, setSelectedShelterId] = useState(null)
  const [routeSummary, setRouteSummary] = useState(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [optimizerData, setOptimizerData] = useState(null)
  const [optimizerRunning, setOptimizerRunning] = useState(false)
  const [optimizerError, setOptimizerError] = useState('')
  const [animationFrame, setAnimationFrame] = useState(0)
  const [animationPlaying, setAnimationPlaying] = useState(false)



  useEffect(() => {

    fetch(`${API}/api/health`)

      .then(response => {

        if (!response.ok) throw new Error('Backend unavailable')

        return response.json()

      })

      .then(setHealth)

      .catch(() => setHealth({ status: 'offline' }))

  }, [])

  useEffect(() => {
    if (!animationPlaying) return undefined
    const timer = window.setInterval(() => {
      setAnimationFrame(frame => {
        const paths = data?.visualization?.movement_paths || []
        const maxFrame = paths.reduce((max, item) => Math.max(max, (item.path || []).length - 1), 0)
        if (frame >= maxFrame) {
          setAnimationPlaying(false)
          return maxFrame
        }
        return frame + 1
      })
    }, 180)
    return () => window.clearInterval(timer)
  }, [animationPlaying, data])


  function stopGpsTracking() {
    if (gpsWatchId !== null && 'geolocation' in navigator) {
      navigator.geolocation.clearWatch(gpsWatchId)
    }
    setGpsWatchId(null)
    setGpsTracking(false)
    setGpsStatus(gpsPosition ? 'ready' : 'idle')
  }

  function startGpsTracking() {
    setGpsError('')
    if (!('geolocation' in navigator)) {
      setGpsError('This browser does not support geolocation. Try a current version of Chrome or Edge.')
      setGpsStatus('error')
      return
    }
    if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      setGpsError('Browser GPS requires HTTPS or localhost. Open this app on localhost or deploy it over HTTPS.')
      setGpsStatus('error')
      return
    }
    setGpsStatus('requesting')
    setGpsTracking(true)
    const id = navigator.geolocation.watchPosition(
      position => {
        setGpsPosition({ latitude: position.coords.latitude, longitude: position.coords.longitude })
        setGpsAccuracy(position.coords.accuracy)
        setGpsUpdatedAt(new Date())
        setGpsStatus('ready')
        setGpsError('')
      },
      error => {
        const messages = {
          1: 'Location permission was denied. Allow location access for this site in your browser settings.',
          2: 'Your location is currently unavailable. Check GPS/location services and try again.',
          3: 'The location request timed out. Try again in an area with a better GPS signal.'
        }
        setGpsError(messages[error.code] || 'Unable to retrieve your location.')
        setGpsStatus('error')
        setGpsTracking(false)
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    )
    setGpsWatchId(id)
  }

  useEffect(() => () => {
    if (gpsWatchId !== null && 'geolocation' in navigator) navigator.geolocation.clearWatch(gpsWatchId)
  }, [gpsWatchId])

  const osmMapUrl = gpsPosition
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${gpsPosition.longitude - 0.008}%2C${gpsPosition.latitude - 0.005}%2C${gpsPosition.longitude + 0.008}%2C${gpsPosition.latitude + 0.005}&layer=mapnik&marker=${gpsPosition.latitude}%2C${gpsPosition.longitude}`
    : null

  // Query nearby mapped emergency-related places from OpenStreetMap's Overpass API.
  // GPS updates are rounded to avoid re-querying on every tiny coordinate change.
  const gpsQueryLat = gpsPosition ? Number(gpsPosition.latitude.toFixed(3)) : null
  const gpsQueryLon = gpsPosition ? Number(gpsPosition.longitude.toFixed(3)) : null

  useEffect(() => {
    if (gpsQueryLat == null || gpsQueryLon == null) return undefined
    const controller = new AbortController()
    async function findShelters() {
      setShelterLoading(true)
      setShelterError('')
      setNearbyShelters([])
      setSelectedShelterId(null)
      setRouteSummary(null)
      const query = `[out:json][timeout:20];(node(around:5000,${gpsQueryLat},${gpsQueryLon})[amenity=shelter];way(around:5000,${gpsQueryLat},${gpsQueryLon})[amenity=shelter];node(around:5000,${gpsQueryLat},${gpsQueryLon})[emergency=assembly_point];way(around:5000,${gpsQueryLat},${gpsQueryLon})[emergency=assembly_point];node(around:5000,${gpsQueryLat},${gpsQueryLon})[amenity=hospital];way(around:5000,${gpsQueryLat},${gpsQueryLon})[amenity=hospital];node(around:5000,${gpsQueryLat},${gpsQueryLon})[amenity=clinic];way(around:5000,${gpsQueryLat},${gpsQueryLon})[amenity=clinic];);out center tags;`
      try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
          body: `data=${encodeURIComponent(query)}`, signal: controller.signal
        })
        if (!response.ok) throw new Error(`OpenStreetMap data service returned ${response.status}`)
        const payload = await response.json()
        const haversineKm = (lat, lon) => {
          const rad = value => value * Math.PI / 180
          const dLat = rad(lat - gpsQueryLat), dLon = rad(lon - gpsQueryLon)
          const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(gpsQueryLat)) * Math.cos(rad(lat)) * Math.sin(dLon / 2) ** 2
          return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        }
        const found = (payload.elements || []).map(item => {
          const lat = item.lat ?? item.center?.lat
          const lon = item.lon ?? item.center?.lon
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
          const tags = item.tags || {}
          const kind = tags.amenity === 'hospital' ? 'Hospital' : tags.amenity === 'clinic' ? 'Clinic' : tags.emergency === 'assembly_point' ? 'Assembly point' : 'Shelter'
          return { id: `${item.type}-${item.id}`, name: tags.name || tags['name:en'] || kind, kind, latitude: lat, longitude: lon, distanceKm: haversineKm(lat, lon), tags }
        }).filter(Boolean).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 20)
        setNearbyShelters(found)
        if (!found.length) setShelterError('No mapped shelters, hospitals, clinics, or assembly points were found within 5 km. This does not mean none exist.')
      } catch (e) {
        if (e.name !== 'AbortError') setShelterError(`${e.message}. Nearby place data may be temporarily unavailable.`)
      } finally {
        if (!controller.signal.aborted) setShelterLoading(false)
      }
    }
    findShelters()
    return () => controller.abort()
  }, [gpsQueryLat, gpsQueryLon])

  useEffect(() => {
    const selected = nearbyShelters.find(item => item.id === selectedShelterId)
    if (!gpsPosition || !selected) { setRouteSummary(null); return undefined }
    const controller = new AbortController()
    async function fetchRoute() {
      setRouteLoading(true)
      setRouteError('')
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${gpsPosition.longitude},${gpsPosition.latitude};${selected.longitude},${selected.latitude}?overview=false&steps=false`
        const response = await fetch(url, { signal: controller.signal })
        if (!response.ok) throw new Error(`Routing service returned ${response.status}`)
        const payload = await response.json()
        const route = payload.routes?.[0]
        if (payload.code !== 'Ok' || !route) throw new Error('No drivable route was returned for this destination')
        setRouteSummary({ distanceKm: route.distance / 1000, durationMinutes: route.duration / 60 })
      } catch (e) {
        if (e.name !== 'AbortError') { setRouteSummary(null); setRouteError(`${e.message}. You can still open directions in OpenStreetMap.`) }
      } finally {
        if (!controller.signal.aborted) setRouteLoading(false)
      }
    }
    fetchRoute()
    return () => controller.abort()
  }, [gpsPosition, nearbyShelters, selectedShelterId])

  function openShelterDirections(shelter) {
    if (!gpsPosition || !shelter) return
    const url = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${gpsPosition.latitude}%2C${gpsPosition.longitude}%3B${shelter.latitude}%2C${shelter.longitude}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function runSimulation() {

    setLoading(true)

    setError('')

    try {

      const response = await fetch(`${API}/api/simulate`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({

          grid_size: Number(gridSize),

          people: Number(people),

          obstacle_percent: Number(obstacles),

          threads: Number(threads),

          disaster

        })

      })

      const result = await response.json()

      if (!response.ok) throw new Error(result.detail || 'Simulation failed')

      setData(result)
      setAnimationFrame(0)
      setAnimationPlaying(true)

    } catch (e) {

      setError(`${e.message}. Confirm the FastAPI backend is running at ${API}.`)

    } finally {

      setLoading(false)

    }

  }



  async function runThreadOptimizer() {
    setOptimizerRunning(true)
    setOptimizerError('')
    setOptimizerData(null)
    try {
      const params = new URLSearchParams({
        grid_size: String(gridSize),
        people: String(people),
        obstacle_percent: String(obstacles),
        repeats: '3',
        disaster
      })
      const response = await fetch(`${API}/api/optimize-threads?${params.toString()}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Thread optimization failed')
      setOptimizerData(result)
      setThreads(result.recommended_threads)
    } catch (e) {
      setOptimizerError(`${e.message}. Confirm the backend is running and has the /api/optimize-threads endpoint.`)
    } finally {
      setOptimizerRunning(false)
    }
  }

  async function runScalingBenchmark() {
    setBenchmarking(true)
    setBenchmarkError('')
    setBenchmarkData(null)
    try {
      const params = new URLSearchParams({
        grid_size: String(gridSize),
        people: String(people),
        obstacle_percent: String(obstacles),
        repeats: '3',
        disaster
      })
      const response = await fetch(`${API}/api/benchmark-scaling?${params.toString()}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Benchmark failed')
      setBenchmarkData(result)
    } catch (e) {
      setBenchmarkError(`${e.message}. Confirm the backend is running and has the /api/benchmark-scaling endpoint.`)
    } finally {
      setBenchmarking(false)
    }
  }

  function downloadBenchmarkCSV() {
    if (!benchmarkData) return
    const rows = [
      ['Threads', 'Average time (ms)', 'Median time (ms)', 'Speedup', 'Efficiency', 'Evacuated', 'Not evacuated', 'Correctness'],
      ...benchmarkData.thread_scaling.map(row => [
        row.threads,
        row.average_ms,
        row.median_ms,
        row.speedup,
        row.efficiency,
        row.evacuated,
        row.not_evacuated,
        row.correctness_passed ? 'Passed' : 'Failed'
      ])
    ]
    const csv = rows.map(row => row.map(value => {
      const text = String(value ?? '')
      return `"${text.replace(/"/g, '""')}"`
    }).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'thread-scaling-benchmark.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function runWorkloadBenchmark() {
    setWorkloadRunning(true)
    setWorkloadError('')
    setWorkloadData(null)
    try {
      const params = new URLSearchParams({
        grid_size: String(gridSize),
        obstacle_percent: String(obstacles),
        repeats: '3',
        disaster
      })
      const response = await fetch(`${API}/api/benchmark-workloads?${params.toString()}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.detail || 'Workload benchmark failed')
      setWorkloadData(result)
    } catch (e) {
      setWorkloadError(`${e.message}. Confirm the backend is running and has the /api/benchmark-workloads endpoint.`)
    } finally {
      setWorkloadRunning(false)
    }
  }

  function downloadWorkloadCSV() {
    if (!workloadData) return
    const rows = [['People', 'Mode', 'Threads', 'Average time (ms)', 'Median time (ms)', 'Speedup', 'Efficiency (%)', 'Correctness']]
    workloadData.workload_results.forEach(workload => {
      rows.push([
        workload.people, 'Sequential', 1, workload.sequential_average_ms,
        workload.sequential_median_ms, 1, 100, workload.correctness_passed ? 'Passed' : 'Failed'
      ])
      workload.thread_scaling.forEach(row => rows.push([
        workload.people, 'OpenMP parallel', row.threads, row.average_ms,
        row.median_ms, row.speedup, (row.efficiency * 100).toFixed(2),
        row.correctness_passed ? 'Passed' : 'Failed'
      ]))
    })
    const csv = rows.map(row => row.map(value => {
      const text = String(value ?? '')
      return `"${text.replace(/"/g, '""')}"`
    }).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'workload-size-benchmark.csv'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const workloadTimeChart = workloadData?.workload_results.map(workload => {
    const row = { people: workload.people.toLocaleString(), sequential: workload.sequential_average_ms }
    workload.thread_scaling.forEach(item => { row[`t${item.threads}`] = item.average_ms })
    return row
  }) || []

  const workloadSpeedupChart = workloadData?.workload_results.map(workload => {
    const row = { people: workload.people.toLocaleString() }
    workload.thread_scaling.forEach(item => { row[`t${item.threads}`] = item.speedup })
    return row
  }) || []

  const performance = data?.performance

  const chartData = performance ? [

    { name: 'Sequential', time: Number(performance.sequential_ms.toFixed(2)) },

    { name: `Parallel (${threads})`, time: Number(performance.parallel_ms.toFixed(2)) }

  ] : []



  const threadData = data ? [

    { threads: 1, time: Number(performance.sequential_ms.toFixed(2)) },

    { threads: Number(threads), time: Number(performance.parallel_ms.toFixed(2)) }

  ].sort((a, b) => a.threads - b.threads) : []



  const parallel = data?.parallel

  const evacuated = Number(parallel?.evacuated ?? 0)

  const notEvacuated = Number(parallel?.not_evacuated ?? 0)

  const totalPeople = Number(parallel?.people ?? people)

  const evacuationRate = totalPeople > 0 ? (evacuated / totalPeople) * 100 : 0



  function downloadResults() {

    if (!data) return

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })

    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')

    a.href = url

    a.download = 'evacuation-simulation-results.json'

    a.click()

    URL.revokeObjectURL(url)

  }



  function resetView() {

    setData(null)

    setError('')

    setActivePage('dashboard')

  }



  function renderDashboard() {

    return (

      <>

        <PopulationPanel
          onApplyCount={(count) => {
            if (!Number.isInteger(count) || count < 1 || count > 20000) {
              setError('Population must be between 1 and 20,000.')
              return
            }

            setPeople(count)
            setData(null)
            setError('')
            setActivePage('dashboard')
          }}
        />

        <PopulationGpsPanel
          onPopulationCount={(count) => {
            if (!Number.isInteger(count) || count < 1 || count > 20000) {
              setError(
                count === 0
                  ? 'No recent GPS check-ins were found in this area. The evacuation population was not changed.'
                  : 'GPS participant count must be between 1 and 20,000 to update the simulation.'
              )
              return
            }
            setPeople(count)
            setData(null)
            setError('')
          }}
        />

        <section className="panel gps-panel">
          <div className="panel-heading">
            <div><span className="section-number"><MapPin size={13} /></span><h2>Real-time GPS location</h2></div>
            <span className={`gps-status ${gpsStatus === 'ready' ? 'gps-status-live' : ''}`}><span />{gpsStatus === 'ready' ? (gpsTracking ? 'LIVE TRACKING' : 'LOCATION READY') : gpsStatus === 'requesting' ? 'REQUESTING LOCATION' : gpsStatus === 'error' ? 'LOCATION ERROR' : 'GPS NOT STARTED'}</span>
          </div>
          <p className="gps-description">Show your device's real-world position on a free OpenStreetMap. Your browser will ask for permission; coordinates stay in this page and are not sent to the simulator backend.</p>
          <div className="gps-actions">
            {!gpsTracking
              ? <button className="button primary" onClick={startGpsTracking}><LocateFixed size={16} /> {gpsPosition ? 'Resume live tracking' : 'Share my live location'}</button>
              : <button className="button secondary" onClick={stopGpsTracking}><Navigation size={16} /> Stop tracking</button>}
            {gpsPosition && <button className="button secondary" onClick={() => { const url = `https://www.openstreetmap.org/?mlat=${gpsPosition.latitude}&mlon=${gpsPosition.longitude}#map=17/${gpsPosition.latitude}/${gpsPosition.longitude}`; window.open(url, '_blank', 'noopener,noreferrer') }}><MapIcon size={16} /> Open full map</button>}
          </div>
          {gpsError && <div className="error-banner gps-error"><AlertTriangle size={17} /><span>{gpsError}</span></div>}
          {gpsPosition ? <>
            <div className="gps-coordinate-grid">
              <div><span>Latitude</span><strong>{gpsPosition.latitude.toFixed(6)}</strong></div>
              <div><span>Longitude</span><strong>{gpsPosition.longitude.toFixed(6)}</strong></div>
              <div><span>Accuracy</span><strong>{gpsAccuracy == null ? '—' : `±${Math.round(gpsAccuracy)} m`}</strong></div>
              <div><span>Last update</span><strong>{gpsUpdatedAt ? gpsUpdatedAt.toLocaleTimeString() : '—'}</strong></div>
            </div>
            <div className="osm-map-frame"><iframe title="Your live location on OpenStreetMap" src={osmMapUrl} loading="lazy" referrerPolicy="no-referrer" /></div>
            <div className="shelter-section">
              <div className="shelter-heading"><div><h3>Nearby emergency-related places</h3><p>OpenStreetMap data within approximately 5 km of your location</p></div><span className="tiny-label">LIVE SEARCH</span></div>
              {shelterLoading && <p className="shelter-message"><span className="spinner" /> Searching nearby map data…</p>}
              {shelterError && <div className="shelter-notice"><AlertTriangle size={15} /><span>{shelterError}</span></div>}
              {!shelterLoading && nearbyShelters.length > 0 && <div className="shelter-list">
                {nearbyShelters.map(shelter => <div className={`shelter-card ${selectedShelterId === shelter.id ? 'selected' : ''}`} key={shelter.id}>
                  <div className="shelter-card-main"><span className="shelter-kind">{shelter.kind}</span><strong>{shelter.name}</strong><small>{shelter.distanceKm.toFixed(2)} km straight-line distance</small></div>
                  <div className="shelter-card-actions"><button className="button secondary" onClick={() => setSelectedShelterId(shelter.id)}>{selectedShelterId === shelter.id ? 'Selected' : 'Route info'}</button><button className="button primary" onClick={() => openShelterDirections(shelter)}><Navigation size={14} /> Directions</button></div>
                  {selectedShelterId === shelter.id && <div className="route-details">{routeLoading ? 'Calculating road route…' : routeSummary ? <><strong>{routeSummary.distanceKm.toFixed(1)} km by road</strong><span>Estimated driving time: {Math.max(1, Math.round(routeSummary.durationMinutes))} min</span></> : routeError ? routeError : 'Road route will appear shortly.'}</div>}
                </div>)}
              </div>}
              <p className="gps-footnote">These are map-listed hospitals, clinics, shelters, or assembly points—not verified emergency shelters. Distance sorting is approximate; road routing may be unavailable. In an actual emergency, follow official local emergency guidance.</p>
            </div>
            <p className="gps-footnote">Your device coordinates stay in this page. Requests to OpenStreetMap services use the approximate location to retrieve nearby map features and calculate a route.</p>
          </> : <div className="gps-empty"><MapPin size={28} /><strong>Your real-world location will appear here</strong><span>Click “Share my live location” and allow location access in your browser.</span></div>}
        </section>

        <section className="panel emergency-panel">
          <div className="panel-heading">
            <div><span className="section-number"><ShieldAlert size={14} /></span><h2>Emergency readiness & alerts</h2></div>
            <span className={`alert-state ${gpsPosition ? 'alert-state-location' : ''}`}><span />{gpsPosition ? 'LOCATION AWARE' : 'LOCATION NOT SHARED'}</span>
          </div>
          <div className="emergency-alert-grid">
            <article className="emergency-alert-card alert-caution">
              <div className="alert-card-title"><AlertTriangle size={17} /><strong>{disaster === 'flood' ? 'Flood scenario selected' : 'Fire scenario selected'}</strong></div>
              <p>{disaster === 'flood' ? 'Avoid low-lying areas and never walk or drive through floodwater. Move to higher ground if local authorities advise evacuation.' : 'If there is smoke or fire nearby, leave by a safe exit, avoid elevators, and stay clear of smoke. Follow instructions from emergency services.'}</p>
              <small>Scenario guidance · not a live hazard detection</small>
            </article>
            <article className={`emergency-alert-card ${gpsPosition ? 'alert-ready' : 'alert-neutral'}`}>
              <div className="alert-card-title">{gpsPosition ? <CheckCircle2 size={17} /> : <MapPin size={17} />}<strong>{gpsPosition ? 'GPS location available' : 'Share location for nearby places'}</strong></div>
              <p>{gpsPosition ? `Location accuracy is approximately ${gpsAccuracy == null ? 'not reported' : `${Math.round(gpsAccuracy)} metres`}. ${nearbyShelters.length} mapped emergency-related place(s) found nearby.` : 'Enable browser location to search OpenStreetMap for nearby hospitals, clinics, shelters, and assembly points.'}</p>
              <small>{gpsPosition ? 'Map data may be incomplete or outdated' : 'Location access requires your permission'}</small>
            </article>
            <article className="emergency-alert-card alert-neutral">
              <div className="alert-card-title"><ShieldCheck size={17} /><strong>Before you move</strong></div>
              <p>Check official local emergency announcements, keep your phone charged, and confirm that a destination is safe before travelling. Do not rely on this academic simulator for real-world decisions.</p>
              <small>Official alerts are not fetched by this app</small>
            </article>
          </div>
          {gpsPosition && nearbyShelters.length > 0 && <div className="nearest-shelter-strip"><Building2 size={17} /><div><strong>Nearest mapped place: {nearbyShelters[0].name}</strong><span>{nearbyShelters[0].kind} · {nearbyShelters[0].distanceKm.toFixed(2)} km straight-line distance</span></div><button className="button secondary" onClick={() => { setSelectedShelterId(nearbyShelters[0].id); document.querySelector('.shelter-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}>View route</button></div>}
        </section>

        <section className="content-grid">

          <div className="panel controls-panel">

            <div className="panel-heading"><div><span className="section-number">01</span><h2>Scenario setup</h2></div><span className="tiny-label">INPUTS</span></div>

            <label className="field-label">Disaster type</label>

            <div className="disaster-toggle">

              <button className={disaster === 'flood' ? 'selected' : ''} onClick={() => setDisaster('flood')}><Waves size={17} /> Flood</button>

              <button className={disaster === 'fire' ? 'selected' : ''} onClick={() => setDisaster('fire')}><Flame size={17} /> Fire</button>

            </div>

            <div className="range-field"><div><label>City grid</label><strong>{gridSize} × {gridSize}</strong></div><input type="range" min="20" max="100" step="10" value={gridSize} onChange={e => setGridSize(+e.target.value)} /><div className="range-hints"><span>20 × 20</span><span>100 × 100</span></div></div>

            <div className="range-field"><div><label>Evacuees</label><strong>{Number(people).toLocaleString()}</strong></div><input type="range" min="1" max="20000" step="100" value={people} onChange={e => setPeople(+e.target.value)} /><div className="range-hints"><span>1 person</span><span>20,000 people</span></div></div>

            <div className="range-field"><div><label>Obstacles</label><strong>{obstacles}%</strong></div><input type="range" min="0" max="30" step="2" value={obstacles} onChange={e => setObstacles(+e.target.value)} /><div className="range-hints"><span>Open city</span><span>Dense blocks</span></div></div>

            <div className="range-field"><div><label><Cpu size={15} /> CPU threads</label><strong>{threads}</strong></div><input type="range" min="1" max="16" step="1" value={threads} onChange={e => setThreads(+e.target.value)} /><div className="range-hints"><span>1 thread</span><span>16 threads</span></div></div>

            <div className="notice"><ShieldCheck size={17} /><span>Same scenario is used for sequential and parallel runs to make the comparison fair.</span></div>

            <button className="button primary run-button" onClick={runSimulation} disabled={loading}>{loading ? <span className="spinner" /> : <Play size={17} fill="currentColor" />}{loading ? 'Running benchmark…' : 'Run simulation & benchmark'}</button>
            <button className="button secondary run-button optimizer-button" onClick={runThreadOptimizer} disabled={optimizerRunning || loading}>
              {optimizerRunning ? <span className="spinner" /> : <Cpu size={17} />}
              {optimizerRunning ? 'Testing 1, 2, 4 and 8 threads…' : 'Auto-optimize CPU threads'}
            </button>
            {optimizerError && <div className="error-banner optimizer-error"><AlertTriangle size={16} /><span>{optimizerError}</span></div>}
            {optimizerData && <div className="optimizer-result">
              <span>Recommended configuration</span>
              <strong>{optimizerData.recommended_threads} threads</strong>
              <div>{optimizerData.recommended_average_ms.toFixed(4)} ms average · {optimizerData.recommended_speedup.toFixed(3)}× speedup</div>
              <small>Correctness checks passed. The thread slider has been updated; run the simulation to apply it.</small>
            </div>}

            <div className="engine-foot"><span className={`status-dot ${health?.compiler_found ? 'online' : 'offline'}`} />{health?.compiler_found ? `C++ compiler: ${health.compiler}` : 'C++ / OpenMP compiler status unavailable'}</div>

          </div>



          <div className="panel map-panel">

            <div className="panel-heading"><div><span className="section-number">02</span><h2>City simulation</h2></div><span className="tiny-label">LIVE OUTPUT</span></div>

            <div className="map-title-row"><div><strong>{data ? `${data.scenario.grid_size} × ${data.scenario.grid_size} city grid` : 'Simulation map'}</strong><small>{data ? `${data.scenario.disaster.toUpperCase()} SCENARIO · DETERMINISTIC GRID` : 'Configure a scenario and run the simulation'}</small></div><span className="map-badge"><span /> GRID MODEL</span></div>

            <CityMap data={data?.visualization} size={data?.scenario?.grid_size || gridSize} animationFrame={animationFrame} />
            {data && data.visualization?.movement_paths?.length > 0 && <div className="animation-controls">
              <div><strong>Evacuation movement</strong><small>{data.visualization.movement_paths.length} sample evacuees · step {animationFrame}</small></div>
              <div className="animation-buttons">
                <button className="button secondary" onClick={() => { setAnimationFrame(0); setAnimationPlaying(true) }}><RotateCcw size={15} /> Replay</button>
                <button className="button primary" onClick={() => setAnimationPlaying(value => !value)}>{animationPlaying ? 'Pause' : 'Play animation'}</button>
              </div>
            </div>}

            {data && <div className="map-summary"><div><span>Population</span><strong>{totalPeople.toLocaleString()}</strong></div><div><span>Evacuated</span><strong className="green-text">{evacuated.toLocaleString()}</strong></div><div><span>Not evacuated</span><strong className="red-text">{notEvacuated.toLocaleString()}</strong></div></div>}

            <div className="map-disclaimer">Simplified grid-based academic simulation · not for real emergency planning.</div>

          </div>

        </section>



        <section className="section-block">

          <PageHeading number="03" title="Performance overview" subtitle={data ? 'Measured from latest run' : 'Waiting for benchmark'} />

          <div className="metrics-grid">

            <Metric icon={Clock3} label="Sequential time" value={performance ? performance.sequential_ms.toFixed(2) : '—'} suffix=" ms" />

            <Metric icon={Zap} label="Parallel time" value={performance ? performance.parallel_ms.toFixed(2) : '—'} suffix=" ms" tone="blue" />

            <Metric icon={Gauge} label="Speedup" value={performance ? performance.speedup.toFixed(2) : '—'} suffix="×" tone="purple" />

            <Metric icon={Cpu} label="Parallel efficiency" value={performance ? (performance.efficiency * 100).toFixed(1) : '—'} suffix="%" tone="green" />

          </div>

        </section>



        <section className="charts-grid">

          <div className="panel chart-panel">

            <div className="panel-heading"><div><span className="section-number">04</span><h2>Execution time comparison</h2></div><span className="tiny-label">MILLISECONDS</span></div>

            {data ? <ResponsiveContainer width="100%" height={230}><BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" stroke="#253246" /><XAxis dataKey="name" tick={{ fill: '#a8b5c8', fontSize: 12 }} axisLine={{ stroke: '#344258' }} tickLine={false} /><YAxis tick={{ fill: '#a8b5c8', fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: '#111c2d', border: '1px solid #2a3b51', borderRadius: 10, color: '#fff' }} /><Bar dataKey="time" name="Execution time (ms)" fill="#48a6f8" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState icon={Activity}>Run a benchmark to view actual timing results</EmptyState>}

          </div>

          <div className="panel chart-panel">

            <div className="panel-heading"><div><span className="section-number">05</span><h2>Thread comparison</h2></div><span className="tiny-label">CURRENT RUN</span></div>

            {data ? <div className="thread-summary">

              <div className="thread-big"><span>Workers requested</span><strong>{threads}</strong><small>OpenMP thread count</small></div>

              <div className="thread-big"><span>Correctness check</span><strong className="success"><CheckCircle2 size={20} /> Passed</strong><small>Sequential and parallel results match</small></div>

              <div className="thread-note">Run several times with different thread counts to study scalability. A single run compares sequential mode with the selected parallel thread count.</div>

            </div> : <EmptyState icon={Cpu}>Thread statistics appear after the first run</EmptyState>}

          </div>

        </section>



        <section className="bottom-grid">

          <div className="panel details-panel">

            <div className="panel-heading"><div><span className="section-number">06</span><h2>Simulation results</h2></div></div>

            {data ? <div className="result-table">

              <div className="table-row table-head"><span>Metric</span><span>Sequential</span><span>Parallel</span></div>

              <div className="table-row"><span>Evacuated agents</span><strong>{data.sequential.evacuated}</strong><strong>{data.parallel.evacuated}</strong></div>

              <div className="table-row"><span>Average arrival steps</span><strong>{Number(data.sequential.average_arrival_steps).toFixed(2)}</strong><strong>{Number(data.parallel.average_arrival_steps).toFixed(2)}</strong></div>

              <div className="table-row"><span>Execution time</span><strong>{data.performance.sequential_ms.toFixed(2)} ms</strong><strong>{data.performance.parallel_ms.toFixed(2)} ms</strong></div>

              <div className="table-row"><span>Correctness</span><strong className="success" colSpan="2">Passed</strong></div>

              <button className="button secondary download-button" onClick={downloadResults}>Download JSON results</button>

            </div> : <div className="empty-results">Results will be shown here after a successful run.</div>}

          </div>

          <div className="panel method-panel">

            <div className="panel-heading"><div><span className="section-number">07</span><h2>How parallelism works</h2></div></div>

            <div className="method-step"><span className="step-icon">1</span><div><strong>Generate one scenario</strong><p>City grid, obstacles, safe zones and agent positions use a fixed seed.</p></div></div>

            <div className="method-step"><span className="step-icon">2</span><div><strong>Find grid distances</strong><p>Multi-source BFS calculates shortest walkable distance to safe zones.</p></div></div>

            <div className="method-step"><span className="step-icon">3</span><div><strong>Distribute agent work</strong><p>OpenMP assigns independent per-agent calculations to CPU threads.</p></div></div>

            <div className="method-step"><span className="step-icon">4</span><div><strong>Measure and compare</strong><p>Report measured timings, speedup, efficiency and matching results.</p></div></div>

          </div>

        </section>

      </>

    )

  }



  function renderPerformance() {

    return (

      <div className="page-stack">

        <PageHeading number="08" title="CPU performance" subtitle={data ? 'Latest benchmark results' : 'Run a simulation to populate metrics'} />

        <section className="panel scaling-panel">
          <div className="panel-heading">
            <div><span className="section-number">09</span><h2>Repeated thread-scaling benchmark</h2></div>
            <span className="tiny-label">1 · 2 · 4 · 8 THREADS</span>
          </div>
          <p className="thread-note">Runs the same scenario three times per thread configuration and compares average execution time against the sequential baseline. This may take several seconds.</p>
          <div className="benchmark-actions">
            <button className="button primary" onClick={runScalingBenchmark} disabled={benchmarking}>
              {benchmarking ? <span className="spinner" /> : <Play size={16} />}
              {benchmarking ? 'Running 15 benchmark runs…' : 'Run thread-scaling benchmark'}
            </button>
            <button className="button secondary" onClick={downloadBenchmarkCSV} disabled={!benchmarkData}>
              Download CSV
            </button>
          </div>
          {benchmarkError && <div className="error-banner benchmark-error"><AlertTriangle size={17} /><span>{benchmarkError}</span></div>}
          {benchmarkData && <>
            <div className="benchmark-baseline">
              <span>Sequential baseline average</span>
              <strong>{benchmarkData.sequential_baseline.average_ms.toFixed(4)} ms</strong>
              <small>Median: {benchmarkData.sequential_baseline.median_ms.toFixed(4)} ms · {benchmarkData.scenario.repeats} repetitions</small>
            </div>
            <div className="benchmark-chart">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={benchmarkData.thread_scaling} margin={{ top: 12, right: 18, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#253246" />
                  <XAxis dataKey="threads" tick={{ fill: '#a8b5c8', fontSize: 12 }} label={{ value: 'Requested OpenMP threads', position: 'insideBottom', offset: -3, fill: '#a8b5c8' }} />
                  <YAxis tick={{ fill: '#a8b5c8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#111c2d', border: '1px solid #2a3b51', color: '#fff' }} />
                  <Line type="monotone" dataKey="average_ms" name="Average execution time (ms)" stroke="#48a6f8" strokeWidth={3} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="benchmark-table-wrap">
              <table className="benchmark-table">
                <thead><tr><th>Threads</th><th>Average (ms)</th><th>Median (ms)</th><th>Speedup</th><th>Efficiency</th><th>Correctness</th></tr></thead>
                <tbody>
                  {benchmarkData.thread_scaling.map(row => (
                    <tr key={row.threads}>
                      <td>{row.threads}</td>
                      <td>{row.average_ms.toFixed(4)}</td>
                      <td>{row.median_ms.toFixed(4)}</td>
                      <td>{row.speedup.toFixed(3)}×</td>
                      <td>{(row.efficiency * 100).toFixed(1)}%</td>
                      <td className={row.correctness_passed ? 'success' : 'benchmark-fail'}>{row.correctness_passed ? 'Passed' : 'Failed'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="thread-note">{benchmarkData.note} Parallel execution is not guaranteed to be faster for every workload.</p>
          </>}
        </section>


        <section className="panel scaling-panel workload-panel">
          <div className="panel-heading">
            <div><span className="section-number">10</span><h2>Workload-size comparison</h2></div>
            <span className="tiny-label">1K · 5K · 10K PEOPLE</span>
          </div>
          <p className="thread-note">Compare sequential execution against 1, 2, 4, and 8 OpenMP threads across three population sizes. Each configuration is measured three times. This benchmark performs 45 measured runs and may take a little longer.</p>
          <div className="benchmark-actions">
            <button className="button primary" onClick={runWorkloadBenchmark} disabled={workloadRunning}>
              {workloadRunning ? <span className="spinner" /> : <Play size={16} />}
              {workloadRunning ? 'Running workload benchmark…' : 'Run workload-size benchmark'}
            </button>
            <button className="button secondary" onClick={downloadWorkloadCSV} disabled={!workloadData}>Download workload CSV</button>
          </div>
          {workloadError && <div className="error-banner benchmark-error"><AlertTriangle size={17} /><span>{workloadError}</span></div>}
          {workloadData && <>
            <div className="benchmark-baseline">
              <span>Best measured configuration</span>
              {(() => {
                const best = workloadData.workload_results.flatMap(w => w.thread_scaling.map(r => ({ people: w.people, ...r }))).reduce((a, b) => b.speedup > a.speedup ? b : a)
                return <>
                  <strong>{best.people.toLocaleString()} people · {best.threads} threads · {best.speedup.toFixed(3)}× speedup</strong>
                  <small>Correctness: {best.correctness_passed ? 'passed' : 'failed'} · {workloadData.scenario.repeats} repetitions per configuration</small>
                </>
              })()}
            </div>
            <div className="benchmark-chart">
              <h3 className="chart-subtitle">Average execution time by workload</h3>
              <ResponsiveContainer width="100%" height={310}>
                <BarChart data={workloadTimeChart} margin={{ top: 12, right: 14, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#253246" />
                  <XAxis dataKey="people" tick={{ fill: '#a8b5c8', fontSize: 12 }} label={{ value: 'Number of people', position: 'insideBottom', offset: -3, fill: '#a8b5c8' }} />
                  <YAxis tick={{ fill: '#a8b5c8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#111c2d', border: '1px solid #2a3b51', color: '#fff' }} />
                  <Bar dataKey="sequential" name="Sequential" fill="#8b9bb0" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="t1" name="1 thread" fill="#5484e8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="t2" name="2 threads" fill="#36b5c8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="t4" name="4 threads" fill="#8c73e6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="t8" name="8 threads" fill="#39c99a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="benchmark-chart">
              <h3 className="chart-subtitle">Speedup by workload and thread count</h3>
              <ResponsiveContainer width="100%" height={290}>
                <LineChart data={workloadSpeedupChart} margin={{ top: 12, right: 18, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#253246" />
                  <XAxis dataKey="people" tick={{ fill: '#a8b5c8', fontSize: 12 }} />
                  <YAxis tick={{ fill: '#a8b5c8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#111c2d', border: '1px solid #2a3b51', color: '#fff' }} />
                  <Line type="monotone" dataKey="t1" name="1 thread speedup" stroke="#5484e8" strokeWidth={2} />
                  <Line type="monotone" dataKey="t2" name="2 threads speedup" stroke="#36b5c8" strokeWidth={2} />
                  <Line type="monotone" dataKey="t4" name="4 threads speedup" stroke="#8c73e6" strokeWidth={2} />
                  <Line type="monotone" dataKey="t8" name="8 threads speedup" stroke="#39c99a" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
              <p className="thread-note">A speedup above 1.0× means the parallel run was faster than the sequential baseline. Efficiency is speedup divided by requested thread count.</p>
            </div>
            <div className="benchmark-table-wrap">
              <table className="benchmark-table">
                <thead><tr><th>People</th><th>Mode</th><th>Threads</th><th>Average (ms)</th><th>Median (ms)</th><th>Speedup</th><th>Efficiency</th><th>Correctness</th></tr></thead>
                <tbody>
                  {workloadData.workload_results.flatMap(workload => [
                    <tr key={`${workload.people}-seq`}><td>{workload.people.toLocaleString()}</td><td>Sequential</td><td>1</td><td>{workload.sequential_average_ms.toFixed(4)}</td><td>{workload.sequential_median_ms.toFixed(4)}</td><td>1.000×</td><td>100.0%</td><td className={workload.correctness_passed ? 'success' : 'benchmark-fail'}>{workload.correctness_passed ? 'Passed' : 'Failed'}</td></tr>,
                    ...workload.thread_scaling.map(row => <tr key={`${workload.people}-${row.threads}`}><td>{workload.people.toLocaleString()}</td><td>OpenMP parallel</td><td>{row.threads}</td><td>{row.average_ms.toFixed(4)}</td><td>{row.median_ms.toFixed(4)}</td><td>{row.speedup.toFixed(3)}×</td><td>{(row.efficiency * 100).toFixed(1)}%</td><td className={row.correctness_passed ? 'success' : 'benchmark-fail'}>{row.correctness_passed ? 'Passed' : 'Failed'}</td></tr>)
                  ])}
                </tbody>
              </table>
            </div>
            <p className="thread-note">{workloadData.note}</p>
          </>}
        </section>

        <div className="metrics-grid">

          <Metric icon={Clock3} label="Sequential time" value={performance ? performance.sequential_ms.toFixed(2) : '—'} suffix=" ms" />

          <Metric icon={Zap} label="Parallel time" value={performance ? performance.parallel_ms.toFixed(2) : '—'} suffix=" ms" tone="blue" />

          <Metric icon={Gauge} label="Speedup" value={performance ? performance.speedup.toFixed(2) : '—'} suffix="×" tone="purple" />

          <Metric icon={Cpu} label="Parallel efficiency" value={performance ? (performance.efficiency * 100).toFixed(1) : '—'} suffix="%" tone="green" />

        </div>

        <div className="charts-grid">

          <div className="panel chart-panel">

            <div className="panel-heading"><div><span className="section-number">09</span><h2>Sequential vs parallel execution</h2></div><span className="tiny-label">MILLISECONDS</span></div>

            {data ? <ResponsiveContainer width="100%" height={280}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="#253246" /><XAxis dataKey="name" tick={{ fill: '#a8b5c8', fontSize: 12 }} /><YAxis tick={{ fill: '#a8b5c8', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#111c2d', border: '1px solid #2a3b51', color: '#fff' }} /><Bar dataKey="time" name="Time (ms)" fill="#48a6f8" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState icon={Activity}>Run a simulation to see execution times.</EmptyState>}

          </div>

          <div className="panel chart-panel">

            <div className="panel-heading"><div><span className="section-number">10</span><h2>Thread comparison</h2></div><span className="tiny-label">CURRENT RUN</span></div>

            {data ? <ResponsiveContainer width="100%" height={280}><LineChart data={threadData}><CartesianGrid strokeDasharray="3 3" stroke="#253246" /><XAxis dataKey="threads" type="number" domain={['dataMin', 'dataMax']} tick={{ fill: '#a8b5c8', fontSize: 12 }} label={{ value: 'Threads', position: 'insideBottom', offset: -4, fill: '#a8b5c8' }} /><YAxis tick={{ fill: '#a8b5c8', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#111c2d', border: '1px solid #2a3b51', color: '#fff' }} /><Line type="monotone" dataKey="time" name="Execution time (ms)" stroke="#48a6f8" strokeWidth={3} activeDot={{ r: 6 }} /></LineChart></ResponsiveContainer> : <EmptyState icon={Cpu}>Thread timing appears after the first run.</EmptyState>}

          </div>

        </div>

        <div className="panel details-panel">

          <div className="panel-heading"><div><span className="section-number">11</span><h2>Benchmark interpretation</h2></div></div>

          <div className="method-step"><span className="step-icon"><Timer size={16} /></span><div><strong>Sequential execution</strong><p>{performance ? `Completed in ${performance.sequential_ms.toFixed(2)} ms for the selected scenario.` : 'Waiting for a benchmark.'}</p></div></div>

          <div className="method-step"><span className="step-icon"><Cpu size={16} /></span><div><strong>Parallel execution</strong><p>{performance ? `Completed in ${performance.parallel_ms.toFixed(2)} ms using ${threads} requested OpenMP threads.` : 'Choose a thread count on the dashboard and run the simulation.'}</p></div></div>

          <div className="method-step"><span className="step-icon"><Gauge size={16} /></span><div><strong>What the speedup means</strong><p>{performance ? (performance.speedup > 1 ? 'Parallel execution was faster for this run.' : performance.speedup < 1 ? 'Parallel execution was slower for this run; thread overhead may outweigh the workload.' : 'Both modes took approximately the same time.') : 'Speedup is sequential time divided by parallel time. Results depend on workload and hardware.'}</p></div></div>

          <button className="button secondary" onClick={() => setActivePage('dashboard')}>Back to simulation dashboard</button>

        </div>

      </div>

    )

  }



  function renderSafety() {

    return (

      <div className="page-stack">

        <PageHeading number="12" title="Safety overview" subtitle={data ? `${data.scenario.disaster.toUpperCase()} scenario results` : 'Run a simulation to view safety results'} />

        <div className="metrics-grid">

          <Metric icon={Users} label="Total population" value={data ? totalPeople.toLocaleString() : '—'} />

          <Metric icon={ShieldCheck} label="Evacuated" value={data ? evacuated.toLocaleString() : '—'} tone="green" />

          <Metric icon={ShieldAlert} label="Not evacuated" value={data ? notEvacuated.toLocaleString() : '—'} tone="purple" />

          <Metric icon={Gauge} label="Evacuation rate" value={data ? evacuationRate.toFixed(1) : '—'} suffix="%" tone="blue" />

        </div>

        <div className="charts-grid">

          <div className="panel chart-panel">

            <div className="panel-heading"><div><span className="section-number">13</span><h2>Evacuation outcome</h2></div><span className="tiny-label">PEOPLE</span></div>

            {data ? <ResponsiveContainer width="100%" height={270}><BarChart data={[{ name: 'Evacuated', count: evacuated }, { name: 'Not evacuated', count: notEvacuated }]}><CartesianGrid strokeDasharray="3 3" stroke="#253246" /><XAxis dataKey="name" tick={{ fill: '#a8b5c8', fontSize: 12 }} /><YAxis tick={{ fill: '#a8b5c8', fontSize: 11 }} /><Tooltip contentStyle={{ background: '#111c2d', border: '1px solid #2a3b51', color: '#fff' }} /><Bar dataKey="count" name="People" fill="#48a6f8" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState icon={ShieldCheck}>Run a simulation to view evacuation outcomes.</EmptyState>}

          </div>

          <div className="panel chart-panel">

            <div className="panel-heading"><div><span className="section-number">14</span><h2>Scenario information</h2></div></div>

            <div className="thread-summary">

              <div className="thread-big"><span>Disaster type</span><strong>{data ? data.scenario.disaster.toUpperCase() : '—'}</strong><small>Selected scenario</small></div>

              <div className="thread-big"><span>Grid size</span><strong>{data ? `${data.scenario.grid_size} × ${data.scenario.grid_size}` : '—'}</strong><small>Simulated city grid</small></div>

              <div className="thread-big"><span>Obstacle setting</span><strong>{obstacles}%</strong><small>Configured in scenario setup</small></div>

            </div>

          </div>

        </div>

        <div className="panel details-panel">

          <div className="panel-heading"><div><span className="section-number">15</span><h2>Safety interpretation</h2></div></div>

          {!data ? <p className="thread-note">No simulation results yet. Return to the dashboard and run the simulation to populate this overview.</p> : <>

            <div className="method-step"><span className="step-icon"><CheckCircle2 size={16} /></span><div><strong>Evacuation outcome</strong><p>{evacuated.toLocaleString()} of {totalPeople.toLocaleString()} agents were reported evacuated ({evacuationRate.toFixed(1)}%).</p></div></div>

            <div className="method-step"><span className="step-icon"><AlertTriangle size={16} /></span><div><strong>Remaining agents</strong><p>{notEvacuated.toLocaleString()} agents were reported as not evacuated in this simulated scenario.</p></div></div>

            <div className="method-step"><span className="step-icon"><Route size={16} /></span><div><strong>Model limitation</strong><p>This is a simplified academic grid simulation. It is not validated for real emergency response or life-safety decisions.</p></div></div>

          </>}

          <button className="button secondary" onClick={() => setActivePage('dashboard')}>Back to simulation dashboard</button>

        </div>

      </div>

    )

  }



  return (

    <div className="app-shell">

      <aside className="sidebar">

        <div className="brand"><div className="brand-icon"><Waves size={23} /></div><div><strong>Evacuation<span>Lab</span></strong><small>PARALLEL COMPUTING</small></div></div>

        <div className="side-label">WORKSPACE</div>

        <button type="button" className={`nav-item ${activePage === 'dashboard' ? 'active' : ''}`} onClick={() => setActivePage('dashboard')}><Activity size={18} /> Simulation dashboard</button>

        <button type="button" className={`nav-item ${activePage === 'performance' ? 'active' : ''}`} onClick={() => setActivePage('performance')}><Cpu size={18} /> CPU performance</button>

        <button type="button" className={`nav-item ${activePage === 'safety' ? 'active' : ''}`} onClick={() => setActivePage('safety')}><ShieldCheck size={18} /> Safety overview</button>

        <div className="sidebar-bottom">

          <div className="engine-card"><span className={`status-dot ${health?.compiler_found ? 'online' : 'offline'}`} /><div><strong>Simulation engine</strong><small>{health?.compiler_found ? 'Compiler detected' : health?.status === 'offline' ? 'Backend offline' : 'Compiler not detected'}</small></div></div>

          <div className="version">ACADEMIC PROJECT · V1.0</div>

        </div>

      </aside>



      <main className="main">

        <header className="topbar">

          <div><div className="eyebrow">COMPUTER SCIENCE / PARALLEL COMPUTING</div><h1>{activePage === 'dashboard' ? 'Disaster evacuation simulator' : activePage === 'performance' ? 'CPU performance' : 'Safety overview'}</h1><p>{activePage === 'dashboard' ? 'Model emergency evacuation and measure multicore performance.' : activePage === 'performance' ? 'Compare sequential execution with OpenMP parallel processing.' : 'Review evacuation outcomes from the selected simulation scenario.'}</p></div>

          <div className="top-actions"><span className="live-pill"><span /> LOCAL SIMULATOR</span><button className="button secondary" onClick={resetView}><RotateCcw size={16} /> Reset view</button></div>

        </header>

        {error && <div className="error-banner"><AlertTriangle size={18} /><span>{error}</span></div>}

        {activePage === 'dashboard' && renderDashboard()}

        {activePage === 'performance' && renderPerformance()}

        {activePage === 'safety' && renderSafety()}

        <footer>EVACUATION LAB <span>·</span> C++ / OPENMP <span>·</span> REACT <span>·</span> FASTAPI <span>·</span> FOR ACADEMIC DEMONSTRATION</footer>

      </main>

    </div>

  )

}
