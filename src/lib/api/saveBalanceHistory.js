import { supabase } from '../supabaseClient'

/**
 * Record a balance snapshot for today.
 * Uses upsert so calling multiple times on the same day just updates.
 */
export async function saveBalanceHistory(userId, balance, source = 'manual') {
    const today = new Date().toISOString().split('T')[0]

    const balanceNum = Number(String(balance).replace(/,/g, '')) || 0

    // Try update first (partial unique index doesn't work with upsert's onConflict)
    const { data: existing } = await supabase
        .from('balance_history')
        .select('id')
        .eq('user_id', userId)
        .eq('recorded_date', today)
        .is('account_id', null)
        .limit(1)
        .maybeSingle()

    if (existing) {
        const { error } = await supabase
            .from('balance_history')
            .update({ balance: balanceNum, source })
            .eq('id', existing.id)
        if (error) throw error
    } else {
        const { error } = await supabase
            .from('balance_history')
            .insert({
                user_id: userId,
                account_id: null,
                balance: balanceNum,
                recorded_date: today,
                source,
            })
        if (error) throw error
    }
}
