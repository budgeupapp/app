import { supabase } from '../supabaseClient'

const stripCommas = str =>
    str ? String(str).replace(/,/g, '') : null

const MONTH_TO_DEFAULT_DATE = {
    september: '2025-09-01', october: '2025-10-01', november: '2025-11-01', december: '2025-12-01',
    january: '2026-01-01', february: '2026-02-01', march: '2026-03-01', april: '2026-04-01',
    may: '2026-05-01', june: '2026-06-01', july: '2026-07-01', august: '2026-08-01'
}

const mapFrequencyToRecurrence = freq => {
    const mapping = {
        'one_off': 'once', 'once': 'once', 'one-off': 'once',
        'weekly': 'weekly', 'fortnightly': 'fortnightly', 'monthly': 'monthly',
        'termly': 'termly', 'yearly': 'yearly', 'irregular': 'yearly',
        'quarterly': 'quarterly', 'other': 'monthly'
    }
    return mapping[freq] || 'monthly'
}

export async function saveCashflowForecast(userId, data) {
    // Debug: log what data we received
    const entryKeys = Object.keys(data).filter(k => k.endsWith('Entries'))
    const entryCounts = entryKeys.map(k => `${k}: ${(data[k] || []).length}`)
    console.log('[saveCashflow] Called with:', { userId: userId?.slice(0, 8), entryCounts, weeklySpend: data.weeklySpend, incomeSources: data.incomeSources, expenseSources: data.expenseSources })

    // Default start date: 1st September
    const firstTermDate = '2025-09-01'

    const rows = []

    /* --- Weekly spend --- */
    const weeklyAmt = stripCommas(data.weeklySpend)
    if (weeklyAmt) {
        rows.push({
            user_id: userId, direction: 'out', type: 'weeklySpend',
            title: 'Weekly Spend', amount: weeklyAmt, currency: 'GBP',
            recurrence: 'weekly',
            scheduled_date: firstTermDate,
            end_date: null, source: 'manual',
            category: 'weeklySpend',
            term_specific: data.weeklySpendVariesByTerm || false,
        })
        if (data.weeklySpendVariesByTerm && data.weeklySpendNonTerm) {
            rows.push({
                user_id: userId, direction: 'out', type: 'weeklySpend_non_term',
                title: 'Weekly Spend (non-term)', amount: stripCommas(data.weeklySpendNonTerm),
                currency: 'GBP', recurrence: 'weekly',
                scheduled_date: firstTermDate,
                end_date: null, source: 'manual',
                category: 'weeklySpend', subcategory: 'non_term',
                term_specific: true,
            })
        }
    }

    /* --- Flex income sources --- */
    for (const srcId of (data.flexIncomeSources || [])) {
        const srcData = data.flexSourceData?.[srcId]
        if (!srcData) continue
        const amt = stripCommas(srcData.amount) || '0'
        const freq = srcData.frequency || 'monthly'
        rows.push({
            user_id: userId, direction: 'in', type: srcId,
            title: srcId.replace('flex_', '').replace(/_/g, ' '),
            amount: amt, currency: 'GBP',
            recurrence: mapFrequencyToRecurrence(freq),
            scheduled_date: srcData.startDate || '2025-09-01',
            end_date: srcData.endDate || null, source: 'manual',
            category: 'flexIncome',
        })
    }

    /* --- Flex expense sources --- */
    for (const srcId of (data.flexExpenseSources || [])) {
        const srcData = data.flexSourceData?.[srcId]
        if (!srcData) continue
        const amt = stripCommas(srcData.amount) || '0'
        const freq = srcData.frequency || 'monthly'
        rows.push({
            user_id: userId, direction: 'out', type: srcId,
            title: srcId.replace('flex_', '').replace(/_/g, ' '),
            amount: amt, currency: 'GBP',
            recurrence: mapFrequencyToRecurrence(freq),
            scheduled_date: srcData.startDate || '2025-09-01',
            end_date: srcData.endDate || null, source: 'manual',
            category: 'flexExpense',
        })
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
            is_removed: !!item.hidden,
        })
    }

    /* --- Removed events and amount overrides are saved after CATEGORY_FORM_KEYS below --- */
    const _removedEvents = data.removedEvents || []
    const _amountOverrides = data.amountOverrides || {}

    /* --- New category entries (studentFinanceEntries, rentEntries, etc.) --- */
    const CAT_LABELS = {
        studentFinance: 'Student Finance', bursary: 'Bursary', job: 'Job',
        familySupport: 'Family Support', savingsIncome: 'Savings', sideHustles: 'Side Hustle',
        benefits: 'Benefits', otherIncome: 'Other Income',
        uniFees: 'University Fees', rent: 'Rent', bills: 'Bills',
        phoneSubscriptions: 'Subscriptions', holidayTrips: 'Holiday & Trips',
        savingsGoals: 'Savings Goals', predictableTravel: 'Predictable Travel',
        bigGifts: 'Big Gifts', rentalDeposit: 'Rental Deposit', insurance: 'Insurance',
        sendingMoneyHome: 'Sending Money Home', councilTax: 'Council Tax',
        loanRepayment: 'Loan Repayment', graduation: 'Graduation', otherExpense: 'Other Expense',
    }
    const CATEGORY_FORM_KEYS = [
        'studentFinanceEntries', 'bursaryEntries', 'jobEntries', 'familySupportEntries',
        'savingsIncomeEntries', 'sideHustlesEntries', 'benefitsEntries', 'otherIncomeEntries',
        'uniFeesEntries', 'rentEntries', 'billsEntries', 'phoneSubscriptionsEntries',
        'holidayTripsEntries', 'savingsGoalsEntries', 'predictableTravelEntries', 'bigGiftsEntries',
        'rentalDepositEntries', 'insuranceEntries', 'sendingMoneyHomeEntries', 'councilTaxEntries',
        'loanRepaymentEntries', 'graduationEntries', 'otherExpenseEntries',
    ]
    const INCOME_KEYS = ['studentFinanceEntries', 'bursaryEntries', 'jobEntries', 'familySupportEntries', 'savingsIncomeEntries', 'sideHustlesEntries', 'benefitsEntries', 'otherIncomeEntries']
    const isValidDate = (d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d)
    for (const formKey of CATEGORY_FORM_KEYS) {
        const entries = data[formKey]
        if (!Array.isArray(entries) || entries.length === 0) continue
        const catId = formKey.replace('Entries', '')
        const isIncome = INCOME_KEYS.includes(formKey)
        for (const entry of entries) {
            const amt = stripCommas(entry.amount)
            const hasInstalments = entry.instalmentAmounts && Object.values(entry.instalmentAmounts).some(v => Number(stripCommas(String(v))) > 0)
            if (!amt && !entry.months?.length && !hasInstalments) continue
            const amtFreq = entry.frequency || 'monthly'
            const paidFreq = entry.scheduleFrequency || amtFreq
            const freq = paidFreq === 'irregular' ? 'irregular' : paidFreq === 'one-off' ? amtFreq : paidFreq
            // Build metadata for cross-device sync
            const meta = {}
            if (entry.scheduleFrequency) meta.sf = entry.scheduleFrequency
            if (entry.frequency) meta.af = entry.frequency
            if (entry.dayOfWeek && entry.dayOfWeek !== 'monday') meta.dow = entry.dayOfWeek
            if (entry.dayOfMonth && entry.dayOfMonth !== '1') meta.dom = entry.dayOfMonth
            if (entry.variesByTerm) meta.vbt = true
            if (entry.nonTermAmount) meta.nta = entry.nonTermAmount
            if (entry.id && entries.length > 1) meta.eid = entry.id

            const catLabel = entry.label || CAT_LABELS[catId] || catId

            if (freq === 'irregular' && entry.months?.length) {
                // Irregular: save each month as a separate row
                const titleBase = Object.keys(meta).length > 0
                    ? JSON.stringify({ n: catLabel, ...meta })
                    : catLabel
                for (const month of entry.months) {
                    const date = entry.dates?.[month] || MONTH_TO_DEFAULT_DATE[month] || '2025-09-15'
                    const instalmentAmt = entry.instalmentAmounts?.[month]
                    const rowAmt = instalmentAmt ? stripCommas(String(instalmentAmt)) : null
                    rows.push({
                        user_id: userId, direction: isIncome ? 'in' : 'out',
                        type: catId, title: titleBase,
                        amount: rowAmt || '0', currency: 'GBP', recurrence: 'yearly',
                        scheduled_date: date, end_date: null, source: 'manual',
                        category: `cat_${catId}`, subcategory: month,
                    })
                }
            } else {
                const title = Object.keys(meta).length > 0 ? JSON.stringify({ n: catLabel, ...meta }) : catLabel
                rows.push({
                    user_id: userId, direction: isIncome ? 'in' : 'out',
                    type: catId, title,
                    amount: amt || '0', currency: 'GBP',
                    recurrence: mapFrequencyToRecurrence(freq),
                    scheduled_date: isValidDate(entry.nextDate) ? entry.nextDate : firstTermDate,
                    end_date: isValidDate(entry.endDate) ? entry.endDate : null,
                    source: 'manual',
                    category: `cat_${catId}`,
                    term_specific: entry.variesByTerm || false,
                })
                if (entry.variesByTerm && entry.nonTermAmount) {
                    rows.push({
                        user_id: userId, direction: isIncome ? 'in' : 'out',
                        type: `${catId}_non_term`, title: catLabel + ' (non-term)',
                        amount: stripCommas(entry.nonTermAmount), currency: 'GBP',
                        recurrence: mapFrequencyToRecurrence(freq),
                        scheduled_date: isValidDate(entry.nextDate) ? entry.nextDate : firstTermDate,
                        end_date: isValidDate(entry.endDate) ? entry.endDate : null,
                        source: 'manual',
                        category: `cat_${catId}`, subcategory: 'non_term',
                        term_specific: true,
                    })
                }
            }
        }
    }

    /* --- Hidden sources metadata --- */
    const hiddenSources = data.hiddenSources || []
    if (hiddenSources.length > 0) {
        rows.push({
            user_id: userId, direction: 'out', type: '_hidden_sources',
            title: JSON.stringify(hiddenSources),
            amount: 0, currency: 'GBP', recurrence: 'once',
            scheduled_date: '2025-09-01', end_date: null, source: 'manual',
            category: '_meta',
        })
    }

    /* --- Removed events (only save if editType matches a current entry) --- */
    const validEditTypes = new Set()
    for (const fk of CATEGORY_FORM_KEYS) {
        const ents = data[fk]
        if (!Array.isArray(ents) || ents.length === 0) continue
        const cid = fk.replace('Entries', '')
        for (const ent of ents) {
            if (!stripCommas(ent.amount) && !ent.months?.length) continue
            validEditTypes.add(ent.id ? `${cid}:${ent.id}` : cid)
        }
        validEditTypes.add(cid)
    }
    for (const srcId of [...(data.flexIncomeSources || []), ...(data.flexExpenseSources || [])]) validEditTypes.add(srcId)
    if (data.weeklySpend) validEditTypes.add('weeklySpend')

    if (_removedEvents.length) {
        for (const key of _removedEvents) {
            const parts = key.split(':')
            const date = parts.pop()
            const editType = parts.join(':')
            if (!editType || !date) continue
            if (!validEditTypes.has(editType)) continue
            rows.push({
                user_id: userId, direction: 'out', type: editType,
                title: `Removed: ${editType}`, amount: 0,
                currency: 'GBP', recurrence: 'once',
                scheduled_date: date, end_date: null, source: 'manual',
                category: editType, is_removed: true,
            })
        }
    }

    /* --- Amount overrides (only save if editType matches a current entry) --- */
    for (const [key, val] of Object.entries(_amountOverrides)) {
        const parts = key.split(':')
        const date = parts.pop()
        const editType = parts.join(':')
        if (!editType || !date || !val) continue
        if (!validEditTypes.has(editType)) continue
        rows.push({
            user_id: userId, direction: 'out', type: editType,
            title: `Override: ${editType}`, amount: stripCommas(val) || 0,
            currency: 'GBP', recurrence: 'once',
            scheduled_date: date, end_date: null, source: 'manual',
            category: editType, subcategory: 'amount_override',
        })
    }

    // Sanitize all date fields to prevent invalid date errors
    for (const row of rows) {
        if (row.scheduled_date && !/^\d{4}-\d{2}-\d{2}/.test(row.scheduled_date)) {
            row.scheduled_date = '2025-09-01'
        }
        if (row.end_date && !/^\d{4}-\d{2}-\d{2}/.test(row.end_date)) {
            row.end_date = null
        }
    }

    // Safety: count existing rows before deleting — never wipe if new data is empty
    const { count: rawCount, error: countError } = await supabase
        .from('cashflow_forecast')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('source', 'manual')

    const existingCount = countError ? 0 : (rawCount || 0)

    if (!rows.length && existingCount > 0) {
        console.warn('[saveCashflow] Refusing to delete', existingCount, 'existing rows with 0 new rows — data would be wiped')
        return
    }

    // Only delete existing rows if we have new rows to replace them (or DB is already empty)
    if (existingCount > 0) {
        const { error: delError } = await supabase
            .from('cashflow_forecast')
            .delete()
            .eq('user_id', userId)
            .eq('source', 'manual')
        if (delError) throw delError
    }

    if (!rows.length) return

    console.log(`[saveCashflow] Saving ${rows.length} rows (replaced ${existingCount || 0})`)
    const { error } = await supabase.from('cashflow_forecast').insert(rows)
    if (error) {
        console.error('[saveCashflow] Insert failed:', error.message, error.details, error.hint)
        throw error
    }
}
