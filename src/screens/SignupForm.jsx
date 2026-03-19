import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useLocation } from 'react-router-dom'
import { POLICY_URLS } from '../lib/policyVersions'
import { analytics, AUTH_EVENTS, getEmailDomain } from '../lib/analytics/index.js'
import { UK_UNIVERSITIES } from '../config/onboardingConfig'
import PasswordField from '../components/PasswordField'


export default function SignupForm() {
  const location = useLocation()
  const isLoginRoute = location.pathname === '/login'
  const [showForm, setShowForm] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [view, setView] = useState(isLoginRoute ? 'login' : 'signup') // 'login' | 'signup' | 'forgot'
  const [resetSent, setResetSent] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [university, setUniversity] = useState('University of Bristol')
  const [loading, setLoading] = useState(false)
  const [consentChecked, setConsentChecked] = useState(false)
  const [newsletterChecked, setNewsletterChecked] = useState(false)
  const [insightsChecked, setInsightsChecked] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Preload forgot password illustration
  useEffect(() => {
    const img = new Image()
    img.src = '/forgot-password-illustration.svg'
  }, [])

  // Referral tracking
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const refCode = params.get('ref')
    if (refCode) {
      localStorage.setItem('referral_code', refCode)
      analytics.track(AUTH_EVENTS.REFERRAL_SIGNUP_STARTED, { referral_code: refCode })
    }
  }, [])

  // Set dynamic island + body background color — teal on landing, white on form
  useEffect(() => {
    const color = '#ffffff'
    // Update theme-color meta (remove + re-insert to force iOS Safari re-read)
    const existing = document.querySelector('meta[name="theme-color"]')
    if (existing) existing.remove()
    const meta = document.createElement('meta')
    meta.name = 'theme-color'
    meta.content = color
    document.head.appendChild(meta)
    // Also set body + root + safe-area cover so iOS renders correct color behind status bar
    document.body.style.backgroundColor = color
    document.getElementById('root').style.backgroundColor = color
    const cover = document.getElementById('safe-area-cover')
    if (cover) cover.style.background = color
    return () => {
      document.body.style.backgroundColor = '#ffffff'
      document.getElementById('root').style.backgroundColor = '#ffffff'
      if (cover) cover.style.background = '#ffffff'
    }
  }, [showForm])

  // Clear errors on view switch
  useEffect(() => {
    setError(null)
    setSuccess(null)
    setResetSent(false)
  }, [view])

  /* ---------- LOGIN ---------- */
  const handleLogin = async (e) => {
    e.preventDefault()
    if (loading) return
    if (!email) { setError('Please enter your email'); return }
    if (!password) { setError('Please enter your password'); return }

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

  /* ---------- SIGNUP ---------- */
  const handleSignup = async (e) => {
    e.preventDefault()
    if (loading) return
    if (!email) { setError('Please enter your email'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email address'); return }
    if (!password) { setError('Please choose a password'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (!consentChecked) { setError('Please agree to the Terms and Privacy Policy'); return }

    setLoading(true)
    setError(null)
    setSuccess(null)

    analytics.track(AUTH_EVENTS.SIGNUP_STARTED, { email_domain: getEmailDomain(email) })

    localStorage.setItem('signup_email', email)
    localStorage.setItem('signup_timestamp', Date.now().toString())
    localStorage.setItem('budgeup_newsletter', newsletterChecked ? 'true' : 'false')
    localStorage.setItem('budgeup_signup_university', university)
    localStorage.setItem('budgeup_insights_consent', insightsChecked ? 'true' : 'false')

    const referralCode = localStorage.getItem('referral_code')

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          referred_by: referralCode || null,
          insights_consent: insightsChecked,
        }
      }
    })

    setLoading(false)

    const alreadyExists = data?.user?.identities?.length === 0

    if (authError || alreadyExists) {
      localStorage.removeItem('signup_email')
      localStorage.removeItem('signup_timestamp')

      analytics.track(AUTH_EVENTS.SIGNUP_FAILED, {
        error_message: alreadyExists ? 'already_registered' : authError?.message,
        email_domain: getEmailDomain(email)
      })

      if (alreadyExists || authError?.message?.toLowerCase().includes('already registered')) {
        setError(<>An account with this email already exists.</>)
      } else {
        setError(authError.message)
      }
    } else {
      setSuccess('Account created! Please check your inbox for a verification email.')
    }
  }

  /* ---------- FORGOT PASSWORD ---------- */
  const handleForgot = async (e) => {
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
      setResetSent(true)
    }
  }

  const msg = error || success
  const isSignUp = view === 'signup'
  const isForgot = view === 'forgot'

  /* ---------- SUNFLOWERS ---------- */
  const sunflowers = [
    { left: '8%', top: 42, size: 30, opacity: 0.11 },
    { left: '35%', top: 48, size: 36, opacity: 0.12 },
    { left: '65%', top: 42, size: 44, opacity: 0.14 },
    { left: '92%', top: 50, size: 26, opacity: 0.09 },
    { left: '22%', top: 78, size: 22, opacity: 0.08 },
    { left: '50%', top: 85, size: 28, opacity: 0.09 },
    { left: '80%', top: 78, size: 20, opacity: 0.07 },
    { left: '10%', top: 110, size: 38, opacity: 0.1 },
    { left: '42%', top: 118, size: 20, opacity: 0.06 },
    { left: '70%', top: 108, size: 32, opacity: 0.08 },
    { left: '95%', top: 120, size: 24, opacity: 0.06 },
    { left: '18%', top: 150, size: 28, opacity: 0.05 },
    { left: '55%', top: 155, size: 22, opacity: 0.04 },
    { left: '82%', top: 148, size: 34, opacity: 0.05 },
    { left: '5%', top: 130, size: 16, opacity: 0.05 },
  ]

  /* ---------- WELCOME LANDING ---------- */
  if (!showForm) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(180deg, #ffffff 0%, #e8f5f4 15%, #d4efed 40%, #d4efed 60%, #e8f5f4 85%, #ffffff 100%)',
        overflow: 'hidden', position: 'relative',
        opacity: transitioning ? 0 : 1,
        transform: transitioning ? 'scale(0.97)' : 'scale(1)',
        transition: 'opacity 0.4s ease, transform 0.4s ease',
      }}>
        {/* Safe area spacer */}
        <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 10px)', flexShrink: 0 }} />

        {/* Content area with sunflowers behind */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 26px',
          position: 'relative',
        }}>
          {/* Sunflowers scattered behind content */}
          {sunflowers.map((s, i) => (
            <img key={i} src="/logo.svg" alt="" style={{
              position: 'absolute', left: s.left, top: s.top,
              width: s.size, height: s.size, opacity: s.opacity,
              transform: 'translate(-50%, -50%)',
              pointerEvents: 'none',
            }} />
          ))}

          <span style={{
            fontSize: 50, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
            color: '#147b75', letterSpacing: 1.5, marginBottom: 10, marginTop: 50,
            position: 'relative', zIndex: 1,
          }}>
            budge up
          </span>

      

          <h1 style={{
            fontSize: 24, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
            color: '#1a1a1a', margin: '40px 0 14px', textAlign: 'center',
            lineHeight: 1.3, position: 'relative', zIndex: 1, maxWidth: 340
          }}>
            Is your bank balance more confusing than your lectures?
          </h1>

          <p style={{
            fontSize: 14, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
            color: '#666', margin: 0, textAlign: 'center', lineHeight: 1.6,
            maxWidth: 340, position: 'relative', zIndex: 1,
          }}>
            If so, it won't be for much longer! Unlike normal budgeting tools, we don't track your past. We predict your future. It's free, zero-effort, and built by students for students. Sign up to get started!
          </p>
        </div>

        {/* Bottom CTA — slide to unlock */}
        <div style={{ padding: '24px 28px calc(env(safe-area-inset-bottom, 0px) + 28px)', flexShrink: 0 }}>
          <SlideToUnlock onUnlock={() => {
            setTransitioning(true)
            setTimeout(() => setShowForm(true), 400)
          }} />
        </div>
      </div>
    )
  }

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: '#ffffff',
      animation: 'authFadeIn 0.4s ease',
      overflow: 'hidden',
    }}>
      {/* Safe area spacer */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)', flexShrink: 0 }} />

      {/* Top spacer */}
      <div style={{ height: 14, flexShrink: 0 }} />

      {/* White card with rounded top */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: '#ffffff',
        borderRadius: '24px 24px 0 0',
        marginTop: 0,
        overflow: 'hidden',
      }}>
        <div style={{
          flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '24px 28px 0',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          minHeight: 0,
        }}>
          {/* Forgot password illustration */}
          {isForgot && (
            <div style={{ width: '55%', maxWidth: 200, aspectRatio: '1', marginBottom: 16 }}>
              <img src="/forgot-password-illustration.svg" alt="" style={{
                width: '100%', height: '100%', objectFit: 'contain',
              }} />
            </div>
          )}

          {/* Title */}
          <h2 style={{
            fontSize: 26, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
            color: '#1a1a1a', margin: '0 0 8px', textAlign: 'center',
          }}>
            {isForgot ? 'Forgot Password?' : isSignUp ? 'Create Account' : 'Welcome Back'}
          </h2>

          {isForgot && (
            <p style={{
              margin: '0 0 20px', fontSize: 14, fontWeight: 500,
              fontFamily: 'Nunito, sans-serif', color: '#888',
              lineHeight: 1.5, textAlign: 'center', maxWidth: 300,
            }}>
              {resetSent
                ? "We've sent a password reset link to your email."
                : "Enter your email and we'll send you a link to reset your password."
              }
            </p>
          )}

          {!isForgot && <div style={{ height: 20 }} />}

          {/* ---------- FORGOT PASSWORD FORM ---------- */}
          {isForgot && !resetSent && (
            <form onSubmit={handleForgot} autoComplete="on" style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
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
            </form>
          )}

          {isForgot && (
            <p style={{
              textAlign: 'center', margin: '22px 0 0',
              fontSize: 14, fontWeight: 600,
              fontFamily: 'Nunito, sans-serif', color: '#999',
            }}>
              <span
                onClick={() => setView('login')}
                style={{ color: '#147b75', fontWeight: 700, cursor: 'pointer' }}
              >
                Back to log in
              </span>
            </p>
          )}

          {/* ---------- LOGIN FORM ---------- */}
          {view === 'login' && (
            <form onSubmit={handleLogin} autoComplete="on" style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
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
                <span
                  onClick={() => setView('forgot')}
                  style={{
                    fontSize: 13, fontWeight: 600,
                    fontFamily: 'Nunito, sans-serif', color: '#147b75',
                    cursor: 'pointer',
                  }}
                >
                  Forgot password?
                </span>
              </div>

              <button type="submit" disabled={loading} style={btn}>
                {loading ? 'Logging in...' : 'Log in'}
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
            </form>
          )}

          {/* ---------- SIGNUP FORM ---------- */}
          {isSignUp && (
            <form onSubmit={handleSignup} autoComplete="on" style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
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

              <div>
                <span style={lbl}>University</span>
                <div style={{ position: 'relative' }}>
                  <select
                    value={university}
                    onChange={(e) => setUniversity(e.target.value)}
                    style={{
                      ...inp,
                      width: '100%', boxSizing: 'border-box',
                      border: '1.5px solid #e0e0e0', borderRadius: 12,
                      padding: '12px 36px 12px 14px',
                      appearance: 'none', WebkitAppearance: 'none',
                      cursor: 'pointer', background: '#fff',
                    }}
                  >
                    {UK_UNIVERSITIES.map(uni => (
                      <option key={uni} value={uni}>{uni}</option>
                    ))}
                  </select>
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <path d="M1 1L5 5L9 1" stroke="#999" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>

              {/* Consent checkbox */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '2px 0' }}>
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
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#444', lineHeight: 1.4 }}>
                  I agree to the{' '}
                  <a href={POLICY_URLS.terms} target="_blank" rel="noopener noreferrer" style={{ color: '#147b75', textDecoration: 'none', fontWeight: 700 }}>Terms</a>
                  {' '}and{' '}
                  <a href={POLICY_URLS.privacy} target="_blank" rel="noopener noreferrer" style={{ color: '#147b75', textDecoration: 'none', fontWeight: 700 }}>Privacy Policy</a>
                </span>
              </label>

              {/* Newsletter opt-in */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '2px 0' }}>
                <div
                  onClick={(e) => { e.preventDefault(); setNewsletterChecked(!newsletterChecked) }}
                  style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                    border: newsletterChecked ? '2px solid #147b75' : '1.5px solid #d0d0d0',
                    background: newsletterChecked ? '#147b75' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {newsletterChecked && (
                    <svg width="12" height="9" viewBox="0 0 14 10" fill="none">
                      <path d="M1 5L5 9L13 1" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#444', lineHeight: 1.4 }}>
                  Sign up for behind-the-scenes updates and features!
                </span>
              </label>

              {/* Anonymised data consent */}
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: '2px 0' }}>
                <div
                  onClick={(e) => { e.preventDefault(); setInsightsChecked(!insightsChecked) }}
                  style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
                    border: insightsChecked ? '2px solid #147b75' : '1.5px solid #d0d0d0',
                    background: insightsChecked ? '#147b75' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {insightsChecked && (
                    <svg width="12" height="9" viewBox="0 0 14 10" fill="none">
                      <path d="M1 5L5 9L13 1" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#444', lineHeight: 1.4 }}>
                  I'm happy for my anonymised data to be used for student finance insights
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
            </form>
          )}

          {/* Divider + Google + Switch (not on forgot view) */}
          {!isForgot && (<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px', width: '100%' }}>
              <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
              <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#aaa' }}>or continue with</span>
              <div style={{ flex: 1, height: 1, background: '#e0e0e0' }} />
            </div>

            <button
              type="button"
              onClick={async () => {
                if (isSignUp) {
                  localStorage.setItem('budgeup_signup_university', university)
                  localStorage.setItem('budgeup_newsletter', newsletterChecked ? 'true' : 'false')
                }
                await supabase.auth.signInWithOAuth({
                  provider: 'google',
                  options: { redirectTo: window.location.origin }
                })
              }}
              style={{
                width: '100%', height: 52, minHeight: 52, borderRadius: 50,
                border: '1.5px solid #e0e0e0', background: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                cursor: 'pointer', fontFamily: 'Nunito, sans-serif',
                fontSize: 15, fontWeight: 700, color: '#333', flexShrink: 0,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.02 24.02 0 0 0 0 21.56l7.98-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Google
            </button>

            <p style={{
              textAlign: 'center', margin: '22px 0 0',
              fontSize: 14, fontWeight: 600,
              fontFamily: 'Nunito, sans-serif', color: '#999',
            }}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <span
                onClick={() => { setView(isSignUp ? 'login' : 'signup'); setError(null); setSuccess(null) }}
                style={{ color: '#147b75', fontWeight: 700, cursor: 'pointer' }}
              >
                {isSignUp ? 'Log in' : 'Sign up'}
              </span>
            </p>
          </>)}

          <div style={{ height: 24 }} />
        </div>
      </div>
    </div>
  )
}

