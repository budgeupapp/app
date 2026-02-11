import { Typography, Button } from 'antd'
import MoneyAdviceSvg from '../assets/money-advice.svg'

const { Title, Paragraph } = Typography

export default function MoneyAdviceScreen() {
    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: '#fff'
        }}>
            {/* STICKY HEADER */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: '#fff',
                borderBottom: '1px solid #f0f0f0'
            }}>
                <h1 style={{
                    margin: 0,
                    padding: '15px 20px 16px',
                    fontSize: 20,
                    fontWeight: 600,
                    color: '#1a1a2e'
                }}>
                    Money Advice
                </h1>
            </div>

            {/* CONTENT */}
            <div style={{
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px 24px 100px'
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    maxWidth: 600,
                    width: '100%'
                }}>
                    {/* SVG Illustration */}
                    <img
                        src={MoneyAdviceSvg}
                        alt="Money Advice"
                        style={{
                            width: '100%',
                            maxWidth: 250,
                            height: 'auto',
                            marginBottom: 32
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
        </div>
    )
}
