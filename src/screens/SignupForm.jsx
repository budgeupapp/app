import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Button, Form, Input, Checkbox, Typography, message } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import AuthContainer from '../components/AuthContainer'
import { POLICY_URLS } from '../lib/policyVersions'
import { usePostHog } from '@posthog/react'

const { Text } = Typography

export default function SignupForm() {
  const posthog = usePostHog()
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [lastEmail, setLastEmail] = useState('')
  const [consentChecked, setConsentChecked] = useState(false)
  const [messageApi, contextHolder] = message.useMessage({
    maxCount: 1
  })

  // Capture referral code from URL
  useEffect(() => {
    const refCode = searchParams.get('ref')
    if (refCode) {
      localStorage.setItem('referral_code', refCode)
      // Track that user arrived via referral
      posthog?.capture('referral_signup_started', {
        referral_code: refCode
      })
    }
  }, [searchParams, posthog])

  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => {
        setCooldownSeconds(cooldownSeconds - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldownSeconds])

  const handleSignup = async ({ email }) => {
    if (!consentChecked) {
      messageApi.error({
        content: 'Please agree to the Terms and Privacy Policy to continue',
        duration: 5,
        style: { fontSize: 15, cursor: 'pointer' },
        onClick: () => messageApi.destroy()
      })
      return
    }

    setLoading(true)

    // Track signup attempt
    posthog?.capture('signup_started', {
      email_domain: email.split('@')[1]
    })

    // Store signup intent in localStorage
    localStorage.setItem('signup_email', email)
    localStorage.setItem('signup_timestamp', Date.now().toString())

    // Get referral code from localStorage
    const referralCode = localStorage.getItem('referral_code')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: window.location.origin,
        data: {
          referred_by: referralCode || null
        }
      }
    })

    setLoading(false)

    if (error) {
      // Clean up localStorage on error
      localStorage.removeItem('signup_email')
      localStorage.removeItem('signup_timestamp')

      // Track signup failure
      posthog?.capture('signup_failed', {
        error_message: error.message,
        email_domain: email.split('@')[1]
      })

      // Provide clearer error messages for common issues
      let errorMessage = error.message

      if (error.message.toLowerCase().includes('signups not allowed')) {
        errorMessage = 'New signups are currently disabled. Please contact support or try again later.'
      } else if (error.message.toLowerCase().includes('email not confirmed')) {
        errorMessage = 'Please check your email and click the confirmation link before signing in.'
      }

      messageApi.error({
        content: errorMessage,
        duration: 10,
        style: { fontSize: 15, cursor: 'pointer' },
        onClick: () => messageApi.destroy()
      })
    } else {
      setLastEmail(email)
      setCooldownSeconds(60)
      messageApi.success({
        content: 'Your signup link is on its way. Check your inbox (and spam/junk folder).',
        duration: 10,
        style: { fontSize: 15, cursor: 'pointer' },
        onClick: () => messageApi.destroy()
      })
    }
  }

  const getButtonText = () => {
    if (loading) return 'Sending signup link...'
    if (cooldownSeconds > 0) return `Check inbox for signup link (${cooldownSeconds}s)`
    return 'Create account'
  }

  return (
    <AuthContainer>
      {contextHolder}
      <Form
        layout="vertical"
        onFinish={handleSignup}
        requiredMark={false}
        autoComplete="on"
        onValuesChange={(changedValues) => {
          if (changedValues.email && changedValues.email !== lastEmail) {
            setCooldownSeconds(0)
            messageApi.destroy()
          }
        }}
      >
        <Form.Item
          label={<Text strong>Your email address</Text>}
          name="email"
          validateTrigger="onSubmit"
          rules={[
            { required: true, message: 'Please enter your email' },
            { type: 'email', message: 'Enter a valid email address' }
          ]}
        >
          <Input
            size="large"
            placeholder="Personal email address"
            type="email"
            inputMode="email"
            autoComplete="username email"
            style={{
              borderRadius: 999,
              padding: '12px 20px'
            }}
          />
        </Form.Item>

        <Form.Item
          name="consent"
          valuePropName="checked"
          rules={[
            {
              validator: (_, value) =>
                value
                  ? Promise.resolve()
                  : Promise.reject(new Error('You must agree to continue'))
            }
          ]}
        >
          <Checkbox
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            style={{ alignItems: 'flex-start' }}
          >
            <Text style={{ fontSize: 14 }}>
              I agree to the{' '}
              <a
                href={POLICY_URLS.terms}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--ant-color-primary)' }}
              >
                Terms of Service
              </a>{' '}
              and{' '}
              <a
                href={POLICY_URLS.privacy}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--ant-color-primary)' }}
              >
                Privacy Policy
              </a>
            </Text>
          </Checkbox>
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          loading={loading}
          disabled={cooldownSeconds > 0 || !consentChecked}
          block
          style={{
            borderRadius: 999,
            height: 52,
            fontSize: 16,
            marginTop: 8
          }}
        >
          {getButtonText()}
        </Button>

        <Text
          type="secondary"
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: 16,
            fontSize: 13
          }}
        >
          We'll email you a secure, password-free login link.
        </Text>

        <Text
          type="secondary"
          style={{
            display: 'block',
            textAlign: 'center',
            marginTop: 24,
            fontSize: 14
          }}
        >
          Already have an account?{' '}
          <Link
            to="/login"
            style={{ color: 'var(--ant-color-primary)', fontWeight: 500 }}
          >
            Log in
          </Link>
        </Text>
      </Form>
    </AuthContainer>
  )
}
