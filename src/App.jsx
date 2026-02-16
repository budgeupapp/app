import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import { Spin } from 'antd'
import { usePostHog } from '@posthog/react'

import LoginForm from './screens/LoginForm'
import SignupForm from './screens/SignupForm'
import FinancialOnboardingForm from './screens/FinancialOnboardingForm'
import LoadingScreen from './screens/LoadingScreen'
import Dashboard from './screens/Dashboard'
import FinancesScreen from './screens/FinancesScreen'
import MoneyAdviceScreen from './screens/MoneyAdviceScreen'
import SettingsScreen from './screens/SettingsScreen'
import NotFound from './screens/NotFound'
import BottomNav from './components/BottomNav'
import MoneyAdviceSvg from './assets/money-advice.svg'
import { saveSignupConsents } from './lib/api'

export default function App() {
    const posthog = usePostHog()
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [processingSignup, setProcessingSignup] = useState(false)
    const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false)
    const [onboardingLoading, setOnboardingLoading] = useState(true)
    const [showLoadingScreen, setShowLoadingScreen] = useState(false)

    /* ---------------- PRELOAD ASSETS ---------------- */

    useEffect(() => {
        // Preload Money Advice SVG
        const img = new Image()
        img.src = MoneyAdviceSvg
    }, [])

    /* ---------------- AUTH ---------------- */

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session)
            // Identify user if already logged in
            if (data.session?.user) {
                posthog?.identify(data.session.user.id, {
                    email: data.session.user.email
                })
            }
            setLoading(false)
        })

        const { data: listener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                setSession(session)

                // Handle new signup consent insertion
                if (event === 'SIGNED_IN' && session?.user) {
                    // Identify the user in PostHog
                    posthog?.identify(session.user.id, {
                        email: session.user.email
                    })

                    const signupEmail = localStorage.getItem('signup_email')
                    const signupTimestamp = localStorage.getItem('signup_timestamp')

                    // Check if this is a recent signup (within last 10 minutes)
                    const isRecentSignup = signupTimestamp &&
                        (Date.now() - parseInt(signupTimestamp)) < 10 * 60 * 1000

                    if (signupEmail === session.user.email && isRecentSignup) {
                        setProcessingSignup(true)
                        posthog?.capture('user_signed_up')
                        await saveSignupConsents(session.user.id)
                        localStorage.removeItem('signup_email')
                        localStorage.removeItem('signup_timestamp')
                        setProcessingSignup(false)
                    } else {
                        posthog?.capture('user_logged_in')
                    }
                }

                // Reset PostHog on sign out
                if (event === 'SIGNED_OUT') {
                    posthog?.reset()
                }
            }
        )

        return () => {
            listener?.subscription.unsubscribe()
        }
    }, [posthog])

    /* ---------------- ONBOARDING CHECK ---------------- */

    const checkOnboarding = async () => {
        if (!session) return

        setOnboardingLoading(true)
        try {
            const { data, error } = await supabase
                .from('user_finances')
                .select('user_id')
                .eq('user_id', session.user.id)
                .single()

            // PGRST116 = no rows found, which means onboarding not complete
            if (error && error.code !== 'PGRST116') {
                console.error('Error checking onboarding status:', error)
            }

            setHasCompletedOnboarding(!!data)
        } catch (err) {
            console.error('Error in checkOnboarding:', err)
            setHasCompletedOnboarding(false)
        } finally {
            setOnboardingLoading(false)
        }
    }

    useEffect(() => {
        if (!session) {
            setOnboardingLoading(false)
            return
        }

        checkOnboarding()
    }, [session?.user?.id])

    /* ---------------- LOADING STATE ---------------- */

    if (loading || onboardingLoading || processingSignup) {
        return (
            <div
                style={{
                    width: '100vw',
                    height: '80vh',
                    display: 'grid',
                    placeItems: 'center',
                    backgroundColor: '#ffffff',
                }}
            >
                <Spin size="large" />
            </div>
        )
    }

    /* ---------------- NOT AUTHENTICATED ---------------- */

    if (!session) {
        return (
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<LoginForm />} />
                    <Route path="/signup" element={<SignupForm />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </BrowserRouter>
        )
    }

    /* ---------------- ONBOARDING NOT COMPLETE ---------------- */

    if (!hasCompletedOnboarding) {
        if (showLoadingScreen) {
            return (
                <LoadingScreen
                    onComplete={async () => {
                        setShowLoadingScreen(false)
                        // Re-verify onboarding status from database
                        await checkOnboarding()
                    }}
                />
            )
        }

        return (
            <FinancialOnboardingForm
                user={session.user}
                onComplete={() => setShowLoadingScreen(true)}
            />
        )
    }

    /* ---------------- AUTHENTICATED & ONBOARDED - MAIN APP ---------------- */

    return (
        <BrowserRouter>
            <Routes>
                {/* Valid app routes with bottom navigation */}
                <Route path="/dashboard" element={
                    <div className="app-container">
                        <div style={{ height: '100vh', position: 'relative' }}>
                            <Dashboard />
                        </div>
                        <BottomNav />
                    </div>
                } />
                <Route path="/transactions" element={
                    <div className="app-container">
                        <div style={{ height: '100vh', position: 'relative' }}>
                            <FinancesScreen />
                        </div>
                        <BottomNav />
                    </div>
                } />
                <Route path="/advice" element={
                    <div className="app-container">
                        <div style={{ height: '100vh', position: 'relative' }}>
                            <MoneyAdviceScreen />
                        </div>
                        <BottomNav />
                    </div>
                } />
                <Route path="/settings" element={
                    <div className="app-container">
                        <div style={{ height: '100vh', position: 'relative' }}>
                            <SettingsScreen />
                        </div>
                        <BottomNav />
                    </div>
                } />

                {/* Redirect root to dashboard */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />

                {/* Redirect login to dashboard */}
                <Route path="/login" element={<Navigate to="/dashboard" replace />} />

                {/* 404 page for invalid routes */}
                <Route path="*" element={<NotFound />} />
            </Routes>
        </BrowserRouter>
    )
}
