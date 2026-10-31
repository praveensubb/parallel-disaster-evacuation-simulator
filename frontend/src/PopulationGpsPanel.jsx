import React, { useCallback, useEffect, useMemo, useState } from "react";
import "./PopulationGpsPanel.css";

const API_BASE = "http://127.0.0.1:8000";

function getParticipantId() {
  const key = "evacuation_gps_participant_id";
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = `p_${window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    window.localStorage.setItem(key, id);
  }
  return id;
}

function getBrowserPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser does not support location access."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_m: Math.round(position.coords.accuracy || 0),
      }),
      (error) => {
        const messages = {
          1: "Location permission was denied. Allow location access in your browser to continue.",
          2: "Your location is currently unavailable. Try again outdoors or check your device settings.",
          3: "Location request timed out. Please try again.",
        };
        reject(new Error(messages[error.code] || "Could not read your location."));
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

export default function PopulationGpsPanel({ onPopulationCount }) {
  const [center, setCenter] = useState(null);
  const [radius, setRadius] = useState(500);
  const [count, setCount] = useState(null);
  const [lastCountedAt, setLastCountedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [apiOnline, setApiOnline] = useState(null);

  const centerLabel = useMemo(() => {
    if (!center) return "Area center not selected";
    return `${center.latitude.toFixed(5)}, ${center.longitude.toFixed(5)}`;
  }, [center]);

  const checkApi = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/gps-population/health`);
      if (!response.ok) throw new Error("API health check failed");
      await response.json();
      setApiOnline(true);
    } catch {
      setApiOnline(false);
    }
  }, []);

  useEffect(() => { checkApi(); }, [checkApi]);

  const chooseAreaCenter = async () => {
    setBusy("center");
    setError("");
    setMessage("");
    try {
      const position = await getBrowserPosition();
      setCenter({ latitude: position.latitude, longitude: position.longitude });
      setMessage("Area center set to your current location. Adjust the radius, then count check-ins.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  const checkIn = async () => {
    setBusy("checkin");
    setError("");
    setMessage("");
    try {
      const position = await getBrowserPosition();
      const response = await fetch(`${API_BASE}/api/gps-population/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: getParticipantId(), ...position }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not save GPS check-in.");
      setExpiresAt(data.expires_at || "");
      if (!center) setCenter({ latitude: position.latitude, longitude: position.longitude });
      setMessage("Your check-in was saved. It expires automatically; this is an opt-in device check-in.");
      await refreshCount(center || { latitude: position.latitude, longitude: position.longitude }, radius);
    } catch (e) {
      setError(e.message || "GPS check-in failed.");
    } finally {
      setBusy("");
    }
  };

  const refreshCount = async (area = center, selectedRadius = radius) => {
    if (!area) {
      setError("Set the area center first.");
      return;
    }
    setBusy("count");
    setError("");
    setMessage("");
    try {
      const params = new URLSearchParams({
        latitude: String(area.latitude),
        longitude: String(area.longitude),
        radius_meters: String(selectedRadius),
      });
      const response = await fetch(`${API_BASE}/api/gps-population/count?${params}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || "Could not retrieve the participant count.");
      setCount(data.active_checkins);
      setLastCountedAt(data.counted_at || new Date().toISOString());
      if (typeof onPopulationCount === "function") onPopulationCount(data.active_checkins, data);
      setMessage("Participant count refreshed.");
    } catch (e) {
      setError(`${e.message} Check that the backend is running and the GPS population router is registered.`);
    } finally {
      setBusy("");
    }
  };

  const removeCheckIn = async () => {
    setBusy("remove");
    setError("");
    setMessage("");
    try {
      const id = getParticipantId();
      const response = await fetch(`${API_BASE}/api/gps-population/check-in/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 404) throw new Error(data.detail || "Could not remove check-in.");
      setExpiresAt("");
      setMessage("Your check-in has been removed.");
      if (center) await refreshCount(center, radius);
    } catch (e) {
      setError(e.message || "Could not remove your check-in.");
    } finally {
      setBusy("");
    }
  };

  return (
    <section className="gps-population-panel" aria-labelledby="gps-population-title">
      <div className="gps-population-heading">
        <div>
          <p className="gps-population-eyebrow">LIVE PARTICIPANT ESTIMATE</p>
          <h2 id="gps-population-title">GPS population check-ins</h2>
          <p className="gps-population-subtitle">
            Count recent, voluntary device check-ins near a selected area. This is not a complete headcount.
          </p>
        </div>
        <span className={`gps-api-status ${apiOnline === true ? "is-online" : apiOnline === false ? "is-offline" : ""}`}>
          <span className="gps-status-dot" />
          {apiOnline === true ? "API online" : apiOnline === false ? "API offline" : "Checking API"}
        </span>
      </div>

      <div className="gps-population-metrics">
        <div className="gps-population-metric">
          <span>Recent check-ins in area</span>
          <strong>{count === null ? "—" : count.toLocaleString()}</strong>
          <small>Unique participant IDs</small>
        </div>
        <div className="gps-population-metric">
          <span>Search radius</span>
          <strong>{radius} m</strong>
          <small>Measured from area center</small>
        </div>
        <div className="gps-population-metric gps-population-center">
          <span>Area center</span>
          <strong>{center ? "Selected" : "Not set"}</strong>
          <small>{centerLabel}</small>
        </div>
      </div>

      <div className="gps-population-controls">
        <button type="button" className="gps-action-button" onClick={chooseAreaCenter} disabled={!!busy}>
          {busy === "center" ? "Getting location…" : "Use my location as area center"}
        </button>
        <button type="button" className="gps-action-button gps-action-primary" onClick={checkIn} disabled={!!busy}>
          {busy === "checkin" ? "Submitting check-in…" : "Consent & check in this device"}
        </button>
        <button type="button" className="gps-action-button" onClick={() => refreshCount()} disabled={!!busy || !center}>
          {busy === "count" ? "Counting…" : "Refresh participant count"}
        </button>
      </div>

      <label className="gps-radius-control">
        <span>Area radius</span>
        <strong>{radius} m</strong>
        <input type="range" min="50" max="5000" step="50" value={radius}
          onChange={(event) => setRadius(Number(event.target.value))} />
        <span className="gps-radius-ends"><small>50 m</small><small>5 km</small></span>
      </label>

      {(message || error) && (
        <div className={`gps-feedback ${error ? "gps-feedback-error" : "gps-feedback-success"}`} role="status">
          {error || message}
        </div>
      )}

      <div className="gps-population-footnote">
        <strong>Privacy & accuracy:</strong> location is requested only when you press a location button.
        Check-ins expire after 30 minutes by default. A device is not necessarily one person, and people who
        do not check in are not counted.
        {expiresAt && <span className="gps-expiry"> Your check-in expires at {new Date(expiresAt).toLocaleTimeString()}.</span>}
        {lastCountedAt && <span className="gps-expiry"> Last count: {new Date(lastCountedAt).toLocaleTimeString()}.</span>}
      </div>
      <div className="gps-population-remove">
        <button type="button" className="gps-remove-button" onClick={removeCheckIn} disabled={!!busy}>
          Remove my check-in
        </button>
      </div>
    </section>
  );
}
