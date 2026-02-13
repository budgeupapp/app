import { Typography } from 'antd'

const { Title } = Typography

export default function AuthContainer({ children }) {
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
          maxWidth: 420,
          padding: '0 8px'
        }}
      >
        {/* Brand Logo and Title */}
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
            src="/logo.svg"
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

        {/* Form Content */}
        {children}
      </div>
    </div>
  )
}
