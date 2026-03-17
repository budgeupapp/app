import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { POLICY_URLS } from '../lib/policyVersions'
import { analytics, AUTH_EVENTS, SETTINGS_EVENTS, FEEDBACK_EVENTS, getErrorProperties } from '../lib/analytics/index.js'
import { CURRENCIES, getCurrency, setCurrency, getGraphStart, setGraphStart, getCurrencySymbol } from '../lib/settings'
import { fetchUserData, saveTermDates, saveUserFinances, saveCashflowForecast } from '../lib/api'
import { INITIAL_FORM_DATA, UK_UNIVERSITIES, getTermDatesForUniversity, hasCustomTermDates } from '../config/onboardingConfig'
import TermDatesStep from './TermDatesStep'
import { User, Share2, DollarSign, Calendar, BookOpen, ChevronRight, LogOut, Trash2, RefreshCw, FileText, Shield, Mail, Copy, Globe, AlertCircle, CreditCard, Sliders, ExternalLink } from 'react-feather'
import { PiCookie } from 'react-icons/pi'

const { Text } = Typography

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
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (open) {
      setVisible(true)
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimating(true)))
    } else if (visible) {
      setAnimating(false)
      const timer = setTimeout(() => setVisible(false), 250)
      return () => clearTimeout(timer)
    }
  }, [open])

  if (!visible) return null

  return (
    <>
      <div
        onClick={loading ? undefined : onCancel}
        style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          opacity: animating ? 1 : 0,
          transition: 'opacity 0.25s ease',
        }}
      />
      <div style={{
        position: 'fixed', left: '50%', top: '50%', zIndex: 1101,
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
          {loading ? 'Please wait\u2026' : confirmText}
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

/* ── Row component for settings items ── */
function SettingsRow({ icon, label, value, onClick, last, children, expanded }) {
  const contentRef = useRef(null)
  const [measuredHeight, setMeasuredHeight] = useState(0)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (expanded) {
      // Set a generous initial height immediately so content isn't clipped
      setMeasuredHeight(500)
      setSettled(false)
      // Then measure actual height after layout
      requestAnimationFrame(() => {
        if (contentRef.current) {
          setMeasuredHeight(contentRef.current.scrollHeight + 20)
        }
      })
      const timer = setTimeout(() => setSettled(true), 350)
      return () => clearTimeout(timer)
    } else {
      setSettled(false)
      setMeasuredHeight(0)
    }
  }, [expanded])

  // Re-measure if content changes while expanded
  useEffect(() => {
    if (!expanded || !contentRef.current) return
    const ro = new ResizeObserver(() => {
      if (contentRef.current) setMeasuredHeight(contentRef.current.scrollHeight + 10)
    })
    ro.observe(contentRef.current)
    return () => ro.disconnect()
  }, [expanded])

  return (
    <div>
      <button
        onClick={onClick}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14,
          padding: '15px 18px', background: 'transparent', border: 'none',
          borderBottom: last ? 'none' : '1px solid',
          borderBottomColor: expanded ? 'transparent' : '#f0f0f0',
          cursor: onClick ? 'pointer' : 'default', textAlign: 'left',
          transition: 'border-bottom-color 0.3s ease',
        }}
      >
        {icon && <span style={{ color: '#888', flexShrink: 0, display: 'flex' }}>{icon}</span>}
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>
          {label}
        </span>
        {value && (
          <span style={{ fontSize: 14, fontFamily: 'Nunito, sans-serif', color: '#888', marginRight: 4, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
            {value}
          </span>
        )}
        {onClick && <ChevronRight size={18} color="#ccc" style={{
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
        }} />}
      </button>
      <div style={{
        display: 'grid',
        gridTemplateRows: expanded ? '1fr' : '0fr',
        opacity: expanded ? 1 : 0,
        transition: 'grid-template-rows 0.3s ease, opacity 0.2s ease',
      }}>
        <div style={{ overflow: 'hidden' }}>
        <div ref={contentRef} style={{
          padding: '0 18px 16px',
        }}>
          {children}
        </div>
        </div>
      </div>
    </div>
  )
}

