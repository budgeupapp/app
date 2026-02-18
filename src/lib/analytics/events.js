/**
 * Centralized event name constants for PostHog tracking
 *
 * Naming convention: object_action (e.g., 'onboarding_started', 'finance_updated')
 * Use snake_case for consistency with PostHog conventions
 */

// Authentication Events
export const AUTH_EVENTS = {
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',
  SIGNUP_FAILED: 'signup_failed',
  LOGIN_STARTED: 'login_started',
  LOGIN_COMPLETED: 'login_completed',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  REFERRAL_SIGNUP_STARTED: 'referral_signup_started',
  REFERRAL_SIGNUP_COMPLETED: 'referral_signup_completed'
}

// Onboarding Events
export const ONBOARDING_EVENTS = {
  STARTED: 'onboarding_started',
  STEP_VIEWED: 'onboarding_step_viewed',
  STEP_COMPLETED: 'onboarding_step_completed',
  STEP_BACK: 'onboarding_step_back',
  COMPLETED: 'onboarding_completed',
  ABANDONED: 'onboarding_abandoned',
  ERROR: 'onboarding_error'
}

// Finance Management Events
export const FINANCE_EVENTS = {
  SCREEN_VIEWED: 'finances_screen_viewed',
  EDIT_STARTED: 'finances_edit_started',
  FIELD_UPDATED: 'finances_field_updated',
  SAVED: 'finances_saved',
  SAVE_FAILED: 'finances_save_failed',
  CANCELLED: 'finances_edit_cancelled',
  UNSAVED_WARNING_SHOWN: 'finances_unsaved_warning_shown',
  UNSAVED_CONTINUE_EDITING: 'finances_stay_and_edit',
  UNSAVED_DISCARD: 'finances_discard_changes'
}

// Student Loan & Bursary Events
export const LOAN_EVENTS = {
  STUDENT_LOAN_ADDED: 'student_loan_added',
  STUDENT_LOAN_UPDATED: 'student_loan_updated',
  STUDENT_LOAN_REMOVED: 'student_loan_removed',
  STUDENT_LOAN_INSTALMENT_ADDED: 'student_loan_instalment_added',
  STUDENT_LOAN_INSTALMENT_REMOVED: 'student_loan_instalment_removed',
  STUDENT_LOAN_DATE_MODE_CHANGED: 'student_loan_date_mode_changed',
  BURSARY_ADDED: 'bursary_added',
  BURSARY_UPDATED: 'bursary_updated',
  BURSARY_REMOVED: 'bursary_removed',
  BURSARY_INSTALMENT_ADDED: 'bursary_instalment_added',
  BURSARY_INSTALMENT_REMOVED: 'bursary_instalment_removed'
}

// Income & Expenses Events
export const TRANSACTION_EVENTS = {
  ONE_OFF_INCOME_ADDED: 'one_off_income_added',
  ONE_OFF_INCOME_REMOVED: 'one_off_income_removed',
  ONE_OFF_EXPENSE_ADDED: 'one_off_expense_added',
  ONE_OFF_EXPENSE_REMOVED: 'one_off_expense_removed',
  RECURRING_INCOME_ADDED: 'recurring_income_added',
  RECURRING_INCOME_REMOVED: 'recurring_income_removed',
  RECURRING_EXPENSE_ADDED: 'recurring_expense_added',
  RECURRING_EXPENSE_REMOVED: 'recurring_expense_removed'
}

// Dashboard Events
export const DASHBOARD_EVENTS = {
  VIEWED: 'dashboard_viewed',
  GRAPH_INTERACTED: 'dashboard_graph_interacted',
  FORECAST_VIEWED: 'forecast_viewed',
  FORECAST_VIEW_CHANGED: 'forecast_view_changed',
  SPEND_BAND_VIEWED: 'spend_band_viewed',
  SAFE_TO_SPEND_VIEWED: 'safe_to_spend_viewed'
}

// Settings Events
export const SETTINGS_EVENTS = {
  VIEWED: 'settings_viewed',
  CURRENCY_CHANGED: 'settings_currency_changed',
  UNIVERSITY_CHANGED: 'settings_university_changed',
  BALANCE_UPDATED: 'settings_balance_updated',
  SAVINGS_UPDATED: 'settings_savings_updated',
  DELETE_ACCOUNT_CLICKED: 'delete_account_clicked',
  ACCOUNT_DELETED: 'account_deleted',
  INVITE_FRIENDS_CLICKED: 'invite_friends_clicked',
  INVITE_SHARED: 'invite_shared'
}

// Support Events
export const SUPPORT_EVENTS = {
  MONEY_ADVICE_CLICKED: 'money_advice_clicked'
}

// Referral Events
export const REFERRAL_EVENTS = {
  CODE_VIEWED: 'referral_code_viewed',
  CODE_COPIED: 'referral_code_copied',
  CODE_SHARED: 'referral_code_shared'
}

// Navigation Events
export const NAVIGATION_EVENTS = {
  TAB_CHANGED: 'tab_changed',
  SCREEN_VIEWED: 'screen_viewed'
}

// Error Events
export const ERROR_EVENTS = {
  API_ERROR: 'api_error',
  VALIDATION_ERROR: 'validation_error',
  NETWORK_ERROR: 'network_error',
  UNKNOWN_ERROR: 'unknown_error'
}

// Session Events
export const SESSION_EVENTS = {
  STARTED: 'session_started',
  ENDED: 'session_ended'
}
