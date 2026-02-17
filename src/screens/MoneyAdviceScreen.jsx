import { Typography, Button } from 'antd'
import MoneyAdviceSvg from '../assets/money-advice.svg'
import { usePostHog } from '@posthog/react'
import { useState } from 'react'

const { Title, Paragraph } = Typography

export default function MoneyAdviceScreen() {
    const [loaded, setLoaded] = useState(false);
    const posthog = usePostHog()

    return (
        <div>
            <div style={{ padding: '16px 20px' }}>
                <Title level={2} style={{ margin: 0, fontSize: 20 }}>
                    Financial Support
                </Title>
            </div>


            {/* CONTENT */}
            <div style={{
                padding: '0px 20px',
                textAlign: 'center'
            }}>
                {/* SVG Illustration */}
                <img
                    src={MoneyAdviceSvg}
                    alt="Money Advice"
                    onLoad={() => setLoaded(true)}
                    style={{
                        width: '100%',
                        maxWidth: 250,
                        height: 180, // reserve space to prevent layout shift
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
                    onClick={() => posthog?.capture('money_advice_clicked')}
                    style={{
                        background: '#147B75',
                        borderColor: '#147B75',
                        height: 50,
                        borderRadius: 25,
                        fontSize: 16,
                        fontWeight: 600,
                        paddingLeft: 32,
                        paddingRight: 32,
                        boxShadow: '0 4px 12px rgba(20, 123, 117, 0.2)'
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
