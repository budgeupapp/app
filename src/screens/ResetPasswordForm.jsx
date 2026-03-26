import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import PasswordField from '../components/PasswordField'

export default function ResetPasswordForm({ onComplete }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    if (!password) { setError('Please enter a new password'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }

    setLoading(true)
    setError(null)

    const { error: updateError } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      localStorage.removeItem('password_reset_pending')
      onComplete()
    }
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      padding: '24px 28px calc(env(safe-area-inset-bottom, 0px) + 24px)',
      overflow: 'auto', WebkitOverflowScrolling: 'touch',
      minHeight: 0,
    }}>
      <h2 style={{
        fontSize: 24, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
        color: '#1a1a1a', margin: '0 0 8px', textAlign: 'center',
      }}>
        Set New Password
      </h2>
      <p style={{
        margin: '0 0 20px', fontSize: 14, fontWeight: 500,
        fontFamily: 'Nunito, sans-serif', color: '#888',
        lineHeight: 1.5, textAlign: 'center',
      }}>
        Choose a new password for your account.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PasswordField
          label="New password"
          autoComplete="new-password"
          placeholder="At least 6 characters"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
          labelStyle={lbl}
          fieldStyle={field}
          inputStyle={inp}
        />

        <PasswordField
          label="Confirm password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(null) }}
          labelStyle={lbl}
          fieldStyle={field}
          inputStyle={inp}
        />

        <button type="submit" disabled={loading} style={btn}>
          {loading ? 'Updating...' : 'Set new password'}
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
