import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Button, Form, Input, Typography, message } from 'antd'

const { Title, Text } = Typography

export default function Login() {
    const [loading, setLoading] = useState(false)
    const [cooldownSeconds, setCooldownSeconds] = useState(0)
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
                shouldCreateUser: true,
                emailRedirectTo: window.location.origin
            }
        })

        setLoading(false)

        if (error) {
            messageApi.error({
                content: error.message,
                duration: 10,
                style: { fontSize: 15, cursor: 'pointer' },
                onClick: () => messageApi.destroy()
            })
        } else {
            setCooldownSeconds(60)
            messageApi.success({
                content: 'Your secure login link is on its way. Check your inbox (and spam/junk folder).', duration: 10,
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
        <div
            style={{
                minHeight: '100svh',
                background: '#ffffff',
                padding: '24px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }}
        >
            {contextHolder}
            <div
                style={{
                    width: '100%',
                    maxWidth: 420,
                    padding: '0 8px'
                }}>

                {/* ---------- BRAND ---------- */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                        marginBottom: 40
                    }}
                >
                    <img
                        src="/logo.svg"
                        alt="Budge Up"
                        style={{
                            height: 44
                        }}
                    />

                    <Title
                        level={2}
                        style={{
                            margin: 0,
                            fontWeight: 700,
                            color: 'var(--ant-color-primary)'
                        }}
                    >
                        budge up
                    </Title>
                </div>

                {/* ---------- FORM ---------- */}
                <Form
                    layout="vertical"
                    onFinish={handleLogin}
                    requiredMark={false}
                >
                    <Form.Item
                        label={<Text strong>Your email address</Text>}
                        name="email"
                        rules={[
                            { required: true, message: 'Please enter your email' },
                            { type: 'email', message: 'Enter a valid email address' }
                        ]}
                    >
                        <Input
                            size="large"
                            placeholder="University email address"
                            inputMode="email"
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
                        We’ll email you a secure, password-free login link.
                    </Text>
                </Form>
            </div>
        </div>
    )
}