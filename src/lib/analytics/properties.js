/**
 * Property helper functions for PostHog tracking
 *
 * These functions generate consistent property objects for events
 */

/**
 * Get common user properties from profile data
 */
export function getUserProperties(profile) {
  if (!profile) return {}

  return {
    university: profile.university || 'unknown',
    currency: profile.currency || 'GBP',
    has_student_loan: !!profile.studentLoan,
    has_bursary: !!profile.bursary,
    weekly_spend_band: profile.weeklySpend || 'unknown',
    balance_range: getBalanceRange(profile.balance),
    savings_range: getSavingsRange(profile.savings)
  }
}

/**
 * Get balance range for privacy-safe tracking
 */
export function getBalanceRange(balance) {
  const num = Number(balance) || 0

  if (num < 0) return 'negative'
  if (num === 0) return 'zero'
  if (num < 100) return '0-100'
  if (num < 500) return '100-500'
  if (num < 1000) return '500-1000'
  if (num < 2000) return '1000-2000'
  if (num < 5000) return '2000-5000'
  return '5000+'
}

/**
 * Get savings range for privacy-safe tracking
 */
export function getSavingsRange(savings) {
  const num = Number(savings) || 0

  if (num === 0) return 'zero'
  if (num < 500) return '0-500'
  if (num < 1000) return '500-1000'
  if (num < 2000) return '1000-2000'
  if (num < 5000) return '2000-5000'
  if (num < 10000) return '5000-10000'
  return '10000+'
}

/**
 * Get onboarding step properties
 */
export function getOnboardingStepProperties(step, totalSteps) {
  return {
    step_id: step.id,
    step_number: step.number || 0,
    step_name: step.heading || 'Unknown',
    step_skipped: !!step.skipped,
    total_steps: totalSteps,
    progress_percentage: totalSteps > 0 ? Math.round((step.number / totalSteps) * 100) : 0
  }
}

/**
 * Get finance field update properties
 */
export function getFinanceFieldProperties(fieldName, oldValue, newValue) {
  return {
    field_name: fieldName,
    field_type: getFieldType(fieldName),
    has_old_value: oldValue !== null && oldValue !== undefined && oldValue !== '',
    has_new_value: newValue !== null && newValue !== undefined && newValue !== '',
    value_changed: oldValue !== newValue
  }
}

/**
 * Determine field type for categorization
 */
function getFieldType(fieldName) {
  if (['balance', 'savings', 'loanAmount', 'bursaryAmount'].includes(fieldName)) {
    return 'monetary'
  }
  if (['instalmentDates', 'loanMonths', 'bursaryDates'].includes(fieldName)) {
    return 'date_array'
  }
  if (['oneOffIncome', 'oneOffExpenses', 'studentLoan', 'bursary'].includes(fieldName)) {
    return 'boolean'
  }
  if (['currency', 'university', 'weeklySpend'].includes(fieldName)) {
    return 'selection'
  }
  return 'other'
}

/**
 * Get student loan properties
 */
export function getStudentLoanProperties(data) {
  if (!data || !data.studentLoan) return {}

  return {
    has_student_loan: true,
    loan_amount: data.loanAmount ? Number(data.loanAmount) : 0,
    uses_exact_dates: !!data.useExactDates,
    instalment_count: data.useExactDates
      ? (data.instalmentDates?.length || 0)
      : (data.loanMonths?.length || 0),
    instalment_months: data.loanMonths || []
  }
}

/**
 * Get bursary properties
 */
export function getBursaryProperties(data) {
  if (!data || !data.bursary) return {}

  return {
    has_bursary: true,
    bursary_amount: data.bursaryAmount ? Number(data.bursaryAmount) : 0,
    instalment_count: data.bursaryDates?.length || 0
  }
}

/**
 * Get one-off transaction properties
 */
export function getOneOffTransactionProperties(items, type) {
  if (!items || !Array.isArray(items)) return {}

  const validItems = items.filter(item => item.amount && item.name)

  return {
    transaction_type: type, // 'income' or 'expense'
    count: validItems.length,
    total_amount: validItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    has_dates: validItems.filter(item => item.date).length,
    missing_dates: validItems.filter(item => !item.date).length
  }
}

/**
 * Get recurring transaction properties
 */
export function getRecurringTransactionProperties(items, type) {
  if (!items || !Array.isArray(items)) return {}

  const validItems = items.filter(item => item.amount && item.name)

  return {
    transaction_type: type, // 'income' or 'expense'
    count: validItems.length,
    total_monthly_amount: validItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    frequency_breakdown: getFrequencyBreakdown(validItems)
  }
}

/**
 * Get frequency breakdown for recurring items
 */
function getFrequencyBreakdown(items) {
  return items.reduce((acc, item) => {
    const freq = item.frequency || 'unknown'
    acc[freq] = (acc[freq] || 0) + 1
    return acc
  }, {})
}

/**
 * Get error properties
 */
export function getErrorProperties(error, context = {}) {
  return {
    error_message: error?.message || 'Unknown error',
    error_type: error?.name || 'Error',
    error_code: error?.code || null,
    error_status: error?.status || null,
    ...context
  }
}

/**
 * Get session properties
 */
export function getSessionProperties() {
  return {
    referrer: document.referrer || 'direct',
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    user_agent: navigator.userAgent,
    language: navigator.language
  }
}

/**
 * Get email domain from email address (for privacy-safe tracking)
 */
export function getEmailDomain(email) {
  if (!email || typeof email !== 'string') return 'unknown'
  const parts = email.split('@')
  return parts.length === 2 ? parts[1] : 'unknown'
}

/**
 * Get time since date (in days)
 */
export function getDaysSince(dateString) {
  if (!dateString) return null

  const date = new Date(dateString)
  const now = new Date()
  const diffTime = Math.abs(now - date)
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}

/**
 * Sanitize properties to remove sensitive data
 */
export function sanitizeProperties(properties) {
  const sanitized = { ...properties }

  // Remove sensitive fields
  const sensitiveFields = [
    'email',
    'password',
    'token',
    'auth',
    'session',
    'api_key',
    'secret'
  ]

  sensitiveFields.forEach(field => {
    delete sanitized[field]
  })

  return sanitized
}
