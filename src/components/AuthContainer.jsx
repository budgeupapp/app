import { Outlet, useLocation } from 'react-router-dom'

export default function AuthContainer() {
  const { pathname } = useLocation()

  return (
    <div
      style={{
        height: '100%',
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        style={{
          flexShrink: 1,
          minHeight: 60,
          maxHeight: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          flex: '1 1 180px',
        }}
      >
        <img src="/logo.svg" alt="Budge Up" style={{ height: 40 }} />
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            fontFamily: 'Nunito, sans-serif',
            color: '#147b75',
          }}
        >
          budge up
        </span>
      </div>

      {/* Form — fades in on route change */}
      <div
        key={pathname}
        style={{
          flexShrink: 1,
          overflowY: 'auto',
          padding: '0 28px 40px',
          maxWidth: 420,
          width: '100%',
          margin: '0 auto',
          animation: 'authFadeIn 0.3s ease',
        }}
      >
        <Outlet />
      </div>
    </div>
  )
}
