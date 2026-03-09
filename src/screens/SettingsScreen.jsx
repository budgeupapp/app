import { useState, useEffect, useRef } from 'react'
import { Button, Typography, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { POLICY_URLS } from '../lib/policyVersions'
import { analytics, AUTH_EVENTS, SETTINGS_EVENTS, getErrorProperties } from '../lib/analytics/index.js'

const { Title, Text } = Typography

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
  const [userEmail, setUserEmail] = useState('')
  const [messageApi, contextHolder] = message.useMessage({ maxCount: 1 })

  // Track settings viewed and load user email
  useEffect(() => {
    if (!trackedRef.current) {
      trackedRef.current = true
      analytics.track(SETTINGS_EVENTS.VIEWED)
    }

    // Load user email
    const loadUserEmail = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.email) {
        setUserEmail(user.email)
      }
    }
    loadUserEmail()
  }, [])

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
      messageApi.error({ content: 'Failed to log out. Please try again.', duration: 5 })
    } else {
      analytics.track(AUTH_EVENTS.LOGOUT)
      localStorage.clear()
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
      messageApi.success({ content: 'Account deleted successfully', duration: 3 })

      localStorage.clear()
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error deleting account:', error)
      analytics.error(error, getErrorProperties(error, { context: 'account_deletion' }))
      messageApi.error({ content: 'Failed to delete account. Please contact support.', duration: 10 })
    } finally {
      setDeletingAccount(false)
      setShowDeleteModal(false)
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
        messageApi.success({
          content: 'Invite link copied to clipboard!',
          duration: 3
        })
        analytics.track(SETTINGS_EVENTS.INVITE_SHARED, { method: 'clipboard' })
      }
    } catch (error) {
      // User cancelled share or clipboard failed
      if (error.name !== 'AbortError') {
        console.error('Share failed:', error)
        messageApi.error({
          content: 'Failed to share invite link',
          duration: 3
        })
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

      {/* CONTENT WRAPPER */}
      <div style={{
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
              borderRadius: 99,
              height: 48,
              backgroundColor: '#147B75',
              borderColor: '#147B75',
              color: '#fff',
              fontSize: 17,
              fontWeight: 600,
            }}
          >
            Invite your friends 🚀
          </Button>
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
              textAlign: 'left',
              cursor: 'pointer'
            }}
          >
            <Text>Cookie Preferences</Text>
            <span style={{ float: 'right', color: '#8c8c8c' }}>→</span>
          </button>
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
    </div>
  )
}