/* ── Toggle component ── */
function Toggle({ on, onChange, loading }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: 48, height: 26, borderRadius: 13,
        background: on ? '#147b75' : '#e0e0e0',
        border: 'none', cursor: 'pointer', padding: 0,
        position: 'relative', flexShrink: 0,
        opacity: loading ? 0.5 : 1,
        transition: 'background 0.2s ease, opacity 0.2s ease',
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        background: '#fff', position: 'absolute', top: 2,
        left: on ? 24 : 2,
        transition: 'left 0.2s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }} />
    </button>
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
  const [termDatesPrompt, setTermDatesPrompt] = useState(null)
  const [overdraft, setOverdraft] = useState(() => {
    try {
      const saved = localStorage.getItem('budgeup_onboarding_state')
      const parsed = saved ? JSON.parse(saved) : {}
      return parsed?.formData?.overdraft || ''
    } catch { return '' }
  })
  const overdraftSaveTimerRef = useRef(null)
  const [startingBalance, setStartingBalance] = useState(() => {
    try {
      const saved = localStorage.getItem('budgeup_onboarding_state')
      const parsed = saved ? JSON.parse(saved) : {}
      return parsed?.formData?.balance || ''
    } catch { return '' }
  })
  const startingBalanceSaveTimerRef = useRef(null)
  const userIdRef = useRef(null)
  const termSaveTimerRef = useRef(null)
  const pendingTermDatesRef = useRef(null)

  const firstTermStart = (() => {
    try {
      const saved = localStorage.getItem('budgeup_onboarding_state')
      const parsed = saved ? JSON.parse(saved) : {}
      const terms = parsed?.formData?.termDates?.terms
      if (!terms?.length) return null
      return [...terms].sort((a, b) => a.start.localeCompare(b.start))[0].start
    } catch { return null }
  })()
  const [newsletterOn, setNewsletterOn] = useState(() => localStorage.getItem('budgeup_newsletter') !== 'false')
  const [newsletterLoading, setNewsletterLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage({ maxCount: 1 })
  const [linkCopied, setLinkCopied] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const settingsScrollRef = useRef(null)
  const showToast = (text, type = 'success', duration = 3000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ text, type })
    toastTimerRef.current = setTimeout(() => setToast(null), duration)
  }

  // Expanded sections
  const [expanded, setExpanded] = useState(null) // 'currency' | 'overdraft' | 'graphStart' | 'university' | 'termDates' | 'startingBalance'
  const toggle = (key) => setExpanded(prev => prev === key ? null : key)

  // Restore scroll position
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

  // Scroll focused input into view
  useEffect(() => {
    const sc = settingsScrollRef.current
    if (!sc) return
    const onFocusIn = (e) => {
      const el = e.target
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
      if (el.dataset.scrollHandled) return
      const pos = sc.scrollTop
      sc.style.overflowY = 'hidden'
      sc.scrollTop = pos
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

  // Flush pending term dates save on unmount
  useEffect(() => {
    return () => {
      if (termSaveTimerRef.current) clearTimeout(termSaveTimerRef.current)
      if (pendingTermDatesRef.current && userIdRef.current) {
        saveTermDates(userIdRef.current, pendingTermDatesRef.current).catch(() => { })
      }
    }
  }, [])

  // Track settings viewed and load user data
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
          if (result.formData?.balance != null && result.formData.balance !== '') {
            setStartingBalance(result.formData.balance)
          }
        } catch (err) {
          console.error('Failed to load user data:', err)
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
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
    if (window.indexedDB?.databases) {
      try {
        const dbs = await window.indexedDB.databases()
        dbs.forEach((db) => { if (db.name) window.indexedDB.deleteDatabase(db.name) })
      } catch (_) { /* not supported in all browsers */ }
    }
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
    analytics.track(AUTH_EVENTS.LOGOUT)
    const { error } = await supabase.auth.signOut()
    setLoggingOut(false)
    if (error) {
      setShowLogoutModal(false)
      showToast('Failed to log out. Please try again.', 'error', 5000)
    } else {
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
      const tables = ['cashflow_forecast', 'balance_history', 'term_dates', 'user_consents', 'user_profiles']
      for (const table of tables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('user_id', user.id)
        if (error) console.error(`Error deleting from ${table}:`, error)
      }
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
      localStorage.removeItem('budgeup_balance_last_date')
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      setGraphStart(todayStr)
      setGraphStartState(todayStr)
      graphStartRef.current = todayStr
      localStorage.setItem('budgeup_graph_start_mode', 'joined')
      setGraphStartMode('joined')
      if (userIdRef.current) {
        await saveUserFinances(userIdRef.current, { ...resetData, onboardingCompleted: true })
        await supabase
          .from('user_profiles')
          .update({ graph_start: todayStr, updated_at: new Date().toISOString() })
          .eq('user_id', userIdRef.current)
        await saveCashflowForecast(userIdRef.current, [])
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
      const { data: existing } = await supabase.from('user_consents')
        .select('id')
        .eq('user_id', userIdRef.current)
        .eq('scope', 'newsletter')
        .limit(1)
        .maybeSingle()
      if (newVal) {
        if (existing) {
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

  const handleShare = async () => {
    analytics.track(SETTINGS_EVENTS.INVITE_FRIENDS_CLICKED)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const referralCode = user?.id ? user.id.substring(0, 8) : ''
      const inviteUrl = referralCode
        ? `${window.location.origin}/signup?ref=${referralCode}`
        : `${window.location.origin}/signup`
      const shareData = {
        title: 'Join Budge Up',
        text: 'This app makes it way easier to manage student money. Thought you\'d find it useful \u2014 here\'s my invite link!',
        url: inviteUrl
      }
      if (navigator.share) {
        await navigator.share(shareData)
        analytics.track(SETTINGS_EVENTS.INVITE_SHARED, { method: 'native_share' })
      } else {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(inviteUrl)
        } else {
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
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error)
        showToast('Failed to share invite link', 'error')
      }
    }
  }

  const handleCopyLink = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const referralCode = user?.id ? user.id.substring(0, 8) : ''
      const inviteUrl = referralCode
        ? `${window.location.origin}/signup?ref=${referralCode}`
        : `${window.location.origin}/signup`
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteUrl)
      } else {
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
    } catch (error) {
      showToast('Failed to copy link', 'error')
    }
  }

  const [qrUrl, setQrUrl] = useState(null)
  const [showQr, setShowQr] = useState(false)

  const handleShowQr = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const referralCode = user?.id ? user.id.substring(0, 8) : ''
      const inviteUrl = referralCode
        ? `${window.location.origin}/signup?ref=${referralCode}`
        : `${window.location.origin}/signup`
      // Use Google Charts QR API
      const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteUrl)}`
      setQrUrl(qr)
      setShowQr(true)
    } catch {
      showToast('Failed to generate QR code', 'error')
    }
  }

  const policyLinks = [
    { label: 'Privacy Policy', url: POLICY_URLS.privacy, icon: <Shield size={18} /> },
    { label: 'Terms of Service', url: POLICY_URLS.terms, icon: <FileText size={18} /> },
    { label: 'Cookie Policy', url: POLICY_URLS.cookies, icon: <PiCookie size={18} /> },
  ]

  const currencyLabel = CURRENCIES.find(c => c.code === currency)?.label || currency

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#fff',
    }}>
      {contextHolder}

      {/* Toasts */}
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

      {/* Modals */}
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

      {/* QR Code modal */}
      {showQr && (
        <div
          onClick={() => setShowQr(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, padding: '28px 24px',
              width: 'calc(100% - 48px)', maxWidth: 300,
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
              textAlign: 'center',
              animation: 'fadeIn 0.2s ease',
            }}
          >
            <h3 style={{
              margin: '0 0 4px', fontSize: 18, fontWeight: 700,
              fontFamily: 'Nunito, sans-serif', color: '#1a1a1a',
            }}>Invite a friend</h3>
            <p style={{
              margin: '0 0 20px', fontSize: 13, fontFamily: 'Nunito, sans-serif', color: '#888',
            }}>Scan this QR code to sign up</p>
            {qrUrl && (
              <img
                src={qrUrl}
                alt="QR Code"
                style={{ width: 180, height: 180, borderRadius: 12, margin: '0 auto 16px' }}
              />
            )}
            <button
              onClick={() => setShowQr(false)}
              style={{
                width: '100%', height: 44, borderRadius: 99, border: 'none',
                fontSize: 15, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                cursor: 'pointer', background: '#F3F3F3', color: '#1a1a1a',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* SCROLLABLE CONTENT */}
      <div ref={settingsScrollRef} onScroll={() => {
        if (settingsScrollRef.current) sessionStorage.setItem('budgeup_scroll_settings', String(settingsScrollRef.current.scrollTop))
      }} style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: '20px 16px 0',
        paddingBottom: 'calc(160px + env(safe-area-inset-bottom))',
      }}>

        {/* ACCOUNT HEADER */}
        <div style={{
          background: '#f0f4f4',
          borderRadius: 16,
          padding: '22px 20px',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: 'linear-gradient(135deg, #147B75, #1E9C94)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <User size={24} color="#fff" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 17, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {userEmail || 'Loading...'}
              </div>
              {userCreatedAt && (
                <div style={{ fontSize: 13, fontFamily: 'Nunito, sans-serif', color: '#999', marginTop: 2 }}>
                  Joined {new Date(userCreatedAt + 'T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
          </div>

          {/* Share actions */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleShare}
              style={{
                flex: 1, height: 42, borderRadius: 10,
                background: '#147B75', border: 'none',
                color: '#fff', fontSize: 14, fontWeight: 700,
                fontFamily: 'Nunito, sans-serif', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Share2 size={16} /> Invite friends
            </button>
            <button
              onClick={handleShowQr}
              style={{
                width: 42, height: 42, borderRadius: 10,
                background: '#fff', border: '1.5px solid #e0e0e0',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="8" height="8" rx="1" />
                <rect x="14" y="2" width="8" height="8" rx="1" />
                <rect x="2" y="14" width="8" height="8" rx="1" />
                <rect x="14" y="14" width="4" height="4" />
                <rect x="20" y="14" width="2" height="2" />
                <rect x="14" y="20" width="2" height="2" />
                <rect x="20" y="20" width="2" height="2" />
              </svg>
            </button>
          </div>
        </div>

        {/* FINANCIAL */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
            color: '#1a1a1a',
            padding: '0 6px', marginBottom: 8,
          }}>Financial</div>
          <div style={{ background: '#f0f4f4', borderRadius: 16 }}>
            <SettingsRow
              icon={<Globe size={18} />}
              label="Currency"
              value={currencyLabel}
              onClick={() => toggle('currency')}
              expanded={expanded === 'currency'}
            >
              <select
                value={currency}
                onChange={(e) => {
                  const code = e.target.value
                  analytics.track(SETTINGS_EVENTS.CURRENCY_CHANGED, { currency: code })
                  setCurrencyState(code)
                  setCurrency(code)
                  if (userIdRef.current) {
                    supabase.from('user_profiles').update({ currency: code, updated_at: new Date().toISOString() }).eq('user_id', userIdRef.current).then()
                  }
                  setExpanded(null)
                }}
                style={{
                  width: '100%', appearance: 'none', WebkitAppearance: 'none',
                  border: '1px solid #e8e8e8', borderRadius: 10, padding: '10px 14px',
                  fontSize: 15, fontFamily: 'Nunito, sans-serif', fontWeight: 600,
                  background: '#fff', color: '#1a1a1a', cursor: 'pointer',
                }}
              >
                {CURRENCIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </SettingsRow>

            <SettingsRow
              icon={<AlertCircle size={18} />}
              label="Overdraft limit"
              value={overdraft ? `${getCurrencySymbol(currency)}${Number(overdraft).toLocaleString()}` : 'Not set'}
              onClick={() => toggle('overdraft')}
              expanded={expanded === 'overdraft'}
            >
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1px solid #e8e8e8', borderRadius: 10,
                padding: '0 14px', height: 44, gap: 6,
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
            </SettingsRow>

            <SettingsRow
              icon={<DollarSign size={18} />}
              label="Starting balance"
              value={startingBalance ? `${getCurrencySymbol(currency)}${Number(startingBalance).toLocaleString()}` : 'Not set'}
              onClick={() => toggle('startingBalance')}
              expanded={expanded === 'startingBalance'}
            >
              <p style={{ fontSize: 12, color: '#999', fontFamily: 'Nunito, sans-serif', margin: '0 0 8px' }}>
                Your bank balance when you started using the app
              </p>
              <div style={{
                display: 'flex', alignItems: 'center',
                border: '1px solid #e8e8e8', borderRadius: 10,
                padding: '0 14px', height: 44, gap: 6,
                background: '#fff',
              }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: '#5e5e5e', fontFamily: 'Nunito, sans-serif' }}>
                  {getCurrencySymbol(currency)}
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={(() => {
                    if (!startingBalance) return ''
                    const [whole, ...rest] = String(startingBalance).split('.')
                    const formatted = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                    return rest.length ? `${formatted}.${rest.join('.')}` : formatted
                  })()}
                  placeholder="0.00"
                  onChange={(e) => {
                    let val = e.target.value.replace(/[^0-9.]/g, '')
                    const parts = val.split('.')
                    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('')
                    setStartingBalance(val)
                    try {
                      const raw = localStorage.getItem('budgeup_onboarding_state')
                      const parsed = raw ? JSON.parse(raw) : {}
                      if (!parsed.formData) parsed.formData = {}
                      parsed.formData.balance = val
                      localStorage.setItem('budgeup_onboarding_state', JSON.stringify(parsed))
                    } catch { }
                    if (startingBalanceSaveTimerRef.current) clearTimeout(startingBalanceSaveTimerRef.current)
                    startingBalanceSaveTimerRef.current = setTimeout(async () => {
                      if (!userIdRef.current) return
                      try {
                        await supabase
                          .from('user_profiles')
                          .update({ balance: Number(val.replace(/,/g, '')) || 0, updated_at: new Date().toISOString() })
                          .eq('user_id', userIdRef.current)
                      } catch (err) {
                        console.error('Failed to save starting balance:', err)
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
            </SettingsRow>

            <SettingsRow
              icon={<Calendar size={18} />}
              label="Graph starts from"
              value={
                graphStartMode === 'first_term' ? 'First term' :
                  graphStartMode === 'custom' ? new Date(graphStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) :
                    'When I joined'
              }
              onClick={() => toggle('graphStart')}
              expanded={expanded === 'graphStart'}
              last
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ...(firstTermStart ? [{ key: 'first_term', label: 'Start of first term', sub: new Date(firstTermStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) }] : []),
                  { key: 'joined', label: 'When I joined', sub: userCreatedAt ? new Date(userCreatedAt + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null },
                  { key: 'custom', label: 'Custom date', sub: null },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => {
                      setGraphStartMode(opt.key)
                      localStorage.setItem('budgeup_graph_start_mode', opt.key)
                      let newDate = null
                      if (opt.key === 'joined' && userCreatedAt) {
                        newDate = userCreatedAt
                      } else if (opt.key === 'first_term' && firstTermStart) {
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
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '10px 14px',
                      borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                      background: graphStartMode === opt.key ? '#f0faf9' : '#fafafa',
                      border: graphStartMode === opt.key ? '2px solid #147b75' : '1.5px solid #e8e8e8',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>
                        {opt.label}
                      </div>
                      {opt.sub && (
                        <div style={{ fontSize: 12, fontFamily: 'Nunito, sans-serif', color: '#999', marginTop: 1 }}>
                          {opt.sub}
                        </div>
                      )}
                    </div>
                    {graphStartMode === opt.key && (
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#147b75', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5L4.2 7.5L8 2.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                    )}
                  </button>
                ))}
                {graphStartMode === 'custom' && (
                  <div style={{ position: 'relative', marginTop: 4 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 10,
                      border: '1px solid #e8e8e8', background: '#fff',
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>
                        {new Date(graphStart + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                      <span style={{ fontSize: 12, color: '#999', fontFamily: 'Nunito, sans-serif' }}>Tap to change</span>
                    </div>
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
                )}
              </div>
            </SettingsRow>
          </div>
        </div>

        {/* UNIVERSITY & TERMS */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
            color: '#1a1a1a',
            padding: '0 6px', marginBottom: 8,
          }}>University & Terms</div>
          <div style={{ background: '#f0f4f4', borderRadius: 16 }}>
            <SettingsRow
              icon={<BookOpen size={18} />}
              label="University"
              value={university || 'Not set'}
              onClick={() => toggle('university')}
              expanded={expanded === 'university'}
            >
              <div style={{ position: 'relative' }}>
                <select
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
                      const currentTerms = termDates?.terms || []
                      const customTerms = custom.terms || []
                      const alreadySet = currentTerms.length === customTerms.length &&
                        customTerms.every((ct, i) => {
                          const curr = currentTerms[i]
                          if (!curr || curr.start !== ct.start || curr.end !== ct.end) return false
                          // Also check break names match
                          const currBreaks = curr.breaks || []
                          const ctBreaks = ct.breaks || []
                          if (currBreaks.length !== ctBreaks.length) return false
                          return ctBreaks.every((cb, j) => currBreaks[j]?.name === cb.name && currBreaks[j]?.start === cb.start && currBreaks[j]?.end === cb.end)
                        })
                      if (!alreadySet) {
                        setTermDatesPrompt({ university: val, termDates: custom })
                      }
                    }
                  }}
                  style={{
                    width: '100%', appearance: 'none', WebkitAppearance: 'none',
                    border: '1.5px solid #e0e0e0', borderRadius: 10, padding: '10px 38px 10px 14px',
                    fontSize: 15, fontFamily: 'Nunito, sans-serif', fontWeight: 600,
                    background: '#fff', color: '#1a1a1a', cursor: 'pointer',
                    boxSizing: 'border-box',
                  }}
                >
                  {UK_UNIVERSITIES.map(uni => (
                    <option key={uni} value={uni}>{uni}</option>
                  ))}
                </select>
                <ChevronRight size={16} color="#999" style={{
                  position: 'absolute', right: 12, top: '50%',
                  transform: 'translateY(-50%) rotate(90deg)',
                  pointerEvents: 'none',
                }} />
              </div>
            </SettingsRow>

            <SettingsRow
              icon={<Calendar size={18} />}
              label="Term dates"
              value={(() => {
                const terms = termDates?.terms
                if (!terms?.length) return null
                const sorted = [...terms].sort((a, b) => a.start.localeCompare(b.start))
                const fmtShort = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                return `${fmtShort(sorted[0].start)} – ${fmtShort(sorted[sorted.length - 1].end)}`
              })()}
              onClick={() => toggle('termDates')}
              expanded={expanded === 'termDates'}
              last
            >
              {termDatesLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <LoadingSkeleton height={58} style={{ opacity: 0, animation: 'fadeIn 0.3s ease 0s forwards' }} />
                  <LoadingSkeleton height={58} style={{ opacity: 0, animation: 'fadeIn 0.3s ease 0.1s forwards' }} />
                </div>
              ) : termDates ? (
                <div style={{ animation: 'fadeIn 0.35s ease' }}>
                  <TermDatesStep
                    compact
                    noAutoScroll
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
            </SettingsRow>
          </div>
        </div>

        {/* LEGAL & PRIVACY */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
            color: '#1a1a1a',
            padding: '0 6px', marginBottom: 8,
          }}>Legal & Privacy</div>
          <div style={{ background: '#f0f4f4', borderRadius: 16 }}>
            {policyLinks.map((link, i) => (
              <a
                key={link.label}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '15px 18px', textDecoration: 'none',
                  borderBottom: i < policyLinks.length - 1 ? '1px solid #f0f0f0' : 'none',
                }}
              >
                <span style={{ color: '#888', flexShrink: 0, display: 'flex' }}>{link.icon}</span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>
                  {link.label}
                </span>
                <ExternalLink size={15} color="#ccc" />
              </a>
            ))}

            <button
              onClick={handleCookiePreferences}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '15px 18px', background: 'transparent', border: 'none',
                borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ color: '#888', flexShrink: 0, display: 'flex' }}><Sliders size={18} /></span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>
                Cookie Preferences
              </span>
              <ChevronRight size={18} color="#ccc" />
            </button>

          </div>
        </div>

        {/* ACCOUNT ACTIONS */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
            color: '#1a1a1a',
            padding: '0 6px', marginBottom: 8,
          }}>Account</div>
          <div style={{ background: '#f0f4f4', borderRadius: 16 }}>
            <button
              onClick={() => setShowResetModal(true)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '15px 18px', background: 'transparent', border: 'none',
                borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ color: '#888', flexShrink: 0, display: 'flex' }}><RefreshCw size={18} /></span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>
                Reset all data
              </span>
              <ChevronRight size={18} color="#ccc" />
            </button>

            <button
              onClick={handleLogout}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '15px 18px', background: 'transparent', border: 'none',
                borderBottom: '1px solid #f0f0f0',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ color: '#888', flexShrink: 0, display: 'flex' }}><LogOut size={18} /></span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a' }}>
                Log out
              </span>
              <ChevronRight size={18} color="#ccc" />
            </button>

            <button
              onClick={handleDeleteAccount}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 14,
                padding: '15px 18px', background: 'transparent', border: 'none',
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{ color: '#E5484D', flexShrink: 0, display: 'flex' }}><Trash2 size={18} /></span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, fontFamily: 'Nunito, sans-serif', color: '#E5484D' }}>
                Delete account
              </span>
              <ChevronRight size={18} color="#ccc" />
            </button>
          </div>
        </div>

        {/* ABOUT */}
        <div style={{ marginTop: 24 }}>
          <div style={{ background: '#f5f7f7', borderRadius: 14, padding: '18px 16px' }}>
            <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#1a1a1a', margin: '0 0 8px' }}>About Budge Up</p>
            <p style={{ fontSize: 13, fontWeight: 500, fontFamily: 'Nunito, sans-serif', color: '#666', margin: 0, lineHeight: 1.6 }}>
              Budge Up is an early-stage startup founded by current students at the University of Bristol (and the University of Costa Rica!). We realised that traditional budgeting is designed for adults on monthly salaries, not the irregularity of student finances. So, we're building a budgeting app that actually works for students! We're hoping to keep the app free for students by having universities pay for it (hence your feedback is so useful!). If you want to stay in the loop on our progress, you can sign up to our newsletter for behind-the-scenes updates.
            </p>
          </div>
        </div>

        {/* APP INFO */}
        <div style={{ textAlign: 'center', marginTop: 24, marginBottom: 20 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Budge Up v0.2.0
          </Text>
        </div>

        {/* LEGAL FOOTER */}
        <div style={{ textAlign: 'center', marginBottom: 40, padding: '0 24px' }}>
          <p style={{ fontSize: 11, color: '#bbb', fontFamily: 'Nunito, sans-serif', fontWeight: 600, lineHeight: 1.6, margin: 0 }}>
            Budge Up is a trading name of Budge Up Ltd<br />
            Registered in England and Wales. Company No. 16927101<br />
            Registered Address: 61 Bridge Street, Kington, HR5 3DJ
          </p>
        </div>

      </div>

      {/* Term dates auto-set prompt */}
      {termDatesPrompt && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.35)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          animation: 'fadeIn 0.2s ease',
        }}
          onClick={() => setTermDatesPrompt(null)}
        >
          <div
            style={{
              background: '#fff', borderRadius: 20, padding: '28px 24px 20px',
              width: 'calc(100% - 48px)', maxWidth: 340,
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
              animation: 'fadeIn 0.2s ease',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{
              margin: '0 0 8px', fontSize: 19, fontWeight: 700,
              fontFamily: 'Nunito, sans-serif', textAlign: 'center', color: '#1a1a1a',
            }}>Update term dates?</h3>
            <p style={{
              margin: '0 0 24px', fontSize: 15, lineHeight: 1.5,
              fontFamily: 'Nunito, sans-serif', textAlign: 'center', color: '#666',
            }}>
              We have term dates for {termDatesPrompt.university}. Would you like to auto-set them? This will replace your current term dates.
            </p>
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
                width: '100%', height: 48, borderRadius: 99, border: 'none',
                fontSize: 16, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
                cursor: 'pointer', background: '#147B75', color: '#fff', marginBottom: 10,
              }}
            >
              Yes, update
            </button>
            <button
              onClick={() => setTermDatesPrompt(null)}
              style={{
                width: '100%', height: 48, borderRadius: 99, border: 'none',
                fontSize: 16, fontWeight: 600, fontFamily: 'Nunito, sans-serif',
                cursor: 'pointer', background: '#F3F3F3', color: '#1a1a1a',
              }}
            >
              No thanks
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
