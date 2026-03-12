import { useState } from 'react'

const EyeOpen = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9f9c9c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)

const EyeClosed = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9f9c9c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

export default function PasswordField({ label, value, onChange, placeholder, autoComplete, labelStyle, fieldStyle, inputStyle }) {
  const [show, setShow] = useState(false)

  return (
    <div>
      <span style={labelStyle}>{label}</span>
      <div style={fieldStyle}>
        <input
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          style={{ ...inputStyle, flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          style={{
            background: 'none', border: 'none', padding: 0,
            marginLeft: 8, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {show ? <EyeOpen /> : <EyeClosed />}
        </button>
      </div>
    </div>
  )
}
