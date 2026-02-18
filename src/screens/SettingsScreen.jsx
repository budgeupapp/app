import { useState, useEffect, useRef } from 'react'
import { Button, Typography, Modal, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { POLICY_URLS } from '../lib/policyVersions'
import { analytics, AUTH_EVENTS, SETTINGS_EVENTS, getErrorProperties } from '../lib/analytics/index.js'

const { Title, Text } = Typography

export default function SettingsScreen() {
  const navigate = useNavigate()
  const trackedRef = useRef(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
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

  const handleLogout = async () => {
    // Track logout button click (intent)
    analytics.track(AUTH_EVENTS.LOGOUT_CLICKED)

    Modal.confirm({
      title: 'Log out?',
      content: 'Are you sure you want to log out?',
      okText: 'Log out',
      cancelText: 'Cancel',
      okButtonProps: {
        style: {
          backgroundColor: '#147B75',
          borderColor: '#147B75'
        }
      },
      onOk: async () => {
        setLoggingOut(true)

        const { error } = await supabase.auth.signOut()

        setLoggingOut(false)

        if (error) {
          messageApi.error({
            content: 'Failed to log out. Please try again.',
            duration: 5
          })
        } else {
          // Track actual logout success
          analytics.track(AUTH_EVENTS.LOGOUT)

          localStorage.clear()
        }
      }
    })
  }

  const handleDeleteAccount = async () => {
    // Track delete account intent
    analytics.track(SETTINGS_EVENTS.DELETE_ACCOUNT_CLICKED)

    Modal.confirm({
      title: 'Delete account permanently?',
      content: (
        <div>
          <Text>This action cannot be undone. All your data will be permanently deleted.</Text>
          <br />
          <br />
          <Text strong>Are you absolutely sure?</Text>
        </div>
      ),
      okText: 'Delete my account',
      cancelText: 'Cancel',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingAccount(true)

        try {
          const { data: { user } } = await supabase.auth.getUser()

          if (!user) {
            throw new Error('No user found')
          }

          // Delete user data from tables (cascade should handle most)
          const { error: dataError } = await supabase
            .from('user_profiles')
            .delete()
            .eq('user_id', user.id)

          if (dataError) {
            console.error('Error deleting user data:', dataError)
          }

          // Delete the auth user account via database RPC
          const { error: authError } = await supabase.rpc('delete_own_account')

          if (authError) {
            throw authError
          }

          // Track successful account deletion before sign out
          analytics.track(SETTINGS_EVENTS.ACCOUNT_DELETED)

          messageApi.success({
            content: 'Account deleted successfully',
            duration: 3
          })

          // Clear local storage and sign out (which will also reset analytics in App.jsx)
          localStorage.clear()
          await supabase.auth.signOut()
        } catch (error) {
          console.error('Error deleting account:', error)
          analytics.error(error, getErrorProperties(error, { context: 'account_deletion' }))
          messageApi.error({
            content: 'Failed to delete account. Please contact support.',
            duration: 10
          })
        } finally {
          setDeletingAccount(false)
        }
      }
    })
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

      // Try native share API first
      if (navigator.share && navigator.canShare(shareData)) {
        await navigator.share(shareData)
        analytics.track(SETTINGS_EVENTS.INVITE_SHARED, { method: 'native_share' })
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(inviteUrl)
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

      {/* STICKY HEADER */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#fff',
      }}>
        <div style={{ padding: '16px 20px' }}>
          <Title level={2} style={{ margin: 0, fontSize: 20 }}>
            Settings
          </Title>
        </div>
      </div>

      {/* CONTENT WRAPPER */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: '0px 20px',
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
            Budge Up v1.0.0
          </Text>
        </div>

      </div>
    </div>
  )
}
