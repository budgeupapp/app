import { useState } from 'react'
import { Button, Checkbox, Typography } from 'antd'
import { CONSENTS } from '../core/consents'
import { saveUserConsents } from '../lib/api'

const { Title, Text } = Typography

const REQUIRED_IDS = ['data_processing']

export default function ConsentScreen({ user, onConsentGranted }) {
    const [consents, setConsents] = useState(
        Object.fromEntries(CONSENTS.map(c => [c.id, false]))
    )
    const [saving, setSaving] = useState(false)

    const allRequiredChecked = REQUIRED_IDS.every(id => consents[id])

    const updateConsent = (id, value) =>
        setConsents(prev => ({ ...prev, [id]: value }))

    const handleContinue = async () => {
        setSaving(true)
        try {
            await saveUserConsents(user.id, consents)
            onConsentGranted()
        } catch (err) {
            console.error(err)
            alert('Something went wrong saving your consents')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            style={{
                height: '100%',
                overflowY: 'auto',
                padding: '0 12px',
                display: 'flex',
                flexDirection: 'column'
            }}
        >
            <div style={{ maxWidth: 480, margin: '0 auto', width: '100%' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 15,
                        padding: '16px 0'
                    }}
                >
                    <img src="/logo.svg" alt="" style={{ height: 32 }} />
                    <Text style={{ color: '#147B75', fontWeight: 600, fontSize: 25 }}>
                        Budge Up
                    </Text>
                </div>

                <Title level={3} style={{ marginTop: 8 }}>
                    Before we get started
                </Title>
                <Text
                    type="secondary"
                    style={{ display: 'block', marginBottom: 24 }}
                >
                    We need your consent to process your financial data and
                    generate personalised insights.{' '}
                    <a
                        href="https://budgeup.co.uk/privacy-policy"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: '#147B75' }}
                    >
                        Privacy Policy
                    </a>
                </Text>

                <div
                    style={{
                        background: '#fafafa',
                        padding: 16,
                        borderRadius: 8,
                        marginBottom: 24
                    }}
                >
                    {CONSENTS.map(consent => (
                        <div key={consent.id} style={{ marginBottom: 5 }}>
                            <Title level={5}>{consent.title}</Title>

                            {consent.description.map((d, i) => (
                                <Text
                                    key={i}
                                    type="secondary"
                                    style={{ display: 'block' }}
                                >
                                    {d}
                                </Text>
                            ))}

                            <Checkbox
                                checked={consents[consent.id]}
                                onChange={e =>
                                    updateConsent(consent.id, e.target.checked)
                                }
                                style={{ marginTop: 15 }}
                            >
                                {consent.checkboxLabel}
                            </Checkbox>

                            {consent.footer && (
                                <Text
                                    type="secondary"
                                    style={{
                                        display: 'block',
                                        fontSize: 12,
                                        marginTop: 40
                                    }}
                                >
                                    {consent.footer}
                                </Text>
                            )}
                        </div>
                    ))}
                </div>

                <Button
                    type="primary"
                    size="large"
                    block
                    disabled={!allRequiredChecked}
                    loading={saving}
                    onClick={handleContinue}
                >
                    Continue
                </Button>
            </div>
        </div>
    )
}
