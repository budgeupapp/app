import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Button, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { POLICY_URLS } from '../lib/policyVersions'
import { analytics, AUTH_EVENTS, SETTINGS_EVENTS, getErrorProperties } from '../lib/analytics/index.js'
import { CURRENCIES, getCurrency, setCurrency, getGraphStart, setGraphStart, getCurrencySymbol } from '../lib/settings'
import { fetchUserData, saveTermDates, saveUserFinances, saveCashflowForecast } from '../lib/api'
import { INITIAL_FORM_DATA, UK_UNIVERSITIES, getTermDatesForUniversity, hasCustomTermDates } from '../config/onboardingConfig'
import TermDatesStep from './TermDatesStep'

const { Title, Text } = Typography

/* ── Custom select with chevron ── */
function SettingsSelect({ value, onChange, children, style }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', ...style }}>
      <select
        value={value}
        onChange={onChange}
        style={{
          appearance: 'none', WebkitAppearance: 'none',
          border: '1px solid #e8e8e8',
          borderRadius: 10,
          padding: '0 32px 0 12px',
          height: 40,
          fontSize: 14,
          fontFamily: 'Nunito, sans-serif',
          fontWeight: 600,
          background: '#fff',
          color: '#1a1a1a',
          cursor: 'pointer',
          outline: 'none',
          width: '100%',
        }}
      >
        {children}
      </select>
      <svg
        width="14" height="14" viewBox="0 0 14 14" fill="none"
        style={{
          position: 'absolute', right: 10, top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      >
        <path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="#9f9c9c"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/* ── Pulse loading skeleton ── */
function LoadingSkeleton({ width = '100%', height = 44, borderRadius = 10, style }) {
  return (
    <div style={{
      width, height, borderRadius,
      background: '#efefef',
      position: 'relative',
      overflow: 'hidden',
      ...style,
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
        animation: 'shimmer 2.4s linear infinite',
      }} />
    </div>
  )
}

/* ── Custom confirmation modal ── */
function ConfirmModal({ open, title, description, confirmText, cancelText = 'Cancel', danger, loading, onConfirm, onCancel }) {
  const [visible, setVisible] = useState(false)   // controls mount
  const [animating, setAnimating] = useState(false) // controls CSS class

  useEffect(() => {
    if (open) {
      setVisible(true)
      // trigger enter animation on next frame
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)))
    } else if (visible) {
      // trigger exit animation, then unmount
      setAnimating(false)
      const timer = setTimeout(() => setVisible(false), 250)
      return () => clearTimeout(timer)
    }
  }, [open])

  if (!visible) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={loading ? undefined : onCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          opacity: animating ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Dialog */}
      <div style={{
        position: 'fixed', left: '50%', top: '50%', zIndex: 1001,
        transform: animating
          ? 'translate(-50%, -50%) scale(1)'
          : 'translate(-50%, -44%) scale(0.92)',
        opacity: animating ? 1 : 0,
        transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease',
        width: 'calc(100% - 48px)', maxWidth: 340,
        background: '#fff', borderRadius: 20,
        padding: '28px 24px 20px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
      }}>
        <h3 style={{
          margin: '0 0 8px', fontSize: 19, fontWeight: 700,
          fontFamily: 'Nunito, sans-serif', textAlign: 'center', color: '#1a1a1a',
        }}>{title}</h3>

        <p style={{
          margin: '0 0 24px', fontSize: 15, lineHeight: 1.5,
          fontFamily: 'Nunito, sans-serif', textAlign: 'center', color: '#666',
        }}>{description}</p>

        <button
          disabled={loading}
          onClick={onConfirm}
          style={{
            width: '100%', height: 48, borderRadius: 99, border: 'none',
            fontSize: 16, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.6 : 1,
            transition: 'opacity 0.15s ease',
            background: danger ? '#E5484D' : '#147B75',
            color: '#fff', marginBottom: 10,
          }}
        >
          {loading ? 'Please wait…' : confirmText}
        </button>

        <button
          disabled={loading}
          onClick={onCancel}
          style={{
            width: '100%', height: 48, borderRadius: 99, border: 'none',
            fontSize: 16, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
            cursor: 'pointer', background: '#F3F3F3', color: '#1a1a1a',
          }}
        >
          {cancelText}
        </button>
      </div>
    </>
  )
}

