import { supabase } from '../supabaseClient'

const stripCommas = str =>
    str ? String(str).replace(/,/g, '') : null

/* Map month keys to a default date (1st of that month, current academic year) */
const MONTH_TO_DEFAULT_DATE = {
    september: '2025-09-01',
    october: '2025-10-01',
    november: '2025-11-01',
    december: '2025-12-01',
    january: '2026-01-01',
    february: '2026-02-01',
    march: '2026-03-01',
    april: '2026-04-01',
    may: '2026-05-01',
    june: '2026-06-01',
    july: '2026-07-01',
    august: '2026-08-01'
}

/* Map income type values to display labels */
const INCOME_TYPE_LABELS = {
    'part_time_job': 'Part-time job',
    'family': 'Family support',
    'freelance': 'Freelance work',
    'investments': 'Investments',
    'other': 'Other'
}

/* Map payment type values to display labels */
const PAYMENT_TYPE_LABELS = {
    'rent': 'Rent',
    'bills': 'Bills',
    'subscription': 'Subscription',
    'insurance': 'Insurance',
    'other': 'Other'
}

/* Helper to map frequency to recurrence (matching DB constraint) */
const mapFrequencyToRecurrence = freq => {
    const mapping = {
        'one_off': 'once',
        'once': 'once',
        'weekly': 'weekly',
        'monthly': 'monthly',
        'termly': 'termly',
        'yearly': 'yearly',
        'quarterly': 'monthly', // fallback to monthly
        'other': 'monthly' // fallback to monthly
    }
    return mapping[freq] || 'monthly'
}

export async function saveCashflowForecast(userId, data) {
    const rows = []

    /* --- Student loan (one entry per selected month) --- */
    if (data.studentLoan && data.loanMonths?.length) {
        const monthCount = data.loanMonths.length
        const rawAmount = stripCommas(data.loanAmount)
        const perInstalment =
            rawAmount && monthCount
                ? (Number(rawAmount) / monthCount).toFixed(2)
                : null

        for (const month of data.loanMonths) {
            const exactDate = data.loanDates?.[month]
            const fallbackDate = MONTH_TO_DEFAULT_DATE[month] || null

            rows.push({
                user_id: userId,
                direction: 'in',
                category: 'student_loan',
                title: `Student loan - ${month}`,
                amount: perInstalment,
                currency: 'GBP',
                recurrence: 'yearly',
                scheduled_date: exactDate || fallbackDate,
                end_date: null,
                source: 'manual'
            })
        }
    }

    /* --- Bursary (one entry per payment date) --- */
    if (data.bursary && data.bursaryDates?.length) {
        const dateCount = data.bursaryDates.filter(Boolean).length
        const rawAmount = stripCommas(data.bursaryAmount)
        const perPayment =
            rawAmount && dateCount
                ? (Number(rawAmount) / dateCount).toFixed(2)
                : null

        for (const date of data.bursaryDates) {
            if (!date) continue
            rows.push({
                user_id: userId,
                direction: 'in',
                category: 'bursary',
                title: 'Bursary',
                amount: perPayment,
                currency: 'GBP',
                recurrence: 'yearly',
                scheduled_date: date,
                end_date: null,
                source: 'manual'
            })
        }
    }

    /* --- Other income --- */
    if (data.otherIncome && data.otherIncomeItems?.length) {
        for (const item of data.otherIncomeItems) {
            const amount = stripCommas(item.amount)
            if (!amount) continue
            const categoryLabel = INCOME_TYPE_LABELS[item.type] || 'Other income'
            rows.push({
                user_id: userId,
                direction: 'in',
                category: item.type || 'income',
                title: categoryLabel,
                amount,
                currency: 'GBP',
                recurrence: mapFrequencyToRecurrence(item.frequency),
                scheduled_date: item.date,
                end_date: null,
                source: 'manual'
            })
        }
    }

    /* --- Regular payments (rent, bills, subscriptions, etc.) --- */
    if (data.regularExpense && data.regularExpenseItems?.length) {
        for (const item of data.regularExpenseItems) {
            const amount = stripCommas(item.amount)
            if (!amount) continue
            const categoryLabel = PAYMENT_TYPE_LABELS[item.type] || 'Regular payment'
            rows.push({
                user_id: userId,
                direction: 'out',
                category: item.type || 'bill',
                title: categoryLabel,
                amount,
                currency: 'GBP',
                recurrence: mapFrequencyToRecurrence(item.frequency),
                scheduled_date: item.date || null,
                end_date: null,
                source: 'manual'
            })
        }
    }

    /* --- One-off money in --- */
    if (data.oneOffPayments && data.oneOffIn?.length) {
        for (const item of data.oneOffIn) {
            const amount = stripCommas(item.amount)
            if (!amount) continue
            rows.push({
                user_id: userId,
                direction: 'in',
                category: 'one_off',
                title: item.name || 'One-off income',
                amount,
                currency: 'GBP',
                recurrence: 'once',
                scheduled_date: item.date || null,
                end_date: null,
                source: 'manual'
            })
        }
    }

    /* --- One-off money out --- */
    if (data.oneOffPayments && data.oneOffOut?.length) {
        for (const item of data.oneOffOut) {
            const amount = stripCommas(item.amount)
            if (!amount) continue
            rows.push({
                user_id: userId,
                direction: 'out',
                category: 'one_off',
                title: item.name || 'One-off expense',
                amount,
                currency: 'GBP',
                recurrence: 'once',
                scheduled_date: item.date || null,
                end_date: null,
                source: 'manual'
            })
        }
    }

    if (!rows.length) return

    const { error } = await supabase.from('cashflow_forecast').insert(rows)

    if (error) throw error
}
