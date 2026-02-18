import posthog from 'posthog-js'

/**
 * Centralized analytics utility for PostHog tracking
 *
 * Usage:
 *   import { analytics } from './lib/analytics/index.js'
 *   analytics.track('event_name', { property: 'value' })
 */

export const analytics = {
  track: (eventName, properties = {}) => {
    if (!posthog) return

    posthog.capture(eventName, {
      ...properties,
      timestamp: new Date().toISOString(),
      app_version: '1.0.0',
      platform: 'web'
    })

    if (import.meta.env.DEV) {
      console.log('[Analytics] Event:', eventName, properties)
    }
  },

  identify: (userId, traits = {}) => {
    if (!posthog || !userId) return

    posthog.identify(userId, traits)

    if (import.meta.env.DEV) {
      console.log('[Analytics] Identify:', userId, traits)
    }
  },

  setUserProperties: (properties) => {
    if (!posthog) return

    posthog.people.set(properties)

    if (import.meta.env.DEV) {
      console.log('[Analytics] User Properties:', properties)
    }
  },

  page: (name, properties = {}) => {
    if (!posthog) return

    posthog.capture('$pageview', {
      screen_name: name,
      ...properties
    })

    if (import.meta.env.DEV) {
      console.log('[Analytics] Page:', name, properties)
    }
  },

  error: (error, context = {}) => {
    if (!posthog) return

    posthog.captureException(error, {
      ...context,
      error_message: error.message,
      error_stack: error.stack
    })

    if (import.meta.env.DEV) {
      console.error('[Analytics] Error:', error.message, context)
    }
  },

  reset: () => {
    if (!posthog) return

    posthog.reset()

    if (import.meta.env.DEV) {
      console.log('[Analytics] Reset')
    }
  },

}
