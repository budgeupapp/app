import { useEffect, useState } from 'react'
import './LoadingScreen.css'

const STEPS = [
    { label: 'Crunching the numbers', delay: 0 },
    { label: 'Mapping your cash flow', delay: 800 },
    { label: 'Building your forecast', delay: 1600 },
]

export default function LoadingScreen({ onComplete }) {
    const [activeStep, setActiveStep] = useState(0)
    const [done, setDone] = useState(false)
    const [fadeOut, setFadeOut] = useState(false)

    useEffect(() => {
        const timers = []
        STEPS.forEach((step, i) => {
            if (i > 0) {
                timers.push(setTimeout(() => setActiveStep(i), step.delay))
            }
        })
        // Mark complete
        timers.push(setTimeout(() => setDone(true), 2400))
        // Fade out then navigate — hold "You're all set" a bit longer
        timers.push(setTimeout(() => setFadeOut(true), 3800))
        timers.push(setTimeout(() => onComplete(), 4200))
        return () => timers.forEach(clearTimeout)
    }, [onComplete])

    return (
        <div className="loading-screen" style={{ opacity: fadeOut ? 0 : 1, transition: 'opacity 0.4s ease' }}>
            <div className="loading-content">
                {/* Animated logo */}
                <div className="loading-logo-wrap">
                    <div className="loading-logo-ring" />
                    <img src="/logo.svg" alt="Budge Up" className="loading-logo" />
                </div>

                {/* Step labels */}
                <div className="loading-steps">
                    {STEPS.map((step, i) => {
                        const isActive = i <= activeStep
                        const isCurrent = i === activeStep && !done
                        return (
                            <div
                                key={i}
                                className={`loading-step ${isActive ? 'active' : ''} ${isCurrent ? 'current' : ''}`}
                                style={{ transitionDelay: `${i * 80}ms` }}
                            >
                                <div className="loading-step-dot">
                                    {isActive && !isCurrent ? (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#147b75" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    ) : (
                                        <div className={`loading-step-dot-inner ${isCurrent ? 'pulse' : ''}`} />
                                    )}
                                </div>
                                <span className="loading-step-label">{step.label}</span>
                            </div>
                        )
                    })}
                </div>

                {/* Done message */}
                <p className={`loading-done ${done ? 'show' : ''}`}>
                    You're all set!
                </p>
            </div>
        </div>
    )
}
