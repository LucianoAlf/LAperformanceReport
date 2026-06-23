/// <reference lib="deno.ns" />

// Edge Function: sync-matriculas-emusys v2
// Varredura de reconciliação Emusys × banco (espelha o estado atual da API).
// Spec: docs/superpowers/specs/2026-06-22-sync-matriculas-emusys-design.md
//
// Processa UMA unidade por invocação (?u=cg|barra|recreio) — o cron chama as 3 defasadas,
// para caber no idle timeout de 150s do Supabase apesar do throttle do rate limit (60/min).
//
// Trilha AUTO (determinística, convergente): status, data_fim, curso_id, professor_atual_id, valor LIMPO.
// Trilha FILA (matriculas_divergencias): ambiguo, ausente_api, disciplina_nao_mapeada,
//   valor_divergente (desconto_fixo embutido / líquido<0 — fonte ambígua), classificacao_divergente (bolsa x tipo).
// Dedup: (aluno|tipo) já com decisão humana não é reenfileirado.
// MODO_TESTE (env SYNC_MATRICULAS_DRYRUN != 'false', default true): não aplica AUTO, só detecta (a fila É gravada).
//
// Salvaguardas: por matrícula (não por pessoa); data_saida = data real da API;
//   respeita matriculas_campos_fixados; tudo logado em automacao_log (lote).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MODO_TESTE = (Deno.env.get('SYNC_MATRICULAS_DRYRUN') ?? 'true') !== 'false';

