import { useEffect } from 'react'
import posthog from 'posthog-js'

const SURVEY_IDS = {
  onboarding: '019cdce8-6017-0000-b093-3245533e0f81',
  open: '019cdce4-4b7f-0000-bbcf-97c75b0a8944',
  graph: '019cdcfd-5db3-0000-e4a7-8c6dcaa2d048',
}

const LS_KEYS = {
  onboarding: 'budgeup_survey_onboarding_at',
  open: 'budgeup_survey_open_at',
  graph: 'budgeup_survey_graph_at',
}

function minutesSince(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60)
}

function daysSince(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / (1000 * 60 * 60 * 24)
}

function markAnswered(key) {
  const ts = new Date().toISOString()
  localStorage.setItem(key, ts)
  try { posthog.setPersonProperties({ [key]: ts }) } catch { /* ignore */ }
}

function getTimestamp(key) {
  return localStorage.getItem(key) || null
}

// Determine which survey ID should be shown (if any)
function getTargetSurveyId() {
  const onboardingAt = getTimestamp(LS_KEYS.onboarding)
  const openAt = getTimestamp(LS_KEYS.open)
  const graphAt = getTimestamp(LS_KEYS.graph)

  if (!onboardingAt) return SURVEY_IDS.onboarding
  if (!openAt && daysSince(onboardingAt) >= 3) return SURVEY_IDS.open
  if (!graphAt && openAt && daysSince(openAt) >= 3) return SURVEY_IDS.graph
  return null
}

export function useSurveySequence() {
  useEffect(() => {
    const originalCapture = posthog.capture?.bind(posthog)
    if (!originalCapture) return

    posthog.capture = function (eventName, properties, ...rest) {
      // Track survey completions
      if (eventName === 'survey sent' && properties?.$survey_id) {
        const surveyId = properties.$survey_id
        if (surveyId === SURVEY_IDS.onboarding) markAnswered(LS_KEYS.onboarding)
        else if (surveyId === SURVEY_IDS.open) markAnswered(LS_KEYS.open)
        else if (surveyId === SURVEY_IDS.graph) markAnswered(LS_KEYS.graph)
      }

      // Gate open-ended survey: fire when user opens dashboard 3+ days after onboarding
      if (eventName === 'dashboard_viewed') {
        const onboardingAt = getTimestamp(LS_KEYS.onboarding)
        const openAt = getTimestamp(LS_KEYS.open)
        if (onboardingAt && !openAt && daysSince(onboardingAt) >= 1) {
          originalCapture('survey_open_eligible', properties, ...rest)
        }
      }

      // Gate graph survey: fire when user interacts with graph 3+ days after onboarding
      if (eventName === 'dashboard_graph_interacted') {
        const onboardingAt = getTimestamp(LS_KEYS.onboarding)
        const graphAt = getTimestamp(LS_KEYS.graph)
        if (onboardingAt && !graphAt && daysSince(onboardingAt) >= 3) {
          originalCapture('survey_graph_eligible', properties, ...rest)
        }
      }

      return originalCapture(eventName, properties, ...rest)
    }

    return () => {
      posthog.capture = originalCapture
    }
  }, [])
}
