import { useNavigate, useLocation } from 'react-router-dom'
import { Home, MessageCircle, Settings } from 'react-feather'
import { analytics, MONEY_ADVICE_EVENTS } from '../lib/analytics/index.js'
import './BottomNav.css'

export default function BottomNav() {
    const navigate = useNavigate()
    const location = useLocation()

    const tabs = [
        { key: 'home', path: '/dashboard', label: 'Home', icon: <Home /> },
        { key: 'advice', path: '/support', label: 'Money Advice', icon: <MessageCircle /> },
        { key: 'settings', path: '/settings', label: 'Settings', icon: <Settings /> },
    ]

    const isActive = (path) => location.pathname === path

    return (
        <div className="bottom-nav-container">
            <div className="bottom-nav-pill">
                {tabs.map(tab => (
                    <div
                        key={tab.key}
                        data-href={tab.path}
                        onClick={() => {
                            if (isActive(tab.path)) {
                                if (tab.key === 'home') {
                                    window.dispatchEvent(new CustomEvent('home-tap-again'))
                                }
                                return
                            }
                            if (tab.path === '/support') {
                                analytics.track(MONEY_ADVICE_EVENTS.VIEWED)
                            }
                            navigate(tab.path)
                        }}
                        className={`nav-tab ${isActive(tab.path) ? 'active' : ''}`}
                    >
                        <div className="nav-icon">{tab.icon}</div>
                        <span className="nav-label">{tab.label}</span>
                        <div className="nav-dot" />
                    </div>
                ))}
            </div>
        </div>
    )
}
