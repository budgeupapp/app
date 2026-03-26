import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link } from 'react-router-dom'

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)

  const handleReset = async (e) => {
    e.preventDefault()
    if (loading) return
    if (!email) { setError('Please enter your email'); return }

    setLoading(true)
    setError(null)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
    } else {
      localStorage.setItem('password_reset_pending', 'true')
      setSent(true)
    }
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center',
      padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 28px calc(env(safe-area-inset-bottom, 0px) + 24px)',
      background: '#fff',
      overflow: 'auto', WebkitOverflowScrolling: 'touch',
      minHeight: 0,
    }}>
      {/* Illustration */}
      <img src="/forgot-password-illustration.svg" alt="" style={{
        width: '65%', maxWidth: 240, marginBottom: 24,
      }} />

      <h2 style={{
        fontSize: 26, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
        color: '#1a1a1a', margin: '0 0 8px', textAlign: 'center',
      }}>
        Forgot Password?
      </h2>

      <p style={{
        margin: '0 0 24px', fontSize: 14, fontWeight: 500,
        fontFamily: 'Nunito, sans-serif', color: '#888',
        lineHeight: 1.5, textAlign: 'center', maxWidth: 300,
      }}>
        {sent
          ? "We've sent a password reset link to your email."
          : "Enter your email and we'll send you a link to reset your password."
        }
      </p>

      {sent ? (
        <Link to="/login" style={{
          ...btn,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          textDecoration: 'none',
        }}>
          Back to log in
        </Link>
      ) : (
        <form onSubmit={handleReset} autoComplete="on" style={{
          display: 'flex', flexDirection: 'column', gap: 18, width: '100%',
        }}>
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

          <button type="submit" disabled={loading} style={btn}>
            {loading ? 'Sending...' : 'Send reset link'}
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
            fontFamily: 'Nunito, sans-serif', color: '#999',
          }}>
            <Link to="/login" style={{ color: '#147b75', fontWeight: 700, textDecoration: 'none' }}>
              Back to log in
            </Link>
          </p>
        </form>
      )}
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
