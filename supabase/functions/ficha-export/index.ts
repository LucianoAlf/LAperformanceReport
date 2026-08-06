import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-super-folha-sync-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function getSecret(admin: SupabaseClient, name: string) {
  const fromEnv = Deno.env.get(name)?.trim();
  if (fromEnv) return fromEnv;
  const { data, error } = await admin.rpc('get_vault_secret', { secret_name: name });
  if (error) throw error;
  const fromVault = String(data ?? '').trim();
  if (!fromVault) throw new Error(`${name} nao configurado em Secrets ou Vault.`);
  return fromVault;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ success: false, error: 'metodo nao permitido' }, 405);
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const esperado = await getSecret(sb, 'FICHA_SYNC_SECRET');
    if (req.headers.get('x-super-folha-sync-secret')?.trim() !== esperado) return json({ success: false, error: 'nao autorizado' }, 401);
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? '').trim();
    let colaboradorId: number | null = Number.isFinite(Number(body?.colaborador_id)) ? Number(body.colaborador_id) : null;
    if (!colaboradorId && token) {
      const { data: tk, error } = await sb.from('ficha_tokens').select('colaborador_id, ativo').eq('token', token).maybeSingle();
      if (error) throw error;
      if (!tk || !tk.ativo) return json({ success: false, error: 'token invalido' }, 404);
      colaboradorId = tk.colaborador_id;
    }
    if (!colaboradorId) return json({ success: false, error: 'informe colaborador_id ou token' }, 400);
    const { data: pessoa, error: e1 } = await sb.from('colaboradores').select('id, nome, apelido, cargo, departamento, situacao').eq('id', colaboradorId).maybeSingle();
    if (e1) throw e1;
    if (!pessoa) return json({ success: false, error: 'pessoa nao encontrada' }, 404);
    const { data: teste } = await sb.from('professor_perfil_testes').select('temperamento_primario, temperamento_secundario, temperamento_codinome, temperamento_contagem, valorizacao_primaria, valorizacao_secundaria, valorizacao_contagem, valores_primario, valores_secundario, valores_sacrificado, valores_contagem, cargo_contexto, concluido_em').eq('colaborador_id', colaboradorId).order('concluido_em', { ascending: false }).limit(1).maybeSingle();
    const { data: rider } = await sb.from('colaborador_rider').select('respostas, versao, preenchido_em, updated_at').eq('colaborador_id', colaboradorId).maybeSingle();
    const respostas: Record<string, string> = {};
    for (const [key, value] of Object.entries(rider?.respostas ?? {})) if (typeof value === 'string' && value.trim().length >= 3) respostas[key] = value.trim();
    return json({ success: true, ficha: {
      pessoa: { colaborador_id: pessoa.id, nome: pessoa.nome, apelido: pessoa.apelido, cargo: pessoa.cargo, departamento: pessoa.departamento, situacao: pessoa.situacao },
      respondeu: Boolean(teste), cargo_contexto: teste?.cargo_contexto ?? null, concluido_em: teste?.concluido_em ?? null,
      perfil: teste ? { primario: teste.temperamento_primario, secundario: teste.temperamento_secundario, codinome: teste.temperamento_codinome, contagem: teste.temperamento_contagem } : null,
      reconhecimento: teste ? { primario: teste.valorizacao_primaria, secundario: teste.valorizacao_secundaria, contagem: teste.valorizacao_contagem } : null,
      valores: teste?.valores_primario ? { primario: teste.valores_primario, secundario: teste.valores_secundario, sacrificado: teste.valores_sacrificado, contagem: teste.valores_contagem } : null,
      rider: { preenchido: Object.keys(respostas).length > 0, atualizado_em: rider?.updated_at ?? null, respostas },
    }});
  } catch (error) {
    console.error('ficha-export:', error);
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
