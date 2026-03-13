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
  LOGOUT_CLICKED: 'logout_clicked',
  REFERRAL_SIGNUP_STARTED: 'referral_signup_started',
  REFERRAL_SIGNUP_COMPLETED: 'referral_signup_completed'
}

// Onboarding Events
export const ONBOARDING_EVENTS = {
  STARTED: 'onboarding_started',
  STEP_VIEWED: 'onboarding_step_viewed',
  FIELD_COMPLETED: 'onboarding_field_completed',
  STEP_COMPLETED: 'onboarding_step_completed',
  STEP_BACK: 'onboarding_step_back',
  COMPLETED: 'onboarding_completed',
  ERROR: 'onboarding_error'
}

// Settings Events
export const SETTINGS_EVENTS = {
  VIEWED: 'settings_viewed',
  DELETE_ACCOUNT_CLICKED: 'delete_account_clicked',
  ACCOUNT_DELETED: 'account_deleted',
  INVITE_FRIENDS_CLICKED: 'invite_friends_clicked',
  INVITE_SHARED: 'invite_shared'
}

// Support Events
export const MONEY_ADVICE_EVENTS = {
  VIEWED: 'money_advice_viewed',
  BUTTON_CLICKED: 'money_advice_clicked'
}

// Session Events
export const SESSION_EVENTS = {
  STARTED: 'session_started',
}