export default function SettingsScreen() {
  const navigate = useNavigate()
  const trackedRef = useRef(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [currency, setCurrencyState] = useState(getCurrency)
  const [graphStart, setGraphStartState] = useState(getGraphStart)
  const [graphStartMode, setGraphStartMode] = useState(localStorage.getItem('budgeup_graph_start_mode') || 'joined')
  const graphStartRef = useRef(getGraphStart())
  const graphStartDirtyRef = useRef(false)
  const [userCreatedAt, setUserCreatedAt] = useState(null)
  const [termDates, setTermDates] = useState(null)
  const [termDatesLoading, setTermDatesLoading] = useState(true)
  const [expandedTerm, setExpandedTerm] = useState(null)
  const [university, setUniversity] = useState(() => {
    try {
      const saved = localStorage.getItem('budgeup_onboarding_state')
      const parsed = saved ? JSON.parse(saved) : {}
      return parsed?.formData?.university || ''
    } catch { return '' }
  })
  const universitySaveTimerRef = useRef(null)
  const [termDatesPrompt, setTermDatesPrompt] = useState(null) // { university, termDates }
  const [overdraft, setOverdraft] = useState(() => {
    try {
      const saved = localStorage.getItem('budgeup_onboarding_state')
      const parsed = saved ? JSON.parse(saved) : {}
      return parsed?.formData?.overdraft || ''
    } catch { return '' }
  })
  const overdraftSaveTimerRef = useRef(null)
  const [showOverdraftToggle, setShowOverdraftToggle] = useState(() => localStorage.getItem('budgeup_show_overdraft') !== 'false')
  const userIdRef = useRef(null)
  const termSaveTimerRef = useRef(null)
  const pendingTermDatesRef = useRef(null)

  const firstTermStart = (() => {
    try {
      const saved = localStorage.getItem('budgeup_onboarding_state')
      const parsed = saved ? JSON.parse(saved) : {}
      return parsed?.formData?.termDates?.terms?.[0]?.start || null
    } catch { return null }
  })()
  const [newsletterOn, setNewsletterOn] = useState(() => localStorage.getItem('budgeup_newsletter') !== 'false')
  const [newsletterLoading, setNewsletterLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage({ maxCount: 1 })
  const [linkCopied, setLinkCopied] = useState(false)
  const [toast, setToast] = useState(null) // { text, type: 'success'|'error' }
  const toastTimerRef = useRef(null)
  const settingsScrollRef = useRef(null)
  const showToast = (text, type = 'success', duration = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, type })
    toastTimerRef.current = setTimeout(() => setToast(null), duration)
  }

  // Restore scroll position from previous visit (layout effect to avoid flash)
  useLayoutEffect(() => {
    const saved = sessionStorage.getItem('budgeup_scroll_settings')
    if (saved && settingsScrollRef.current) {
      settingsScrollRef.current.scrollTop = parseInt(saved, 10)
    }
  }, [])

  // Tap Settings tab again → scroll to top
  useEffect(() => {
    const handler = () => {
      if (settingsScrollRef.current) {
        settingsScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
      }
    }
    window.addEventListener('nav-tap-again', handler)
    return () => window.removeEventListener('nav-tap-again', handler)
  }, [])

  // Scroll focused input into view when keyboard opens
  useEffect(() => {
    const sc = settingsScrollRef.current
    if (!sc) return
    const onFocusIn = (e) => {
      const el = e.target
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
      // Skip inputs that handle their own scroll-into-view (e.g. term name inputs)
      if (el.dataset.scrollHandled) return
      // Pin scroll to prevent keyboard-induced jump
      const pos = sc.scrollTop
      sc.style.overflowY = 'hidden'
      sc.scrollTop = pos
      // After keyboard settles, unlock and scroll input into view
      setTimeout(() => {
        sc.style.overflowY = 'auto'
        const scRect = sc.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const targetTop = elRect.top - scRect.top + sc.scrollTop - 100
        sc.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
      }, 400)
    }
    sc.addEventListener('focusin', onFocusIn)
    return () => sc.removeEventListener('focusin', onFocusIn)
  }, [])

  // Persist buffered graph start date on unmount
  useEffect(() => {
    return () => {
      if (graphStartDirtyRef.current) {
        setGraphStart(graphStartRef.current)
      }
    }
  }, [])

  // Flush pending term dates save on unmount so Dashboard doesn't fetch stale data
  useEffect(() => {
    return () => {
      if (termSaveTimerRef.current) clearTimeout(termSaveTimerRef.current)
      if (pendingTermDatesRef.current && userIdRef.current) {
        saveTermDates(userIdRef.current, pendingTermDatesRef.current).catch(() => {})
      }
    }
  }, [])

  // Track settings viewed and load user email + created_at
  useEffect(() => {
    if (!trackedRef.current) {
      trackedRef.current = true
      analytics.track(SETTINGS_EVENTS.VIEWED)
    }

    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) setUserEmail(user.email)
      if (user?.created_at) {
        const d = new Date(user.created_at)
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        setUserCreatedAt(dateStr)
      }
      if (user?.id) {
        userIdRef.current = user.id
        try {
          const result = await fetchUserData(user.id)
          if (result.formData?.termDates) {
            setTermDates(result.formData.termDates)
          }
          if (result.formData?.university) {
            setUniversity(result.formData.university)
          }
          if (result.formData?.overdraft != null && result.formData.overdraft !== '') {
            setOverdraft(result.formData.overdraft)
          }
        } catch (err) {
          console.error('Failed to load term dates:', err)
        } finally {
          setTermDatesLoading(false)
        }
        // Load newsletter consent
        try {
          const { data: nlConsent } = await supabase
            .from('user_consents')
            .select('id')
            .eq('user_id', user.id)
            .eq('scope', 'newsletter')
            .is('revoked_at', null)
            .maybeSingle()
          const isOn = !!nlConsent
          setNewsletterOn(isOn)
          localStorage.setItem('budgeup_newsletter', String(isOn))
        } catch { /* ignore */ }
      } else {
        setTermDatesLoading(false)
      }
    }
    loadUser()
  }, [])

  const clearAllAppData = async () => {
    localStorage.clear()
    sessionStorage.clear()
    // Clear all Cache Storage entries
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    // Clear IndexedDB databases
    if (window.indexedDB?.databases) {
      try {
        const dbs = await window.indexedDB.databases()
        dbs.forEach((db) => { if (db.name) window.indexedDB.deleteDatabase(db.name) })
      } catch (_) { /* not supported in all browsers */ }
    }
    // Unregister service workers
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  }

  const handleLogout = () => {
    analytics.track(AUTH_EVENTS.LOGOUT_CLICKED)
    setShowLogoutModal(true)
  }

  const confirmLogout = async () => {
    setLoggingOut(true)
    const { error } = await supabase.auth.signOut()
    setLoggingOut(false)

    if (error) {
      setShowLogoutModal(false)
      showToast('Failed to log out. Please try again.', 'error', 5000)
    } else {
      analytics.track(AUTH_EVENTS.LOGOUT)
      await clearAllAppData()
    }
  }

  const handleDeleteAccount = () => {
    analytics.track(SETTINGS_EVENTS.DELETE_ACCOUNT_CLICKED)
    setShowDeleteModal(true)
  }

  const confirmDeleteAccount = async () => {
    setDeletingAccount(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No user found')

      const { error: dataError } = await supabase
        .from('user_profiles')
        .delete()
        .eq('user_id', user.id)

      if (dataError) console.error('Error deleting user data:', dataError)

      const { error: authError } = await supabase.rpc('delete_own_account')
      if (authError) throw authError

      analytics.track(SETTINGS_EVENTS.ACCOUNT_DELETED)
      showToast('Account deleted successfully', 'success')

      await clearAllAppData()
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error deleting account:', error)
      analytics.error(error, getErrorProperties(error, { context: 'account_deletion' }))
      showToast('Failed to delete account. Please contact support.', 'error', 10000)
    } finally {
      setDeletingAccount(false)
      setShowDeleteModal(false)
    }
  }

  const confirmResetFinances = async () => {
    setResetting(true)
    try {
      // Reset localStorage formData but keep termDates and university
      const saved = localStorage.getItem('budgeup_onboarding_state')
      const parsed = saved ? JSON.parse(saved) : {}
      const oldData = parsed.formData || {}
      const resetData = {
        ...INITIAL_FORM_DATA,
        termDates: oldData.termDates || INITIAL_FORM_DATA.termDates,
        university: oldData.university || INITIAL_FORM_DATA.university,
      }
      parsed.formData = resetData
      localStorage.setItem('budgeup_onboarding_state', JSON.stringify(parsed))

      // Clear balance-related localStorage
      localStorage.removeItem('budgeup_balance_last_date')

      // Reset graph start date to today
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      setGraphStart(todayStr)
      setGraphStartState(todayStr)
      graphStartRef.current = todayStr
      localStorage.setItem('budgeup_graph_start_mode', 'joined')
      setGraphStartMode('joined')

      // Reset on Supabase if user is logged in
      if (userIdRef.current) {
        await saveUserFinances(userIdRef.current, {
          ...resetData,
          onboardingCompleted: true,
        })
        // Save new graph start date
        await supabase
          .from('user_profiles')
          .update({ graph_start: todayStr, updated_at: new Date().toISOString() })
          .eq('user_id', userIdRef.current)
        await saveCashflowForecast(userIdRef.current, [])
        // Delete all balance history records
        await supabase
          .from('balance_history')
          .delete()
          .eq('user_id', userIdRef.current)
      }
      showToast('All data has been reset', 'success')
    } catch (err) {
      console.error('Failed to reset finances:', err)
      showToast('Failed to reset. Please try again.', 'error', 5000)
    } finally {
      setResetting(false)
      setShowResetModal(false)
    }
  }

  const handleNewsletterToggle = async () => {
    if (newsletterLoading || !userIdRef.current) return
    const newVal = !newsletterOn
    setNewsletterOn(newVal)
    localStorage.setItem('budgeup_newsletter', String(newVal))
    setNewsletterLoading(true)
    try {
      // Check if a newsletter consent row already exists for this user
      const { data: existing } = await supabase.from('user_consents')
        .select('id')
        .eq('user_id', userIdRef.current)
        .eq('scope', 'newsletter')
        .limit(1)
        .maybeSingle()

      if (newVal) {
        if (existing) {
          // Unrevoke: clear revoked_at and update granted_at
          await supabase.from('user_consents')
            .update({ revoked_at: null, granted_at: new Date().toISOString() })
            .eq('id', existing.id)
        } else {
          await supabase.from('user_consents').insert({
            user_id: userIdRef.current,
            provider: 'budgeup',
            scope: 'newsletter',
            policy_version: 'v1',
            granted_at: new Date().toISOString(),
          })
        }
      } else {
        if (existing) {
          await supabase.from('user_consents')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', existing.id)
        }
      }
      showToast(newVal ? 'Subscribed to newsletter' : 'Unsubscribed from newsletter')
    } catch (err) {
      // Revert on failure
      setNewsletterOn(!newVal)
      localStorage.setItem('budgeup_newsletter', String(!newVal))
      showToast('Failed to update newsletter preference', 'error')
    } finally {
      setNewsletterLoading(false)
    }
  }

  const handleCookiePreferences = () => {
    if (window._iub && window._iub.cs && window._iub.cs.api) {
      window._iub.cs.api.openPreferences()
    }
  }

  const handleInviteFriends = async () => {
    // Track invite intent
    analytics.track(SETTINGS_EVENTS.INVITE_FRIENDS_CLICKED)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      // Create invite link with referral code (user ID)
      const referralCode = user?.id ? user.id.substring(0, 8) : ''
      const inviteUrl = referralCode
        ? `${window.location.origin}/signup?ref=${referralCode}`
        : `${window.location.origin}/signup`

      const shareData = {
        title: 'Join Budge Up 🎉',
        text: `This app makes it way easier to manage student money ✨\n\nThought you'd find it useful — here's my invite link!`,
        url: inviteUrl
      }

      // Try native share API first (canShare may not exist on all iOS versions)
      if (navigator.share) {
        await navigator.share(shareData)
        analytics.track(SETTINGS_EVENTS.INVITE_SHARED, { method: 'native_share' })
      } else {
        // Fallback: copy to clipboard
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(inviteUrl)
        } else {
          // Fallback for non-secure contexts / older browsers
          const textarea = document.createElement('textarea')
          textarea.value = inviteUrl
          textarea.style.position = 'fixed'
          textarea.style.opacity = '0'
          document.body.appendChild(textarea)
          textarea.select()
          document.execCommand('copy')
          document.body.removeChild(textarea)
        }
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 2500)
        analytics.track(SETTINGS_EVENTS.INVITE_SHARED, { method: 'clipboard' })
      }
    } catch (error) {
      // User cancelled share or clipboard failed
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error)
        showToast('Failed to share invite link', 'error')
      }
    }
  }

  const policyLinks = [
    { label: 'Privacy Policy', url: POLICY_URLS.privacy },
    { label: 'Terms of Service', url: POLICY_URLS.terms },
    { label: 'Cookie Policy', url: POLICY_URLS.cookies }
  ]


  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#fff'
    }}>
      {contextHolder}

      {/* Invite link copied toast */}
      <div style={{
        position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
        background: '#1a1a1a', color: '#fff', borderRadius: 20,
        padding: '9px 18px', fontSize: 13, fontWeight: 600,
        fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap',
        zIndex: 9999, pointerEvents: 'none',
        opacity: linkCopied ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}>
        Invite link copied!
      </div>

      {/* General toast */}
      <div style={{
        position: 'fixed', bottom: 90, left: '50%', transform: 'translateX(-50%)',
        background: toast?.type === 'error' ? '#c0392b' : '#1a1a1a',
        color: '#fff', borderRadius: 20,
        padding: '9px 18px', fontSize: 13, fontWeight: 600,
        fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap',
        zIndex: 9999, pointerEvents: 'none',
        opacity: toast ? 1 : 0,
        transition: 'opacity 0.25s ease',
      }}>
        {toast?.text}
      </div>

      <ConfirmModal
        open={showLogoutModal}
        title="Log out?"
        description="Are you sure you want to log out of your account?"
        confirmText="Log out"
        loading={loggingOut}
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutModal(false)}
      />

      <ConfirmModal
        open={showDeleteModal}
        title="Delete account?"
        description="This will permanently delete all your data. This action cannot be undone."
        confirmText="Delete my account"
        danger
        loading={deletingAccount}
        onConfirm={confirmDeleteAccount}
        onCancel={() => setShowDeleteModal(false)}
      />

      <ConfirmModal
        open={showResetModal}
        title="Reset all data?"
        description="This will clear all your income, expenses, balance, balance history, and weekly spending. Term dates and university will be kept."
        confirmText="Reset everything"
        danger
        loading={resetting}
        onConfirm={confirmResetFinances}
        onCancel={() => setShowResetModal(false)}
      />

      {/* CONTENT WRAPPER */}
      <div ref={settingsScrollRef} onScroll={() => {
        if (settingsScrollRef.current) sessionStorage.setItem('budgeup_scroll_settings', String(settingsScrollRef.current.scrollTop))
      }} style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: '40px 20px 0',
        paddingBottom: 'calc(250px + env(safe-area-inset-bottom))'
      }}>

        {/* INVITE FRIENDS */}
        <div style={{ marginBottom: 40 }}>

          <Button
            type="default"
            size="large"
            block
            onClick={handleInviteFriends}
            style={{
              borderRadius: 999,
              height: 52,
              background: 'linear-gradient(135deg,#147B75,#1E9C94)',
              border: 'none',
              color: '#fff',
              fontSize: 16,
              fontWeight: 600,
              fontFamily: 'Nunito, sans-serif',
              letterSpacing: 0.2,
              boxShadow: '0 8px 18px rgba(20,123,117,0.28)',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8
            }}
          >
            Invite Your Friends 🚀
          </Button>
        </div>

        {/* PREFERENCES */}
        <div style={{ marginBottom: 32 }}>
          <Title level={4} style={{ marginBottom: 16, fontSize: 16 }}>
            Preferences
          </Title>

          <div style={{
            background: '#fafafa',
            borderRadius: 12,
            border: '1px solid #f0f0f0',
          }}>
            {/* University */}
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid #f0f0f0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Nunito, sans-serif', flexShrink: 0 }}>University</Text>
                <SettingsSelect
                  value={university}
                  onChange={(e) => {
                    const val = e.target.value
                    setUniversity(val)
                    try {
                      const raw = localStorage.getItem('budgeup_onboarding_state')
                      const parsed = raw ? JSON.parse(raw) : {}
                      if (parsed.formData) {
                        parsed.formData.university = val
                        localStorage.setItem('budgeup_onboarding_state', JSON.stringify(parsed))
                      }
                    } catch { }
                    if (universitySaveTimerRef.current) clearTimeout(universitySaveTimerRef.current)
                    universitySaveTimerRef.current = setTimeout(async () => {
                      if (!userIdRef.current) return
                      try {
                        const raw = localStorage.getItem('budgeup_onboarding_state')
                        const parsed = raw ? JSON.parse(raw) : {}
                        await saveUserFinances(userIdRef.current, { ...parsed.formData, onboardingCompleted: true })
                      } catch (err) {
                        console.error('Failed to save university:', err)
                      }
                    }, 1500)
                    if (hasCustomTermDates(val)) {
                      const custom = getTermDatesForUniversity(val)
                      // Only prompt if current term dates differ from the university's defaults
                      const currentTerms = termDates?.terms || []
                      const customTerms = custom.terms || []
                      const alreadySet = currentTerms.length === customTerms.length &&
                        customTerms.every((ct, i) => currentTerms[i]?.start === ct.start && currentTerms[i]?.end === ct.end)
                      if (!alreadySet) {
                        setTermDatesPrompt({ university: val, termDates: custom })
                      }
                    }
                  }}
                  style={{ width: 180 }}
                >
                  {UK_UNIVERSITIES.map(uni => (
                    <option key={uni} value={uni}>{uni}</option>
                  ))}
                </SettingsSelect>
              </div>
            </div>

            {/* Currency */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px',
              borderBottom: '1px solid #f0f0f0',
            }}>
              <Text style={{ fontSize: 15, fontFamily: 'Nunito, sans-serif' }}>Currency</Text>
              <SettingsSelect
                value={currency}
                onChange={(e) => {
                  const code = e.target.value
                  setCurrencyState(code)
                  setCurrency(code)
                  if (userIdRef.current) {
                    supabase.from('user_profiles').update({ currency: code, updated_at: new Date().toISOString() }).eq('user_id', userIdRef.current).then()
                  }
                }}
                style={{ width: 180 }}
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </SettingsSelect>
            </div>

            {/* Overdraft limit */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: '1px solid #f0f0f0',
            }}>
              <Text style={{ fontSize: 15, fontFamily: 'Nunito, sans-serif' }}>Overdraft limit</Text>
              <div style={{
                display: 'inline-flex', alignItems: 'center',
                border: '1px solid #e8e8e8', borderRadius: 10,
                padding: '0 14px', height: 40, gap: 6, width: 180,
                background: '#fff',
              }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#5e5e5e', fontFamily: 'Nunito, sans-serif' }}>
                  {getCurrencySymbol(currency)}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={(() => {
                    if (!overdraft) return ''
                    const [whole, ...rest] = overdraft.split('.')
                    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                    return rest.length ? `${formatted}.${rest.join('.')}` : formatted
                  })()}
                  placeholder="0.00"
                  onChange={(e) => {
                    let val = e.target.value.replace(/[^0-9.]/g, '')
                    const parts = val.split('.')
                    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
                    setOverdraft(val)
                    try {
                      const raw = localStorage.getItem('budgeup_onboarding_state')
                      const parsed = raw ? JSON.parse(raw) : {}
                      if (!parsed.formData) parsed.formData = {}
                      parsed.formData.overdraft = val
                      localStorage.setItem('budgeup_onboarding_state', JSON.stringify(parsed))
                    } catch { }
                    if (overdraftSaveTimerRef.current) clearTimeout(overdraftSaveTimerRef.current)
                    overdraftSaveTimerRef.current = setTimeout(async () => {
                      if (!userIdRef.current) return
                      try {
                        await supabase
                          .from('user_profiles')
                          .update({ overdraft: Number(val.replace(/,/g, '')) || 0, updated_at: new Date().toISOString() })
                          .eq('user_id', userIdRef.current)
                      } catch (err) {
                        console.error('Failed to save overdraft:', err)
                      }
                    }, 1500)
                  }}
                  style={{
                    flex: 1, border: 'none', background: 'transparent',
                    fontSize: 16, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
                    color: '#000', outline: 'none', padding: 0,
                  }}
                />
              </div>
            </div>

            {/* Show overdraft toggle */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: '1px solid #f0f0f0',
            }}>
              <Text style={{ fontSize: 15, fontFamily: 'Nunito, sans-serif' }}>Show overdraft on graph</Text>
              <button
                onClick={() => {
                  const current = localStorage.getItem('budgeup_show_overdraft') !== 'false'
                  localStorage.setItem('budgeup_show_overdraft', String(!current))
                  setShowOverdraftToggle(!current)
                }}
                style={{
                  width: 48, height: 26, borderRadius: 13,
                  background: showOverdraftToggle ? '#147b75' : '#e0e0e0',
                  border: 'none', cursor: 'pointer', padding: 0,
                  position: 'relative', flexShrink: 0,
                  transition: 'background 0.2s ease',
                }}
              >
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: '#fff', position: 'absolute', top: 2,
                  left: showOverdraftToggle ? 24 : 2,
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }} />
              </button>
            </div>

            {/* Graph start date */}
            <div style={{
              padding: '14px 20px',
              borderBottom: (termDates || termDatesLoading) ? '1px solid #f0f0f0' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ fontSize: 15, fontFamily: 'Nunito, sans-serif', flexShrink: 0 }}>Graph starts from</Text>
                <SettingsSelect
                  value={graphStartMode}
                  onChange={(e) => {
                    const mode = e.target.value
                    setGraphStartMode(mode)
                    localStorage.setItem('budgeup_graph_start_mode', mode)
                    let newDate = null
                    if (mode === 'joined') {
                      newDate = graphStartRef.current || getGraphStart()
                    } else if (mode === 'first_term' && firstTermStart) {
                      newDate = firstTermStart
                    }
                    if (newDate) {
                      setGraphStartState(newDate)
                      graphStartRef.current = newDate
                      setGraphStart(newDate)
                      if (userIdRef.current) {
                        supabase.from('user_profiles').update({ graph_start: newDate, updated_at: new Date().toISOString() }).eq('user_id', userIdRef.current).then()
                      }
                    }
                  }}
                  style={{ width: 180 }}
                >
                  {firstTermStart && <option value="first_term">Start of first term</option>}
                  <option value="joined">When I joined</option>
                  <option value="custom">Custom date</option>
                </SettingsSelect>
              </div>
              {graphStartMode === 'custom' && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: '#147b75',
                      borderBottom: '1px dotted rgba(20,123,117,0.45)',
                      paddingBottom: 1, fontFamily: 'Nunito, sans-serif',
                      pointerEvents: 'none',
                    }}>
                      {new Date(graphStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                    <input
                      type="date"
                      value={graphStart}
                      onChange={(e) => {
                        if (e.target.value) {
                          const today = new Date().toISOString().split('T')[0]
                          let val = e.target.value
                          if (val > today) {
                            val = today
                            showToast('Start date can\u2019t be in the future', 'error')
                          }
                          setGraphStartState(val)
                          graphStartRef.current = val
                          setGraphStart(val)
                          if (userIdRef.current) {
                            supabase.from('user_profiles').update({ graph_start: val, updated_at: new Date().toISOString() }).eq('user_id', userIdRef.current).then()
                          }
                        }
                      }}
                      style={{
                        position: 'absolute', inset: 0, opacity: 0,
                        width: '100%', height: '100%',
                        cursor: 'pointer', fontSize: 16,
                      }}
                    />
                  </div>
                </div>
              )}
              {graphStartMode === 'joined' && (
                <span style={{ fontSize: 13, color: '#888', fontFamily: 'Nunito, sans-serif', display: 'block', marginTop: 8 }}>
                  {new Date(graphStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
              )}
              {graphStartMode === 'first_term' && (
                firstTermStart ? (
                  <span style={{ fontSize: 13, color: '#888', fontFamily: 'Nunito, sans-serif', display: 'block', marginTop: 8 }}>
                    {new Date(firstTermStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                ) : (
                  <LoadingSkeleton width={140} height={16} borderRadius={8} style={{ marginTop: 8 }} />
                )
              )}
            </div>

            {/* Term dates */}
            <div style={{ padding: '14px 16px' }}>
              <span style={{ fontSize: 15, fontFamily: 'Nunito, sans-serif', display: 'block', marginBottom: 10 }}>Term dates</span>
              {termDatesLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <LoadingSkeleton height={58} style={{ opacity: 0, animation: 'fadeIn 0.3s ease 0s forwards' }} />
                  <LoadingSkeleton height={58} style={{ opacity: 0, animation: 'fadeIn 0.3s ease 0.1s forwards' }} />
                  <LoadingSkeleton height={58} style={{ opacity: 0, animation: 'fadeIn 0.3s ease 0.2s forwards' }} />
                </div>
              ) : termDates ? (
                <div style={{ animation: 'fadeIn 0.35s ease' }}>
                  <TermDatesStep
                    compact
                    termData={termDates}
                    updateTermDates={(updated) => {
                      setTermDates(updated)
                      try {
                        const saved = localStorage.getItem('budgeup_onboarding_state')
                        const parsed = saved ? JSON.parse(saved) : {}
                        if (parsed.formData) {
                          parsed.formData.termDates = updated
                          localStorage.setItem('budgeup_onboarding_state', JSON.stringify(parsed))
                        }
                      } catch { }
                      pendingTermDatesRef.current = updated
                      if (termSaveTimerRef.current) clearTimeout(termSaveTimerRef.current)
                      termSaveTimerRef.current = setTimeout(async () => {
                        pendingTermDatesRef.current = null
                        if (!userIdRef.current) return
                        try {
                          await saveTermDates(userIdRef.current, updated)
                        } catch (err) {
                          console.error('Failed to save term dates:', err)
                        }
                      }, 1500)
                    }}
                    expandedTerm={expandedTerm}
                    onExpandedTermChange={setExpandedTerm}
                  />
                </div>
              ) : (
                <span style={{ fontSize: 13, color: '#9f9c9c', fontFamily: 'Nunito, sans-serif' }}>
                  No term dates found
                </span>
              )}
            </div>
          </div>
        </div>

        {/* LEGAL */}
        <Title level={4} style={{ marginBottom: 16, fontSize: 16 }}>
          Legal & Privacy
        </Title>

        <div style={{
          background: '#fafafa',
          borderRadius: 12,
          overflow: 'hidden',
          border: '1px solid #f0f0f0',
          marginBottom: 32
        }}>
          {policyLinks.map((link, index) => (
            <a
              key={link.label}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                padding: '16px 20px',
                color: '#262626',
                textDecoration: 'none',
                borderBottom: index < policyLinks.length - 1 ? '1px solid #f0f0f0' : 'none'
              }}
            >
              <Text>{link.label}</Text>
              <span style={{ float: 'right', color: '#8c8c8c' }}>→</span>
            </a>
          ))}

          <button
            onClick={handleCookiePreferences}
            style={{
              width: '100%',
              display: 'block',
              padding: '16px 20px',
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #f0f0f0',
              textAlign: 'left',
              cursor: 'pointer'
            }}
          >
            <Text>Cookie Preferences</Text>
            <span style={{ float: 'right', color: '#8c8c8c' }}>→</span>
          </button>

          {/* Newsletter toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 20px',
          }}>
            <Text style={{ fontSize: 15, fontFamily: 'Nunito, sans-serif' }}>Weekly newsletter</Text>
            <button
              onClick={handleNewsletterToggle}
              style={{
                width: 48, height: 26, borderRadius: 13,
                background: newsletterOn ? '#147b75' : '#e0e0e0',
                border: 'none', cursor: 'pointer', padding: 0,
                position: 'relative', flexShrink: 0,
                opacity: newsletterLoading ? 0.5 : 1,
                transition: 'background 0.2s ease, opacity 0.2s ease',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: '50%',
                background: '#fff', position: 'absolute', top: 2,
                left: newsletterOn ? 24 : 2,
                transition: 'left 0.2s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }} />
            </button>
          </div>
        </div>


        {/* ACCOUNT ACTIONS */}
        <div style={{ marginBottom: 40 }}>
          <Title level={4} style={{ marginBottom: 16, fontSize: 16 }}>
            Account
          </Title>

          {/* User Email */}
          {(
            <div style={{
              background: '#fafafa',
              borderRadius: 12,
              padding: '16px 20px',
              marginBottom: 16,
              border: '1px solid #f0f0f0'
            }}>

              <Text style={{ fontSize: 15 }}>
                {userEmail || 'Loading...'}
              </Text>
            </div>
          )}

          <Button
            block
            onClick={() => setShowResetModal(true)}
            style={{ borderRadius: 8, height: 48, marginBottom: 12 }}
          >
            Reset all data
          </Button>

          <Button
            block
            loading={loggingOut}
            onClick={handleLogout}
            style={{ borderRadius: 8, height: 48, marginBottom: 12 }}
          >
            Log out
          </Button>

          <Button
            danger
            block
            loading={deletingAccount}
            onClick={handleDeleteAccount}
            style={{ borderRadius: 8, height: 48 }}
          >
            Delete account
          </Button>
        </div>

        {/* APP INFO */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Budge Up v0.2.0
          </Text>
        </div>

      </div>

      {/* Term dates auto-set prompt */}
      {termDatesPrompt && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)',
          animation: 'fadeIn 0.2s ease',
        }}
          onClick={() => setTermDatesPrompt(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 16, padding: '24px 22px 20px',
              width: 'calc(100% - 48px)', maxWidth: 340,
              boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
              animation: 'fadeIn 0.2s ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 800, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', marginBottom: 8 }}>
              Update term dates?
            </div>
            <div style={{ fontSize: 13, fontFamily: 'Nunito, sans-serif', color: '#666', lineHeight: 1.5, marginBottom: 20 }}>
              We have term dates for {termDatesPrompt.university}. Would you like to auto-set them? This will replace your current term dates.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setTermDatesPrompt(null)}
                style={{
                  flex: 1, height: 40, border: '1px solid #e0e0e0', borderRadius: 10,
                  background: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                  color: '#666', cursor: 'pointer',
                }}
              >
                No thanks
              </button>
              <button
                onClick={() => {
                  const td = termDatesPrompt.termDates
                  setTermDates(td)
                  try {
                    const raw = localStorage.getItem('budgeup_onboarding_state')
                    const parsed = raw ? JSON.parse(raw) : {}
                    if (parsed.formData) {
                      parsed.formData.termDates = td
                      localStorage.setItem('budgeup_onboarding_state', JSON.stringify(parsed))
                    }
                  } catch { }
                  if (userIdRef.current) {
                    saveTermDates(userIdRef.current, td).catch(err =>
                      console.error('Failed to save term dates:', err)
                    )
                  }
                  setTermDatesPrompt(null)
                }}
                style={{
                  flex: 1, height: 40, border: 'none', borderRadius: 10,
                  background: '#147b75', fontSize: 13, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                  color: '#fff', cursor: 'pointer',
                }}
              >
                Yes, update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
