import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ ERRO: Variáveis de ambiente do Supabase não configuradas!')
  console.error('Crie um arquivo .env na raiz do projeto com:')
  console.error('VITE_SUPABASE_URL=sua_url_aqui')
  console.error('VITE_SUPABASE_ANON_KEY=sua_chave_aqui')
  throw new Error('Variáveis de ambiente do Supabase não configuradas. Verifique o console para instruções.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/**
 * Detecta se um erro de edge function é relacionado a autenticação.
 * Supabase JS v2 retorna FunctionsRelayError com mensagens variadas.
 */
function isAuthError(error: any): boolean {
  const msg = (error?.message || '').toLowerCase();
  return (
    msg.includes('401') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid jwt') ||
    msg.includes('jwt expired') ||
    msg.includes('relay error') ||
    error?.name === 'FunctionsRelayError'
  );
}

/**
 * Invoke edge function com retry automático em caso de erro de auth.
 * Faz refresh do token e tenta novamente uma vez.
 */
export async function invokeWithRetry<T = any>(
  functionName: string,
  options: Parameters<typeof supabase.functions.invoke>[1] = {},
): Promise<{ data: T | null; error: Error | null }> {
  const { data, error } = await supabase.functions.invoke<T>(functionName, options);

  if (error && isAuthError(error)) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      return { data: null, error };
    }
    // Retry com token renovado
    const retry = await supabase.functions.invoke<T>(functionName, options);
    return { data: retry.data ?? null, error: retry.error ?? null };
  }

  return { data: data ?? null, error: error ?? null };
}
