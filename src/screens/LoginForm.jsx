import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Button, Form, Input, Typography, message } from 'antd'
import { Link } from 'react-router-dom'
import AuthContainer from '../components/AuthContainer'

const { Text } = Typography

export default function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [lastEmail, setLastEmail] = useState('')
  const [messageApi, contextHolder] = message.useMessage({
    maxCount: 1
  })

  useEffect(() => {
    if (cooldownSeconds > 0) {
      const timer = setTimeout(() => {
        setCooldownSeconds(cooldownSeconds - 1)
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [cooldownSeconds])

  const handleLogin = async ({ email }) => {
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.origin
      }
    })

    setLoading(false)

    if (error) {
      // Provide clearer error messages for common issues
      let errorMessage = error.message

      if (error.message.toLowerCase().includes('signups not allowed')) {
        errorMessage = 'No account found with this email. Please sign up first.'
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
        content: 'Your secure login link is on its way. Check your inbox (and spam/junk folder).',
        duration: 10,
        style: { fontSize: 15, cursor: 'pointer' },
        onClick: () => messageApi.destroy()
      })
    }
  }

  const getButtonText = () => {
    if (loading) return 'Sending magic link...'
    if (cooldownSeconds > 0) return `Check inbox for login link (${cooldownSeconds}s)`
    return 'Send magic link'
  }

  return (
    <AuthContainer>
      {contextHolder}
      <Form
        layout="vertical"
        onFinish={handleLogin}
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
            placeholder="University email address"
            type="email"
            inputMode="email"
            autoComplete="username email"
            style={{
              borderRadius: 999,
              padding: '12px 20px'
            }}
          />
        </Form.Item>

        <Button
          type="primary"
          htmlType="submit"
          size="large"
          loading={loading}
          disabled={cooldownSeconds > 0}
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
          Don't have an account?{' '}
          <Link
            to="/signup"
            style={{ color: 'var(--ant-color-primary)', fontWeight: 500 }}
          >
            Sign up
          </Link>
        </Text>
      </Form>
    </AuthContainer>
  )
}
