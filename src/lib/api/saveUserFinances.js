import { supabase } from '../supabaseClient'

const stripCommas = str =>
    str ? String(str).replace(/,/g, '') : null

export async function saveUserFinances(userId, profile) {
    const data = {
        user_id: userId,
        university: profile.university || null,
        balance: Number(stripCommas(profile.balance)) || 0,
        savings: Number(stripCommas(profile.savings)) || 0,
        weekly_spend_band: profile.weeklySpend || null,
        currency: profile.currency ?? 'GBP',
        updated_at: new Date().toISOString()
    }

    // Include referred_by if provided (only on first save)
    if (profile.referredBy !== undefined) {
        data.referred_by = profile.referredBy
    }

    const { error } = await supabase
        .from('user_finances')
        .upsert(data, { onConflict: 'user_id' })

    if (error) throw error
}
