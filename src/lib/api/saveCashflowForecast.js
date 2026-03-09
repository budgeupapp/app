import { supabase } from '../supabaseClient'

const stripCommas = str =>
    str ? String(str).replace(/,/g, '') : null

const MONTH_TO_DEFAULT_DATE = {
    september: '2025-09-15', october: '2025-10-15', november: '2025-11-15', december: '2025-12-15',
    january: '2026-01-15', february: '2026-02-15', march: '2026-03-15', april: '2026-04-15',
    may: '2026-05-15', june: '2026-06-15', july: '2026-07-15', august: '2026-08-15'
}

const mapFrequencyToRecurrence = freq => {
    const mapping = {
        'one_off': 'once', 'once': 'once',
        'weekly': 'weekly', 'monthly': 'monthly',
        'termly': 'termly', 'yearly': 'yearly',
        'quarterly': 'quarterly', 'other': 'monthly'
    }
    return mapping[freq] || 'monthly'
}

export async function saveCashflowForecast(userId, data) {
    // Delete existing manual cashflow entries for this user
    const { error: delError } = await supabase
        .from('cashflow_forecast')
        .delete()
        .eq('user_id', userId)
        .eq('source', 'manual')

    if (delError) throw delError

    const rows = []

    /* --- Maintenance loan --- */
    if (data.incomeSources?.includes('maintenance_loan') || data.studentLoan) {
        const rawAmount = stripCommas(data.loanAmount)
        const totalAmount = Number(rawAmount) || 0

        if (data.loanKnowDates && data.instalmentDates?.length) {
            const validDates = data.instalmentDates.filter(Boolean)
            const dateCount = validDates.length
            const perInstalment = dateCount ? Number((totalAmount / dateCount).toFixed(2)) : 0
            let running = 0

            validDates.forEach((date, idx) => {
                const amount = idx === validDates.length - 1
                    ? (totalAmount - running).toFixed(2)
                    : perInstalment.toFixed(2)
                running += Number(amount)
                rows.push({
                    user_id: userId, direction: 'in', type: 'student_loan',
                    title: `Student loan - instalment ${idx + 1}`,
                    amount, currency: 'GBP', recurrence: 'yearly',
                    scheduled_date: date, end_date: null, source: 'manual',
                    category: 'loan',
                })
            })
        } else if (data.loanMonths?.length) {
            const months = data.loanMonths
            const dateCount = months.length
            const perInstalment = dateCount ? Number((totalAmount / dateCount).toFixed(2)) : 0
            let running = 0

            months.forEach((month, idx) => {
                const exactDate = data.loanDates?.[month]
                const fallbackDate = MONTH_TO_DEFAULT_DATE[month]
                const instalmentAmt = data.instalmentAmounts?.[month]
                    ? Number(stripCommas(data.instalmentAmounts[month]))
                    : null

                let amount
                if (instalmentAmt && instalmentAmt > 0) {
                    amount = instalmentAmt.toFixed(2)
                } else {
                    amount = idx === months.length - 1
                        ? (totalAmount - running).toFixed(2)
                        : perInstalment.toFixed(2)
                }
                running += Number(amount)

                rows.push({
                    user_id: userId, direction: 'in', type: 'student_loan',
                    title: `Student loan - ${month.charAt(0).toUpperCase() + month.slice(1)}`,
                    amount, currency: 'GBP', recurrence: 'yearly',
                    scheduled_date: exactDate || fallbackDate, end_date: null, source: 'manual',
                    category: 'loan',
                })
            })
        }
    }

    /* --- Bursary --- */
    if (data.incomeSources?.includes('bursary') || data.bursary) {
        const rawAmount = stripCommas(data.bursaryAmount)
        const totalAmount = Number(rawAmount) || 0
        const dates = data.bursaryDates?.filter(Boolean) || []
        const dateCount = dates.length
        const perPayment = dateCount ? Number((totalAmount / dateCount).toFixed(2)) : 0
        let running = 0

        dates.forEach((date, idx) => {
            const amount = idx === dates.length - 1
                ? (totalAmount - running).toFixed(2)
                : perPayment.toFixed(2)
            running += Number(amount)
            rows.push({
                user_id: userId, direction: 'in', type: 'bursary',
                title: 'Bursary', amount, currency: 'GBP', recurrence: 'yearly',
                scheduled_date: date, end_date: null, source: 'manual',
                category: 'bursary',
            })
        })
    }

    /* --- Family & Friends --- */
    if (data.incomeSources?.includes('family_friends')) {
        const amt = stripCommas(data.familyAmount)
        const freq = data.familyFrequency
        if (amt && freq) {
            rows.push({
                user_id: userId, direction: 'in', type: 'family',
                title: 'Family & Friends', amount: amt, currency: 'GBP',
                recurrence: mapFrequencyToRecurrence(freq),
                scheduled_date: data.familyNextDate || '2025-09-01',
                end_date: null, source: 'manual',
                category: 'family',
                term_specific: data.familyVariesByTerm || false,
            })
            // If varies by term, store non-term amount as a child row
            if (data.familyVariesByTerm && data.familyNonTermAmount) {
                rows.push({
                    user_id: userId, direction: 'in', type: 'family_non_term',
                    title: 'Family & Friends (non-term)', amount: stripCommas(data.familyNonTermAmount),
                    currency: 'GBP', recurrence: mapFrequencyToRecurrence(freq),
                    scheduled_date: data.familyNextDate || '2025-09-01',
                    end_date: null, source: 'manual',
                    category: 'family', subcategory: 'non_term',
                    term_specific: true,
                })
            }
        }
    }

    /* --- Work --- */
    if (data.incomeSources?.includes('work')) {
        const amt = stripCommas(data.workAmount)
        const freq = data.workFrequency || 'monthly'
        if (amt) {
            rows.push({
                user_id: userId, direction: 'in', type: 'work',
                title: 'Work', amount: amt, currency: 'GBP',
                recurrence: mapFrequencyToRecurrence(freq),
                scheduled_date: data.workNextDate || '2025-09-01',
                end_date: null, source: 'manual',
                category: 'work',
                term_specific: data.workVariesByTerm || false,
            })
            if (data.workVariesByTerm && data.workNonTermAmount) {
                rows.push({
                    user_id: userId, direction: 'in', type: 'work_non_term',
                    title: 'Work (non-term)', amount: stripCommas(data.workNonTermAmount),
                    currency: 'GBP', recurrence: mapFrequencyToRecurrence(freq),
                    scheduled_date: data.workNextDate || '2025-09-01',
                    end_date: null, source: 'manual',
                    category: 'work', subcategory: 'non_term',
                    term_specific: true,
                })
            }
        }
    }

    /* --- Other income --- */
    if (data.incomeSources?.includes('other_income')) {
        const amt = stripCommas(data.otherIncomeAmount)
        const freq = data.otherIncomeFrequency
        if (amt && freq) {
            rows.push({
                user_id: userId, direction: 'in', type: 'other_income',
                title: data.otherIncomeLabel || 'Other Income', amount: amt,
                currency: 'GBP', recurrence: mapFrequencyToRecurrence(freq),
                scheduled_date: data.otherIncomeNextDate || '2025-09-01',
                end_date: null, source: 'manual',
                category: 'otherIncome',
                term_specific: data.otherIncomeVariesByTerm || false,
            })
            if (data.otherIncomeVariesByTerm && data.otherIncomeNonTermAmount) {
                rows.push({
                    user_id: userId, direction: 'in', type: 'other_income_non_term',
                    title: (data.otherIncomeLabel || 'Other Income') + ' (non-term)',
                    amount: stripCommas(data.otherIncomeNonTermAmount),
                    currency: 'GBP', recurrence: mapFrequencyToRecurrence(freq),
                    scheduled_date: data.otherIncomeNextDate || '2025-09-01',
                    end_date: null, source: 'manual',
                    category: 'otherIncome', subcategory: 'non_term',
                    term_specific: true,
                })
            }
        }
    }

    /* --- Rent --- */
    if (data.expenseSources?.includes('rent')) {
        const amt = stripCommas(data.rentAmount)
        if (amt) {
            rows.push({
                user_id: userId, direction: 'out', type: 'rent',
                title: 'Rent', amount: amt, currency: 'GBP',
                recurrence: mapFrequencyToRecurrence(data.rentFrequency || 'monthly'),
                scheduled_date: data.rentNextDate || '2025-09-01',
                end_date: null, source: 'manual',
                category: 'rent',
            })
        }
    }

    /* --- Bills --- */
    if (data.expenseSources?.includes('bills')) {
        const amt = stripCommas(data.billsAmount)
        if (amt) {
            rows.push({
                user_id: userId, direction: 'out', type: 'bills',
                title: 'Bills', amount: amt, currency: 'GBP',
                recurrence: mapFrequencyToRecurrence(data.billsFrequency || 'monthly'),
                scheduled_date: data.billsNextDate || '2025-09-01',
                end_date: null, source: 'manual',
                category: 'bills',
            })
        }
    }

    /* --- University Fees --- */
    if (data.expenseSources?.includes('uni_fees')) {
        const amt = stripCommas(data.uniFeesAmount)
        if (amt) {
            rows.push({
                user_id: userId, direction: 'out', type: 'uni_fees',
                title: 'University Fees', amount: amt, currency: 'GBP',
                recurrence: 'yearly',
                scheduled_date: '2025-09-01',
                end_date: null, source: 'manual',
                category: 'uniFees',
            })
        }
    }

    /* --- Savings & Investments --- */
    if (data.expenseSources?.includes('savings_investments')) {
        const amt = stripCommas(data.savingsInvAmount)
        if (amt) {
            rows.push({
                user_id: userId, direction: 'out', type: 'savings',
                title: 'Savings & Investments', amount: amt, currency: 'GBP',
                recurrence: mapFrequencyToRecurrence(data.savingsInvFrequency || 'monthly'),
                scheduled_date: data.savingsInvNextDate || '2025-09-01',
                end_date: null, source: 'manual',
                category: 'savingsInv',
            })
        }
    }

    /* --- Weekly spend --- */
    const weeklyAmt = stripCommas(data.weeklySpend)
    if (weeklyAmt) {
        rows.push({
            user_id: userId, direction: 'out', type: 'weekly_spend',
            title: 'Weekly Spend', amount: weeklyAmt, currency: 'GBP',
            recurrence: 'weekly',
            scheduled_date: '2025-09-01',
            end_date: null, source: 'manual',
            category: 'weeklySpend',
            term_specific: data.weeklySpendVariesByTerm || false,
        })
        if (data.weeklySpendVariesByTerm && data.weeklySpendNonTerm) {
            rows.push({
                user_id: userId, direction: 'out', type: 'weekly_spend_non_term',
                title: 'Weekly Spend (non-term)', amount: stripCommas(data.weeklySpendNonTerm),
                currency: 'GBP', recurrence: 'weekly',
                scheduled_date: '2025-09-01',
                end_date: null, source: 'manual',
                category: 'weeklySpend', subcategory: 'non_term',
                term_specific: true,
            })
        }
    }

    /* --- One-off items --- */
    for (const item of (data.oneOffItems || [])) {
        const amt = stripCommas(item.amount)
        if (!amt || !item.date) continue
        const dir = (item.direction || 'out') === 'in' ? 'in' : 'out'
        rows.push({
            user_id: userId, direction: dir, type: 'one_off',
            title: item.name || (dir === 'in' ? 'One-off income' : 'One-off expense'),
            amount: amt, currency: 'GBP', recurrence: 'once',
            scheduled_date: item.date, end_date: null, source: 'manual',
            category: 'oneOff',
        })
    }

    /* --- Removed events --- */
    const removedEvents = data.removedEvents || []
    if (removedEvents.length) {
        for (const key of removedEvents) {
            const [editType, date] = key.split(':')
            if (!editType || !date) continue
            rows.push({
                user_id: userId, direction: 'out', type: editType,
                title: `Removed: ${editType}`, amount: 0,
                currency: 'GBP', recurrence: 'once',
                scheduled_date: date, end_date: null, source: 'manual',
                category: editType, is_removed: true,
            })
        }
    }

    if (!rows.length) return

    const { error } = await supabase.from('cashflow_forecast').insert(rows)
    if (error) throw error
}
