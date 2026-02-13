import { useNavigate, useLocation } from 'react-router-dom'
import {
    CoinsHand,
    MessageQuestionCircle,
    Settings01
} from "@untitledui/icons";
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
            key: 'transactions',
            path: '/transactions',
            label: 'Finances',
            icon: <CoinsHand className="size-5" />
        },
        {
            key: 'advice',
            path: '/advice',
            label: 'Money Advice',
            icon: <MessageQuestionCircle className="size-5" />
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
                        onClick={() => navigate(tab.path)}
                        className={`nav-tab ${isActive(tab.path) ? 'active' : ''}`}
                    >
                        <div className="nav-icon">
                            {tab.icon === 'logo' ? (
                                <img
                                    src={isActive(tab.path) ? "/logo.svg" : "/logo-gray.svg"}
                                    alt="Home"
                                    className="nav-logo"
                                />
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
