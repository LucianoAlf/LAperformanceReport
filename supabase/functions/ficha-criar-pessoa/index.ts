// ficha-criar-pessoa — ponte LA Report para o fluxo de candidatas do Super Folha.
// Pessoa e token nascem juntos na RPC; origem estável torna retries idempotentes.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP_URL = 'https://la-performance-report.vercel.app/ficha-tecnica/';
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
  const value = String(data ?? '').trim();
  if (!value) throw new Error(`${name} nao configurado.`);
  return value;
}

const semAcento = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ success: false, error: 'metodo nao permitido' }, 405);

  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const expectedSecret = await getSecret(sb, 'FICHA_SYNC_SECRET');
    const receivedSecret = req.headers.get('x-super-folha-sync-secret')?.trim();
    if (!receivedSecret || receivedSecret !== expectedSecret) return json({ success: false, error: 'nao autorizado' }, 401);

    const body = await req.json().catch(() => ({}));
    const nome = String(body?.nome ?? '').trim();
    const unidadeNome = String(body?.unidade ?? '').trim();
    const origemSistema = String(body?.origem_sistema ?? '').trim();
    const origemRef = String(body?.origem_ref ?? '').trim();
    if (!nome) return json({ success: false, error: 'nome e obrigatorio' }, 400);
    if (!unidadeNome) return json({ success: false, error: 'unidade e obrigatoria' }, 400);
    if (origemSistema !== 'super_folha' || !origemRef) return json({ success: false, error: 'origem_sistema e origem_ref obrigatorios' }, 400);

    const { data: unidades, error: unidadesError } = await sb.from('unidades').select('id, nome');
    if (unidadesError) throw unidadesError;
    const target = semAcento(unidadeNome);
    const unidade = (unidades || []).find((item) => semAcento(item.nome) === target)
      ?? (unidades || []).find((item) => semAcento(item.nome).includes(target) || target.includes(semAcento(item.nome)));
    if (!unidade) return json({ success: false, error: 'unidade nao encontrada', unidades_validas: (unidades || []).map((item) => item.nome) }, 400);

    const { data, error } = await sb.rpc('ficha_criar_pessoa', {
      p_nome: nome,
      p_unidade_id: unidade.id,
      p_whatsapp: String(body?.whatsapp ?? '') || null,
      p_departamento: String(body?.departamento ?? 'Atendimento'),
      p_cargo_contexto: String(body?.cargo_contexto ?? 'ATENDIMENTO'),
      p_situacao: String(body?.situacao ?? 'candidato'),
      p_origem_sistema: origemSistema,
      p_origem_ref: origemRef,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.token || !row?.colaborador_id) throw new Error('RPC nao devolveu token.');

    return json({
      success: true,
      colaborador_id: Number(row.colaborador_id),
      token: String(row.token),
      link: `${APP_URL}?t=${encodeURIComponent(String(row.token))}`,
      unidade: unidade.nome,
      ja_existia: Boolean(row.ja_existia),
    });
  } catch (error) {
    console.error('ficha-criar-pessoa:', error instanceof Error ? error.message : String(error));
    return json({ success: false, error: 'nao foi possivel criar a ficha' }, 500);
  }
});
