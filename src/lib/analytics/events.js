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
  STEP_COMPLETED: 'onboarding_step_completed',
  STEP_BACK: 'onboarding_step_back',
  COMPLETED: 'onboarding_completed',
  ERROR: 'onboarding_error'
}

// Dashboard Events
export const DASHBOARD_EVENTS = {
  BALANCE_RECORDED: 'balance_recorded',
  SOURCE_ADDED: 'source_added',
  SOURCE_REMOVED: 'source_removed',
  SOURCE_VISIBILITY_TOGGLED: 'source_visibility_toggled',
  SOURCE_EXPANDED: 'source_expanded',
  ONE_OFF_ADDED: 'one_off_added',
  ONE_OFF_REMOVED: 'one_off_removed',
  WEEKLY_SPEND_UPDATED: 'weekly_spend_updated',
  OVERDRAFT_UPDATED: 'overdraft_updated',
  EVENT_EDITED: 'event_edited',
  EVENT_SKIPPED: 'event_skipped',
  EVENT_RESTORED: 'event_restored',
  TAB_SWITCHED: 'tab_switched',
  BALANCE_HISTORY_TOGGLED: 'balance_history_toggled',
  GRAPH_EVENT_CLICKED: 'graph_event_clicked',
  GRAPH_ZOOMED: 'graph_zoomed',
  GRAPH_SCRUBBED: 'graph_scrubbed',
  GRAPH_FILTER_TOGGLED: 'graph_filter_toggled',
  FLEX_SOURCE_ADDED: 'flex_source_added',
  FLEX_SOURCE_REMOVED: 'flex_source_removed',
  OVERRIDES_CLEARED: 'overrides_cleared',
  BREAKDOWN_TAPPED: 'breakdown_tapped',
}

// Settings Events
export const SETTINGS_EVENTS = {
  VIEWED: 'settings_viewed',
  DELETE_ACCOUNT_CLICKED: 'delete_account_clicked',
  ACCOUNT_DELETED: 'account_deleted',
  INVITE_FRIENDS_CLICKED: 'invite_friends_clicked',
  INVITE_SHARED: 'invite_shared',
  CURRENCY_CHANGED: 'currency_changed',
}

// Feedback Events
export const FEEDBACK_EVENTS = {
  VIEWED: 'feedback_viewed',
  QUICK_SUBMITTED: 'feedback_quick_submitted',
  FORM_OPENED: 'feedback_form_opened',
}

// Support Events
export const MONEY_ADVICE_EVENTS = {
  VIEWED: 'money_advice_viewed',
  BUTTON_CLICKED: 'money_advice_clicked'
}

// Screen View Events
export const SCREEN_EVENTS = {
  DASHBOARD_VIEWED: 'screen_dashboard_viewed',
  SETTINGS_VIEWED: 'screen_settings_viewed',
  FEEDBACK_VIEWED: 'screen_feedback_viewed',
  SUPPORT_VIEWED: 'screen_support_viewed',
  ONBOARDING_VIEWED: 'screen_onboarding_viewed',
  SIGNUP_VIEWED: 'screen_signup_viewed',
  LOGIN_VIEWED: 'screen_login_viewed',
}

// Session Events
export const SESSION_EVENTS = {
  STARTED: 'session_started',
}
