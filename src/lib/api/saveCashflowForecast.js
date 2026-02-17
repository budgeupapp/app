import { supabase } from '../supabaseClient'

const stripCommas = str =>
    str ? String(str).replace(/,/g, '') : null

/* Map month keys to a default date (15th of that month, current academic year) */
const MONTH_TO_DEFAULT_DATE = {
    september: '2025-09-15',
    october: '2025-10-15',
    november: '2025-11-15',
    december: '2025-12-15',
    january: '2026-01-15',
    february: '2026-02-15',
    march: '2026-03-15',
    april: '2026-04-15',
    may: '2026-05-15',
    june: '2026-06-15',
    july: '2026-07-15',
    august: '2026-08-15'
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

    /* --- Student loan --- */
    if (data.studentLoan) {
        const rawAmount = stripCommas(data.loanAmount)

        // If user knows exact dates, use instalmentDates array
        if (data.loanKnowDates && data.instalmentDates?.length) {
            const validDates = data.instalmentDates.filter(Boolean)
            const dateCount = validDates.length
            const totalAmount = Number(rawAmount)
            const perInstalment = rawAmount && dateCount
                ? Number((totalAmount / dateCount).toFixed(2))
                : null

            validDates.forEach((date, idx) => {
                // For the last instalment, calculate to ensure sum equals total
                const amount = idx === validDates.length - 1
                    ? (totalAmount - (perInstalment * idx)).toFixed(2)
                    : perInstalment.toFixed(2)

                rows.push({
                    user_id: userId,
                    direction: 'in',
                    type: 'student_loan',
                    title: `Student loan - instalment ${idx + 1}`,
                    amount,
                    currency: 'GBP',
                    recurrence: 'yearly',
                    scheduled_date: date,
                    end_date: null,
                    source: 'manual'
                })
            })
        }
        // Otherwise, use loanMonths with default dates
        else if (!data.loanKnowDates && data.loanMonths?.length) {
            const monthCount = data.loanMonths.length
            const totalAmount = Number(rawAmount)
            const perInstalment = rawAmount && monthCount
                ? Number((totalAmount / monthCount).toFixed(2))
                : null

            data.loanMonths.forEach((month, idx) => {
                const exactDate = data.loanDates?.[month]
                const fallbackDate = MONTH_TO_DEFAULT_DATE[month] || null

                // For the last instalment, calculate to ensure sum equals total
                const amount = idx === data.loanMonths.length - 1
                    ? (totalAmount - (perInstalment * idx)).toFixed(2)
                    : perInstalment.toFixed(2)

                rows.push({
                    user_id: userId,
                    direction: 'in',
                    type: 'student_loan',
                    title: `Student loan - ${month.charAt(0).toUpperCase() + month.slice(1)}`,
                    amount,
                    currency: 'GBP',
                    recurrence: 'yearly',
                    scheduled_date: exactDate || fallbackDate,
                    end_date: null,
                    source: 'manual'
                })
            })
        }
    }

    /* --- Bursary (one entry per payment date) --- */
    if (data.bursary && data.bursaryDates?.length) {
        const validDates = data.bursaryDates.filter(Boolean)
        const dateCount = validDates.length
        const rawAmount = stripCommas(data.bursaryAmount)
        const totalAmount = Number(rawAmount)
        const perPayment =
            rawAmount && dateCount
                ? Number((totalAmount / dateCount).toFixed(2))
                : null

        validDates.forEach((date, idx) => {
            // For the last payment, calculate to ensure sum equals total
            const amount = idx === validDates.length - 1
                ? (totalAmount - (perPayment * idx)).toFixed(2)
                : perPayment.toFixed(2)

            rows.push({
                user_id: userId,
                direction: 'in',
                type: 'bursary',
                title: 'Bursary',
                amount,
                currency: 'GBP',
                recurrence: 'yearly',
                scheduled_date: date,
                end_date: null,
                source: 'manual'
            })
        })
    }

    /* --- Other income --- */
    if (data.otherIncome && data.otherIncomeItems?.length) {
        for (const item of data.otherIncomeItems) {
            const amount = stripCommas(item.amount)
            if (!amount) continue
            const typeLabel = INCOME_TYPE_LABELS[item.type] || 'Other income'
            rows.push({
                user_id: userId,
                direction: 'in',
                type: item.type || 'income',
                title: typeLabel,
                amount,
                currency: 'GBP',
                recurrence: mapFrequencyToRecurrence(item.frequency),
                scheduled_date: item.date,
                end_date: item.endDate || null,
                source: 'manual'
            })
        }
    }

    /* --- Regular payments (rent, bills, subscriptions, etc.) --- */
    if (data.regularExpense && data.regularExpenseItems?.length) {
        for (const item of data.regularExpenseItems) {
            const amount = stripCommas(item.amount)
            if (!amount) continue
            const typeLabel = PAYMENT_TYPE_LABELS[item.type] || 'Regular payment'
            rows.push({
                user_id: userId,
                direction: 'out',
                type: item.type || 'bill',
                title: typeLabel,
                amount,
                currency: 'GBP',
                recurrence: mapFrequencyToRecurrence(item.frequency),
                scheduled_date: item.date || null,
                end_date: item.endDate || null,
                source: 'manual'
            })
        }
    }

    /* --- One-off money in --- */
    if (data.oneOffIncome && data.oneOffIn?.length) {
        for (const item of data.oneOffIn) {
            const amount = stripCommas(item.amount)
            if (!amount) continue
            rows.push({
                user_id: userId,
                direction: 'in',
                type: 'one_off',
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
    if (data.oneOffExpenses && data.oneOffOut?.length) {
        for (const item of data.oneOffOut) {
            const amount = stripCommas(item.amount)
            if (!amount) continue
            rows.push({
                user_id: userId,
                direction: 'out',
                type: 'one_off',
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
