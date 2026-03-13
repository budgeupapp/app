import { supabase } from '../supabaseClient'

/**
 * Save term dates and breaks for a user.
 * Deletes existing term dates first, then inserts fresh.
 */
export async function saveTermDates(userId, termDates) {
    if (!termDates?.terms?.length) return

    // Delete existing term dates (cascades to term_breaks)
    const { error: delError } = await supabase
        .from('term_dates')
        .delete()
        .eq('user_id', userId)

    if (delError) throw delError

    // Insert new term dates
    for (const term of termDates.terms) {
        const { data: inserted, error: termError } = await supabase
            .from('term_dates')
            .insert({
                user_id: userId,
                term_id: term.id,
                name: term.name,
                start_date: term.start,
                end_date: term.end,
            })
            .select('id')
            .single()

        if (termError) throw termError

        // Insert breaks for this term
        if (term.breaks?.length) {
            const breakRows = term.breaks.map(b => ({
                term_date_id: inserted.id,
                start_date: b.start,
                end_date: b.end,
                ...(b.name ? { name: b.name } : {}),
            }))

            const { error: breakError } = await supabase
                .from('term_breaks')
                .insert(breakRows)

            // Retry without name if column doesn't exist yet
            if (breakError) {
                const fallbackRows = term.breaks.map(b => ({
                    term_date_id: inserted.id,
                    start_date: b.start,
                    end_date: b.end,
                }))
                const { error: fallbackError } = await supabase
                    .from('term_breaks')
                    .insert(fallbackRows)
                if (fallbackError) throw fallbackError
            }
        }
    }
}
