import { supabase } from '../supabaseClient'

export async function saveConsents(userId, consents) {
    const rows = Object.entries(consents)
        .filter(([_, granted]) => granted)
        .map(([type]) => ({
            user_id: userId,
            provider: 'budge_up',
            scope: type,
            policy_version: 'v1',
            granted_at: new Date().toISOString()
        }))

    if (!rows.length) return

    const { error } = await supabase
        .from('consents')
        .insert(rows)

    if (error) throw error
}