/**
 * Main analytics export
 *
 * Usage:
 *   import { analytics, AUTH_EVENTS, getUserProperties } from '@/lib/analytics/index.js'
 *
 *   analytics.track(AUTH_EVENTS.LOGIN_COMPLETED, getUserProperties(profile))
 */

export { analytics } from '../analytics'
export * from './events'
export * from './properties'
