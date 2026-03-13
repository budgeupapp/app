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
    weekly_spend: profile.weeklySpend || 'unknown',
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

