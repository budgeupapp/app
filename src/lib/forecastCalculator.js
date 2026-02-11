import {
    addDays,
    addWeeks,
    addMonths,
    addYears,
    isSameDay,
    isAfter,
    isBefore,
    startOfDay,
    differenceInDays,
    format,
    parseISO
} from 'date-fns'

/**
 * Calculate the next occurrence of a recurring transaction
 */
function getNextOccurrence(date, recurrence, occurrenceCount = 1) {
    const baseDate = parseISO(date)

    switch (recurrence) {
        case 'weekly':
            return addWeeks(baseDate, occurrenceCount)
        case 'monthly':
            return addMonths(baseDate, occurrenceCount)
        case 'termly':
            // Academic terms are roughly every 4 months
            return addMonths(baseDate, occurrenceCount * 4)
        case 'yearly':
            return addYears(baseDate, occurrenceCount)
        case 'once':
        default:
            return null // No next occurrence for one-time transactions
    }
}

/**
 * Generate all transaction occurrences within a date range
 */
function generateOccurrences(transaction, startDate, endDate) {
    const occurrences = []
    const scheduledDate = parseISO(transaction.scheduled_date)

    // If transaction is before our range and not recurring, skip it
    if (isBefore(scheduledDate, startDate) && transaction.recurrence === 'once') {
        return occurrences
    }

    // If transaction is after our range, skip it
    if (isAfter(scheduledDate, endDate)) {
        return occurrences
    }

    if (transaction.recurrence === 'once') {
        // One-time transaction
        if (!isBefore(scheduledDate, startDate) && !isAfter(scheduledDate, endDate)) {
            occurrences.push({
                date: scheduledDate,
                amount: Number(transaction.amount),
                direction: transaction.direction,
                title: transaction.title,
                category: transaction.category
            })
        }
    } else {
        // Recurring transaction
        let currentDate = scheduledDate
        let occurrenceCount = 0
        const maxOccurrences = 1000 // Safety limit

        while (
            !isAfter(currentDate, endDate) &&
            occurrenceCount < maxOccurrences
        ) {
            if (!isBefore(currentDate, startDate)) {
                occurrences.push({
                    date: currentDate,
                    amount: Number(transaction.amount),
                    direction: transaction.direction,
                    title: transaction.title,
                    category: transaction.category
                })
            }

            occurrenceCount++
            const nextDate = getNextOccurrence(transaction.scheduled_date, transaction.recurrence, occurrenceCount)
            if (!nextDate) break
            currentDate = nextDate
        }
    }

    return occurrences
}

/**
 * Calculate daily balance forecast
 * @param {number} startingBalance - User's current bank balance
 * @param {number} savings - User's savings (optional, added to starting balance)
 * @param {Array} cashflowEntries - Array of cashflow_forecast entries from database
 * @param {number} weeklySpending - Average weekly spending amount
 * @param {Date} startDate - Start date for forecast
 * @param {Date} endDate - End date for forecast
 * @returns {Array} Array of {date, balance, transactions} objects
 */
export function calculateForecast(
    startingBalance,
    savings,
    cashflowEntries,
    weeklySpending,
    startDate,
    endDate
) {
    const forecast = []
    const start = startOfDay(startDate)
    const end = startOfDay(endDate)

    // Calculate total starting balance (bank + savings)
    let currentBalance = Number(startingBalance)

    // Generate all transaction occurrences within the date range
    const allOccurrences = []
    cashflowEntries.forEach(entry => {
        const occurrences = generateOccurrences(entry, start, end)
        allOccurrences.push(...occurrences)
    })

    // Sort occurrences by date
    allOccurrences.sort((a, b) => a.date - b.date)

    // Calculate daily spending (weekly spending / 7)
    const dailySpending = weeklySpending ? Number(weeklySpending) / 7 : 0

    // Build forecast day by day
    let currentDate = start
    let occurrenceIndex = 0

    while (!isAfter(currentDate, end)) {
        const dayTransactions = []

        // Apply daily spending (as an outflow)
        if (dailySpending > 0) {
            currentBalance -= dailySpending
            dayTransactions.push({
                title: 'Daily spending',
                amount: dailySpending,
                direction: 'out'
            })
        }

        // Apply any transactions scheduled for this day
        while (
            occurrenceIndex < allOccurrences.length &&
            isSameDay(allOccurrences[occurrenceIndex].date, currentDate)
        ) {
            const occurrence = allOccurrences[occurrenceIndex]
            const amount = occurrence.amount

            if (occurrence.direction === 'in') {
                currentBalance += amount
            } else {
                currentBalance -= amount
            }

            dayTransactions.push(occurrence)
            occurrenceIndex++
        }

        forecast.push({
            date: format(currentDate, 'yyyy-MM-dd'),
            balance: Math.round(currentBalance * 100) / 100, // Round to 2 decimals
            transactions: dayTransactions
        })

        currentDate = addDays(currentDate, 1)
    }
    return forecast
}

/**
 * Analyze forecast for key insights
 */
export function analyzeForecast(forecast) {
    const insights = {
        runOutDate: null,
        lowestBalance: Infinity,
        lowestBalanceDate: null,
        daysUntilNegative: null,
        isHealthy: true
    }

    for (let i = 0; i < forecast.length; i++) {
        const day = forecast[i]

        // Track lowest balance
        if (day.balance < insights.lowestBalance) {
            insights.lowestBalance = day.balance
            insights.lowestBalanceDate = day.date
        }

        // Find first day balance goes negative
        if (day.balance < 0 && !insights.runOutDate) {
            insights.runOutDate = day.date
            insights.daysUntilNegative = i
            insights.isHealthy = false
        }
    }

    return insights
}
