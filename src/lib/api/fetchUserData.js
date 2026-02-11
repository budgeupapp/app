import { supabase } from '../supabaseClient'

/**
 * Fetch all financial data for a user
 * Returns: { profile, cashflows }
 */
export async function fetchUserData(userId) {
    try {
        // Fetch financial profile
        const { data: profile, error: profileError } = await supabase
            .from('user_finances')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (profileError && profileError.code !== 'PGRST116') {
            // PGRST116 is "not found" - that's okay for new users
            throw profileError
        }

        // Fetch all cashflow entries
        const { data: cashflows, error: cashflowError } = await supabase
            .from('cashflow_forecast')
            .select('*')
            .eq('user_id', userId)
            .order('scheduled_date', { ascending: true })

        if (cashflowError) throw cashflowError

        return {
            profile: profile || null,
            cashflows: cashflows || []
        }
    } catch (error) {
        console.error('Error fetching user data:', error)
        throw error
    }
}

/**
 * Update a cashflow entry
 */
export async function updateCashflowEntry(entryId, updates) {
    const { error } = await supabase
        .from('cashflow_forecast')
        .update(updates)
        .eq('id', entryId)

    if (error) throw error
}

/**
 * Delete a cashflow entry
 */
export async function deleteCashflowEntry(entryId) {
    const { error } = await supabase
        .from('cashflow_forecast')
        .delete()
        .eq('id', entryId)

    if (error) throw error
}
