# PostHog Event Tracking Summary

Last updated: 18 March 2026

## Authentication

| Event | When | Properties |
|-------|------|-----------|
| `signup_started` | User clicks Create account | `email_domain` |
| `signup_completed` | Auth succeeds | — |
| `signup_failed` | Auth error | `error_message` |
| `login_started` | User clicks Log in | `email_domain` |
| `login_completed` | Login succeeds | — |
| `login_failed` | Login error | `error_message` |
| `logout` | User logs out | — |
| `referral_signup_started` | Signup with ref code | `referral_code` |
| `referral_signup_completed` | Referred user completes onboarding | `referral_code` |

## Onboarding

| Event | When | Properties |
|-------|------|-----------|
| `onboarding_started` | First step shown | — |
| `onboarding_step_viewed` | Panel displayed | `step_id`, `step_number` |
| `onboarding_step_completed` | User advances | `step_id`, `step_number` |
| `onboarding_step_back` | User goes back | `step_id` |
| `onboarding_completed` | Final submit | `university`, `currency`, `balance`, `savings`, `weeklySpend`, `studentLoan`, `bursary`, `has_other_income`, `has_one_off_items`, `was_referred` |
| `onboarding_error` | Save fails | `error_message`, `error_type`, `step_id`, `step_number` |

## Dashboard

| Event | When | Properties |
|-------|------|-----------|
| `balance_recorded` | Balance updated (FAB, popup, or inline) | `balance`, `source` |
| `source_added` | Income/expense source added via FAB | `source_id`, `source_type` |
| `source_removed` | Source deleted from dropdown | `source_id`, `source_type` |
| `source_visibility_toggled` | Source eye icon toggled | `source_id`, `visible` |
| `source_expanded` | Source dropdown opened/closed | `source_id`, `expanded` |
| `event_edited` | Dot amount changed via popup | `edit_type`, `event_type` |
| `event_skipped` | Payment skipped via popup | `edit_type`, `event_type`, `date` |
| `event_restored` | Skipped payment restored (single or bulk) | `edit_type`, `date` or `edit_types`, `count` |
| `tab_switched` | Income/Expenses/Insights tab changed | `tab` |
| `graph_event_clicked` | Event dot tapped on graph | `event_type`, `edit_type` |
| `graph_zoomed` | Graph pinch-to-zoom or double-tap zoom | — |
| `graph_scrubbed` | Scrubber activated by sliding on graph line | — |
| `graph_filter_toggled` | Graph filter toggled (expenses/income/history/overdraft/breaks) | `filter`, `visible` |
| `balance_history_toggled` | Balance history visibility toggled (legacy — now covered by `graph_filter_toggled`) | `visible` |
| `flex_source_added` | Flex source (freelance, gifts, etc.) added via FAB | `source_id`, `source_type` |
| `overrides_cleared` | Amount edits cleared for a source | `edit_types`, `count` |
| `breakdown_tapped` | Pie chart segment tapped in Insights | `label`, `type` |
| `one_off_added` | One-off item created | — |
| `one_off_removed` | One-off item deleted | — |
| `weekly_spend_updated` | Weekly spend slider changed | `amount` |
| `overdraft_updated` | Overdraft limit changed | `amount` |

## Settings

| Event | When | Properties |
|-------|------|-----------|
| `settings_viewed` | Settings page opened | — |
| `delete_account_clicked` | Delete account button tapped | — |
| `account_deleted` | Account confirmed deleted | — |
| `invite_friends_clicked` | Share/invite button tapped | — |
| `invite_shared` | Share action completed | `method` |
| `currency_changed` | Currency updated | `currency` |

## Feedback

| Event | When | Properties |
|-------|------|-----------|
| `feedback_viewed` | Feedback page opened | — |
| `feedback_quick_submitted` | Quick 10-question survey submitted | `question_count`, `responses_given` |
| `feedback_form_opened` | Suggestion box interacted with | — |

## PostHog Surveys (Native)

| Survey | Trigger |
|--------|---------|
| Suggestion Box | Feedback page — emoji rating + open text |
| Quick Survey (10 Questions) | Feedback page — 10 Likert-scale questions + NPS |
| Onboarding Survey | Immediately after onboarding completion |
| Open-Ended Survey | 3+ days after onboarding, on dashboard view |
| Graph Survey | 3+ days after onboarding, on graph interaction |

## Other

| Event | When | Properties |
|-------|------|-----------|
| `money_advice_viewed` | Resources page opened | — |
| `money_advice_clicked` | Resource link tapped | `resource_type` |
| `session_started` | App launched | — |

## User Properties (set on identify)

- `university` — selected university
- `currency` — selected currency
- `balance` — current bank balance
- `savings` — savings amount
- `weekly_spend` — weekly spending budget
- `student_loan` — loan amount
- `bursary` — bursary amount
- `has_other_income` — boolean
- `was_referred` — boolean
- `referral_code` — if applicable

## Implementation Files

- **Event constants**: `src/lib/analytics/events.js`
- **Analytics wrapper**: `src/lib/analytics.js` (PostHog `track`, `identify`, `page`, `error`)
- **Survey sequence**: `src/lib/useSurveySequence.js`
- **Dashboard tracking**: `src/screens/Dashboard.jsx`
- **Onboarding tracking**: `src/screens/FinancialOnboardingForm.jsx`
- **Feedback tracking**: `src/screens/FeedbackScreen.jsx`
- **Settings tracking**: `src/screens/SettingsScreen.jsx`
- **Auth tracking**: `src/screens/SignupForm.jsx`
