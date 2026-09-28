/// <reference lib="deno.ns" />

// export-kpis-mensais: indicadores canônicos por unidade/mês para o Super Folha.
// Contrato: Docs/handoffs/2026-09-28-kpis-canonicos-superfolha.md (aceite SF 28/09).
//
// POST { competencia: "YYYY-MM" | "YYYY-MM-01", unidade_id?: uuid }
// Header: x-super-folha-sync-secret
//
// Núcleo: RPC kpis_mensais_export_v1 (banco). A edge só autentica, valida,
// aplica HMAC no telefone do professor (nunca devolve o número cru) e embala
// o manifesto com hash da resposta.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Segredo dedicado do export de KPIs; enquanto não provisionado, aceita o
// segredo já combinado do export de contas a receber (mesmo destinatário).
const INTERNAL_SECRET = (
  Deno.env.get('SUPER_FOLHA_KPIS_SECRET') ??
  Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET') ??
  ''
).trim();

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function parseCompetencia(value: unknown) {
  const raw = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})(?:-01)?$/.exec(raw);
  if (!match) return null;
  const ano = Number(match[1]);
  const mes = Number(match[2]);
  if (ano < 2020 || ano > 2100 || mes < 1 || mes > 12) return null;
  return { ano, mes, competencia: `${match[1]}-${match[2]}-01` };
}

async function hmacFone(foneNorm: string, secret: string) {
  const digits = foneNorm.replace(/\D/g, '');
  if (!digits) return null;
  const e164 = digits.length <= 11 ? `55${digits}` : digits;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`professor-fone-v1:${e164}`),
  );
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

serve(async (request) => {
  if (request.method !== 'POST') return json({ success: false, erro: 'metodo nao permitido' }, 405);
  if (!INTERNAL_SECRET) return json({ success: false, erro: 'segredo interno nao configurado' }, 503);
  const supplied = request.headers.get('x-super-folha-sync-secret')?.trim() ?? '';
  if (!supplied || !safeEqual(supplied, INTERNAL_SECRET)) {
    return json({ success: false, erro: 'acesso negado' }, 403);
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const competencia = parseCompetencia(body.competencia);
    if (!competencia) {
      return json({ success: false, erro: 'competencia deve ser YYYY-MM ou YYYY-MM-01' }, 400);
    }
    const unidadeId = body.unidade_id == null ? null : String(body.unidade_id).trim();
    if (unidadeId && !UUID_PATTERN.test(unidadeId)) {
      return json({ success: false, erro: 'unidade_id deve ser UUID quando informada' }, 400);
    }

    const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.rpc('kpis_mensais_export_v1', {
      p_unidade_id: unidadeId,
      p_ano: competencia.ano,
      p_mes: competencia.mes,
    });
    if (error) throw error;

    const resultado = (data ?? {}) as Record<string, unknown>;
    const linhas = Array.isArray(resultado.linhas) ? resultado.linhas : [];
    const professoresRaw = Array.isArray(resultado.professores) ? resultado.professores : [];

    // HMAC do telefone; o número cru sai da resposta aqui.
    const professores = await Promise.all(professoresRaw.map(async (row) => {
      const item = { ...(row as Record<string, unknown>) };
      const fone = String(item.fone_norm ?? '');
      item.professor_fone_hmac = await hmacFone(fone, INTERNAL_SECRET);
      delete item.fone_norm;
      return item;
    }));

    const payload = { competencia: resultado.competencia, linhas, professores };
    const manifesto = {
      competencia: resultado.competencia ?? competencia.competencia,
      gerado_em: resultado.gerado_em ?? new Date().toISOString(),
      unidades: linhas.length,
      professores: professores.length,
      contrato: 'kpis-mensais-v1',
      fonte: 'kpis_mensais_export_v1',
      payload_sha256: await sha256Hex(JSON.stringify(payload)),
      notas: [
        'status_fechamento: fechado (snapshot maior versao) | legado (dados_mensais pre-08/08, jan-mai/2026) | aberto (RPC viva).',
        'novos_alunos = pessoas novas (distinct pessoa_key); novas_matriculas = linhas de matricula criadas, inclui 2o curso.',
        'horas: sessao dedupada por (unidade, professor, inicio, sala, curso) — linhas individual irmaos de turma contam uma vez.',
        'professor_fone_hmac = HMAC-SHA256("professor-fone-v1:"+telefone E164) com o segredo compartilhado.',
      ],
    };
    return json({ success: true, manifesto, linhas, professores });
  } catch (error) {
    console.error('[export-kpis-mensais]', error);
    const message = error instanceof Error
      ? error.message
      : (error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error));
    return json({ success: false, erro: message }, 500);
  }
});