const EMUSYS_API = 'https://api.emusys.com.br/v1';
const UNIDADES: Record<string, { nome: string; id: string; token: string }> = {
  cg: { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', token: 'nEAlBC5gjtqojA7qberYVOttD1lXdx' },
  recreio: { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', token: 'rUI85cQTePX1ecpLwWLbAWY9UM9yiF' },
  barra: { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e', token: '4reVMLdiBmdNTOBQKa4m7WGYQaRDKI' },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normalizarNome(s: string): string {
  return (s || '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const STATUS_API_PARA_NOSSO: Record<string, string> = { ativa: 'ativo', trancada: 'trancado', finalizada: 'evadido' };

async function fetchTodasMatriculas(token: string) {
  const porId = new Map<number, any>();
  const ativasPorNome = new Map<string, any[]>();
  let cursor = '';
  for (let i = 0; i < 200; i++) {
    const url = `${EMUSYS_API}/matriculas?status=todas&limite=50${cursor ? `&cursor=${cursor}` : ''}`;
    const resp = await fetch(url, { headers: { token } });
    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const json = await resp.json();
    for (const m of json.items || []) {
      porId.set(Number(m.id), m);
      if (m.status === 'ativa') {
        const k = normalizarNome(m.aluno?.nome || '');
        if (!ativasPorNome.has(k)) ativasPorNome.set(k, []);
        ativasPorNome.get(k)!.push(m);
      }
    }
    if (!json.paginacao?.tem_mais || !json.paginacao?.proximo_cursor) break;
    cursor = json.paginacao.proximo_cursor;
    await sleep(1100); // throttle: rate limit 60/min por IP
  }
  return { porId, ativasPorNome };
}

function resolverCursoContrato(mat: any, depara: Map<number, number | null>, banda: Set<number>) {
  const cursos: number[] = [];
  let naoMapeada: number | null = null;
  for (const d of (mat.contrato_atual?.disciplinas || [])) {
    const did = Number(d.disciplina_id);
    if (!depara.has(did)) { naoMapeada = did; continue; }
    const cid = depara.get(did);
    if (cid == null || banda.has(cid)) continue;
    if (!cursos.includes(cid)) cursos.push(cid);
  }
  return { cursos, naoMapeada };
}

function resolverProfessorContrato(mat: any, profMap: Map<number, number>) {
  for (const d of (mat.contrato_atual?.disciplinas || [])) {
    const eid = Number(d.id_professor);
    if (profMap.has(eid)) return profMap.get(eid)!;
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const alvo = new URL(req.url).searchParams.get('u') || 'cg';
  const u = UNIDADES[alvo];
  if (!u) return new Response(JSON.stringify({ erro: 'unidade inválida; use ?u=cg|recreio|barra' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const resumo: any = { modo: MODO_TESTE ? 'dry-run' : 'aplicando', unidade: u.nome, auto: 0, fila: {}, erros: 0 };
  const logs: any[] = [];
  const divs: any[] = [];

  try {
    const { porId, ativasPorNome } = await fetchTodasMatriculas(u.token);

    const { data: cursosBanda } = await supabase.from('cursos').select('id').eq('is_projeto_banda', true);
    const banda = new Set<number>((cursosBanda || []).map((c: any) => c.id));

    const { data: dep } = await supabase.from('curso_emusys_depara').select('emusys_disciplina_id, curso_id').eq('unidade_id', u.id);
    const depara = new Map<number, number | null>((dep || []).map((d: any) => [d.emusys_disciplina_id, d.curso_id]));

    const { data: prof } = await supabase.from('professores_unidades').select('emusys_id, professor_id').eq('unidade_id', u.id).not('emusys_id', 'is', null);
    const profMap = new Map<number, number>((prof || []).map((p: any) => [p.emusys_id, p.professor_id]));

    const { data: alunos } = await supabase.from('alunos')
      .select('id, nome, curso_id, professor_atual_id, emusys_matricula_id, status, data_fim_contrato, valor_cheio, desconto_fixo, desconto_condicional, valor_parcela, tipo_matricula_id')
      .eq('unidade_id', u.id).eq('status', 'ativo');

    // tipo_matricula_id -> codigo (BOLSISTA_INT, REGULAR, etc.) para a régua de classificação
    const { data: tiposMat } = await supabase.from('tipos_matricula').select('id, codigo');
    const tipoCodigoMap = new Map<number, string>((tiposMat || []).map((t: any) => [t.id, t.codigo]));

    const ids = (alunos || []).map((a: any) => a.id);
    const fixadosMap = new Map<number, Set<string>>();
    // dedup: (aluno_id|tipo) que o usuário já decidiu — não reenfileirar (respeita a decisão humana)
    const jaDecidido = new Set<string>();
    if (ids.length) {
      const { data: fx } = await supabase.from('matriculas_campos_fixados').select('aluno_id, campo').in('aluno_id', ids);
      for (const f of fx || []) {
        if (!fixadosMap.has(f.aluno_id)) fixadosMap.set(f.aluno_id, new Set());
        fixadosMap.get(f.aluno_id)!.add(f.campo);
      }
      const { data: decididas } = await supabase
        .from('matriculas_divergencias_decisoes')
        .select('aluno_id, matriculas_divergencias!inner(tipo_divergencia)')
        .in('aluno_id', ids);
      for (const d of decididas || []) {
        const tp = (d as any).matriculas_divergencias?.tipo_divergencia;
        if (tp) jaDecidido.add(`${d.aluno_id}|${tp}`);
      }
    }

    for (const a of alunos || []) {
      try {
        const tipoCodigo = a.tipo_matricula_id ? tipoCodigoMap.get(a.tipo_matricula_id) || null : null;
        const r = reconciliar(a, u, porId, ativasPorNome, depara, profMap, banda, fixadosMap.get(a.id) || new Set(), tipoCodigo);

        // AUTO: aplica mudanças seguras — SÓ fora do dry-run. Em dry-run não escreve nem loga
        // (evita poluir automacao_log a cada rodada do cron de fila).
        if (Object.keys(r.upd).length) {
          resumo.auto++;
          if (!MODO_TESTE) {
            r.upd.updated_at = new Date().toISOString();
            await supabase.from('alunos').update(r.upd).eq('id', a.id);
            logs.push({
              aluno_id: a.id, aluno_nome: a.nome, unidade_nome: u.nome,
              evento: 'sync_matricula_reconciliacao', acao: 'reconciliado',
              status: 'ok', detalhes: r.detalhes, created_at: new Date().toISOString(),
            });
          }
        }

        // FILA: cada divergência vira uma linha (respeitando dedup de decisões humanas)
        for (const dv of r.divergencias) {
          if (jaDecidido.has(`${a.id}|${dv.tipo}`)) continue;
          resumo.fila[dv.tipo] = (resumo.fila[dv.tipo] || 0) + 1;
          divs.push({
            aluno_id: a.id, emusys_matricula_id: a.emusys_matricula_id, unidade_id: u.id,
            tipo_divergencia: dv.tipo, campo: dv.campo || '',
            valor_nosso: { nome: a.nome, curso_id: a.curso_id, status: a.status, tipo: tipoCodigo },
            valor_api: dv.valorApi, sugestao: dv.sugestao ?? null,
            severidade: dv.severidade || 'media',
            resolvido: false, updated_at: new Date().toISOString(),
          });
        }
      } catch (_e) { resumo.erros++; }
    }

    // inserts em lote
    if (logs.length) await supabase.from('automacao_log').insert(logs);
    if (divs.length) await supabase.from('matriculas_divergencias').upsert(divs, { onConflict: 'aluno_id,tipo_divergencia,campo' });
  } catch (e) {
    resumo.erro_unidade = String(e);
  }

  return new Response(JSON.stringify(resumo, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// Pura (sem I/O): decide o que fazer com o aluno.
// Retorna { upd, detalhes, divergencias: [{tipo, campo, valorApi, severidade, sugestao}] }.
// `upd` = mudanças AUTO seguras; `divergencias` = casos de fila (decisão humana). Podem coexistir.
function reconciliar(
  a: any, u: any, porId: Map<number, any>, ativasPorNome: Map<string, any[]>,
  depara: Map<number, number | null>, profMap: Map<number, number>, banda: Set<number>, fixados: Set<string>,
  tipoCodigo: string | null,
): any {
  const upd: Record<string, any> = {};
  const divergencias: any[] = [];

  let mat: any = null;
  if (a.emusys_matricula_id && porId.has(Number(a.emusys_matricula_id))) {
    mat = porId.get(Number(a.emusys_matricula_id));
  } else {
    const cand = ativasPorNome.get(normalizarNome(a.nome)) || [];
    if (cand.length === 1) mat = cand[0];
    else if (cand.length > 1) {
      divergencias.push({ tipo: 'ambiguo', campo: '', severidade: 'media', valorApi: { candidatos: cand.map((m: any) => ({ id: m.id, disciplinas: (m.contrato_atual?.disciplinas || []).map((d: any) => d.nome) })) } });
      return { upd, divergencias };
    } else {
      divergencias.push({ tipo: 'ausente_api', campo: '', severidade: 'alta', valorApi: { nome: a.nome } });
      return { upd, divergencias };
    }
  }

  const statusAlvo = STATUS_API_PARA_NOSSO[mat.status] || 'ativo';
  const c = mat.contrato_atual || {};
  const cheio = c.valor_mensalidade != null ? Number(c.valor_mensalidade) : null;
  const fixo = Number(c.desconto_fixo || 0);
  const cond = Number(c.desconto_condicional || 0);
  const liquido = cheio != null ? Math.round((cheio - fixo - cond) * 100) / 100 : null;
  // parcela real estimada: quando líquido<0 o desconto_fixo veio embutido no valor_mensalidade (fonte ambígua) → usa cheio-cond
  const efetivo = cheio != null ? (liquido! >= 0 ? liquido! : Math.max(Math.round((cheio - cond) * 100) / 100, 0)) : null;
  const bolsa = c.bolsa === true;
  const dataFim = c.data_original_ultima_aula || null;

  const diffs: Record<string, any> = {};
  const setCampo = (campo: string, vNovo: any, vAtual: any) => {
    if (vNovo == null || fixados.has(campo)) return;
    if (String(vNovo) !== String(vAtual ?? '')) { upd[campo] = vNovo; diffs[campo] = { de: vAtual, para: vNovo }; }
  };

  if (statusAlvo !== a.status) {
    upd.status = statusAlvo; diffs.status = { de: a.status, para: statusAlvo };
    if (statusAlvo === 'evadido' && dataFim && !fixados.has('data_saida')) upd.data_saida = dataFim;
  }
  setCampo('data_fim_contrato', dataFim, a.data_fim_contrato);

  // Régua de VALOR: aplica AUTO só se a fonte é limpa; senão enfileira (fonte ambígua = desconto_fixo embutido)
  if (cheio != null) {
    if (liquido! >= 0 && cheio > 0) {
      setCampo('valor_cheio', cheio, a.valor_cheio);
      setCampo('desconto_fixo', fixo, a.desconto_fixo);
      setCampo('desconto_condicional', cond, a.desconto_condicional);
      setCampo('valor_parcela', liquido, a.valor_parcela);
    } else if (!fixados.has('valor_parcela')) {
      // fonte ambígua (desconto_fixo embutido): parcela real estimada = efetivo (cheio - cond).
      // Só enfileira quando há parcela parcial real a recuperar (>0) e difere do nosso.
      // cheio<=0 com líquido<0 (bolsista integral: mensal 0, fixo cheio) → efetivo 0 → ignora (não-pagante legítimo).
      if ((efetivo ?? 0) > 0 && Number(a.valor_parcela ?? 0) !== efetivo) {
        divergencias.push({
          tipo: 'valor_divergente', campo: 'valor_parcela', severidade: 'media',
          valorApi: { cheio, fixo, cond, liquido, liquido_estimado: efetivo, ambiguo: true },
          sugestao: efetivo,
        });
      }
    }
  }

  // Régua de CLASSIFICAÇÃO: tipo de matrícula do nosso x realidade da API (bolsa/valor).
  // Bolsista→REGULAR só quando paga o CHEIO integral (sem desconto algum) — o flag `bolsa=false` da API
  // não é confiável p/ parciais (que têm desconto real). REGULAR→bolsista quando a API marca bolsa=true.
  if (statusAlvo === 'ativo' && tipoCodigo && !fixados.has('tipo_matricula_id')) {
    const ehBolsista = tipoCodigo === 'BOLSISTA_INT' || tipoCodigo === 'BOLSISTA_PARC';
    if (ehBolsista && !bolsa && cheio != null && cheio > 0 && liquido === cheio) {
      divergencias.push({
        tipo: 'classificacao_divergente', campo: 'tipo_matricula_id', severidade: 'media',
        valorApi: { bolsa, liquido, efetivo, cheio, fixo, cond, tipo_sugerido: 'REGULAR' }, sugestao: 'REGULAR',
      });
    } else if (tipoCodigo === 'REGULAR' && bolsa) {
      const sug = (efetivo ?? 0) <= 0 ? 'BOLSISTA_INT' : 'BOLSISTA_PARC';
      divergencias.push({
        tipo: 'classificacao_divergente', campo: 'tipo_matricula_id', severidade: 'media',
        valorApi: { bolsa, liquido, efetivo, cheio, fixo, cond, tipo_sugerido: sug }, sugestao: sug,
      });
    }
  }

  if (statusAlvo === 'ativo') {
    const { cursos, naoMapeada } = resolverCursoContrato(mat, depara, banda);
    if (naoMapeada != null && cursos.length === 0) {
      divergencias.push({ tipo: 'disciplina_nao_mapeada', campo: '', severidade: 'media', valorApi: { disciplina_id: naoMapeada } });
    } else if (cursos.length === 1) {
      setCampo('curso_id', cursos[0], a.curso_id);
    } else if (cursos.length > 1 && !cursos.includes(a.curso_id)) {
      divergencias.push({ tipo: 'ambiguo', campo: '', severidade: 'media', valorApi: { motivo: 'multiplos_cursos', cursos } });
    }
    const profId = resolverProfessorContrato(mat, profMap);
    if (profId != null) setCampo('professor_atual_id', profId, a.professor_atual_id);
  }

  return { upd, divergencias, detalhes: { emusys_matricula_id: mat.id, status_api: mat.status, diffs } };
}
