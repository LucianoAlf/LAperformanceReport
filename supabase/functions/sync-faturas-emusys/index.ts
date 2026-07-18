/// <reference lib="deno.ns" />

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  coletarFaturasUnidade,
  GlobalRateLimiter,
  type UnidadeSyncConfig,
} from '../_shared/faturasSync.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EMUSYS_API = 'https://api.emusys.com.br/v1';

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret obrigatorio ausente: ${name}`);
  return value;
};

const EMAILS_SYNC_TECNICO = new Set(
  (Deno.env.get('SYNC_FATURAS_ALLOWED_EMAILS')
    ?? Deno.env.get('SYNC_MATRICULAS_ALLOWED_EMAILS')
    ?? 'lucianoalf.la@gmail.com,hugo@lamusic.com.br')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_FATURAS_ADMIN_TOKEN')?.trim()
  || Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim()
  || '';

const UNIDADES: Record<string, UnidadeSyncConfig> = {
  cg: {
    nome: 'Campo Grande',
    id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
    token: Deno.env.get('EMUSYS_TOKEN_CAMPO_GRANDE')?.trim() || requiredEnv('EMUSYS_TOKEN_CG'),
  },
  recreio: {
    nome: 'Recreio',
    id: '95553e96-971b-4590-a6eb-0201d013c14d',
    token: requiredEnv('EMUSYS_TOKEN_RECREIO'),
  },
  barra: {
    nome: 'Barra',
    id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
    token: requiredEnv('EMUSYS_TOKEN_BARRA'),
  },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return String(error);
};

type AccessResult = {
  denied?: Response;
  isServiceRole: boolean;
  requestedBy: string;
};

async function validarAcessoSync(req: Request): Promise<AccessResult> {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_ADMIN_TOKEN && syncToken && syncToken === SYNC_ADMIN_TOKEN) {
    return { isServiceRole: false, requestedBy: 'sync_admin_token' };
  }

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    return {
      denied: json({ ok: false, erro: 'sync restrito a usuarios tecnicos' }, 403),
      isServiceRole: false,
      requestedBy: 'anonymous',
    };
  }
  if (token === SUPABASE_SERVICE_ROLE_KEY) {
    return { isServiceRole: true, requestedBy: 'service_role' };
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  const email = data.user?.email?.trim().toLowerCase() || '';
  if (error || !email || !EMAILS_SYNC_TECNICO.has(email)) {
    return {
      denied: json({ ok: false, erro: 'sync restrito a usuarios tecnicos' }, 403),
      isServiceRole: false,
      requestedBy: email || 'jwt_invalido',
    };
  }
  return { isServiceRole: false, requestedBy: email };
}

function validateCompetencia(value: unknown) {
  const competencia = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-01$/.test(competencia)) {
    throw new Error('competencia obrigatoria no formato YYYY-MM-01');
  }
  const parsed = new Date(`${competencia}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== competencia) {
    throw new Error('competencia invalida');
  }
  return competencia;
}

function competenciaFromLegacy(body: Record<string, unknown>) {
  if (body.competencia) return validateCompetencia(body.competencia);
  const ano = Number(body.ano);
  const mes = Number(body.mes);
  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) throw new Error('ano invalido');
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error('mes invalido');
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'metodo nao permitido' }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let syncRunId: string | null = null;

  try {
    const access = await validarAcessoSync(req);
    if (access.denied) return access.denied;
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.unidade && String(body.unidade).toLowerCase() !== 'todos') {
      return json({ ok: false, erro: 'sync financeiro exige sempre as 3 unidades' }, 400);
    }
    const competencia = competenciaFromLegacy(body);
    const overrideReason = String(body.override_reason ?? '').trim() || null;
    if (overrideReason && !access.isServiceRole) {
      return json({ ok: false, erro: 'override de sanidade exige service_role' }, 403);
    }

    const { data: startedRun, error: startError } = await supabase.rpc(
      'start_financeiro_sync_run',
      {
        p_competencia: competencia,
        p_trigger_source: String(body.trigger_source ?? 'manual'),
        p_requested_by: access.requestedBy,
        p_stale_timeout_seconds: 1800,
      },
    );
    if (startError) throw startError;
    syncRunId = String(startedRun);

    const limiter = new GlobalRateLimiter();
    const allRows = [];
    const unitsSummary = [];
    for (const [unidadeCodigo, unidade] of Object.entries(UNIDADES)) {
      const collected = await coletarFaturasUnidade({
        apiBaseUrl: EMUSYS_API,
        competencia,
        unidadeCodigo,
        unidade,
        limiter,
      });
      allRows.push(...collected.rows);
      unitsSummary.push(collected.resumo);
    }

    const { data: publishedRun, error: publishError } = await supabase.rpc(
      'publish_financeiro_sync_run',
      {
        p_run_id: syncRunId,
        p_items: allRows,
        p_units_summary: unitsSummary,
        p_override_reason: overrideReason,
      },
    );
    if (publishError) throw publishError;

    return json({
      ok: true,
      sync_run_id: syncRunId,
      competencia,
      resultado: publishedRun,
      unidades: unitsSummary,
    });
  } catch (error) {
    const message = errorMessage(error);
    if (syncRunId) {
      const { error: failError } = await supabase.rpc('fail_financeiro_sync_run', {
        p_run_id: syncRunId,
        p_erro_detalhe: message,
      });
      if (failError) console.error('[sync-faturas-emusys] falha ao registrar erro', failError);
    }
    console.error('[sync-faturas-emusys] erro', error);
    const status = /competencia|ano invalido|mes invalido/i.test(message)
      ? 400
      : (/MUTEX|55P03|running/i.test(message) ? 409 : 500);
    return json({ ok: false, sync_run_id: syncRunId, erro: message }, status);
  }
});
