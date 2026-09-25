/// <reference lib="deno.ns" />

// Compatibility endpoint for the "Atualizar agora" button.
// It no longer reads /matriculas or writes a competing boolean into the journey.
// The only financial refresh path is refresh-contas-receber -> sync queue ->
// complete three-unit snapshot -> get_inadimplencia_canonica.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { autorizarEquipe } from '../_shared/equipeAuthorization.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() || '';
const CONTAS_RECEBER_SECRET = Deno.env.get('SUPER_FOLHA_CONTAS_RECEBER_SECRET')?.trim() || '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

// 25/09/2026: ate aqui bastava QUALQUER usuario logado (verify_jwt=false no gateway e a
// chave anon e publica) — um professor autenticado disparava o refresh financeiro de
// contas a receber. Agora exige usuario ATIVO com perfil admin/unidade, no mesmo padrao
// de enviar-mensagem-admin. Cron (x-sync-token) e service_role seguem.
async function validarAcesso(req: Request): Promise<Response | null> {
  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const resultado = await autorizarEquipe(req, {
    syncAdminToken: SYNC_ADMIN_TOKEN,
    serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
    getUser: async (token) => {
      const { data, error } = await authClient.auth.getUser(token);
      return error || !data.user ? null : { id: data.user.id };
    },
    buscarUsuario: async (authUserId) => {
      const { data } = await authClient
        .from('usuarios')
        .select('perfil, ativo')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      return data;
    },
  });
  if (resultado.ok === false) {
    return json({ ok: false, erro: resultado.erro }, resultado.status);
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, erro: 'metodo nao permitido' }, 405);

  const bloqueio = await validarAcesso(req);
  if (bloqueio) return bloqueio;
  if (!CONTAS_RECEBER_SECRET) {
    return json({ ok: false, erro: 'segredo interno de contas a receber nao configurado' }, 503);
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const response = await fetch(`${SUPABASE_URL}/functions/v1/refresh-contas-receber`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-super-folha-sync-secret': CONTAS_RECEBER_SECRET,
      },
      body: JSON.stringify({
        competencias: Array.isArray(body.competencias) ? body.competencias : undefined,
        competencia: body.competencia,
        include_backlog: body.include_backlog !== false,
      }),
    });
    const payload = await response.json().catch(() => ({
      ok: false,
      erro: `refresh-contas-receber respondeu HTTP ${response.status}`,
    })) as Record<string, unknown>;

    return json({
      ...payload,
      queue_status: payload.queue_status ?? 'error',
      next_attempt_at: payload.next_attempt_at ?? null,
      sync_run_id: payload.sync_run_id ?? null,
    }, response.status);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[atualizar-inadimplencia-emusys]', error);
    return json({
      ok: false,
      queue_status: 'error',
      next_attempt_at: null,
      sync_run_id: null,
      erro: message,
    }, 502);
  }
});
