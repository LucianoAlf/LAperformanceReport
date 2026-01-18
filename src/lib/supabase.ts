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
