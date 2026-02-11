import { supabase } from '../supabaseClient'

const stripCommas = str =>
    str ? String(str).replace(/,/g, '') : null

export async function saveUserFinances(userId, profile) {
    const { error } = await supabase
        .from('user_finances')
        .upsert(
            {
                user_id: userId,
                university: profile.university || null,
                current_balance: Number(stripCommas(profile.balance)) || 0,
                savings: Number(stripCommas(profile.savings)) || 0,
                weekly_spend_band: profile.weeklySpend || null,
                currency: profile.currency ?? 'GBP',
                updated_at: new Date().toISOString()
            },
            { onConflict: 'user_id' }
        )

    if (error) throw error
}
