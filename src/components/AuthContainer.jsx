import { useLayoutEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

function setThemeColor(color) {
  const existing = document.querySelector('meta[name="theme-color"]')
  if (existing) existing.remove()
  const meta = document.createElement('meta')
  meta.name = 'theme-color'
  meta.content = color
  document.head.appendChild(meta)
}

export default function AuthContainer() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const isWelcome = pathname === '/signup' || pathname === '/'
  const isReset = pathname === '/reset-password'

  // Theme color is managed by individual screens (SignupForm, etc.)

  return (
    <div
      style={{
        height: '100%',
        background: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Back button for reset password */}
      {isReset && (
        <div style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          paddingLeft: 16,
          flexShrink: 0,
        }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '8px 4px', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 15L7 10L12 5" stroke="#147b75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Nunito, sans-serif', color: '#147b75' }}>
              Back
            </span>
          </button>
        </div>
      )}

      {/* Form content */}
      <div
        key={pathname}
        style={{
          flex: 1,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          display: 'flex',
          flexDirection: 'column',
          animation: 'authFadeIn 0.3s ease',
        }}
      >
        <Outlet />
      </div>
    </div>
  )
}
