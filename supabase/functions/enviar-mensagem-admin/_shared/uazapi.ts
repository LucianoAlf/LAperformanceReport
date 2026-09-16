import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
export interface WhatsAppCreds { caixaId: number; caixaNome: string; provedor: 'uazapi' | 'waha'; baseUrl: string; token: string; wahaUrl?: string; wahaSession?: string; wahaApiKey?: string; }
const WA_FIELDS = 'id,nome,provedor,uazapi_url,uazapi_token,waha_url,waha_session,waha_api_key';
function toWA(row: any): WhatsAppCreds { let u = row.uazapi_url || ''; if (u && !u.startsWith('http')) u = 'https://' + u; return { caixaId: row.id, caixaNome: row.nome, provedor: row.provedor || 'uazapi', baseUrl: u.replace(/\/+$/, ''), token: row.uazapi_token || '', wahaUrl: row.waha_url ? row.waha_url.replace(/\/+$/, '') : undefined, wahaSession: row.waha_session || undefined, wahaApiKey: row.waha_api_key || undefined }; }
export async function getWhatsAppCredentials(supabase: SupabaseClient, opts: any = {}): Promise<WhatsAppCreds> {
  const { funcao, caixaId, unidadeId, departamento } = opts;
  // Filtra por departamento nos fallbacks: garante que o envio nunca use o numero de outro departamento
  const applyDepto = (q: any) => departamento ? q.eq('departamento', departamento) : q;
  // 1) caixaId exato e a fonte de verdade (a caixa que recebeu/criou a conversa)
  if (caixaId) { const { data } = await supabase.from('whatsapp_caixas').select(WA_FIELDS).eq('id', caixaId).eq('ativo', true).maybeSingle(); if (data) return toWA(data); }
  // 2) funcao + unidade + (departamento)
  if (funcao && unidadeId) { const { data } = await applyDepto(supabase.from('whatsapp_caixas').select(WA_FIELDS).eq('ativo', true).eq('unidade_id', unidadeId).in('funcao', [funcao, 'ambos'])).limit(1).maybeSingle(); if (data) return toWA(data); }
  // 3) funcao + (departamento)
  if (funcao) { const { data } = await applyDepto(supabase.from('whatsapp_caixas').select(WA_FIELDS).eq('ativo', true).in('funcao', [funcao, 'ambos'])).limit(1).maybeSingle(); if (data) return toWA(data); }
  // 4) qualquer caixa ativa do departamento
  const { data } = await applyDepto(supabase.from('whatsapp_caixas').select(WA_FIELDS).eq('ativo', true)).limit(1).maybeSingle();
  if (data) return toWA(data);
  throw new Error('Nenhuma caixa WhatsApp ativa encontrada');
}
export function toWahaJid(n: string): string { return n.includes('@') ? n : `${n}@c.us`; }
