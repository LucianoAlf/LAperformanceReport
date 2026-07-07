/// <reference lib="deno.ns" />

// Edge Function: debug-webhook-emusys-observador
//
// Observador temporário: recebe webhooks do Emusys (matrícula, lead ou experimental)
// em paralelo ao n8n e SÓ grava o payload bruto em automacao_log — não processa nada,
// não escreve em alunos/leads/movimentacoes_admin. Objetivo: ver o que chega de verdade
// (formato, volume, eventos como matricula_alterada) antes de decidir se vale apontar
// alguma URL de produção direto pro Emusys.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extrairNome(body: any): string {
  return (
    body?.matricula?.nome_aluno ||
    body?.lead?.nome_aluno ||
    body?.aula?.nome_aluno ||
    '(observador)'
  );
}

function extrairUnidade(body: any): string | null {
  return body?.escola_nome ?? null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let body: any = null;
  let rawText = '';
  try {
    rawText = await req.text();
    body = rawText ? JSON.parse(rawText) : null;
  } catch (_e) {
    body = null;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    await supabase.from('automacao_log').insert({
      evento: body?.evento ?? 'observador_desconhecido',
      acao: 'webhook_observado_direto',
      aluno_nome: extrairNome(body),
      unidade_nome: extrairUnidade(body),
      payload_bruto: body ?? { raw_nao_json: rawText },
      workflow_id: 'debug-webhook-emusys-observador',
      execution_id: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[debug-webhook-emusys-observador] falha ao gravar log:', e?.message ?? e);
  }

  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
