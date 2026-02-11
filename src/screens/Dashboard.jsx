import { useState, useEffect, useCallback } from 'react'
import { Spin, Alert } from 'antd'
import { addDays, addMonths, addYears, format, parseISO } from 'date-fns'
import { LogOut01 } from '@untitledui/icons'
import ForecastChart from '../components/ForecastChart'
import NativeSegmented from '../components/NativeSegmented'
import { fetchUserData } from '../lib/api'
import { calculateForecast, analyzeForecast } from '../lib/forecastCalculator'
import { supabase } from '../lib/supabaseClient'

// Map weekly spend band to actual amount (midpoint of ranges)
const WEEKLY_SPEND_MAP = {
    1: 65,   // £50-£80
    2: 100,  // £80-£120
    3: 150,  // £120-£180
    4: 200   // £180+
}

const TIME_OPTIONS = [
    { label: 'Weekly', value: 'day' },
    { label: 'Monthly', value: 'month' },
    { label: 'Termly', value: 'term' },
    { label: 'Yearly', value: 'year' }
]

function calculateTotals(forecast) {
    let totalIncome = 0
    let totalExpense = 0

    forecast.forEach(day => {
        if (day.transactions) {
            day.transactions.forEach(t => {
                if (t.direction === 'in') {
                    totalIncome += t.amount
                } else {
                    totalExpense += t.amount
                }
            })
        }
    })

    return { totalIncome, totalExpense }
}

