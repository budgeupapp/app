import { useState } from 'react'

export default function FeedbackScreen() {
    const [loaded, setLoaded] = useState(false)

    return (
        <div style={{
            display: 'flex', flexDirection: 'column',
            height: 'calc(100% - 170px - env(safe-area-inset-bottom, 0px))',
            background: '#fff',
        }}>
            <div style={{
                padding: '50px 20px 12px',
                flexShrink: 0,
            }}>
                <h1 style={{
                    fontSize: 22, fontWeight: 800,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#000', margin: 0,
                }}>Feedback</h1>
                <p style={{
                    fontSize: 13, fontWeight: 500,
                    fontFamily: 'Nunito, sans-serif',
                    color: '#888', margin: '4px 0 0',
                }}>Help us improve Budge Up</p>
            </div>
            <div style={{
                flex: 1, overflow: 'hidden',
                position: 'relative',
            }}>
                {!loaded && (
                    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div style={{ width: '60%', height: 14, borderRadius: 7, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite' }} />
                        <div style={{ width: '100%', height: 40, borderRadius: 10, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.1s' }} />
                        <div style={{ width: '45%', height: 14, borderRadius: 7, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.2s' }} />
                        <div style={{ width: '100%', height: 80, borderRadius: 10, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.3s' }} />
                        <div style={{ width: '50%', height: 14, borderRadius: 7, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.4s' }} />
                        <div style={{ width: '100%', height: 40, borderRadius: 10, background: '#f0f0f0', animation: 'skeleton-pulse 1.2s ease-in-out infinite', animationDelay: '0.5s' }} />
                        <style>{`
                            @keyframes skeleton-pulse {
                                0%, 100% { opacity: 1; }
                                50% { opacity: 0.4; }
                            }
                        `}</style>
                    </div>
                )}
                <iframe
                    src="https://docs.google.com/forms/d/e/1FAIpQLSdOCeCs4tTbidXiCCQnJdb-34MgybgseESE1OX-Y-H5iiNfQg/viewform?embedded=true"
                    onLoad={() => setLoaded(true)}
                    style={{
                        width: '100%', height: '100%',
                        border: 'none',
                        opacity: loaded ? 1 : 0,
                        transition: 'opacity 0.3s ease',
                    }}
                    title="Feedback form"
                />
            </div>
        </div>
    )
}
