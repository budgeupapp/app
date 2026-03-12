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
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{
        margin: 0, fontSize: 15, fontWeight: 600,
        fontFamily: 'Nunito, sans-serif', color: '#5e5e5e',
        lineHeight: 1.5,
      }}>
        Choose a new password for your account.
      </p>

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