/* ---- shared styles ---- */

const lbl = {
  fontSize: 13, fontWeight: 700,
  fontFamily: 'Nunito, sans-serif',
  color: '#444', display: 'block', marginBottom: 4,
}

const field = {
  borderRadius: 12,
  border: '1.5px solid #e0e0e0',
  padding: '0 14px',
  height: 44, minHeight: 44,
  background: '#fff',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}

const inp = {
  width: '100%', border: 'none', padding: 0,
  fontSize: 16, fontWeight: 500,
  fontFamily: 'Nunito, sans-serif', color: '#000',
  background: 'transparent', outline: 'none',
  boxSizing: 'border-box', WebkitAppearance: 'none',
}

const btn = {
  width: '100%', height: 48, minHeight: 48, borderRadius: 50,
  border: 'none', background: '#147b75',
  color: '#fff', fontSize: 16, fontWeight: 700,
  fontFamily: 'Nunito, sans-serif', marginTop: 2,
  cursor: 'pointer', flexShrink: 0,
}

/* ---- slide to unlock ---- */

function SlideToUnlock({ onUnlock }) {
  const trackRef = useRef(null)
  const thumbRef = useRef(null)
  const labelRef = useRef(null)
  const lockRef = useRef(null)
  const shackleRef = useRef(null)
  const stateRef = useRef({ dragging: false, startX: 0, currentX: 0, maxX: 200, unlocked: false })

  const THUMB = 52

  const updateVisuals = (x) => {
    if (!thumbRef.current || !labelRef.current) return
    thumbRef.current.style.transform = `translateX(${x}px)`
    const progress = x / stateRef.current.maxX
    labelRef.current.style.opacity = Math.max(0, 1 - progress * 2)
    // Animate the lock shackle opening as user slides
    if (shackleRef.current) {
      const shackleProgress = Math.min(1, progress * 1.5)
      shackleRef.current.style.transform = `translateY(${-shackleProgress * 3}px) rotate(${shackleProgress * 15}deg)`
      shackleRef.current.style.transformOrigin = 'right bottom'
    }
  }

  const handleStart = (clientX) => {
    const s = stateRef.current
    if (s.unlocked) return
    s.maxX = trackRef.current.offsetWidth - THUMB - 8
    s.startX = clientX
    s.currentX = 0
    s.dragging = true
    thumbRef.current.style.transition = 'none'
    if (shackleRef.current) shackleRef.current.style.transition = 'none'
  }

  const handleMove = (clientX) => {
    const s = stateRef.current
    if (!s.dragging || s.unlocked) return
    const x = Math.max(0, Math.min(clientX - s.startX, s.maxX))
    s.currentX = x
    updateVisuals(x)
  }

  const handleEnd = () => {
    const s = stateRef.current
    if (!s.dragging) return
    s.dragging = false
    thumbRef.current.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
    if (shackleRef.current) shackleRef.current.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)'

    if (s.currentX >= s.maxX * 0.65) {
      s.unlocked = true
      updateVisuals(s.maxX)
      if (navigator.vibrate) navigator.vibrate(15)
      setTimeout(onUnlock, 350)
    } else {
      updateVisuals(0)
      s.currentX = 0
    }
  }

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const onTouchStart = (e) => handleStart(e.touches[0].clientX)
    const onTouchMove = (e) => { e.preventDefault(); handleMove(e.touches[0].clientX) }
    const onTouchEnd = () => handleEnd()
    const onMouseDown = (e) => { handleStart(e.clientX); document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp) }
    const onMouseMove = (e) => handleMove(e.clientX)
    const onMouseUp = () => { handleEnd(); document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp) }

    track.addEventListener('touchstart', onTouchStart, { passive: true })
    track.addEventListener('touchmove', onTouchMove, { passive: false })
    track.addEventListener('touchend', onTouchEnd)
    track.addEventListener('mousedown', onMouseDown)

    return () => {
      track.removeEventListener('touchstart', onTouchStart)
      track.removeEventListener('touchmove', onTouchMove)
      track.removeEventListener('touchend', onTouchEnd)
      track.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [onUnlock])

  return (
    <div
      ref={trackRef}
      style={{
        position: 'relative',
        width: '100%', height: 60, borderRadius: 50,
        background: '#147b75',
        boxShadow: '0 4px 16px rgba(20,123,117,0.3)',
        overflow: 'hidden',
        userSelect: 'none', WebkitUserSelect: 'none',
        touchAction: 'pan-y',
      }}
    >
      <div ref={labelRef} style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        paddingLeft: 26,
        color: '#fff',
        fontSize: 17, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
        pointerEvents: 'none',
        transition: 'opacity 0.15s ease',
      }}>
        Slide to unlock
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 8, animation: 'slideArrow 1.2s ease-in-out infinite' }}>
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <style>{`@keyframes slideArrow { 0%, 100% { transform: translateX(0); opacity: 1; } 50% { transform: translateX(6px); opacity: 0.6; } }`}</style>
      </div>

      <div
        ref={thumbRef}
        style={{
          position: 'absolute',
          left: 4, top: 4,
          width: THUMB, height: THUMB, borderRadius: '50%',
          background: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'grab',
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'transform',
        }}
      >
        {/* Lock icon */}
        <svg ref={lockRef} width="22" height="26" viewBox="0 -2 24 26" fill="none" style={{ overflow: 'visible' }}>
          {/* Lock body */}
          <rect x="5" y="11" width="14" height="11" rx="2" stroke="#147b75" strokeWidth="2" fill="none" />
          {/* Lock shackle (animated) */}
          <path ref={shackleRef} d="M8 11V7a4 4 0 1 1 8 0v4" stroke="#147b75" strokeWidth="2" strokeLinecap="round" style={{ transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }} />
          {/* Keyhole */}
          <circle cx="12" cy="16" r="1.5" fill="#147b75" />
        </svg>
      </div>
    </div>
  )
}
