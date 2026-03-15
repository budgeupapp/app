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
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 'calc(env(safe-area-inset-top, 0px) + 40px) 0 20px',
        }}
      >
        <img src="/logo.svg" alt="Budge Up" style={{ height: 36 }} />
        <span
          style={{
            fontSize: 22,
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
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
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
