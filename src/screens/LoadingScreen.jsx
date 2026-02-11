import { useEffect } from 'react'
import { Typography } from 'antd'
import './LoadingScreen.css'

const { Text } = Typography

export default function LoadingScreen({ onComplete }) {
    useEffect(() => {
        // Simulate data fetching for 2-3 seconds
        const timer = setTimeout(() => {
            onComplete()
        }, 2500)

        return () => clearTimeout(timer)
    }, [onComplete])

    return (
        <div className="loading-screen">
            <div className="loading-content">
                <div className="sunflower-spinner">
                    <img src="/logo.svg" alt="Budge Up" />
                </div>
                <Text
                    style={{
                        fontSize: 20,
                        color: '#147B75',
                        fontWeight: 500,
                        marginTop: 24
                    }}
                >
                    Building your budget...
                </Text>
            </div>
        </div>
    )
}
