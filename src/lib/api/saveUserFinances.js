import { supabase } from '../supabaseClient'

const stripCommas = str =>
    str ? String(str).replace(/,/g, '') : null

export async function saveUserFinances(userId, profile) {
    const data = {
        user_id: userId,
        university: profile.university || null,
        balance: Number(stripCommas(profile.balance)) || 0,
        savings: Number(stripCommas(profile.savings)) || 0,
        overdraft: Number(stripCommas(profile.overdraft)) || 0,
        weekly_spend: Number(stripCommas(profile.weeklySpend)) || null,
        weekly_spend_non_term: Number(stripCommas(profile.weeklySpendNonTerm)) || null,
        weekly_spend_varies_by_term: profile.weeklySpendVariesByTerm || false,
        onboarding_completed: profile.onboardingCompleted ?? true,
        currency: profile.currency ?? 'GBP',
        updated_at: new Date().toISOString()
    }

    // Include referred_by if provided (only on first save)
    if (profile.referredBy !== undefined) {
        data.referred_by = profile.referredBy
    }

    const { error } = await supabase
        .from('user_profiles')
        .upsert(data, { onConflict: 'user_id' })

    if (error) throw error
}
