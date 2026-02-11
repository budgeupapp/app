import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'
import { Spin } from 'antd'

import Login from './screens/Login'
import ConsentScreen from './screens/ConsentScreen'
import FinancialOnboardingForm from './screens/FinancialOnboardingForm'
import LoadingScreen from './screens/LoadingScreen'
import Dashboard from './screens/Dashboard'
import PaymentsScreen from './screens/PaymentsScreen'
import MoneyAdviceScreen from './screens/MoneyAdviceScreen'
import NotFound from './screens/NotFound'
import BottomNav from './components/BottomNav'
import MoneyAdviceSvg from './assets/money-advice.svg'

export default function App() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [hasConsent, setHasConsent] = useState(false)
    const [consentLoading, setConsentLoading] = useState(true)
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
            setLoading(false)
        })

        const { data: listener } = supabase.auth.onAuthStateChange(
            (_event, session) => {
                setSession(session)
            }
        )

        return () => {
            listener?.subscription.unsubscribe()
        }
    }, [])

    /* ---------------- CONSENT CHECK ---------------- */

    useEffect(() => {
        if (!session) {
            setConsentLoading(false)
            return
        }

        const checkConsent = async () => {
            setConsentLoading(true)
            const { data } = await supabase
                .from('user_consents')
                .select('id')
                .eq('user_id', session.user.id)
                .is('revoked_at', null)

            setHasConsent(data && data.length > 0)
            setConsentLoading(false)
        }

        checkConsent()
    }, [session?.user?.id])

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
        if (!session || !hasConsent) {
            setOnboardingLoading(false)
            return
        }

        checkOnboarding()
    }, [session?.user?.id, hasConsent])

    /* ---------------- LOADING STATE ---------------- */

    if (loading || consentLoading || onboardingLoading) {
        return (
            <div
                style={{
                    width: '100vw',
                    height: '100vh',
                    display: 'grid',
                    placeItems: 'center',
                    backgroundColor: '#ffffff',
                }}
            >
                <Spin size="large" description="Loading…" />
            </div>
        )
    }

    /* ---------------- NOT AUTHENTICATED ---------------- */

    if (!session) {
        return (
            <BrowserRouter>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="*" element={<Navigate to="/login" replace />} />
                </Routes>
            </BrowserRouter>
        )
    }

    /* ---------------- NO CONSENT ---------------- */

    if (!hasConsent) {
        return (
            <ConsentScreen
                user={session.user}
                onConsentGranted={() => setHasConsent(true)}
            />
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
                <Route path="/payments" element={
                    <div className="app-container">
                        <div style={{ height: '100vh', position: 'relative' }}>
                            <PaymentsScreen />
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
