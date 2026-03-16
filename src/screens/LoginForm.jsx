import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'
import { analytics, AUTH_EVENTS, getEmailDomain } from '../lib/analytics/index.js'
import PasswordField from '../components/PasswordField'

export default function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    if (loading) return
    if (!email || !password) {
      setError(!email ? 'Please enter your email' : 'Please enter your password')
      return
    }

    setLoading(true)
    setError(null)

    analytics.track(AUTH_EVENTS.LOGIN_STARTED, { email_domain: getEmailDomain(email) })

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)

    if (authError) {
      analytics.track(AUTH_EVENTS.LOGIN_FAILED, {
        error_message: authError.message,
        email_domain: getEmailDomain(email)
      })

      if (authError.message.toLowerCase().includes('invalid login credentials')) {
        setError('Incorrect email or password. Please try again.')
      } else if (authError.message.toLowerCase().includes('email not confirmed')) {
        setError('Please confirm your email before logging in. Check your inbox.')
      } else {
        setError(authError.message)
      }
    } else {
      localStorage.setItem('login_initiated', 'true')
    }
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: 'calc(env(safe-area-inset-top, 0px) + 32px) 28px 0',
    }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
          <img src="/logo.svg" alt="Budge Up" style={{ height: 28 }} />
          <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>budge up</span>
        </div>
        <h2 style={{
          fontSize: 26, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
          color: '#1a1a1a', margin: '0 0 6px',
        }}>Welcome Back!</h2>
        <p style={{
          fontSize: 14, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
          color: '#888', margin: 0,
        }}>Log in to continue managing your budget</p>
      </div>

      <form onSubmit={handleLogin} autoComplete="on" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <span style={lbl}>Email</span>
          <div style={field}>
            <input
              type="email"
              inputMode="email"
              autoComplete="username email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              style={inp}
            />
          </div>
        </div>

        <PasswordField
          label="Password"
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
          labelStyle={lbl}
          fieldStyle={field}
          inputStyle={inp}
        />

        <div style={{ textAlign: 'right', marginTop: -6 }}>
          <Link to="/forgot-password" style={{
            fontSize: 13, fontWeight: 600,
            fontFamily: 'Nunito, sans-serif', color: '#147b75',
            textDecoration: 'none',
          }}>
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={loading} style={btn}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>

        {error && (
          <p style={{
            margin: 0, fontSize: 13, fontWeight: 600,
            fontFamily: 'Nunito, sans-serif', color: '#e06470',
            textAlign: 'center',
          }}>
            {error}
          </p>
        )}

        <p style={{
          textAlign: 'center', margin: '4px 0 0',
          fontSize: 14, fontWeight: 600,
          fontFamily: 'Nunito, sans-serif', color: '#9f9c9c',
        }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: '#147b75', fontWeight: 700, textDecoration: 'none' }}>
            Sign up
          </Link>
        </p>
      </form>
    </div>
  )
}

/* ---- shared styles ---- */

const lbl = {
  fontSize: 13, fontWeight: 700,
  fontFamily: 'Nunito, sans-serif',
  color: '#444', display: 'block', marginBottom: 6,
}

const field = {
  borderRadius: 12,
  border: '1.5px solid #e0e0e0',
  padding: '0 14px',
  height: 48,
  background: '#fff',
  display: 'flex',
  alignItems: 'center',
}

const inp = {
  width: '100%', border: 'none', padding: 0,
  fontSize: 16, fontWeight: 500,
  fontFamily: 'Nunito, sans-serif', color: '#000',
  background: 'transparent', outline: 'none',
  boxSizing: 'border-box', WebkitAppearance: 'none',
}

const btn = {
  width: '100%', height: 52, borderRadius: 50,
  border: 'none', background: '#147b75',
  color: '#fff', fontSize: 16, fontWeight: 700,
  fontFamily: 'Nunito, sans-serif', marginTop: 4,
  cursor: 'pointer',
}
