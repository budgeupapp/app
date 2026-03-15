import { supabase } from '../supabaseClient'
import { INITIAL_FORM_DATA, DEFAULT_LOAN_MONTHS, DEFAULT_BURSARY_DATES } from '../../config/onboardingConfig'

/**
 * Fetch all financial data for a user and reconstruct formData
 * Returns: { profile, cashflows, termDates, balanceHistory, formData }
 */
export async function fetchUserData(userId) {
    try {
        // Fetch all data in parallel
        const [profileRes, cashflowRes, termRes, balanceRes] = await Promise.all([
            supabase.from('user_profiles').select('*').eq('user_id', userId).single(),
            supabase.from('cashflow_forecast').select('*').eq('user_id', userId).order('scheduled_date', { ascending: true }),
            supabase.from('term_dates').select('*, term_breaks(*)').eq('user_id', userId).order('start_date', { ascending: true }),
            supabase.from('balance_history').select('*').eq('user_id', userId).order('recorded_date', { ascending: false }).limit(90),
        ])

        if (profileRes.error && profileRes.error.code !== 'PGRST116') throw profileRes.error
        if (cashflowRes.error) throw cashflowRes.error
        if (termRes.error) throw termRes.error
        if (balanceRes.error) throw balanceRes.error

        const profile = profileRes.data || null
        const cashflows = cashflowRes.data || []
        const termDatesRows = termRes.data || []
        const balanceHistory = balanceRes.data || []

        // Reconstruct formData from DB
        const formData = reconstructFormData(profile, cashflows, termDatesRows)

        return { profile, cashflows, termDates: termDatesRows, balanceHistory, formData }
    } catch (error) {
        console.error('Error fetching user data:', error)
        throw error
    }
}

/**
 * Reconstruct the client-side formData object from DB rows
 */
