// Edge Function: calcular-risco-evasao
// Pontua o risco de evasao (churn) de cada aluno ATIVO usando o modelo Random
// Forest treinado offline (estudo/pesquisas/churn-alunos), exportado pra JS via
// m2cgen. Roda em lote (cron diario), grava em public.risco_evasao.
//
// Fluxo: rpc(features_churn_alunos_ativos) -> buildVector -> score() -> upsert.
// Feature engineering vive na funcao SQL (versionada na migration), aqui so pontua.
//
// Body opcional: { "dry_run": true } -> calcula e devolve resumo SEM gravar.
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { score } from './model.ts';
import { buildVector, type FeaturesAluno } from './preprocessing.ts';
import { FEATURE_IMPORTANCE, faixaRisco, MODELO_VERSAO } from './contract.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Probabilidade de churn a partir do vetor de features (score() devolve [p_ativo, p_churn]).
function probChurn(vec: number[]): number {
  const r = score(vec);
  return r[1] / (r[0] + r[1]);
}

// Monta os 'fatores' (explicabilidade honesta e barata): os principais drivers do
// modelo com o valor do aluno e um sinal de alerta baseado em limiares simples.
// Nao e SHAP — e importancia global + leitura do valor cru do aluno.
function montarFatores(f: FeaturesAluno) {
  const drivers: Array<{ fator: string; valor: unknown; importancia: number; sinal: string }> = [];

  const add = (fator: string, valor: unknown, sinal: string) => {
    drivers.push({ fator, valor, importancia: FEATURE_IMPORTANCE[fator] ?? 0, sinal });
  };

  const pres = (t: number | null) => (t === null ? 'sem dado' : `${Math.round(t * 100)}%`);
  const sinalPres = (t: number | null) => (t === null ? 'neutro' : t < 0.5 ? 'risco' : t >= 0.75 ? 'ok' : 'atencao');

  add('taxa_presenca_30d', pres(f.taxa_presenca_30d), sinalPres(f.taxa_presenca_30d));
  add('taxa_presenca_60d', pres(f.taxa_presenca_60d), sinalPres(f.taxa_presenca_60d));
  add('taxa_presenca_geral', pres(f.taxa_presenca_geral), sinalPres(f.taxa_presenca_geral));
  add(
    'dias_desde_ultima_aula',
    f.dias_desde_ultima_aula === null ? 'sem dado' : `${f.dias_desde_ultima_aula} dias`,
    f.dias_desde_ultima_aula === null ? 'neutro' : f.dias_desde_ultima_aula > 14 ? 'risco' : f.dias_desde_ultima_aula > 7 ? 'atencao' : 'ok',
  );
  add('status_pagamento', f.status_pagamento ?? 'sem dado', f.status_pagamento === 'inadimplente' ? 'risco' : 'neutro');

  // ordena por importancia desc
  drivers.sort((a, b) => b.importancia - a.importancia);
  return drivers;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let dryRun = false;
  try {
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      dryRun = body?.dry_run === true;
    }
  } catch (_) { /* body opcional */ }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const t0 = Date.now();

  // 1. Busca as features engenheiradas de todos os alunos ativos (FE vive no SQL).
  //    Pagina em blocos de 1000 — o PostgREST corta rpc em 1000 linhas por padrao,
  //    e temos >1000 alunos ativos. Sem paginar, alunos seriam descartados em silencio.
  const PAGE = 1000;
  const alunos: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .rpc('features_churn_alunos_ativos')
      .range(from, from + PAGE - 1);
    if (error) return json({ ok: false, etapa: 'features', erro: error.message }, 500);
    if (!data || data.length === 0) break;
    alunos.push(...data);
    if (data.length < PAGE) break;
  }
  if (alunos.length === 0) return json({ ok: true, msg: 'nenhum aluno ativo', total: 0 });

  // 2. Pontua cada aluno.
  const hoje = new Date().toISOString().slice(0, 10);
  const linhas = [];
  const distFaixa = { baixo: 0, atencao: 0, critico: 0 };

  for (const a of alunos) {
    const feats = a as FeaturesAluno & { aluno_id: number; unidade_id: string };
    const vec = buildVector(feats);
    const prob = probChurn(vec);
    const faixa = faixaRisco(prob);
    distFaixa[faixa]++;

    linhas.push({
      aluno_id: feats.aluno_id,
      unidade_id: feats.unidade_id,
      probabilidade: Math.round(prob * 10000) / 10000,
      faixa,
      fatores: montarFatores(feats),
      modelo_versao: MODELO_VERSAO,
      calculado_em: hoje,
    });
  }

  // ordena por probabilidade desc (top risco primeiro) pra amostra
  const topAmostra = [...linhas]
    .sort((x, y) => y.probabilidade - x.probabilidade)
    .slice(0, 10)
    .map((l) => ({ aluno_id: l.aluno_id, probabilidade: l.probabilidade, faixa: l.faixa }));

  // 3. Dry-run: nao grava, so devolve o resumo pra conferencia.
  if (dryRun) {
    return json({
      ok: true, dry_run: true, total: linhas.length,
      distribuicao_faixa: distFaixa, top10: topAmostra,
      modelo_versao: MODELO_VERSAO, ms: Date.now() - t0,
    });
  }

  // 4. Grava (uma linha por aluno por dia — historico via calculado_em).
  //    upsert por (aluno_id, calculado_em, modelo_versao): recalculo no mesmo dia
  //    com o mesmo modelo sobrescreve; versoes diferentes coexistem (comparacao).
  const { error: errUp } = await supabase
    .from('risco_evasao')
    .upsert(linhas, { onConflict: 'aluno_id,calculado_em,modelo_versao' });
  if (errUp) return json({ ok: false, etapa: 'upsert', erro: errUp.message }, 500);

  return json({
    ok: true, total: linhas.length, distribuicao_faixa: distFaixa,
    top10: topAmostra, modelo_versao: MODELO_VERSAO, ms: Date.now() - t0,
  });
});
