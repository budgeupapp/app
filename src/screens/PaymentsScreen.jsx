import { Typography } from 'antd'

const { Text } = Typography

export default function PaymentsScreen() {
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
                    Your Payments
                </h1>
            </div>

            {/* CONTENT */}
            <div style={{
                flex: 1,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0px 24px 100px'
            }}>
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    maxWidth: 600,
                    width: '100%'
                }}>
                    <div>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>🚧</div>
                        <Text type="secondary">
                            Coming soon: Connect your bank account to unlock personalised budgeting insights and manage all your payments in one place.
                        </Text>
                    </div>
                </div>
            </div>
        </div>
    )
}
