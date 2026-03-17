import { useState } from 'react'

export default function IntroScreen({ onContinue }) {
  const [pressing, setPressing] = useState(false)

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      background: '#ffffff',
      animation: 'introFadeIn 0.5s ease',
    }}>
      <style>{`
        @keyframes introFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Safe area spacer */}
      <div style={{ height: 'env(safe-area-inset-top, 0px)', flexShrink: 0 }} />

      {/* Scrollable content */}
      <div style={{
        flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch',
        display: 'flex', flexDirection: 'column',
        padding: '0 28px',
        minHeight: 0,
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {/* Celebration icon */}
          <div style={{
            fontSize: 56, textAlign: 'center', marginBottom: 16,
          }}>
            🎉
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: 26, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
            color: '#1a1a1a', margin: '0 0 28px', textAlign: 'center',
            lineHeight: 1.3,
          }}>
            Congratulations, you're in!
          </h1>

          {/* Subtitle */}
          <p style={{
            fontSize: 16, fontWeight: 700, fontFamily: 'Nunito, sans-serif',
            color: '#1a1a1a', margin: '0 0 18px',
          }}>
            So, how does it work?
          </p>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <StepItem number={1}>
              Enter some details and create a personalised prediction of your combined bank balances over the rest of the term.
            </StepItem>
            <StepItem number={2}>
              View your financial future and make real-life decisions with real-life clarity.
            </StepItem>
            <StepItem number={3}>
              Next week, compare your actual bank balance with your predicted bank balance to see if you're on track!
            </StepItem>
          </div>

          {/* Closing text */}
          <p style={{
            fontSize: 14, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
            color: '#666', margin: '24px 0 0', lineHeight: 1.6,
          }}>
            From now on, you'll know exactly what your bank balance means for your future. We give you the clarity. You take back control.
          </p>
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{
        padding: '20px 28px calc(env(safe-area-inset-bottom, 0px) + 28px)',
        flexShrink: 0,
      }}>
        <button
          onClick={onContinue}
          onTouchStart={() => setPressing(true)}
          onTouchEnd={() => setPressing(false)}
          onMouseDown={() => setPressing(true)}
          onMouseUp={() => setPressing(false)}
          onMouseLeave={() => setPressing(false)}
          style={{
            width: '100%', height: 52, borderRadius: 50,
            border: 'none', background: '#147b75',
            color: '#fff', fontSize: 17, fontWeight: 700,
            fontFamily: 'Nunito, sans-serif',
            cursor: 'pointer',
            transform: pressing ? 'scale(0.97)' : 'scale(1)',
            transition: 'transform 0.15s ease',
          }}
        >
          Sound good? Let's go!
        </button>
      </div>
    </div>
  )
}

function StepItem({ number, children }) {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <div style={{
        width: 30, height: 30, borderRadius: '50%',
        background: '#e8f5f4', color: '#147b75',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
        flexShrink: 0, marginTop: 1,
      }}>
        {number}
      </div>
      <p style={{
        fontSize: 14, fontWeight: 500, fontFamily: 'Nunito, sans-serif',
        color: '#444', margin: 0, lineHeight: 1.55, flex: 1,
      }}>
        {children}
      </p>
    </div>
  )
}
