import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { adminSignIn, isConfigured } from '../services/firebase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isConfigured) {
        // Real flow: Firebase Auth, then verify admin role (claim or admins/{uid} doc)
        const admin = await adminSignIn(email, password);
        signIn(admin);
      } else {
        // Demo mode: any credentials accepted, seeded mock data everywhere
        signIn({ uid: 'demo-admin', email, role: 'superadmin', name: 'Demo Admin' });
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #FF4DA6 0%, #7B61FF 50%, #00BCD4 100%)', padding: 20,
    }}>
      <div className="card" style={{ maxWidth: 420, width: '100%', padding: 34 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ fontSize: 48 }}>📸</div>
          <h2>Photobooth Admin</h2>
          <p className="muted" style={{ fontSize: 13 }}>
            Sign in to manage your platform
          </p>
        </div>

        {error && (
          <div className="hint" style={{ borderColor: 'rgba(255,82,82,0.4)', color: '#FF5252', background: 'rgba(255,82,82,0.1)', marginBottom: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@photobooth.app" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="password" type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••"
              />
              <button type="button" className="btn ghost small" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
          <button type="submit" className="btn" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {!isConfigured && (
          <p className="hint" style={{ marginTop: 16 }}>
            Demo mode: Firebase env vars are not set, so any email/password opens the panel with sample data.
          </p>
        )}
      </div>
    </div>
  );
}
