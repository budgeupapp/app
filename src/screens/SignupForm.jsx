import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Link, useSearchParams } from 'react-router-dom'
import { POLICY_URLS } from '../lib/policyVersions'
import { analytics, AUTH_EVENTS, getEmailDomain } from '../lib/analytics/index.js'
import PasswordField from '../components/PasswordField'

export default function SignupForm() {
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    const refCode = searchParams.get('ref')
    if (refCode) {
      localStorage.setItem('referral_code', refCode)
      analytics.track(AUTH_EVENTS.REFERRAL_SIGNUP_STARTED, { referral_code: refCode })
    }
  }, [searchParams])

  const handleSignup = async (e) => {
    e.preventDefault()
    if (loading) return
    if (!email) { setError('Please enter your email'); return }
    if (!password) { setError('Please choose a password'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (!consentChecked) { setError('Please agree to the Terms and Privacy Policy'); return }

    setLoading(true)
    setError(null)
    setSuccess(null)

    analytics.track(AUTH_EVENTS.SIGNUP_STARTED, { email_domain: getEmailDomain(email) })

    localStorage.setItem('signup_email', email)
    localStorage.setItem('signup_timestamp', Date.now().toString())

    const referralCode = localStorage.getItem('referral_code')

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { referred_by: referralCode || null }
      }
    })

    setLoading(false)

    // Supabase returns empty identities when email already exists
    const alreadyExists = data?.user?.identities?.length === 0

    if (authError || alreadyExists) {
      localStorage.removeItem('signup_email')
      localStorage.removeItem('signup_timestamp')

      analytics.track(AUTH_EVENTS.SIGNUP_FAILED, {
        error_message: alreadyExists ? 'already_registered' : authError?.message,
        email_domain: getEmailDomain(email)
      })

      if (alreadyExists || authError?.message?.toLowerCase().includes('already registered')) {
        setError(<>An account with this email already exists. </>)
      } else {
        setError(authError.message)
      }
    } else {
      setSuccess('Check your inbox to confirm your email, then log in.')
    }
  }

  const msg = error || success

  return (
    <form onSubmit={handleSignup} autoComplete="on" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
        autoComplete="new-password"
        placeholder="At least 6 characters"
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(null) }}
        labelStyle={lbl}
        fieldStyle={field}
        inputStyle={inp}
      />

      {/* Consent checkbox */}
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        cursor: 'pointer', padding: '2px 0',
      }}>
        <div
          onClick={(e) => { e.preventDefault(); setConsentChecked(!consentChecked); setError(null) }}
          style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
            border: consentChecked ? '2px solid #147b75' : '1.5px solid #d0d0d0',
            background: consentChecked ? '#147b75' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}
        >
          {consentChecked && (
            <svg width="12" height="9" viewBox="0 0 14 10" fill="none">
              <path d="M1 5L5 9L13 1" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#5e5e5e', lineHeight: 1.4 }}>
          I agree to the{' '}
          <a href={POLICY_URLS.terms} target="_blank" rel="noopener noreferrer" style={{ color: '#147b75', textDecoration: 'none', fontWeight: 700 }}>
            Terms
          </a>{' '}and{' '}
          <a href={POLICY_URLS.privacy} target="_blank" rel="noopener noreferrer" style={{ color: '#147b75', textDecoration: 'none', fontWeight: 700 }}>
            Privacy Policy
          </a>
        </span>
      </label>

      <button type="submit" disabled={loading || !consentChecked} style={{
        ...btn,
        background: consentChecked ? '#147b75' : '#ccc',
      }}>
        {loading ? 'Creating account...' : 'Create account'}
      </button>

      {msg && (
        <p style={{
          margin: 0, fontSize: 13, fontWeight: 600,
          fontFamily: 'Nunito, sans-serif',
          color: error ? '#e06470' : '#147b75',
          textAlign: 'center',
        }}>
          {msg}
        </p>
      )}

      <p style={{
        textAlign: 'center', margin: '4px 0 0',
        fontSize: 14, fontWeight: 600,
        fontFamily: 'Nunito, sans-serif', color: '#9f9c9c',
      }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: '#147b75', fontWeight: 700, textDecoration: 'none' }}>
          Log in
        </Link>
      </p>
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
