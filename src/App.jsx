import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'

import Login from './screens/Login'
import FinancialOnboardingForm from './screens/FinancialOnboardingForm'

export default function App() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [hasConsent, setHasConsent] = useState(false)

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
        if (!session) return

        const checkConsent = async () => {
            const { data } = await supabase
                .from('consents')
                .select('id')
                .eq('user_id', session.user.id)
                .is('revoked_at', null)

            setHasConsent(data && data.length > 0)
        }

        checkConsent()
    }, [session])


    if (loading) return null

    if (!session) return <Login />


    return <FinancialOnboardingForm user={session.user} />



}
