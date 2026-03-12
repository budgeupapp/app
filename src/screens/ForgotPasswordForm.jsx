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
      setSent(true)
    }
  }

  return (
    <form onSubmit={handleReset} autoComplete="on" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sent ? (
        <>
          <p style={{
            margin: 0, fontSize: 15, fontWeight: 600,
            fontFamily: 'Nunito, sans-serif', color: '#147b75',
            textAlign: 'center', lineHeight: 1.5,
          }}>
            Check your inbox for a password reset link.
          </p>
          <Link to="/login" style={{
            ...btn,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none',
          }}>
            Back to log in
          </Link>
        </>
      ) : (
        <>
          <p style={{
            margin: 0, fontSize: 15, fontWeight: 600,
            fontFamily: 'Nunito, sans-serif', color: '#5e5e5e',
            lineHeight: 1.5,
          }}>
            Enter your email and we'll send you a link to reset your password.
          </p>

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
            fontFamily: 'Nunito, sans-serif', color: '#9f9c9c',
          }}>
            <Link to="/login" style={{ color: '#147b75', fontWeight: 700, textDecoration: 'none' }}>
              Back to log in
            </Link>
          </p>
        </>
      )}
    </form>
  )
}

/* ---- shared styles ---- */

const lbl = {
  fontSize: 13, fontWeight: 700,
  fontFamily: 'Nunito, sans-serif',
  color: '#5e5e5e', display: 'block', marginBottom: 6,
}

const field = {
  borderRadius: 14,
  border: '1px solid #e8e8e8',
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
  width: '100%', height: 52, borderRadius: 14,
  border: 'none', background: '#147b75',
  color: '#fff', fontSize: 16, fontWeight: 700,
  fontFamily: 'Nunito, sans-serif', marginTop: 4,
}
