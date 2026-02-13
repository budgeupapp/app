import { useState } from 'react'
import { Button, Typography, Modal, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { POLICY_URLS } from '../lib/policyVersions'

const { Title, Text } = Typography

export default function SettingsScreen() {
  const navigate = useNavigate()
  const [loggingOut, setLoggingOut] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [messageApi, contextHolder] = message.useMessage({ maxCount: 1 })

  const handleLogout = async () => {
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
        }
        // App.jsx will handle redirect after signOut
      }
    })
  }

  const handleDeleteAccount = async () => {
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
            .from('user_finances')
            .delete()
            .eq('user_id', user.id)

          if (dataError) {
            console.error('Error deleting user data:', dataError)
          }

          // Delete the auth user account
          const { error: authError } = await supabase.auth.admin.deleteUser(user.id)

          if (authError) {
            throw authError
          }

          messageApi.success({
            content: 'Account deleted successfully',
            duration: 3
          })

          // Sign out
          await supabase.auth.signOut()
        } catch (error) {
          console.error('Error deleting account:', error)
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

  const policyLinks = [
    { label: 'Privacy Policy', url: POLICY_URLS.privacy },
    { label: 'Terms of Service', url: POLICY_URLS.terms },
    { label: 'Cookie Policy', url: POLICY_URLS.cookies }
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#ffffff',
        padding: '24px 16px',
        paddingBottom: 'calc(100px + env(safe-area-inset-bottom))'
      }}
    >
      {contextHolder}

      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        {/* Header */}
        <Title level={2} style={{ marginBottom: 32 }}>
          Settings
        </Title>

        {/* Legal & Privacy Section */}
        <div style={{ marginBottom: 40 }}>
          <Title level={4} style={{ marginBottom: 16, fontSize: 16 }}>
            Legal & Privacy
          </Title>

          <div style={{
            background: '#fafafa',
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid #f0f0f0'
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
                  borderBottom: index < policyLinks.length - 1 ? '1px solid #f0f0f0' : 'none',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
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
                cursor: 'pointer',
                transition: 'background 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <Text>Cookie Preferences</Text>
              <span style={{ float: 'right', color: '#8c8c8c' }}>→</span>
            </button>
          </div>
        </div>

        {/* Account Actions */}
        <div style={{ marginBottom: 40 }}>
          <Title level={4} style={{ marginBottom: 16, fontSize: 16 }}>
            Account
          </Title>

          <Button
            type="default"
            size="large"
            block
            loading={loggingOut}
            onClick={handleLogout}
            style={{
              borderRadius: 8,
              height: 48,
              marginBottom: 12
            }}
          >
            Log out
          </Button>

          <Button
            danger
            type="default"
            size="large"
            block
            loading={deletingAccount}
            onClick={handleDeleteAccount}
            style={{
              borderRadius: 8,
              height: 48
            }}
          >
            Delete account
          </Button>
        </div>

        {/* App Info */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Budge Up v1.0.0
          </Text>
        </div>
      </div>
    </div>
  )
}
