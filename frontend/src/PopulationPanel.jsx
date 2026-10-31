import { useCallback, useEffect, useState } from 'react'
import { Calculator, MapPinned, RefreshCw, Send, Users } from 'lucide-react'

const API = 'http://127.0.0.1:8000'

const SOURCE_LABELS = {
  official_report: 'Official report',
  sensor_count: 'Sensor count',
  shelter_registration: 'Shelter registration',
  manual_report: 'Manual report',
  area_and_population_density: 'Area and density estimate',
}

async function readResponse(response) {
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = result.detail
    throw new Error(typeof detail === 'string' ? detail : 'The server rejected the request.')
  }
  return result
}

export default function PopulationPanel({ onApplyCount }) {
  const [areaId, setAreaId] = useState('AREA-001')
  const [areaKm2, setAreaKm2] = useState('2')
  const [density, setDensity] = useState('1500')
  const [reportCount, setReportCount] = useState('')
  const [reportSource, setReportSource] = useState('manual_report')
  const [reportedBy, setReportedBy] = useState('')
  const [note, setNote] = useState('')
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadSummary = useCallback(async ({ keepMessage = false } = {}) => {
    const cleanArea = areaId.trim()
    if (!cleanArea) {
      setError('Enter an area ID.')
      return
    }
    setLoading(true)
    setError('')
    if (!keepMessage) setMessage('')
    try {
      const params = new URLSearchParams({ area_id: cleanArea })
      if (areaKm2 !== '' && density !== '') {
        params.set('area_km2', areaKm2)
        params.set('density_per_km2', density)
      }
      const result = await readResponse(
        await fetch(`${API}/api/population/summary?${params.toString()}`)
      )
      setSummary(result)
    } catch (err) {
      setError(`${err.message} Check that the FastAPI backend is running at ${API}.`)
    } finally {
      setLoading(false)
    }
  }, [areaId, areaKm2, density])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  async function submitReport(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await readResponse(await fetch(`${API}/api/population/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area_id: areaId.trim(),
          people_count: Number(reportCount),
          source: reportSource,
          reported_by: reportedBy.trim() || null,
          note: note.trim() || null,
        }),
      }))
      setReportCount('')
      await loadSummary({ keepMessage: true })
      setMessage(`Report saved: ${Number(result.people_count).toLocaleString()} people. The count has not been independently verified.`)
    } catch (err) {
      setError(`${err.message} Check the area ID and report values.`)
    } finally {
      setSaving(false)
    }
  }

  async function calculateEstimate() {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const result = await readResponse(await fetch(`${API}/api/population/area-estimate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          area_id: areaId.trim(),
          area_km2: Number(areaKm2),
          density_per_km2: Number(density),
        }),
      }))
      setSummary({
        area_id: result.area_id,
        people_count: result.estimated_people,
        status: 'estimated',
        source: result.source,
        last_updated: null,
        report_count: 0,
        reports: [],
        warning: result.warning,
      })
      setMessage('Area-based population estimate calculated.')
    } catch (err) {
      setError(`${err.message} Check the area size and density values.`)
    } finally {
      setLoading(false)
    }
  }

  const count = summary?.people_count
  const canApply = Number.isInteger(count) && count >= 1 && count <= 20000
  const statusLabel = {
    reported: 'Latest reported count',
    estimated: 'Population estimate',
    unavailable: 'Count unavailable',
  }[summary?.status] || 'Population count'

  return (
    <section className="panel population-panel">
      <div className="panel-heading">
        <div>
          <span className="section-number"><Users size={14} /></span>
          <h2>Population estimation</h2>
        </div>
        <span className="tiny-label">REPORTS + ESTIMATES</span>
      </div>

      <p className="population-description">
        Use a recent report from an authorized source or calculate an estimate
        from area size and population density. This panel does not automatically
        detect every person in an area.
      </p>

      <div className="population-input-grid">
        <label>
          Area ID
          <input value={areaId} onChange={event => setAreaId(event.target.value)}
            maxLength={100} placeholder="Example: AREA-001" />
        </label>
        <label>
          Area size (km²)
          <input type="number" min="0.001" max="100000" step="any"
            value={areaKm2} onChange={event => setAreaKm2(event.target.value)} />
        </label>
        <label>
          Population density (people/km²)
          <input type="number" min="0" max="1000000" step="any"
            value={density} onChange={event => setDensity(event.target.value)} />
        </label>
      </div>

      <div className="population-actions">
        <button className="button primary" type="button" onClick={calculateEstimate}
          disabled={loading || !areaId.trim() || !(Number(areaKm2) > 0) || !(Number(density) >= 0)}>
          <Calculator size={16} /> Calculate estimate
        </button>
        <button className="button secondary" type="button" onClick={() => loadSummary()}
          disabled={loading}>
          <RefreshCw size={16} /> Refresh reports
        </button>
      </div>

      <div className="population-result">
        <div className="population-result-top">
          <span>{statusLabel}</span><MapPinned size={18} />
        </div>
        <strong className="population-number">
          {Number.isInteger(count) ? count.toLocaleString() : '—'}
        </strong>
        <div className="population-meta">
          <span>Area: {summary?.area_id || areaId || 'Not selected'}</span>
          <span>Source: {SOURCE_LABELS[summary?.source] || 'None'}</span>
          {summary?.last_updated && <span>Reported: {new Date(summary.last_updated).toLocaleString()}</span>}
          {Number.isInteger(summary?.report_count) && <span>Recent reports: {summary.report_count}</span>}
        </div>
        {summary?.warning && <p className="population-warning">{summary.warning}</p>}
        <button className="button primary population-apply" type="button"
          disabled={!canApply || !onApplyCount} onClick={() => onApplyCount(count)}>
          Use count in evacuation simulation
        </button>
        {Number.isInteger(count) && count > 20000 && (
          <p className="population-warning">This count exceeds the simulator limit of 20,000 people.</p>
        )}
      </div>

      <form className="population-report-form" onSubmit={submitReport}>
        <h3>Submit a population report</h3>
        <p className="population-description">
          Enter a count obtained from an authorized official, sensor, shelter,
          or manual observation. Submitted counts are not independently verified.
        </p>
        <label>
          Number of people
          <input type="number" min="0" max="10000000" step="1" required
            value={reportCount} onChange={event => setReportCount(event.target.value)}
            placeholder="Enter reported count" />
        </label>
        <label>
          Report source
          <select value={reportSource} onChange={event => setReportSource(event.target.value)}>
            <option value="manual_report">Manual report</option>
            <option value="official_report">Official report</option>
            <option value="sensor_count">Sensor count</option>
            <option value="shelter_registration">Shelter registration</option>
          </select>
        </label>
        <label>
          Reporter or organization (optional)
          <input value={reportedBy} onChange={event => setReportedBy(event.target.value)}
            maxLength={100} placeholder="Example: Rescue Team 1" />
        </label>
        <label>
          Notes (optional)
          <textarea value={note} onChange={event => setNote(event.target.value)}
            maxLength={500} rows={2} placeholder="When and how was this count obtained?" />
        </label>
        <button className="button primary" type="submit"
          disabled={saving || !areaId.trim() || reportCount === ''}>
          <Send size={16} /> {saving ? 'Saving report…' : 'Save population report'}
        </button>
      </form>

      {message && <div className="population-success" role="status">{message}</div>}
      {error && <div className="error-banner" role="alert">{error}</div>}

      {summary?.reports?.length > 0 && (
        <div className="population-report-list">
          <h3>Recent reports for this area</h3>
          {summary.reports.map(report => (
            <div className="population-report-item" key={report.id}>
              <strong>{Number(report.people_count).toLocaleString()} people</strong>
              <span>{SOURCE_LABELS[report.source] || report.source}</span>
              <small>{new Date(report.created_at).toLocaleString()}</small>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
