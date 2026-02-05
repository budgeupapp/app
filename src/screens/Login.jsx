import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Button, Form, Input, Typography } from 'antd'

const { Title, Text } = Typography

export default function Login() {
    const [loading, setLoading] = useState(false)

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
            alert(error.message)
        } else {
            alert('Check your email for your secure login link')
        }
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
            <div
                style={{
                    width: '100%',
                    maxWidth: 420
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
                        src="/logo.png"
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
                            placeholder="Uni email address"
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
                        block
                        style={{
                            borderRadius: 999,
                            height: 52,
                            fontSize: 16,
                            marginTop: 8
                        }}
                    >
                        Send magic link
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