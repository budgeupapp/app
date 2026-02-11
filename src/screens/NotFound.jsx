import { useNavigate } from 'react-router-dom'
import { Button } from 'antd'
import PageNotFoundSvg from '../assets/page-not-found.svg'

export default function NotFound() {
    const navigate = useNavigate()

    return (
        <div style={{
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fff',
            padding: '20px 24px',
            textAlign: 'center'
        }}>
            {/* SVG Illustration */}
            <img
                src={PageNotFoundSvg}
                alt="Page Not Found"
                style={{
                    width: '100%',
                    maxWidth: 300,
                    height: 'auto',
                    marginBottom: 32
                }}
            />

            {/* Error Code */}
            <h1 style={{
                fontSize: 72,
                fontWeight: 800,
                color: '#147B75',
                margin: '0 0 8px 0',
                lineHeight: 1
            }}>
                404
            </h1>

            {/* Heading */}
            <h2 style={{
                fontSize: 24,
                fontWeight: 700,
                color: '#1a1a2e',
                margin: '0 0 12px 0'
            }}>
                Page Not Found
            </h2>

            {/* Description */}
            <p style={{
                fontSize: 14,
                color: '#666',
                lineHeight: 1.6,
                marginBottom: 32,
                maxWidth: 400
            }}>
                Oops! It looks like this page got eaten by the dog.
                The page you're looking for doesn't exist or has been moved.
            </p>

            {/* CTA Button */}
            <Button
                type="primary"
                size="large"
                onClick={() => navigate('/dashboard')}
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
                Go to Dashboard
            </Button>
        </div>
    )
}
