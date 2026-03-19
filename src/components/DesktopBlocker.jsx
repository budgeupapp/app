import { useEffect, useState } from 'react'

const SITE_URL = 'https://app.budgeup.co.uk'

function isMobileDevice() {
    // Check user agent for mobile indicators
    const ua = navigator.userAgent || ''
    const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    // Also check screen width as a fallback
    const narrowScreen = window.innerWidth <= 768
    return mobileUA || narrowScreen
}

export default function DesktopBlocker({ children }) {
    const [isMobile, setIsMobile] = useState(true) // default true to avoid flash

    useEffect(() => {
        const check = () => setIsMobile(isMobileDevice())
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    if (isMobile) return children

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <img src="/logo.svg" alt="Budge Up" style={styles.logo} />
                <h1 style={styles.title}>budge up</h1>
                <p style={styles.subtitle}>A revolution in student budgeting.</p>

                <div style={styles.divider} />

                <p style={styles.message}>
                    Budge Up is designed for mobile.<br />
                    Scan the QR code to open on your phone.
                </p>

                <div style={styles.qrWrapper}>
                    <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(SITE_URL)}&color=147b75&bgcolor=ffffff&margin=0`}
                        alt="QR code to open Budge Up on your phone"
                        style={styles.qr}
                    />
                </div>

                <p style={styles.url}>{SITE_URL.replace('https://', '')}</p>
            </div>
        </div>
    )
}

const styles = {
    container: {
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0faf9 0%, #e8f5f3 50%, #f5f0ff 100%)',
        fontFamily: "'Nunito', sans-serif",
    },
    card: {
        background: '#fff',
        borderRadius: 24,
        padding: '48px 56px',
        textAlign: 'center',
        maxWidth: 420,
        width: '90%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.08)',
    },
    logo: {
        width: 64,
        height: 64,
        marginBottom: 12,
    },
    title: {
        fontSize: 28,
        fontWeight: 700,
        color: '#147b75',
        margin: '0 0 4px',
    },
    subtitle: {
        fontSize: 15,
        color: '#888',
        margin: 0,
        fontWeight: 600,
    },
    divider: {
        width: 48,
        height: 3,
        borderRadius: 2,
        background: '#147b75',
        margin: '24px auto',
        opacity: 0.3,
    },
    message: {
        fontSize: 16,
        color: '#333',
        lineHeight: 1.6,
        margin: '0 0 28px',
    },
    qrWrapper: {
        display: 'inline-block',
        padding: 16,
        background: '#fff',
        borderRadius: 16,
        border: '2px solid #e8e8e8',
        marginBottom: 16,
    },
    qr: {
        width: 180,
        height: 180,
        display: 'block',
    },
    url: {
        fontSize: 14,
        color: '#147b75',
        fontWeight: 700,
        margin: 0,
    },
}
