import React, { useState } from 'react';
import { loadSettings, persistSettings } from '../services/dataAdapter';
import { PageShell } from '../components/UI';
import { formatPeso } from '../utils/formatters';

export default function Settings() {
  const [form, setForm] = useState(() => loadSettings());
  const [saved, setSaved] = useState(false);

  const set = (key) => (e) =>
    setForm({ ...form, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const handleSave = (e) => {
    e.preventDefault();
    persistSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <PageShell title="Settings" subtitle="Platform configuration and monetization defaults">
      <form onSubmit={handleSave} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 18 }}>
        <div className="card">
          <h3>General</h3>
          <div className="field">
            <label>App name</label>
            <input value={form.appName} onChange={set('appName')} />
          </div>
          <div className="field">
            <label>Support email</label>
            <input type="email" value={form.supportEmail} onChange={set('supportEmail')} />
          </div>
          <div className="field checkbox-row">
            <input type="checkbox" id="maintenance" checked={form.maintenanceMode} onChange={set('maintenanceMode')} />
            <label htmlFor="maintenance" style={{ margin: 0 }}>Maintenance mode (block app access)</label>
          </div>
        </div>

        <div className="card">
          <h3>Monetization</h3>
          <div className="field">
            <label>Free tier credits per user</label>
            <input type="number" min="0" value={form.freeTierCredits} onChange={set('freeTierCredits')} />
          </div>
          <div className="field">
            <label>Premium price (₱ / month)</label>
            <input type="number" min="0" value={form.premiumPricePHP} onChange={set('premiumPricePHP')} />
          </div>
          <div className="hint">Current premium price: {formatPeso(form.premiumPricePHP)} / month</div>
        </div>

        <div className="card">
          <h3>Features</h3>
          <div className="field checkbox-row">
            <input type="checkbox" id="push" checked={form.pushEnabled} onChange={set('pushEnabled')} />
            <label htmlFor="push" style={{ margin: 0 }}>Push notifications (Firebase Cloud Messaging)</label>
          </div>
          <div className="field checkbox-row">
            <input type="checkbox" id="ai" checked={form.aiFiltersEnabled} onChange={set('aiFiltersEnabled')} />
            <label htmlFor="ai" style={{ margin: 0 }}>AI filters engine enabled</label>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h3>Save</h3>
          <p className="muted" style={{ fontSize: 13 }}>
            Settings are stored locally in demo mode. In production, persist them in a
            Firestore <code className="mono">config/platform</code> document and read them from
            Cloud Functions / the mobile app.
          </p>
          <div className="btn-row">
            <button type="submit" className="btn">Save Settings</button>
            {saved && <Badge tone="green">Saved ✓</Badge>}
          </div>
        </div>
      </form>
    </PageShell>
  );
}
