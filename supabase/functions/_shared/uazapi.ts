// supabase/functions/_shared/uazapi.ts
// Módulo compartilhado para resolver credenciais UAZAPI da tabela whatsapp_caixas.
// Todas as Edge Functions importam daqui em vez de usar env vars.

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface UazapiCredentials {
  baseUrl: string;
  token: string;
  caixaId: number;
  caixaNome: string;
}

export interface GetCredentialsOptions {
  /** Função desejada: 'agente' | 'sistema' */
  funcao?: string;
  /** ID exato da caixa (tem prioridade sobre funcao) */
  caixaId?: number;
  /** Filtrar por unidade (opcional) */
  unidadeId?: string;
}

/**
 * Resolve credenciais UAZAPI da tabela whatsapp_caixas.
 *
 * Prioridade:
 *  1. caixaId exato
 *  2. funcao + unidadeId (caixa da unidade)
 *  3. funcao only (incluindo 'ambos')
 *  4. Erro se nenhuma caixa ativa encontrada
 */
export async function getUazapiCredentials(
  supabase: SupabaseClient,
  opts: GetCredentialsOptions = {}
): Promise<UazapiCredentials> {
  const { funcao, caixaId, unidadeId } = opts;

  // Tentativa 1: caixaId exato
  if (caixaId) {
    const { data, error } = await supabase
      .from('whatsapp_caixas')
      .select('id, nome, uazapi_url, uazapi_token')
      .eq('id', caixaId)
      .eq('ativo', true)
      .maybeSingle();

    if (error) {
      console.error('[uazapi-shared] Erro ao buscar caixa por ID:', error.message);
    }
    if (data) return toCreds(data);
  }

  // Tentativa 2: funcao + unidadeId (caixa específica da unidade)
  if (funcao && unidadeId) {
    const { data, error } = await supabase
      .from('whatsapp_caixas')
      .select('id, nome, uazapi_url, uazapi_token, funcao')
      .eq('ativo', true)
      .eq('unidade_id', unidadeId)
      .in('funcao', [funcao, 'ambos'])
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[uazapi-shared] Erro ao buscar caixa por funcao+unidade:', error.message);
    }
    if (data) return toCreds(data);
  }

  // Tentativa 3: funcao only (qualquer unidade, incluindo null)
  if (funcao) {
    const { data, error } = await supabase
      .from('whatsapp_caixas')
      .select('id, nome, uazapi_url, uazapi_token, funcao')
      .eq('ativo', true)
      .in('funcao', [funcao, 'ambos'])
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[uazapi-shared] Erro ao buscar caixa por funcao:', error.message);
    }
    if (data) return toCreds(data);
  }

  // Tentativa 4: qualquer caixa ativa (último recurso antes de erro)
  const { data: any_caixa, error: any_error } = await supabase
    .from('whatsapp_caixas')
    .select('id, nome, uazapi_url, uazapi_token')
    .eq('ativo', true)
    .limit(1)
    .maybeSingle();

  if (any_error) {
    console.error('[uazapi-shared] Erro ao buscar qualquer caixa:', any_error.message);
  }
  if (any_caixa) return toCreds(any_caixa);

  // Nenhuma caixa encontrada
  throw new Error(
    `Nenhuma caixa UAZAPI ativa encontrada (funcao=${funcao || 'any'}, unidade=${unidadeId || 'any'})`
  );
}

function toCreds(row: { id: number; nome: string; uazapi_url: string; uazapi_token: string }): UazapiCredentials {
  let baseUrl = row.uazapi_url;
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }
  // Remove trailing slash
  baseUrl = baseUrl.replace(/\/+$/, '');

  return {
    baseUrl,
    token: row.uazapi_token,
    caixaId: row.id,
    caixaNome: row.nome,
  };
}