export default function Dashboard() {
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [timeView, setTimeView] = useState('month')
    const [forecastData, setForecastData] = useState([])
    const [insights, setInsights] = useState(null)
    const [userData, setUserData] = useState(null)
    const [isScrolled, setIsScrolled] = useState(false)
    const [visibleTotals, setVisibleTotals] = useState({ totalIncome: 0, totalExpense: 0 })

    useEffect(() => {
        loadUserData()
    }, [])

    useEffect(() => {
        if (userData) {
            generateForecast(timeView)
        }
    }, [timeView, userData])

    useEffect(() => {
        const handleScroll = () => {
            const scrollContainer = document.querySelector('[style*="overflow: auto"]')
            if (scrollContainer) {
                setIsScrolled(scrollContainer.scrollTop > 50)
            }
        }

        const scrollContainer = document.querySelector('[style*="overflow: auto"]')
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', handleScroll)
            return () => scrollContainer.removeEventListener('scroll', handleScroll)
        }
    }, [])

    const loadUserData = async () => {
        try {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()

            if (!user) {
                setError('Not authenticated')
                return
            }

            const data = await fetchUserData(user.id)
            setUserData(data)
        } catch (err) {
            console.error('Error loading user data:', err)
            setError('Failed to load your data')
        } finally {
            setLoading(false)
        }
    }

    const generateForecast = (view) => {
        if (!userData || !userData.profile) return

        const { profile, cashflows } = userData
        const today = new Date()
        let endDate

        // Always generate a full year of data so users can navigate forward
        endDate = addYears(today, 1)

        const weeklySpend = WEEKLY_SPEND_MAP[profile.weekly_spend_band] || 0

        const forecast = calculateForecast(
            profile.current_balance || 0,
            profile.savings || 0,
            cashflows,
            weeklySpend,
            today,
            endDate
        )

        const analysis = analyzeForecast(forecast)

        setForecastData(forecast)
        setInsights(analysis)
    }

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut()
            // The auth state change listener in App.jsx will handle navigation
        } catch (error) {
            console.error('Error logging out:', error)
        }
    }

    const handleVisibleDataChange = useCallback((visibleData) => {
        setVisibleTotals(calculateTotals(visibleData))
    }, [])

    // Render the layout structure even during loading
    const currentBalance = userData?.profile?.current_balance || 0
    const { totalIncome, totalExpense } = visibleTotals

    // Show error if present
    const showError = error || (!loading && !userData?.profile)

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            background: '#fff',
            paddingBottom: 100
        }}>
            {/* STICKY HEADER - Title + Segmented Control */}
            <div style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                background: '#fff',
            }}>
                {/* Page Title with Logout Button */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 20px 16px'
                }}>
                    <h1 style={{
                        margin: 0,
                        fontSize: 20,
                        fontWeight: 600,
                        color: '#1a1a2e',
                    }}>
                        Your Financial Forecast
                    </h1>

                    <button
                        onClick={handleLogout}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            padding: 8,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 8,
                            transition: 'background 0.2s ease',
                            color: '#666'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        aria-label="Logout"
                    >
                        <LogOut01 size={20} strokeWidth={2} />
                    </button>
                </div>

                {/* Time View Segmented Control */}
                <div style={{
                    padding: '0 20px'
                }}>
                    <NativeSegmented
                        value={timeView}
                        onChange={setTimeView}
                        options={TIME_OPTIONS}
                    />
                </div>
            </div>

            {/* SCROLLABLE CONTENT */}
            <div style={{
                flex: 1,
                overflow: 'auto',
                paddingTop: 20,
                minHeight: 'calc(100vh - 200px)',
            }}>
                {/* Chart Section with Status & Balance */}
                <div style={{
                    background: '#f8f8f8',
                    borderRadius: 16,
                    padding: 16,
                    margin: '0 20px 20px'
                }}>
                    {/* Status + Balance - White background */}
                    <div style={{
                        background: '#ffffff',
                        borderRadius: 12,
                        padding: 16,
                        marginBottom: 16
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: 12
                        }}>
                            {/* Balance - Left side */}
                            <div style={{ flex: 1 }}>
                                <p style={{
                                    margin: 0,
                                    fontSize: 13,
                                    color: '#aaa',
                                    fontWeight: 600
                                }}>
                                    Current Balance
                                </p>
                                <p style={{
                                    margin: '4px 0 0',
                                    fontSize: 28,
                                    fontWeight: 800,
                                    color: '#1a1a2e',
                                    letterSpacing: -0.5
                                }}>
                                    £{currentBalance.toFixed(2)}
                                </p>
                            </div>

                            {/* Status - Right side */}
                            <div style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'flex-end',
                                gap: 6
                            }}>
                                {!insights ? (
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '5px 12px',
                                        borderRadius: 20,
                                        background: '#f5f5f5'
                                    }}>
                                        <Spin size="small" />
                                        <span style={{
                                            fontSize: 11,
                                            fontWeight: 600,
                                            color: '#999'
                                        }}>
                                            Analysing…
                                        </span>
                                    </div>
                                ) : (
                                    <div style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '5px 12px',
                                        borderRadius: 20,
                                        background: insights.isHealthy ? '#e8f8f5' : '#fff3e8'
                                    }}>
                                        <span style={{
                                            fontSize: 11,
                                            fontWeight: 700,
                                            color: insights.isHealthy ? '#147B75' : '#e67e22'
                                        }}>
                                            {insights.isHealthy ? '✓ On Track' : '⚠ Warning'}
                                        </span>
                                    </div>
                                )}
                                {insights && !insights.isHealthy && (
                                    <p style={{
                                        margin: 0,
                                        fontSize: 11,
                                        color: '#e67e22',
                                        fontWeight: 500,
                                        textAlign: 'right',
                                        maxWidth: 140
                                    }}>
                                        Balance drops below £0 on {format(parseISO(insights.runOutDate), 'd MMM yyyy')}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Chart */}
                    <div style={{
                        flex: 1,
                        minHeight: 0
                    }}>
                        <ForecastChart data={forecastData} timeView={timeView} savingsBuffer={userData?.profile?.savings || 0} onVisibleDataChange={handleVisibleDataChange} />
                    </div>
                </div>

                {/* Income / Expense summary cards */}
                <div style={{
                    padding: '12px 20px 20px',
                    display: 'flex',
                    gap: 12
                }}>
                    {/* Income card */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 16px',
                        borderRadius: 16,
                        background: '#f0faf9'
                    }}>
                        <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: '#147B75',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path
                                    d="M12 10L4 4M4 4H10M4 4V10"
                                    stroke="#fff"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: 12, color: '#aaa', fontWeight: 600 }}>Income</p>
                            <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#147B75' }}>
                                £{totalIncome.toFixed(2)}
                            </p>
                        </div>
                    </div>

                    {/* Expense card */}
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 16px',
                        borderRadius: 16,
                        background: '#fef5f5'
                    }}>
                        <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            background: '#e74c3c',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                        }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <path
                                    d="M4 6L12 12M12 12H6M12 12V6"
                                    stroke="#fff"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </div>
                        <div>
                            <p style={{ margin: 0, fontSize: 12, color: '#aaa', fontWeight: 600 }}>Expense</p>
                            <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#e74c3c' }}>
                                £{totalExpense.toFixed(2)}
                            </p>
                        </div>
                    </div>
                </div>
                {/* END SCROLLABLE CONTENT */}
            </div>
        </div>
    )
}
