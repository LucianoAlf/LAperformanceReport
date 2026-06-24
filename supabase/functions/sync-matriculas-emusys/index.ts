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
//   valor_divergente (parcela comercial divergente), classificacao_divergente (bolsa x tipo).
// Dedup: (aluno|tipo) já com decisão humana não é reenfileirado.
// MODO_TESTE (env SYNC_MATRICULAS_DRYRUN != 'false', default true): não aplica AUTO; em vez disso
//   registra cada mudança AUTO como linha `auto_preview` na fila (prévia do que faria em produção).
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
  // indexa TODOS os status para o fallback de nome — a reconciliação resolve o conflito depois
  const todasPorNome = new Map<string, any[]>();
  let cursor = '';
  for (let i = 0; i < 200; i++) {
    const url = `${EMUSYS_API}/matriculas?status=todas&limite=50${cursor ? `&cursor=${cursor}` : ''}`;
    const resp = await fetch(url, { headers: { token } });
    if (!resp.ok) throw new Error(`API ${resp.status}`);
    const json = await resp.json();
    for (const m of json.items || []) {
      porId.set(Number(m.id), m);
      const k = normalizarNome(m.aluno?.nome || '');
      if (!todasPorNome.has(k)) todasPorNome.set(k, []);
      todasPorNome.get(k)!.push(m);
    }
    if (!json.paginacao?.tem_mais || !json.paginacao?.proximo_cursor) break;
    cursor = json.paginacao.proximo_cursor;
    await sleep(1100); // throttle: rate limit 60/min por IP
  }
  return { porId, ativasPorNome: todasPorNome };
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
  // dry-run: alunos cujo upd seria aplicado (prévia do que o sync faria em produção)
  const previewAlunoIds: number[] = [];

  try {
    const { porId, ativasPorNome } = await fetchTodasMatriculas(u.token);

    const { data: cursosBanda } = await supabase.from('cursos').select('id').eq('is_projeto_banda', true);
    const banda = new Set<number>((cursosBanda || []).map((c: any) => c.id));

    const { data: dep } = await supabase.from('curso_emusys_depara').select('emusys_disciplina_id, curso_id').eq('unidade_id', u.id);
    const depara = new Map<number, number | null>((dep || []).map((d: any) => [d.emusys_disciplina_id, d.curso_id]));

    const { data: prof } = await supabase.from('professores_unidades').select('emusys_id, professor_id').eq('unidade_id', u.id).not('emusys_id', 'is', null);
    const profMap = new Map<number, number>((prof || []).map((p: any) => [p.emusys_id, p.professor_id]));

    const { data: alunos } = await supabase.from('alunos')
      .select('id, nome, curso_id, professor_atual_id, emusys_matricula_id, status, data_fim_contrato, valor_cheio, desconto_fixo, desconto_condicional, valor_parcela, tipo_matricula_id, dia_aula')
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

        // AUTO: aplica mudanças seguras. Em produção escreve em `alunos` + loga.
        // Em dry-run NÃO altera nada, mas registra uma linha `auto_preview` na fila de
        // conciliação (1 por aluno) com os diffs de→para, para a aba mostrar exatamente
        // o que o sync faria quando sair do modo auditoria.
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
          } else {
            previewAlunoIds.push(a.id);
            divs.push({
              aluno_id: a.id, emusys_matricula_id: a.emusys_matricula_id, unidade_id: u.id,
              tipo_divergencia: 'auto_preview', campo: '', fonte: 'sync',
              valor_nosso: { nome: a.nome },
              // `patch` = o que o "Aprovar" da tela vai gravar (mesmo upd que o sync aplicaria em produção)
              valor_api: { diffs: r.detalhes?.diffs ?? {}, patch: r.upd, status_api: r.detalhes?.status_api },
              sugestao: null, severidade: 'baixa',
              resolvido: false, updated_at: new Date().toISOString(),
            });
          }
        }

        // FILA: cada divergência vira uma linha (respeitando dedup de decisões humanas)
        for (const dv of r.divergencias) {
          if (jaDecidido.has(`${a.id}|${dv.tipo}`)) continue;
          resumo.fila[dv.tipo] = (resumo.fila[dv.tipo] || 0) + 1;
          divs.push({
            aluno_id: a.id, emusys_matricula_id: a.emusys_matricula_id, unidade_id: u.id,
            tipo_divergencia: dv.tipo, campo: dv.campo || '', fonte: 'sync',
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

    // limpa ausente_api obsoletos: alunos que foram encontrados na API nesta rodada
    const encontradosIds = (alunos || [])
      .filter((a: any) => {
        const eid = Number(a.emusys_matricula_id);
        return (a.emusys_matricula_id && porId.has(eid));
      })
      .map((a: any) => a.id);
    if (encontradosIds.length) {
      await supabase.from('matriculas_divergencias')
        .update({ resolvido: true, updated_at: new Date().toISOString() })
        .in('aluno_id', encontradosIds)
        .eq('tipo_divergencia', 'ausente_api')
        .eq('resolvido', false);
    }

    // limpa auto_preview obsoletos: alunos desta unidade que NÃO teriam mais mudança
    // auto nesta rodada (ou TODOS, quando em produção — lá o upd é aplicado, não previsto).
    {
      let q = supabase.from('matriculas_divergencias')
        .update({ resolvido: true, updated_at: new Date().toISOString() })
        .eq('unidade_id', u.id)
        .eq('tipo_divergencia', 'auto_preview')
        .eq('resolvido', false);
      if (previewAlunoIds.length) q = q.not('aluno_id', 'in', `(${previewAlunoIds.join(',')})`);
      await q;
    }
  } catch (e) {
    resumo.erro_unidade = String(e);
  }

  return new Response(JSON.stringify(resumo, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});

// Extrai o dia da semana do nome da turma (ex: "G_Ter_14" → "Terça", "BT_Seg_18" → "Segunda").
// Retorna null se o formato não for reconhecido.
function parseDiaDeTurma(nomeTurma: string): string | null {
  const partes = (nomeTurma || '').split('_');
  if (partes.length < 3) return null;
  const abrev = partes[partes.length - 2];
  const mapa: Record<string, string> = {
    Seg: 'Segunda', Ter: 'Terça', Qua: 'Quarta',
    Qui: 'Quinta', Sex: 'Sexta', Sab: 'Sábado',
  };
  return mapa[abrev] || null;
}

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
    const candTodas = ativasPorNome.get(normalizarNome(a.nome)) || [];
    // prefere ativas; só cai para qualquer status se não há ativa (ex: trancada no Emusys, ativo no nosso)
    const candAtivas = candTodas.filter((m: any) => m.status === 'ativa');
    const cand = candAtivas.length > 0 ? candAtivas : candTodas;
    if (cand.length === 1) mat = cand[0];
    else if (cand.length > 1) {
      // Mantém TODOS os candidatos (não descarta no narrowing — senão a 2ª matrícula do
      // caso 2x/semana some). Marca `sugerido_por_turma` no que bate com o dia_aula, e
      // enriquece cada um com curso/professor/valor/dia pra tela mostrar e o humano vincular.
      const diaAluno = a.dia_aula ? normalizarNome(a.dia_aula) : null;
      const candidatosMeta = (m: any) => {
        const c = m.contrato_atual || {};
        const disc = c.disciplinas || [];
        const turmasArr = disc.map((d: any) => d.nome_turma).filter(Boolean);
        const dias = turmasArr.map((t: string) => parseDiaDeTurma(t)).filter(Boolean) as string[];
        const cheioM = c.valor_mensalidade != null ? Number(c.valor_mensalidade) : null;
        const condM = Number(c.desconto_condicional || 0);
        const parcelaM = cheioM != null ? Math.round((cheioM - condM) * 100) / 100 : null;
        const { cursos } = resolverCursoContrato(m, depara, banda);
        return {
          id: m.id, status: m.status, aluno_id: m.aluno?.id ?? null,
          disciplinas: disc.map((d: any) => d.nome),
          turmas: turmasArr,
          dia: dias[0] || null,
          curso_id: cursos[0] ?? null,
          professor_id: resolverProfessorContrato(m, profMap),
          cheio: cheioM, fixo: Number(c.desconto_fixo || 0), cond: condM,
          parcela: (parcelaM != null && parcelaM >= 0) ? parcelaM : null,
          parcela_invalida: !(parcelaM != null && parcelaM >= 0 && (cheioM ?? 0) > 0),
          data_fim: c.data_original_ultima_aula || null,
          sugerido_por_turma: !!(diaAluno && dias.some((d) => normalizarNome(d) === diaAluno)),
        };
      };
      divergencias.push({ tipo: 'ambiguo', campo: '', severidade: 'media', valorApi: { candidatos: cand.map(candidatosMeta) } });
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
  // Parcela comercial dos relatorios: contrato mensal menos desconto condicional.
  // O desconto_fixo fica auditado separadamente e nao entra em valor_parcela.
  const parcelaComercial = cheio != null ? Math.round((cheio - cond) * 100) / 100 : null;
  const liquidoFinanceiro = cheio != null ? Math.round((cheio - fixo - cond) * 100) / 100 : null;
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

  // Regua de VALOR: contrato Emusys e a fonte da parcela comercial.
  if (cheio != null) {
    if (parcelaComercial != null && parcelaComercial >= 0 && cheio > 0) {
      setCampo('valor_cheio', cheio, a.valor_cheio);
      setCampo('desconto_fixo', fixo, a.desconto_fixo);
      setCampo('desconto_condicional', cond, a.desconto_condicional);
      setCampo('valor_parcela', parcelaComercial, a.valor_parcela);
    } else if (!fixados.has('valor_parcela')) {
      // Parcela inválida (a API às vezes embute o desconto_fixo no valor_mensalidade → líquido<0) → revisão humana.
      if ((parcelaComercial ?? 0) > 0 && Number(a.valor_parcela ?? 0) !== parcelaComercial) {
        divergencias.push({
          tipo: 'valor_divergente', campo: 'valor_parcela', severidade: 'media',
          valorApi: { cheio, fixo, cond, parcela_comercial: parcelaComercial, liquido_financeiro: liquidoFinanceiro },
          sugestao: parcelaComercial,
        });
      }
    }
  }

  // Régua de CLASSIFICAÇÃO: tipo de matrícula do nosso x realidade da API (bolsa/valor).
  // Bolsista→REGULAR só quando paga o CHEIO integral (sem desconto algum) — o flag `bolsa=false` da API
  // não é confiável p/ parciais (que têm desconto real). REGULAR→bolsista quando a API marca bolsa=true.
  if (statusAlvo === 'ativo' && tipoCodigo && !fixados.has('tipo_matricula_id')) {
    const ehBolsista = tipoCodigo === 'BOLSISTA_INT' || tipoCodigo === 'BOLSISTA_PARC';
    if (ehBolsista && !bolsa && cheio != null && cheio > 0 && parcelaComercial === cheio) {
      divergencias.push({
        tipo: 'classificacao_divergente', campo: 'tipo_matricula_id', severidade: 'media',
        valorApi: { bolsa, parcela_comercial: parcelaComercial, liquido_financeiro: liquidoFinanceiro, cheio, fixo, cond, tipo_sugerido: 'REGULAR' }, sugestao: 'REGULAR',
      });
    } else if (tipoCodigo === 'REGULAR' && bolsa) {
      const sug = (parcelaComercial ?? 0) <= 0 ? 'BOLSISTA_INT' : 'BOLSISTA_PARC';
      divergencias.push({
        tipo: 'classificacao_divergente', campo: 'tipo_matricula_id', severidade: 'media',
        valorApi: { bolsa, parcela_comercial: parcelaComercial, liquido_financeiro: liquidoFinanceiro, cheio, fixo, cond, tipo_sugerido: sug }, sugestao: sug,
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
