/**
 * Cria um client Supabase com service role (acesso admin sem RLS).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function createServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  return createClient(url, key)
}

export function createUserClient(authHeader: string) {
  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
}
