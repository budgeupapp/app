import { useNavigate, useLocation } from 'react-router-dom'
import { Settings01 } from "@untitledui/icons";
import { analytics, MONEY_ADVICE_EVENTS } from '../lib/analytics/index.js'
import './BottomNav.css'

export default function BottomNav() {
    const navigate = useNavigate()
    const location = useLocation()

    const tabs = [
        {
            key: 'home',
            path: '/dashboard',
            label: 'Home',
            icon: 'logo' // Use logo image
        },
        {
            key: '/support',
            path: '/support',
            label: 'Money Advice',
            icon: 'helpCircle'
        },
        {
            key: 'settings',
            path: '/settings',
            label: 'Settings',
            icon: <Settings01 className="size-5" />
        }
    ]

    const isActive = (path) => location.pathname === path

    return (
        <div className="bottom-nav-container">
            <div className="bottom-nav-blur" />
            <div className="bottom-nav-pill">
                {tabs.map(tab => (
                    <div
                        key={tab.key}
                        data-href={tab.path}
                        onClick={() => {
                            if (isActive(tab.path)) return
                            if (tab.path === '/support') {
                                analytics.track(MONEY_ADVICE_EVENTS.VIEWED)
                            }
                            navigate(tab.path)
                        }}
                        className={`nav-tab ${isActive(tab.path) ? 'active' : ''}`}
                    >
                        <div className="nav-icon">
                            {tab.icon === 'logo' ? (
                                <img
                                    src={isActive(tab.path) ? "/logo.svg" : "/logo-gray.svg"}
                                    alt="Home"
                                    className="nav-logo"
                                />
                            ) : tab.icon === 'helpCircle' ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                                    <line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                            ) : (
                                tab.icon
                            )}
                        </div>
                        <span className="nav-label">
                            {tab.label}
                        </span>
                    </div>

                ))}
            </div>
        </div>
    )
}
