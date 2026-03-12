import { Typography, Button } from 'antd'
import MoneyAdviceSvg from '../assets/money-advice.svg'
import { useState } from 'react'
import { analytics, MONEY_ADVICE_EVENTS } from '../lib/analytics/index.js'

const { Title, Paragraph } = Typography

const STORAGE_KEY = 'budgeup_onboarding_state'

function getUniversity() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
            const parsed = JSON.parse(saved)
            return parsed.formData?.university || ''
        }
    } catch { /* ignore */ }
    return ''
}

export default function MoneyAdviceScreen() {
    const [loaded, setLoaded] = useState(false)
    const university = getUniversity()
    const isBristol = university === 'University of Bristol'

    if (!isBristol) {
        return (
            <div style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{
                    padding: '0px 20px',
                    textAlign: 'center',
                    paddingBottom: 200,
                }}>
                    <img
                        src={MoneyAdviceSvg}
                        alt="Money Advice"
                        onLoad={() => setLoaded(true)}
                        style={{
                            width: '100%',
                            maxWidth: 250,
                            height: 180,
                            marginBottom: 32,
                            opacity: loaded ? 1 : 0,
                            transition: 'opacity 0.2s ease-in-out',
                            objectFit: 'contain'
                        }}
                    />
                    <Title level={3} style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: '#1a1a2e',
                        marginBottom: 10,
                        marginTop: 0
                    }}>
                        Coming Soon
                    </Title>
                    <Paragraph style={{
                        fontSize: 14,
                        color: '#666',
                        lineHeight: 1.6,
                        marginBottom: 0
                    }}>
                        We're working on bringing tailored financial support resources for {university || 'your university'}. Stay tuned!
                    </Paragraph>
                </div>
            </div>
        )
    }

    return (
        <div style={{
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            {/* CONTENT */}
            <div style={{
                padding: '0px 20px',
                textAlign: 'center',
                paddingBottom: 200,
            }}>
                {/* SVG Illustration */}
                <img
                    src={MoneyAdviceSvg}
                    alt="Money Advice"
                    onLoad={() => setLoaded(true)}
                    style={{
                        width: '100%',
                        maxWidth: 250,
                        height: 180,
                        marginBottom: 32,
                        opacity: loaded ? 1 : 0,
                        transition: 'opacity 0.2s ease-in-out',
                        objectFit: 'contain'
                    }}
                />

                {/* Heading */}
                <Title level={3} style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: '#1a1a2e',
                    marginBottom: 10,
                    marginTop: 0
                }}>
                    Need Financial Support?
                </Title>

                {/* Description */}
                <Paragraph style={{
                    fontSize: 14,
                    color: '#666',
                    lineHeight: 1.6,
                    marginBottom: 20
                }}>
                    If you're a student and need financial advice or support from the university,
                    the Money Advice Team is here to help you manage your finances and make informed decisions.
                </Paragraph>

                {/* CTA Button */}
                <Button
                    type="primary"
                    size="large"
                    href="https://www.bristol.ac.uk/students/support/finances/advice/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => analytics.track(MONEY_ADVICE_EVENTS.BUTTON_CLICKED)}
                    style={{
                        background: 'linear-gradient(135deg,#147B75,#1E9C94)',
                        border: 'none',
                        height: 52,
                        borderRadius: 999,
                        fontSize: 16,
                        fontWeight: 600,
                        padding: '0 34px',
                        fontFamily: 'Nunito, sans-serif',
                        letterSpacing: 0.2,
                        boxShadow: '0 8px 20px rgba(20,123,117,0.25)',
                        transition: 'all 0.2s ease',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8
                    }}
                >
                    Contact Money Advice Team
                </Button>

                {/* Additional info */}
                <Paragraph style={{
                    fontSize: 13,
                    color: '#999',
                    marginTop: 16,
                    marginBottom: 0
                }}>
                    Free, confidential advice for all University of Bristol students
                </Paragraph>
            </div>
        </div>
    )
}
