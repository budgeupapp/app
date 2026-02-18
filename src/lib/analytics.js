/**
 * Centralized analytics utility for PostHog tracking
 *
 * Usage:
 *   import { analytics } from './lib/analytics/index.js'
 *   analytics.track('event_name', { property: 'value' })
 */

export const analytics = {
  /**
   * Track an event
   * @param {string} eventName - Name of the event
   * @param {object} properties - Event properties
   */
  track: (eventName, properties = {}) => {
    if (typeof window !== 'undefined' && window.posthog) {
      window.posthog.capture(eventName, {
        ...properties,
        timestamp: new Date().toISOString(),
        app_version: '1.0.0',
        platform: 'web'
      })

      // Log in development
      if (process.env.NODE_ENV === 'development') {
        console.log('[Analytics]', eventName, properties)
      }
    }
  },

  /**
   * Identify a user
   * @param {string} userId - User ID
   * @param {object} traits - User traits/properties
   */
  identify: (userId, traits = {}) => {
    if (typeof window !== 'undefined' && window.posthog) {
      window.posthog.identify(userId, traits)

      if (process.env.NODE_ENV === 'development') {
        console.log('[Analytics] Identify:', userId, traits)
      }
    }
  },

  /**
   * Set user properties
   * @param {object} properties - User properties to set
   */
  setUserProperties: (properties) => {
    if (typeof window !== 'undefined' && window.posthog?.people) {
      window.posthog.people.set(properties)

      if (process.env.NODE_ENV === 'development') {
        console.log('[Analytics] Set User Properties:', properties)
      }
    }
  },

  /**
   * Track a page view
   * @param {string} name - Page name
   * @param {object} properties - Page properties
   */
  page: (name, properties = {}) => {
    if (typeof window !== 'undefined' && window.posthog) {
      window.posthog.capture('$pageview', {
        screen_name: name,
        ...properties
      })

      if (process.env.NODE_ENV === 'development') {
        console.log('[Analytics] Page View:', name, properties)
      }
    }
  },

  /**
   * Track an error
   * @param {Error} error - Error object
   * @param {object} context - Additional context
   */
  error: (error, context = {}) => {
    if (typeof window !== 'undefined' && window.posthog) {
      window.posthog.captureException(error, {
        ...context,
        error_message: error.message,
        error_stack: error.stack
      })

      if (process.env.NODE_ENV === 'development') {
        console.error('[Analytics] Error:', error, context)
      }
    }
  },

  /**
   * Reset user session (call on logout)
   */
  reset: () => {
    if (typeof window !== 'undefined' && window.posthog) {
      window.posthog.reset()

      if (process.env.NODE_ENV === 'development') {
        console.log('[Analytics] Reset')
      }
    }
  }
}
