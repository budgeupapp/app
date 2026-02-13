import { supabase } from '../supabaseClient'
import { POLICY_VERSIONS } from '../policyVersions'

export async function saveSignupConsents(userId) {
  // Check for existing active consents to avoid duplicates
  const { data: existing } = await supabase
    .from('user_consents')
    .select('id')
    .eq('user_id', userId)
    .is('revoked_at', null)

  if (existing && existing.length > 0) {
    return { alreadyExists: true }
  }

  // Insert terms + privacy consents
  const rows = [
    {
      user_id: userId,
      provider: 'budgeup',
      scope: 'terms',
      policy_version: POLICY_VERSIONS.terms,
      granted_at: new Date().toISOString()
    },
    {
      user_id: userId,
      provider: 'budgeup',
      scope: 'privacy',
      policy_version: POLICY_VERSIONS.privacy,
      granted_at: new Date().toISOString()
    }
  ]

  const { error } = await supabase
    .from('user_consents')
    .insert(rows)

  if (error) {
    console.error('Error saving signup consents:', error)
    return { error }
  }

  return { success: true }
}
