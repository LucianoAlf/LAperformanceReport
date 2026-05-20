// supabase/functions/auditor-divergencias-emusys/index.ts
//
// Auditor periódico de divergências em webhooks Emusys.
// Varre tabelas leads/lead_experimentais/alunos com queries SQL idempotentes.
// Grava em automacao_log + automacao_invariantes.
//
// Disparo:
//   - pg_cron horário (trigger='cron')
//   - botão manual no frontend (trigger='manual', user_id=auth.uid())

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { gravarLog, type Invariante, type Severidade } from './_shared/invariantes.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Trigger = 'cron' | 'manual';

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

type Regra = {
  regra: string;
  severidade: Severidade;
  evento: string;
  acao: string;
  sql: string;
  construirMensagem: (row: Row) => string;
  construirIdempotencyKey: (row: Row) => string;
  construirLog: (row: Row) => {
    aluno_nome: string;
    aluno_id?: number | null;
    lead_id?: number | null;
    unidade_nome?: string | null;
  };
};

// As regras concretas serão adicionadas nas Tasks 6-8
const REGRAS: Regra[] = [];

serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: { trigger?: Trigger; user_id?: string | null } = {};
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { /* body opcional */ }
  }
  const trigger: Trigger = body.trigger ?? 'cron';
  const user_id = body.user_id ?? null;

  const t0 = Date.now();
  let totalDetectado = 0;
  let totalNovo = 0;
  const erros: Array<{ regra: string; erro: string }> = [];

  for (const regra of REGRAS) {
    try {
      const { data: rows, error } = await supabase.rpc('executar_query_auditoria', {
        p_sql: regra.sql,
      });
      if (error) {
        erros.push({ regra: regra.regra, erro: error.message });
        continue;
      }
      const lista: Row[] = (rows as Row[]) ?? [];
      totalDetectado += lista.length;

      for (const row of lista) {
        const idempotency_key = regra.construirIdempotencyKey(row);
        const meta = regra.construirLog(row);
        const invariante: Invariante = {
          regra: regra.regra,
          severidade: regra.severidade,
          mensagem: regra.construirMensagem(row),
        };

        // Checagem manual de idempotência (antes de chamar gravarLog)
        const antes = await supabase
          .from('automacao_log')
          .select('id')
          .eq('idempotency_key', idempotency_key)
          .limit(1)
          .maybeSingle();
        if (antes.data) continue;

        await gravarLog(supabase, {
          evento: regra.evento,
          acao: regra.acao,
          aluno_nome: meta.aluno_nome,
          aluno_id: meta.aluno_id ?? undefined,
          lead_id: meta.lead_id ?? undefined,
          unidade_nome: meta.unidade_nome ?? undefined,
          payload_bruto: row,
          idempotency_key,
          invariantes: [invariante],
          detalhes: { trigger, user_id, audit_run_at: new Date().toISOString() },
        });
        totalNovo++;
      }
    } catch (e: any) {
      erros.push({ regra: regra.regra, erro: e?.message ?? String(e) });
    }
  }

  const duracao_ms = Date.now() - t0;

  return new Response(JSON.stringify({
    ok: true,
    trigger,
    duracao_ms,
    total_detectado: totalDetectado,
    novos: totalNovo,
    regras_com_erro: erros,
  }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
