// DEV: set to 'onboarding' or 'dashboard' to bypass login and jump to that view. Set to null for normal behaviour.
const DEV_VIEW = null

import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabaseClient'

// Detect magic link callback before React processes/clears the URL
const authCallbackPending =
    window.location.hash.includes('access_token') ||
    new URLSearchParams(window.location.search).has('code')
const recoveryPending =
    window.location.hash.includes('type=recovery')
import { Spin } from 'antd'
import { analytics, AUTH_EVENTS, SESSION_EVENTS, getSessionProperties } from './lib/analytics/index.js'

import LoginForm from './screens/LoginForm'
import SignupForm from './screens/SignupForm'
import ForgotPasswordForm from './screens/ForgotPasswordForm'
import ResetPasswordForm from './screens/ResetPasswordForm'
import AuthContainer from './components/AuthContainer'
import FinancialOnboardingForm from './screens/FinancialOnboardingForm'
import LoadingScreen from './screens/LoadingScreen'
import Dashboard from './screens/Dashboard'
import MoneyAdviceScreen from './screens/MoneyAdviceScreen'
import SettingsScreen from './screens/SettingsScreen'
import NotFound from './screens/NotFound'
import BottomNav from './components/BottomNav'
import MoneyAdviceSvg from './assets/money-advice.svg'
import { saveSignupConsents } from './lib/api'

export default function App() {
    const sessionTrackedRef = useRef(false)
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [processingSignup, setProcessingSignup] = useState(false)
    const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(null)
    const [onboardingLoading, setOnboardingLoading] = useState(true)
    const [showLoadingScreen, setShowLoadingScreen] = useState(false)
    const [passwordRecovery, setPasswordRecovery] = useState(recoveryPending)

    /* ---------------- PRELOAD ASSETS ---------------- */

    useEffect(() => {
        // Preload Money Advice SVG
        const img = new Image()
        img.src = MoneyAdviceSvg
    }, [])

    /* ---------------- SESSION TRACKING ---------------- */

    useEffect(() => {
        // Track session start (guard prevents StrictMode double-fire)
        if (!sessionTrackedRef.current) {
            sessionTrackedRef.current = true
            analytics.track(SESSION_EVENTS.STARTED, getSessionProperties())
        }
    }, [])



    /* ---------------- AUTH ---------------- */

    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            setSession(data.session)
            // Identify user if already logged in
            if (data.session?.user) {
                analytics.identify(data.session.user.id, {
                    email: data.session.user.email
                })
            }
            setLoading(false)
        })

        const { data: listener } = supabase.auth.onAuthStateChange(
            async (event, session) => {
                if (event === 'PASSWORD_RECOVERY') {
                    setSession(session)
                    setPasswordRecovery(true)
                    return
                }

                // Skip normal sign-in flow during password recovery
                if (recoveryPending && event === 'SIGNED_IN') {
                    setSession(session)
                    return
                }

                setSession(session)

                // Handle new signup consent insertion
                if (event === 'SIGNED_IN' && session?.user) {
                    // Identify the user
                    analytics.identify(session.user.id, {
                        email: session.user.email
                    })

                    const signupEmail = localStorage.getItem('signup_email')
                    const signupTimestamp = localStorage.getItem('signup_timestamp')

                    // Check if this is a recent signup (within last 10 minutes)
                    const isRecentSignup = signupTimestamp &&
                        (Date.now() - parseInt(signupTimestamp)) < 10 * 60 * 1000

                    if (signupEmail === session.user.email && isRecentSignup) {
                        setProcessingSignup(true)
                        analytics.track(AUTH_EVENTS.SIGNUP_COMPLETED)
                        localStorage.setItem('signup_onboarding_pending', 'true')
                        await saveSignupConsents(session.user.id)
                        localStorage.removeItem('signup_email')
                        localStorage.removeItem('signup_timestamp')
                        setProcessingSignup(false)
                    } else if (authCallbackPending || localStorage.getItem('login_initiated')) {
                        localStorage.removeItem('login_initiated')
                        analytics.track(AUTH_EVENTS.LOGIN_COMPLETED)
                    }
                }

                // Reset analytics on sign out
                if (event === 'SIGNED_OUT') {
                    analytics.reset()
                }
            }
        )

        return () => {
            listener?.subscription.unsubscribe()
        }
    }, [])

    /* ---------------- ONBOARDING CHECK ---------------- */

    // update checkOnboarding
    const checkOnboarding = async () => {
        if (!session) return

        setOnboardingLoading(true)

        try {
            const { data, error } = await supabase
                .from('user_profiles')
                .select('user_id')
                .eq('user_id', session.user.id)
                .maybeSingle() // important

            if (error) {
                console.error(error)
                setHasCompletedOnboarding(false)
            } else {
                setHasCompletedOnboarding(!!data)
            }
        } catch (err) {
            console.error(err)
            setHasCompletedOnboarding(false)
        } finally {
            setOnboardingLoading(false)
        }
    }

    useEffect(() => {
        if (session?.user?.id) {
            checkOnboarding()
        } else {
            setHasCompletedOnboarding(null)
            setOnboardingLoading(false)
        }
    }, [session?.user?.id])

    /* ---------------- LOADING STATE ---------------- */

    if (loading || onboardingLoading || processingSignup || (session?.user?.id && hasCompletedOnboarding === null)) {
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


    /* ---------------- NOT AUTHENTICATED / PASSWORD RECOVERY ---------------- */

    if (!session || passwordRecovery) {
        return (
            <BrowserRouter>
                <Routes>
                    <Route element={<AuthContainer />}>
                        <Route path="/login" element={<LoginForm />} />
                        <Route path="/signup" element={<SignupForm />} />
                        <Route path="/forgot-password" element={<ForgotPasswordForm />} />
                        <Route path="/reset-password" element={
                            <ResetPasswordForm onComplete={() => setPasswordRecovery(false)} />
                        } />
                        <Route path="*" element={
                            <Navigate to={passwordRecovery ? '/reset-password' : '/signup'} replace />
                        } />
                    </Route>
                </Routes>
            </BrowserRouter>
        )
    }

    /* ---------------- ONBOARDING NOT COMPLETE ---------------- */

    if (DEV_VIEW === 'onboarding' || hasCompletedOnboarding === false) {
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
        } else
            return (
                <FinancialOnboardingForm
                    user={session?.user}
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
                <Route path="/support" element={
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

                {/* Redirect auth routes to dashboard */}
                <Route path="/login" element={<Navigate to="/dashboard" replace />} />
                <Route path="/signup" element={<Navigate to="/dashboard" replace />} />
                <Route path="/reset-password" element={<Navigate to="/dashboard" replace />} />
                <Route path="/forgot-password" element={<Navigate to="/dashboard" replace />} />

                {/* 404 page for invalid routes */}
                <Route path="*" element={<NotFound />} />
            </Routes>
        </BrowserRouter>
    )
}