function reconstructFormData(profile, cashflows, termDatesRows) {
    const fd = { ...INITIAL_FORM_DATA }

    // Profile fields
    if (profile) {
        fd.university = profile.university || fd.university
        fd.balance = profile.balance != null ? String(profile.balance) : ''
        fd.overdraft = profile.overdraft != null ? String(profile.overdraft) : ''
        fd.savings = profile.savings != null ? String(profile.savings) : ''
        fd.weeklySpend = profile.weekly_spend != null ? String(profile.weekly_spend) : ''
        fd.weeklySpendNonTerm = profile.weekly_spend_non_term != null ? String(profile.weekly_spend_non_term) : ''
        fd.weeklySpendVariesByTerm = profile.weekly_spend_varies_by_term || false
    }

    // Term dates
    if (termDatesRows.length) {
        fd.termDates = {
            terms: termDatesRows.map(t => ({
                id: t.term_id,
                name: t.name,
                start: t.start_date,
                end: t.end_date,
                breaks: (t.term_breaks || []).map(b => ({
                    id: b.id,
                    start: b.start_date,
                    end: b.end_date,
                    ...(b.name ? { name: b.name } : {}),
                }))
            }))
        }
    }

    // Process cashflows by category
    const byCategory = {}
    for (const cf of cashflows) {
        const cat = cf.category || cf.type
        if (!byCategory[cat]) byCategory[cat] = []
        byCategory[cat].push(cf)
    }

    // Income sources
    const incomeSources = []
    const expenseSources = []

    // Loan
    const loanRows = (byCategory['loan'] || []).filter(r => !r.is_removed)
    if (loanRows.length) {
        incomeSources.push('maintenance_loan')
        fd.studentLoan = true
        const totalLoan = loanRows.reduce((s, r) => s + Number(r.amount), 0)
        fd.loanAmount = String(totalLoan)

        // Extract months and dates from rows
        const months = []
        const loanDates = {}
        const instalmentAmounts = {}
        for (const row of loanRows) {
            // Try to extract month from title
            const match = row.title?.match(/- (\w+)/)
            if (match) {
                const month = match[1].toLowerCase()
                months.push(month)
                loanDates[month] = row.scheduled_date
                instalmentAmounts[month] = String(row.amount)
            }
        }
        if (months.length) {
            fd.loanMonths = months
            fd.loanDates = loanDates
            fd.instalmentAmounts = instalmentAmounts
        }
    }

    // Bursary
    const bursaryRows = (byCategory['bursary'] || []).filter(r => !r.is_removed)
    if (bursaryRows.length) {
        incomeSources.push('bursary')
        fd.bursary = true
        const totalBursary = bursaryRows.reduce((s, r) => s + Number(r.amount), 0)
        fd.bursaryAmount = String(totalBursary)
        fd.bursaryDates = bursaryRows.map(r => r.scheduled_date)
    }

    // Family
    const familyRows = (byCategory['family'] || []).filter(r => !r.is_removed)
    if (familyRows.length) {
        incomeSources.push('family_friends')
        const main = familyRows.find(r => r.subcategory !== 'non_term')
        const nonTerm = familyRows.find(r => r.subcategory === 'non_term')
        if (main) {
            fd.familyAmount = String(main.amount)
            fd.familyFrequency = main.recurrence
            fd.familyNextDate = main.scheduled_date
            fd.familyVariesByTerm = main.term_specific || false
        }
        if (nonTerm) {
            fd.familyNonTermAmount = String(nonTerm.amount)
            fd.familyVariesByTerm = true
        }
    }

    // Work
    const workRows = (byCategory['work'] || []).filter(r => !r.is_removed)
    if (workRows.length) {
        incomeSources.push('work')
        const main = workRows.find(r => r.subcategory !== 'non_term')
        const nonTerm = workRows.find(r => r.subcategory === 'non_term')
        if (main) {
            fd.workAmount = String(main.amount)
            fd.workFrequency = main.recurrence
            fd.workNextDate = main.scheduled_date
            fd.workVariesByTerm = main.term_specific || false
        }
        if (nonTerm) {
            fd.workNonTermAmount = String(nonTerm.amount)
            fd.workVariesByTerm = true
        }
    }

    // Other income (array-based)
    const otherIncomeRows = (byCategory['otherIncome'] || []).filter(r => !r.is_removed)
    if (otherIncomeRows.length) {
        incomeSources.push('other_income')
        fd.otherIncome = true
        // Group main rows and their non-term pairs by title
        const mainRows = otherIncomeRows.filter(r => r.subcategory !== 'non_term')
        const nonTermRows = otherIncomeRows.filter(r => r.subcategory === 'non_term')
        const otherIncomes = mainRows.map((main, idx) => {
            const baseLabel = main.title || 'Other Income'
            const nonTerm = nonTermRows.find(r => r.title === baseLabel + ' (non-term)')
            return {
                id: `other_income_${idx}`,
                label: baseLabel,
                amount: String(main.amount),
                frequency: main.recurrence,
                nextDate: main.scheduled_date,
                variesByTerm: main.term_specific || false,
                nonTermAmount: nonTerm ? String(nonTerm.amount) : '',
            }
        })
        fd.otherIncomes = otherIncomes
        // Also set legacy flat fields from first entry for backwards compat
        if (mainRows[0]) {
            fd.otherIncomeAmount = String(mainRows[0].amount)
            fd.otherIncomeFrequency = mainRows[0].recurrence
            fd.otherIncomeNextDate = mainRows[0].scheduled_date
            fd.otherIncomeLabel = mainRows[0].title
            fd.otherIncomeVariesByTerm = mainRows[0].term_specific || false
        }
        if (nonTermRows[0]) {
            fd.otherIncomeNonTermAmount = String(nonTermRows[0].amount)
            fd.otherIncomeVariesByTerm = true
        }
    }

    // Rent
    const rentRows = (byCategory['rent'] || []).filter(r => !r.is_removed)
    if (rentRows.length) {
        expenseSources.push('rent')
        const r = rentRows[0]
        fd.rentAmount = String(r.amount)
        fd.rentFrequency = r.recurrence
        fd.rentNextDate = r.scheduled_date
    }

    // Bills
    const billsRows = (byCategory['bills'] || []).filter(r => !r.is_removed)
    if (billsRows.length) {
        expenseSources.push('bills')
        const main = billsRows.find(r => r.subcategory !== 'non_term')
        const nonTerm = billsRows.find(r => r.subcategory === 'non_term')
        if (main) {
            fd.billsAmount = String(main.amount)
            fd.billsFrequency = main.recurrence
            fd.billsNextDate = main.scheduled_date
            fd.billsVariesByTerm = main.term_specific || false
        }
        if (nonTerm) {
            fd.billsNonTermAmount = String(nonTerm.amount)
            fd.billsVariesByTerm = true
        }
    }

    // Uni fees
    const uniRows = (byCategory['uniFees'] || []).filter(r => !r.is_removed)
    if (uniRows.length) {
        expenseSources.push('uni_fees')
        const uniMain = uniRows.find(r => r.subcategory !== 'non_term')
        const uniNonTerm = uniRows.find(r => r.subcategory === 'non_term')
        if (uniMain) {
            fd.uniFeesAmount = String(uniMain.amount)
            fd.uniFeesFrequency = uniMain.recurrence
            fd.uniFeesNextDate = uniMain.scheduled_date
            fd.uniFeesVariesByTerm = uniMain.term_specific || false
        }
        if (uniNonTerm) {
            fd.uniFeesNonTermAmount = String(uniNonTerm.amount)
            fd.uniFeesVariesByTerm = true
        }
    }

    // Savings & Investments
    const savingsRows = (byCategory['savingsInv'] || []).filter(r => !r.is_removed)
    if (savingsRows.length) {
        expenseSources.push('savings_investments')
        const savMain = savingsRows.find(r => r.subcategory !== 'non_term')
        const savNonTerm = savingsRows.find(r => r.subcategory === 'non_term')
        if (savMain) {
            fd.savingsInvAmount = String(savMain.amount)
            fd.savingsInvFrequency = savMain.recurrence
            fd.savingsInvNextDate = savMain.scheduled_date
            fd.savingsInvVariesByTerm = savMain.term_specific || false
        }
        if (savNonTerm) {
            fd.savingsInvNonTermAmount = String(savNonTerm.amount)
            fd.savingsInvVariesByTerm = true
        }
    }

    // Other expenses (array-based)
    const otherExpenseRows = (byCategory['otherExpense'] || []).filter(r => !r.is_removed)
    if (otherExpenseRows.length) {
        expenseSources.push('other_expense')
        const mainRows = otherExpenseRows.filter(r => r.subcategory !== 'non_term')
        const nonTermRows = otherExpenseRows.filter(r => r.subcategory === 'non_term')
        fd.otherExpenses = mainRows.map((main, idx) => {
            const baseLabel = main.title || 'Other Expense'
            const nonTerm = nonTermRows.find(r => r.title === baseLabel + ' (non-term)')
            return {
                id: `other_expense_${idx}`,
                label: baseLabel,
                amount: String(main.amount),
                frequency: main.recurrence,
                nextDate: main.scheduled_date,
                variesByTerm: main.term_specific || false,
                nonTermAmount: nonTerm ? String(nonTerm.amount) : '',
            }
        })
    }

    // One-off items (is_removed means hidden, not deleted — deleted items are removed from the array)
    const oneOffRows = (byCategory['oneOff'] || [])
    if (oneOffRows.length) {
        fd.oneOffItems = oneOffRows.map(r => ({
            name: r.title,
            amount: String(r.amount),
            date: r.scheduled_date,
            direction: r.direction === 'in' ? 'in' : 'out',
            ...(r.is_removed ? { hidden: true } : {}),
        }))
    }

    // Removed events
    const removedRows = cashflows.filter(r => r.is_removed)
    if (removedRows.length) {
        fd.removedEvents = removedRows.map(r => `${r.category}:${r.scheduled_date}`)
    }

    // Amount overrides (per-payment)
    const overrideRows = cashflows.filter(r => r.subcategory === 'amount_override')
    if (overrideRows.length) {
        fd.amountOverrides = {}
        for (const r of overrideRows) {
            fd.amountOverrides[`${r.category}:${r.scheduled_date}`] = String(r.amount)
        }
    }

    fd.incomeSources = incomeSources
    fd.expenseSources = expenseSources

    return fd
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
