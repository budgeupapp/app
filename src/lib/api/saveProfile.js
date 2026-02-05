import { supabase } from '../supabaseClient'

export async function saveProfile(userId, profile) {
    const { error } = await supabase
        .from('financial_profiles')
        .upsert(
            {
                user_id: userId,
                current_balance: Number(profile.balance),
                weekly_spend_band: Number(profile.weeklySpendBand),
                currency: profile.currency ?? 'GBP',
                updated_at: new Date().toISOString()
            },
            { onConflict: 'user_id' }
        )

    if (error) throw error
}