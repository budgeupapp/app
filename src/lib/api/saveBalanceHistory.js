import { supabase } from '../supabaseClient'

/**
 * Record a balance snapshot for today.
 * Uses upsert so calling multiple times on the same day just updates.
 */
export async function saveBalanceHistory(userId, balance, source = 'manual') {
    const today = new Date().toISOString().split('T')[0]

    const { error } = await supabase
        .from('balance_history')
        .upsert({
            user_id: userId,
            account_id: null,
            balance: Number(String(balance).replace(/,/g, '')) || 0,
            recorded_date: today,
            source,
        }, { onConflict: 'user_id,account_id,recorded_date' })

    if (error) throw error
}
