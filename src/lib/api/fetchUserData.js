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

    // Restore hidden sources from metadata row
    const metaRows = byCategory['_meta'] || []
    const hiddenRow = metaRows.find(r => r.type === '_hidden_sources')
    if (hiddenRow) {
        try { fd.hiddenSources = JSON.parse(hiddenRow.title) } catch { }
    }

    // Income sources
    const incomeSources = []
    const expenseSources = []

    // Flex income sources
    const flexIncomeRows = (byCategory['flexIncome'] || []).filter(r => !r.is_removed)
    if (flexIncomeRows.length) {
        const flexIncomeSources = []
        const flexSourceData = fd.flexSourceData || {}
        for (const r of flexIncomeRows) {
            const srcId = r.type // e.g. 'flex_freelance'
            if (!flexIncomeSources.includes(srcId)) flexIncomeSources.push(srcId)
            flexSourceData[srcId] = {
                amount: String(r.amount),
                frequency: r.recurrence || 'monthly',
                startDate: r.scheduled_date || '',
                endDate: r.end_date || '',
            }
        }
        fd.flexIncomeSources = flexIncomeSources
        fd.flexSourceData = flexSourceData
    }

    // Flex expense sources
    const flexExpenseRows = (byCategory['flexExpense'] || []).filter(r => !r.is_removed)
    if (flexExpenseRows.length) {
        const flexExpenseSources = []
        const flexSourceData = fd.flexSourceData || {}
        for (const r of flexExpenseRows) {
            const srcId = r.type
            if (!flexExpenseSources.includes(srcId)) flexExpenseSources.push(srcId)
            flexSourceData[srcId] = {
                amount: String(r.amount),
                frequency: r.recurrence || 'monthly',
                startDate: r.scheduled_date || '',
                endDate: r.end_date || '',
            }
        }
        fd.flexExpenseSources = flexExpenseSources
        fd.flexSourceData = flexSourceData
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

    // Reconstruct new category entries (cat_studentFinance, cat_rent, etc.)
    const CATEGORY_KEY_MAP = {
        cat_studentFinance: 'studentFinanceEntries',
        cat_bursary: 'bursaryEntries',
        cat_job: 'jobEntries',
        cat_familySupport: 'familySupportEntries',
        cat_savingsIncome: 'savingsIncomeEntries',
        cat_sideHustles: 'sideHustlesEntries',
        cat_benefits: 'benefitsEntries',
        cat_otherIncome: 'otherIncomeEntries',
        cat_uniFees: 'uniFeesEntries',
        cat_rent: 'rentEntries',
        cat_bills: 'billsEntries',
        cat_phoneSubscriptions: 'phoneSubscriptionsEntries',
        cat_holidayTrips: 'holidayTripsEntries',
        cat_savingsGoals: 'savingsGoalsEntries',
        cat_predictableTravel: 'predictableTravelEntries',
        cat_bigGifts: 'bigGiftsEntries',
        cat_rentalDeposit: 'rentalDepositEntries',
        cat_insurance: 'insuranceEntries',
        cat_sendingMoneyHome: 'sendingMoneyHomeEntries',
        cat_councilTax: 'councilTaxEntries',
        cat_loanRepayment: 'loanRepaymentEntries',
        cat_graduation: 'graduationEntries',
        cat_otherExpense: 'otherExpenseEntries',
    }
    // Map camelCase catId → snake_case category id (used by INCOME_CATEGORIES/EXPENSE_CATEGORIES)
    const CAT_ID_TO_SOURCE_ID = {
        studentFinance: 'student_finance',
        bursary: 'bursary',
        job: 'job',
        familySupport: 'family_support',
        savingsIncome: 'savings_income',
        sideHustles: 'side_hustles',
        benefits: 'benefits',
        otherIncome: 'other_income',
        uniFees: 'uni_fees',
        rent: 'rent',
        bills: 'bills',
        phoneSubscriptions: 'phone_subscriptions',
        holidayTrips: 'holiday_trips',
        savingsGoals: 'savings_goals',
        predictableTravel: 'predictable_travel',
        bigGifts: 'big_gifts',
        rentalDeposit: 'rental_deposit',
        insurance: 'insurance',
        sendingMoneyHome: 'sending_money_home',
        councilTax: 'council_tax',
        loanRepayment: 'loan_repayment',
        graduation: 'graduation',
        otherExpense: 'other_expense',
    }
    for (const [catKey, formKey] of Object.entries(CATEGORY_KEY_MAP)) {
        const catRows = (byCategory[catKey] || []).filter(r => !r.is_removed)
        if (catRows.length === 0) continue
        // Group by entry: irregular entries have subcategory=month, regular entries are standalone
        // Irregular entries have subcategory set to a month name
        const MONTH_NAMES = ['september', 'october', 'november', 'december', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august']
        const irregularRows = catRows.filter(r => r.subcategory && MONTH_NAMES.includes(r.subcategory))
        const nonTermRows = catRows.filter(r => r.subcategory === 'non_term')
        const regularRows = catRows.filter(r => !MONTH_NAMES.includes(r.subcategory || '') && r.subcategory !== 'non_term')
        const entries = []
        // Regular entries — each row is one entry
        for (const r of regularRows) {
            const nonTerm = nonTermRows.find(nt => nt.recurrence === r.recurrence)
            // Parse metadata from title if JSON
            let meta = {}, label = r.title || ''
            try {
                const parsed = JSON.parse(r.title)
                if (parsed && typeof parsed === 'object' && parsed.n) {
                    label = parsed.n
                    meta = parsed
                }
            } catch { /* not JSON, use as plain label */ }
            entries.push({
                id: meta.eid || `${r.type}_${entries.length}`,
                amount: String(r.amount),
                frequency: meta.af || r.recurrence || 'monthly',
                scheduleFrequency: meta.sf || undefined,
                dayOfWeek: meta.dow || undefined,
                dayOfMonth: meta.dom || undefined,
                nextDate: r.scheduled_date || '',
                endDate: r.end_date || '',
                label,
                months: [],
                dates: {},
                instalmentAmounts: {},
                variesByTerm: meta.vbt || r.term_specific || false,
                nonTermAmount: meta.nta || (nonTerm ? String(nonTerm.amount) : ''),
            })
        }
        // Irregular entries — group months by entry ID (eid)
        if (irregularRows.length > 0) {
            // Parse eid from title metadata to group rows by entry
            const groups = {}
            for (const r of irregularRows) {
                let eid = '_default'
                try {
                    const parsed = JSON.parse(r.title)
                    if (parsed && typeof parsed === 'object' && parsed.eid) eid = parsed.eid
                } catch { /* plain title — single entry */ }
                if (!groups[eid]) groups[eid] = []
                groups[eid].push(r)
            }
            for (const [eid, groupRows] of Object.entries(groups)) {
                const months = []
                const dates = {}
                const instalmentAmounts = {}
                let label = '', meta = {}
                for (const r of groupRows) {
                    if (r.subcategory) {
                        months.push(r.subcategory)
                        dates[r.subcategory] = r.scheduled_date
                        if (Number(r.amount) > 0) instalmentAmounts[r.subcategory] = String(r.amount)
                    }
                    if (!label) {
                        try {
                            const parsed = JSON.parse(r.title)
                            if (parsed && typeof parsed === 'object' && parsed.n) {
                                label = parsed.n
                                meta = parsed
                            }
                        } catch { /* plain title */ }
                    }
                }
                const instValues = Object.values(instalmentAmounts).map(v => Number(v) || 0).filter(v => v > 0)
                // Use per-instalment value if all equal, otherwise leave empty (individual amounts shown separately)
                const allEqual = instValues.length > 0 && instValues.every(v => v === instValues[0])
                const perInstalmentAmount = allEqual ? instValues[0] : 0
                // Restore original amount frequency from metadata
                const origFreq = meta.af || 'irregular'
                const origSf = meta.sf || undefined
                // If original freq was yearly, amount is the total (sum of instalments)
                let entryAmt
                if (origFreq === 'yearly') {
                    const total = instValues.reduce((s, v) => s + v, 0)
                    entryAmt = total > 0 ? String(total) : ''
                } else {
                    entryAmt = perInstalmentAmount > 0 ? String(perInstalmentAmount) : ''
                }
                entries.push({
                    id: eid !== '_default' ? eid : `${groupRows[0].type}_irr`,
                    amount: entryAmt,
                    frequency: origFreq,
                    scheduleFrequency: origSf,
                    nextDate: '',
                    label,
                    months,
                    dates,
                    instalmentAmounts,
                    variesByTerm: meta.vbt || false,
                    nonTermAmount: meta.nta || '',
                })
            }
        }
        if (entries.length > 0) {
            fd[formKey] = entries
            // Also add to incomeSources/expenseSources if not already there
            const catId = catKey.replace('cat_', '')
            const sourceId = CAT_ID_TO_SOURCE_ID[catId] || catId
            const isIncome = ['student_finance', 'bursary', 'job', 'family_support', 'savings_income', 'side_hustles', 'benefits', 'other_income'].includes(sourceId)
            const sourceList = isIncome ? incomeSources : expenseSources
            if (!sourceList.includes(sourceId)) sourceList.push(sourceId)
        }
    }

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
