/// <reference lib="deno.ns" />

// Edge Function: sync-matriculas-emusys v2
// Varredura de reconciliação Emusys × banco (espelha o estado atual da API).
// Spec: docs/superpowers/specs/2026-06-22-sync-matriculas-emusys-design.md
//
// Processa UMA unidade por invocação (?u=cg|barra|recreio) — o cron chama as 3 defasadas,
// para caber no idle timeout de 150s do Supabase apesar do throttle do rate limit (60/min).
//
// Cadastro direto do Emusys: telefone, e-mail, responsável, foto e Instagram
//   atualizam `alunos` por unidade + matrícula, salvo campo local fixado.
// Trilha SUGESTÃO: `auto_preview` é exclusivamente curso/professor/dia/horário.
//   Contrato, valores e financeiro têm filas próprias e nunca viram Sync grade.
// Trilha FILA (matriculas_divergencias): ambiguo, ausente_api, disciplina_nao_mapeada,
//   valor_divergente (parcela comercial divergente), classificacao_divergente (bolsa x tipo).
// Dedup: (aluno|tipo) já com decisão humana não é reenfileirado.
//
// Salvaguardas: por matrícula (não por pessoa); data_saida = data real da API;
//   respeita matriculas_campos_fixados; tudo logado em automacao_log (lote).
//
// ─── PIPELINE (ordem de execução no handler) ──────────────────────────────────
// FASE A — roda nos DOIS escopos:
//   A1. Autentica (x-sync-token ou JWT) .................... validarAcessoSync
//   A2. Busca no Emusys .................................... fetchTodasMatriculas
//         operacional = status ativa + trancada; completo = todos os status
//   A3. Monta de-para de curso, professor e aluno↔matrícula
//   A4. Grava a fotografia crua ............ emusys_matriculas_estado_atual
//   A5. Jornada canônica .......... aluno_jornada_matricula_disciplina
//   A6. Sincroniza cadastro direto, fecha pendências que viraram histórico;
//       A6b: no operacional, reconcilia estados ausentes e segue para a fila de grade
//
// FASE B — roda nos dois escopos usando a fotografia já buscada (não chama a API):
//   B2. Decisões canônicas de matrícula
//   B3. Régua de classificação (tipos_matricula)
//   B4. Lead ID .................................. alunos.emusys_lead_id
//   B5. Reconciliação por aluno: sugestões (auto_preview), fila de divergências
//       e conversão de renovação pendente em não-renovação (movimentacoes_admin)
//   B6. Limpeza de alertas obsoletos + varredura reversa (contratos órfãos)
//
// ⚠️ O escopo operacional não pode inferir ausência: ele traz somente matrículas
//    ativas/trancadas. A fase B processa os registros presentes, mas pula a linha
//    vinculada que não veio e nunca a fecha, religa por nome ou limpa sua pendência.
//    `ausente_api` e não-renovação por ausência permanecem exclusivos do completo.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { analisarFinanceiroContrato, deveIgnorarStatusFinanceiroPorTipo } from './financeiro.ts';
import {
  buildJornadaInputFromMatriculaApi,
  buildJornadaRowsForUpsert,
} from '../_shared/jornada-canonica.ts';
import { resolveEmusysMatriculaLifecycle } from '../_shared/emusys-matricula-lifecycle.ts';
import { deveConverterFinalizadaEmNaoRenovacao } from '../_shared/nao-renovacao-canonica.ts';
import { decidirLeadId } from '../_shared/lead-id-reconciliacao.ts';
// Regra ÚNICA de derivação do cadastro, compartilhada com o webhook
// `matricula_alterada` (processar-matricula-emusys) desde 2026-08-19.
import {
  carregarMapasCadastro,
  devePreservarCursoBase,
  parseDiaDeTurma,
  parseHorarioDeTurma,
  resolverCursoDasDisciplinas,
  resolverProfessorDasDisciplinas,
  valoresIguaisParaCampo,
} from '../_shared/emusys-cadastro-canonico.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EMAILS_SYNC_TECNICO = new Set(
  (Deno.env.get('SYNC_MATRICULAS_ALLOWED_EMAILS') ?? 'lucianoalf.la@gmail.com,hugo@lamusic.com.br')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const SYNC_ADMIN_TOKEN = Deno.env.get('SYNC_MATRICULAS_ADMIN_TOKEN')?.trim() || '';

const EMUSYS_API = 'https://api.emusys.com.br/v1';
const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret obrigatorio ausente: ${name}`);
  return value;
};
const UNIDADES: Record<string, { nome: string; id: string; token: string }> = {
  cg: { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', token: requiredEnv('EMUSYS_TOKEN_CG') },
  recreio: { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', token: requiredEnv('EMUSYS_TOKEN_RECREIO') },
  barra: { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e', token: requiredEnv('EMUSYS_TOKEN_BARRA') },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const EMUSYS_PAGE_THROTTLE_MS = 1500;
const EMUSYS_429_MAX_RETRIES = 4;

/**
 * O Emusys aplica rate limit por IP compartilhado entre as Edge Functions.
 * Um 429 transitório não pode transformar uma fotografia operacional válida
 * em uma execução incompleta; repetimos a mesma página com backoff e só
 * falhamos depois do limite explícito de tentativas.
 */
async function fetchEmusysMatriculas(
  url: string,
  token: string,
  status: string,
): Promise<Response> {
  for (let tentativa = 0; tentativa <= EMUSYS_429_MAX_RETRIES; tentativa++) {
    let resp: Response;
    try {
      resp = await fetch(url, { headers: { token } });
    } catch (error) {
      if (tentativa === EMUSYS_429_MAX_RETRIES) {
        throw new Error(`API indisponivel (${status}) apos ${tentativa + 1} tentativas: ${String(error)}`);
      }
      const backoffMs = 2500 * (2 ** tentativa);
      await sleep(Math.min(backoffMs, 30000));
      continue;
    }
    if (resp.status !== 429) return resp;

    if (tentativa === EMUSYS_429_MAX_RETRIES) {
      throw new Error(`API 429 (${status}) apos ${tentativa + 1} tentativas`);
    }

    const retryAfterSeconds = Number(resp.headers.get('retry-after') || '0');
    const retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 0;
    const backoffMs = 2500 * (2 ** tentativa);
    await sleep(Math.min(Math.max(retryAfterMs, backoffMs), 30000));
  }

  throw new Error(`API 429 (${status}) sem resposta apos retry`);
}

async function validarAcessoSync(req: Request): Promise<Response | null> {
  const syncToken = req.headers.get('x-sync-token')?.trim() || '';
  if (SYNC_ADMIN_TOKEN && syncToken && syncToken === SYNC_ADMIN_TOKEN) return null;

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return new Response(JSON.stringify({ erro: 'sync restrito a usuarios tecnicos' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Permite chamadas tecnicas/cron feitas com service role.
  if (token === SUPABASE_SERVICE_ROLE_KEY) return null;

  const authClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await authClient.auth.getUser(token);
  const email = data.user?.email?.trim().toLowerCase() || '';

  if (error || !email || !EMAILS_SYNC_TECNICO.has(email)) {
    return new Response(JSON.stringify({ erro: 'sync restrito a usuarios tecnicos' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return null;
}

function normalizarNome(s: string): string {
  return (s || '').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ⚠️ `normalizarDiaParaComparacao`, `valoresIguaisParaCampo`, `parseDiaDeTurma`,
// `parseHorarioDeTurma`, `resolverCursoDasDisciplinas`, `devePreservarCursoBase` e
// `resolverProfessorDasDisciplinas` vêm de `_shared/emusys-cadastro-canonico.ts` desde
// 2026-08-19. Tinham cópia local aqui, e o webhook `matricula_alterada` passou a
// escrever nos mesmos campos — duas implementações da mesma regra é o padrão que
// causou as duplicatas de renovação neste projeto. Não reintroduzir cópia local.


function temValor(v: any): boolean {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function descreverErroSync(erro: unknown): string {
  if (erro instanceof Error) return erro.message;
  if (erro && typeof erro === 'object') {
    const estruturado = erro as Record<string, unknown>;
    const partes = ['code', 'message', 'details', 'hint']
      .map((campo) => estruturado[campo])
      .filter((valor) => temValor(valor))
      .map((valor) => String(valor).trim());
    if (partes.length) return partes.join(' | ').slice(0, 500);
    return Object.prototype.toString.call(erro);
  }
  return String(erro);
}

/**
 * A conciliação é uma fila de trabalho atual, não um inventário histórico.
 * A linha de aluno continua sendo processada no sync completo para manter
 * estado, jornada e movimentações auditáveis; só sugestão/pendência manual
 * fica restrita a quem ainda está na operação.
 */
function alunoEntraNaFilaOperacional(aluno: any): boolean {
  const status = String(aluno?.status || '').trim().toLowerCase();
  return aluno?.is_ex_aluno !== true && !['inativo', 'evadido'].includes(status);
}

function normalizarTextoValor(v: any): string {
  return normalizarNome(String(v ?? '')).replace(/[^\w\s@.-]/g, '').trim();
}

function normalizarUrlValor(v: any): string {
  return String(v ?? '').trim().replace(/\/+$/, '');
}

function normalizarTelefoneValor(v: any): string {
  let digits = String(v ?? '').replace(/\D/g, '');
  while (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits;
}

function normalizarInstagramValor(v: any): string {
  const s = String(v ?? '').trim().toLowerCase();
  return s
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .replace(/^@/, '')
    .replace(/\/$/, '')
    .trim();
}

function textoIndicaSemInstagramEmusys(v: any): boolean {
  const texto = normalizarNome(String(v ?? ''))
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!texto) return false;
  return [
    'nao possui',
    'nao possui instagram',
    'nao possui insta',
    'nao tem',
    'nao tem instagram',
    'nao tem insta',
    'n possui',
    'n possui instagram',
    'n tem',
    'n tem instagram',
    'sem instagram',
    'sem insta',
    'nao usa',
    'nao usa instagram',
    'nao utiliza',
    'nao utiliza instagram',
  ].includes(texto)
    || texto.startsWith('nao possui ')
    || texto.startsWith('nao tem ')
    || texto.startsWith('n possui ')
    || texto.startsWith('n tem ')
    || texto.startsWith('sem instagram')
    || texto.startsWith('sem insta')
    || texto.startsWith('nao usa ')
    || texto.startsWith('nao utiliza ');
}

function normalizarFormaPagamentoValor(v: any): string {
  const s = normalizarTextoValor(v).replace(/\./g, '').replace(/\s+/g, ' ');
  if (!s) return '';
  if (['credito recorrente', 'cr', 'c r', 'pgto recorrente', 'pagamento recorrente'].includes(s)) {
    return 'credito_recorrente';
  }
  if (s.includes('cheque')) return 'cheque';
  if (s.includes('pix')) return 'pix';
  if (s.includes('dinheiro')) return 'dinheiro';
  if (s.includes('boleto')) return 'boleto';
  if (s.includes('link')) return 'link';
  if (s.includes('debito')) return 'cartao_debito';
  return s;
}

function extrairCampoPersonalizado(campos: any, nomes: string[]): string | null {
  if (!Array.isArray(campos)) return null;
  const alvos = nomes.map(normalizarNome);
  for (const campo of campos) {
    const nome = normalizarNome(campo?.nome ?? campo?.campo ?? campo?.label ?? campo?.chave ?? campo?.key ?? '');
    if (!alvos.some((alvo) => nome.includes(alvo))) continue;
    const valor = campo?.valor ?? campo?.value ?? campo?.conteudo ?? campo?.resposta;
    if (temValor(valor)) return String(valor).trim();
  }
  return null;
}

function extrairFotoAluno(mat: any): string | null {
  const foto = mat?.aluno?.foto_url ?? mat?.aluno?.photo_url ?? mat?.foto_aluno_url ?? mat?.foto_url;
  if (!temValor(foto)) return null;
  const url = String(foto).trim();
  if (['https://sys.emusys.com.br/', 'http://sys.emusys.com.br/'].includes(url)) {
    return null;
  }
  return url;
}

function extrairInstagramAluno(mat: any): string | null {
  const direto = mat?.aluno?.instagram ?? mat?.instagram;
  const personalizado = extrairCampoPersonalizado(mat?.aluno?.campos_personalizados, ['instagram', 'insta']);
  const valor = direto ?? personalizado;
  return temValor(valor) ? String(valor).trim() : null;
}

function extrairStatusFinanceiroEmusys(mat: any): string | null {
  const raw = mat?.contrato_atual?.inadimplente ?? mat?.inadimplente ?? mat?.aluno?.inadimplente;
  if (typeof raw === 'boolean') return raw ? 'inadimplente' : 'em_dia';
  if (!temValor(raw)) return null;
  const normalizado = normalizarNome(String(raw));
  if (['inadimplente', 'atrasado', 'em_dia', 'em dia'].includes(normalizado)) {
    return normalizado.replace(' ', '_');
  }
  return null;
}

function extrairAguardandoRenovacaoEmusys(mat: any): boolean | null {
  const raw = mat?.contrato_atual?.aguardando_renovacao
    ?? mat?.contrato_atual?.renovacao_pendente
    ?? mat?.contrato_atual?.pendente_renovacao
    ?? mat?.aguardando_renovacao
    ?? mat?.renovacao_pendente
    ?? mat?.aluno?.aguardando_renovacao;
  if (typeof raw === 'boolean') return raw;
  if (!temValor(raw)) return null;
  const normalizado = normalizarNome(String(raw));
  if (['true', 'sim', 's', '1', 'aguardando renovacao', 'renovacao pendente', 'pendente'].includes(normalizado)) {
    return true;
  }
  if (['false', 'nao', 'n', '0', 'em dia', 'renovado'].includes(normalizado)) {
    return false;
  }
  return null;
}

function extrairFormaPagamentoEmusys(mat: any): string | null {
  const valor = mat?.contrato_atual?.forma_pagamento
    ?? mat?.cobranca_automatica?.forma_pagamento
    ?? mat?.forma_pagamento;
  return temValor(valor) ? String(valor).trim() : null;
}

function resolverFormaPagamentoId(formaEmusys: string | null, formasPagamento: Map<number, any>): number | null {
  if (!formaEmusys) return null;
  const alvo = normalizarFormaPagamentoValor(formaEmusys);
  for (const [id, forma] of formasPagamento.entries()) {
    const nome = normalizarFormaPagamentoValor(forma?.nome);
    const sigla = normalizarFormaPagamentoValor(forma?.sigla);
    if (nome === alvo || sigla === alvo) return id;
  }
  return null;
}

/**
 * Campos cadastrais correntes do GET /matriculas. A API e a fonte
 * operacional desses quatro campos: quando o valor mudou no Emusys, o
 * cadastro local acompanha a mudanca; a unica excecao e uma escolha local
 * explicitamente protegida em matriculas_campos_fixados.
 */
function setCampoEmusysAutoritativo(
  patch: Record<string, any>,
  diffs: Record<string, any>,
  campo: string,
  valorEmusys: any,
  valorLocal: any,
  fixados: Set<string>,
  normalizar: (valor: any) => string,
) {
  if (fixados.has(campo) || !temValor(valorEmusys)) return;
  if (normalizar(valorEmusys) === normalizar(valorLocal)) return;
  patch[campo] = String(valorEmusys).trim();
  diffs[campo] = { de: valorLocal ?? null, para: String(valorEmusys).trim() };
}

function gerarPatchCadastroCanonicoEmusys(a: any, mat: any, fixados: Set<string>) {
  const patch: Record<string, any> = {};
  const diffs: Record<string, any> = {};
  const responsavel = mat?.responsavel || {};

  setCampoEmusysAutoritativo(patch, diffs, 'telefone', mat?.aluno?.telefone, a.telefone, fixados, normalizarTelefoneValor);
  setCampoEmusysAutoritativo(patch, diffs, 'email', mat?.aluno?.email, a.email, fixados, normalizarTextoValor);
  setCampoEmusysAutoritativo(patch, diffs, 'responsavel_nome', responsavel.nome, a.responsavel_nome, fixados, normalizarTextoValor);
  setCampoEmusysAutoritativo(patch, diffs, 'responsavel_telefone', responsavel.telefone, a.responsavel_telefone, fixados, normalizarTelefoneValor);

  // Foto e Instagram também são dados cadastrais da matrícula. A fonte é o
  // Emusys enquanto não houver um campo fixado local; assim eles não viram
  // pseudo-divergência de grade nem dependem de decisão manual recorrente.
  const fotoEmusys = extrairFotoAluno(mat);
  const fotoLocal = temValor(a.foto_url) ? a.foto_url : a.photo_url;
  setCampoEmusysAutoritativo(patch, diffs, 'foto_url', fotoEmusys, fotoLocal, fixados, normalizarUrlValor);

  const instagramEmusys = extrairInstagramAluno(mat);
  if (a.instagram_nao_possui !== true && !textoIndicaSemInstagramEmusys(instagramEmusys)) {
    setCampoEmusysAutoritativo(patch, diffs, 'instagram', instagramEmusys, a.instagram, fixados, normalizarInstagramValor);
  }

  return { patch, diffs };
}

async function aplicarPatchAtributosEmusys(
  supabase: any,
  unidadeId: string,
  aluno: any,
  patch: Record<string, any>,
) {
  if (!Object.keys(patch).length) return { aplicado: false, camposAplicados: [] as string[], aluno };

  // A função do banco protege contra a corrida entre a leitura de
  // matriculas_campos_fixados e a escrita: ela trava o aluno, reconsulta os
  // campos fixados e devolve exatamente quais campos foram aplicados.
  const { data, error } = await supabase.rpc('aplicar_cadastro_emusys_canonico', {
    p_unidade_id: unidadeId,
    p_aluno_id: aluno.id,
    // A identidade externa e revalidada dentro do lock do banco. Se a
    // matricula for religada enquanto este sync estiver em voo, o patch nao
    // pode cair no cadastro que passou a representar outra matricula Emusys.
    p_emusys_matricula_id: String(aluno.emusys_matricula_id ?? '').trim(),
    p_patch: patch,
  });
  if (error) throw error;
  const resultado = Array.isArray(data) ? data[0] : data;
  if (!resultado || Number(resultado.aluno_id) !== Number(aluno.id)) {
    throw new Error('ALUNO_NAO_ENCONTRADO_PARA_PATCH_EMUSYS');
  }

  const camposAplicados = Array.isArray(resultado.campos_aplicados)
    ? resultado.campos_aplicados.map((campo: any) => String(campo))
    : [];
  const patchAplicado = Object.fromEntries(
    camposAplicados
      .filter((campo: string) => Object.prototype.hasOwnProperty.call(patch, campo))
      .map((campo: string) => [campo, patch[campo]]),
  );

  return {
    aplicado: camposAplicados.length > 0,
    camposAplicados,
    aluno: { ...aluno, ...patchAplicado },
  };
}

async function resolverDivergenciasAtributosSincronizadas(
  supabase: any,
  unidadeId: string,
  alunoId: number,
  campos: string[],
) {
  if (!campos.length) return;
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from('alunos_emusys_atributos_divergencias')
    .update({
      resolvido: true,
      decisao: 'sincronizado_emusys',
      decidido_por: 'sync-matriculas-emusys',
      decidido_em: agora,
      updated_at: agora,
    })
    .eq('unidade_id', unidadeId)
    .eq('aluno_id', alunoId)
    .eq('fonte', 'emusys_matriculas')
    .eq('resolvido', false)
    .in('campo', campos);
  if (error) throw error;
}

/**
 * Esta rotina roda nos dois escopos, antes do retorno do cron operacional.
 * Ela usa somente a identidade segura (unidade + matricula Emusys), nunca
 * nome como fallback, e atualiza apenas os campos que a API afirma hoje.
 */
async function sincronizarAtributosCadastraisEmusys(
  supabase: any,
  unidade: { id: string; nome: string },
  alunos: any[],
  porId: Map<number, any>,
  fixadosMap: Map<number, Set<string>>,
  logs: any[],
  resumo: any,
) {
  const atualizados = new Map<number, any>();
  for (const aluno of alunos || []) {
    if (!alunoEntraNaFilaOperacional(aluno)) continue;
    const matriculaId = numeroFinitoOuNull(aluno.emusys_matricula_id);
    if (matriculaId == null) continue;
    const mat = porId.get(matriculaId);
    if (!mat) continue;

    const fixados = fixadosMap.get(aluno.id) || new Set<string>();
    const cadastroCanonico = gerarPatchCadastroCanonicoEmusys(aluno, mat, fixados);
    const patch = cadastroCanonico.patch;
    if (!Object.keys(patch).length) continue;

    try {
      const resultado = await aplicarPatchAtributosEmusys(supabase, unidade.id, aluno, patch);
      if (!resultado.aplicado) continue;

      atualizados.set(aluno.id, resultado.aluno);
      resumo.atributos_sincronizados = (resumo.atributos_sincronizados || 0) + resultado.camposAplicados.length;
      logs.push({
        aluno_nome: aluno.nome,
        aluno_id: aluno.id,
        unidade_nome: unidade.nome,
        evento: 'sync_matriculas_atributos',
        acao: 'atualizados_do_emusys',
        detalhes: {
          unidade_id: unidade.id,
          emusys_matricula_id: matriculaId,
          campos: resultado.camposAplicados.sort(),
        },
        workflow_id: 'sync-matriculas-emusys',
        execution_id: new Date().toISOString(),
      });

      try {
        await resolverDivergenciasAtributosSincronizadas(supabase, unidade.id, aluno.id, resultado.camposAplicados);
      } catch (erroResolucao) {
        resumo.atributos_sincronizacao_erros = (resumo.atributos_sincronizacao_erros || 0) + 1;
        logs.push({
          aluno_nome: aluno.nome,
          aluno_id: aluno.id,
          unidade_nome: unidade.nome,
          evento: 'sync_matriculas_atributos',
          acao: 'falha_ao_resolver_fila',
          detalhes: { unidade_id: unidade.id, emusys_matricula_id: matriculaId, campos: resultado.camposAplicados.sort(), erro: descreverErroSync(erroResolucao).slice(0, 160) },
          workflow_id: 'sync-matriculas-emusys',
          execution_id: new Date().toISOString(),
        });
      }
    } catch (erroAtualizacao) {
      resumo.atributos_sincronizacao_erros = (resumo.atributos_sincronizacao_erros || 0) + 1;
      logs.push({
        aluno_nome: aluno.nome,
        aluno_id: aluno.id,
        unidade_nome: unidade.nome,
        evento: 'sync_matriculas_atributos',
        acao: 'falha_ao_atualizar_cadastro',
        detalhes: { unidade_id: unidade.id, emusys_matricula_id: matriculaId, campos: Object.keys(patch).sort(), erro: descreverErroSync(erroAtualizacao).slice(0, 160) },
        workflow_id: 'sync-matriculas-emusys',
        execution_id: new Date().toISOString(),
      });
    }
  }
  return atualizados;
}

const TIPOS_DECISAO_IGNORA_SYNC = new Set([
  'ignorar_matricula_api',
  'responsavel_nao_aluno',
]);

const CAMPOS_FINANCEIROS_SYNC = [
  'valor_cheio',
  'desconto_fixo',
  'desconto_condicional',
  'valor_parcela',
  'status_pagamento',
  'tipo_matricula_id',
];

function deveIgnorarSyncPorDecisaoCanonica(decisao: any): boolean {
  if (!decisao) return false;
  return decisao.ignorar_sync === true || TIPOS_DECISAO_IGNORA_SYNC.has(String(decisao.tipo_decisao || ''));
}

function camposBloqueadosPorDecisaoCanonica(decisao: any): Set<string> {
  const campos = new Set<string>();
  if (!decisao) return campos;
  for (const campo of Array.isArray(decisao.campos_bloqueados) ? decisao.campos_bloqueados : []) {
    if (temValor(campo)) campos.add(String(campo));
  }
  if (String(decisao.tipo_decisao || '') === 'bloquear_auto_sync') {
    for (const campo of CAMPOS_FINANCEIROS_SYNC) campos.add(campo);
  }
  return campos;
}

function combinarCamposFixados(...sets: Set<string>[]): Set<string> {
  const combinado = new Set<string>();
  for (const set of sets) {
    for (const valor of set || []) combinado.add(valor);
  }
  return combinado;
}

function criarDivergenciaAtributo(a: any, mat: any, tipo: string, campo: string, valorNosso: any, valorEmusys: any, sugestao: any, severidade = 'media') {
  return {
    unidade_id: a.unidade_id,
    aluno_id: a.id,
    emusys_student_id: String(mat?.aluno?.id ?? a.emusys_student_id ?? ''),
    emusys_matricula_id: String(mat?.id ?? a.emusys_matricula_id ?? ''),
    tipo_divergencia: tipo,
    campo,
    valor_nosso: valorNosso ?? {},
    valor_emusys: valorEmusys ?? {},
    sugestao: sugestao ?? {},
    fonte: 'emusys_matriculas',
    severidade,
    resolvido: false,
    updated_at: new Date().toISOString(),
  };
}

function detectarDivergenciasAtributosAluno(
  a: any,
  mat: any,
  formaPagamentoLocal: any,
  fixados: Set<string> = new Set(),
  tipoCodigo: string | null = null,
) {
  const rows: any[] = [];
  if (!mat) return rows;

  const fotoEmusys = extrairFotoAluno(mat);
  if (!fixados.has('foto_url') && fotoEmusys && !temValor(a.foto_url) && !temValor(a.photo_url)) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'foto_ausente', 'foto_url',
      { foto_url: a.foto_url ?? null, photo_url: a.photo_url ?? null },
      { foto_url: fotoEmusys },
      { foto_url: fotoEmusys },
      'baixa',
    ));
  }

  const instagramEmusys = extrairInstagramAluno(mat);
  const instagramNosso = a.instagram;
  const instagramSemPendencia = a.instagram_nao_possui === true || textoIndicaSemInstagramEmusys(instagramEmusys);
  if (!instagramSemPendencia && !fixados.has('instagram') && instagramEmusys && !temValor(instagramNosso)) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'instagram_ausente', 'instagram',
      { instagram: instagramNosso ?? null },
      { instagram: instagramEmusys },
      { instagram: instagramEmusys },
      'baixa',
    ));
  } else if (!instagramSemPendencia && !fixados.has('instagram') && instagramEmusys && normalizarInstagramValor(instagramEmusys) !== normalizarInstagramValor(instagramNosso)) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'instagram_divergente', 'instagram',
      { instagram: instagramNosso ?? null },
      { instagram: instagramEmusys },
      { instagram: instagramEmusys },
      'baixa',
    ));
  }

  const telefoneEmusys = mat?.aluno?.telefone;
  const telefoneNosso = a.telefone || a.whatsapp;
  if (!fixados.has('telefone') && temValor(telefoneEmusys) && normalizarTelefoneValor(telefoneEmusys) !== normalizarTelefoneValor(telefoneNosso)) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'contato_divergente', 'telefone',
      { telefone: a.telefone ?? null, whatsapp: a.whatsapp ?? null },
      { telefone: telefoneEmusys },
      { telefone: telefoneEmusys },
      'media',
    ));
  }

  const emailEmusys = mat?.aluno?.email;
  if (!fixados.has('email') && temValor(emailEmusys) && normalizarTextoValor(emailEmusys) !== normalizarTextoValor(a.email)) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'contato_divergente', 'email',
      { email: a.email ?? null },
      { email: emailEmusys },
      { email: emailEmusys },
      'media',
    ));
  }

  const responsavel = mat?.responsavel || {};
  if (!fixados.has('responsavel_nome') && temValor(responsavel.nome) && normalizarTextoValor(responsavel.nome) !== normalizarTextoValor(a.responsavel_nome)) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'responsavel_divergente', 'responsavel_nome',
      { responsavel_nome: a.responsavel_nome ?? null },
      { responsavel_nome: responsavel.nome },
      { responsavel_nome: responsavel.nome },
      'media',
    ));
  }
  if (!fixados.has('responsavel_telefone') && temValor(responsavel.telefone) && normalizarTelefoneValor(responsavel.telefone) !== normalizarTelefoneValor(a.responsavel_telefone)) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'responsavel_divergente', 'responsavel_telefone',
      { responsavel_telefone: a.responsavel_telefone ?? null },
      { responsavel_telefone: responsavel.telefone },
      { responsavel_telefone: responsavel.telefone },
      'media',
    ));
  }

  const financeiro = analisarFinanceiroContrato(mat);
  const statusFinanceiroEmusys = financeiro.statusPagamentoCanonico ?? extrairStatusFinanceiroEmusys(mat);
  const permiteSyncStatusFinanceiro = String(a.status || '').toLowerCase() === 'ativo';
  const ignoraStatusFinanceiro = deveIgnorarStatusFinanceiroPorTipo(
    tipoCodigo,
    a.status_pagamento,
    statusFinanceiroEmusys,
  );
  if (permiteSyncStatusFinanceiro && !fixados.has('status_pagamento') && statusFinanceiroEmusys && !ignoraStatusFinanceiro && normalizarTextoValor(statusFinanceiroEmusys) !== normalizarTextoValor(a.status_pagamento)) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'status_financeiro_divergente', 'status_pagamento',
      { status_pagamento: a.status_pagamento ?? null },
      { status_pagamento: statusFinanceiroEmusys, cobranca_automatica_status: mat?.cobranca_automatica?.status ?? null },
      { status_pagamento: statusFinanceiroEmusys },
      statusFinanceiroEmusys === 'inadimplente' ? 'alta' : 'media',
    ));
  }

  const formaEmusys = extrairFormaPagamentoEmusys(mat);
  const formaNosso = formaPagamentoLocal?.nome ?? formaPagamentoLocal?.sigla ?? null;
  if (!fixados.has('forma_pagamento_id') && formaEmusys && normalizarFormaPagamentoValor(formaEmusys) !== normalizarFormaPagamentoValor(formaNosso)) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'forma_pagamento_divergente', 'forma_pagamento_id',
      { forma_pagamento_id: a.forma_pagamento_id ?? null, nome: formaPagamentoLocal?.nome ?? null, sigla: formaPagamentoLocal?.sigla ?? null },
      { forma_pagamento: formaEmusys, cobranca_automatica_status: mat?.cobranca_automatica?.status ?? null },
      { forma_pagamento: formaEmusys },
      'baixa',
    ));
  }

  const aguardandoRenovacaoEmusys = extrairAguardandoRenovacaoEmusys(mat);
  if (!fixados.has('aguardando_renovacao') && aguardandoRenovacaoEmusys !== null && aguardandoRenovacaoEmusys !== a.aguardando_renovacao) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'aguardando_renovacao_divergente', 'aguardando_renovacao',
      { aguardando_renovacao: a.aguardando_renovacao ?? null },
      { aguardando_renovacao: aguardandoRenovacaoEmusys },
      { aguardando_renovacao: aguardandoRenovacaoEmusys },
      'media',
    ));
  }

  if (!fixados.has('anamnese_preenchida') && a.status === 'ativo' && a.anamnese_preenchida !== true) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'anamnese_pendente', 'anamnese_preenchida',
      { anamnese_preenchida: a.anamnese_preenchida ?? null },
      { fonte: 'la_report' },
      { acao: 'preencher_anamnese' },
      'baixa',
    ));
  }

  // data_nascimento: comparacao direta YYYY-MM-DD. Nunca auto-aplica — vai pra fila
  // com severidade alta (bug historico do webhook mandava a data do responsavel).
  const dnEmusys = mat?.aluno?.data_nascimento;
  if (!fixados.has('data_nascimento') && temValor(dnEmusys) && String(dnEmusys) !== String(a.data_nascimento ?? '')) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'data_nascimento_divergente', 'data_nascimento',
      { data_nascimento: a.data_nascimento ?? null },
      { data_nascimento: dnEmusys },
      { data_nascimento: dnEmusys },
      'alta',
    ));
  }

  return rows;
}

const TIPOS_ATRIBUTO_POR_ALUNO = new Set([
  'foto_ausente',
  'instagram_ausente',
  'instagram_divergente',
  'contato_divergente',
  'responsavel_divergente',
  'anamnese_pendente',
  'contrato_assinatura_pendente',
  'data_nascimento_divergente',
]);

function chaveAtributo(row: any): string {
  if (TIPOS_ATRIBUTO_POR_ALUNO.has(row.tipo_divergencia)) {
    return `${row.aluno_id ?? -1}|aluno|${row.tipo_divergencia}|${row.campo}`;
  }
  return `${row.aluno_id ?? -1}|${row.emusys_matricula_id ?? ''}|${row.tipo_divergencia}|${row.campo}`;
}

function deduplicarDivergenciasAtributos(rows: any[]) {
  const porChave = new Map<string, any>();
  for (const row of rows) {
    const key = chaveAtributo(row);
    if (!porChave.has(key)) porChave.set(key, row);
  }
  return [...porChave.values()];
}

async function persistirDivergenciasAtributos(supabase: any, unidadeId: string, rows: any[]) {
  const rowsDeduplicadas = deduplicarDivergenciasAtributos(rows);
  const { data: existentes } = await supabase
    .from('alunos_emusys_atributos_divergencias')
    .select('id, aluno_id, emusys_matricula_id, tipo_divergencia, campo')
    .eq('unidade_id', unidadeId)
    .eq('fonte', 'emusys_matriculas')
    .eq('resolvido', false);

  const existentesPorChave = new Map<string, any>();
  const duplicadosExistentes: string[] = [];
  for (const row of existentes || []) {
    const key = chaveAtributo(row);
    if (existentesPorChave.has(key)) {
      duplicadosExistentes.push(row.id);
    } else {
      existentesPorChave.set(key, row);
    }
  }

  const atuais = new Set(rowsDeduplicadas.map(chaveAtributo));
  const inserts: any[] = [];
  for (const row of rowsDeduplicadas) {
    const existente = existentesPorChave.get(chaveAtributo(row));
    if (existente) {
      await supabase
        .from('alunos_emusys_atributos_divergencias')
        .update({
          emusys_student_id: row.emusys_student_id,
          valor_nosso: row.valor_nosso,
          valor_emusys: row.valor_emusys,
          sugestao: row.sugestao,
          severidade: row.severidade,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existente.id);
    } else {
      inserts.push(row);
    }
  }

  if (inserts.length) {
    for (let i = 0; i < inserts.length; i += 200) {
      await supabase.from('alunos_emusys_atributos_divergencias').insert(inserts.slice(i, i + 200));
    }
  }

  const obsoletos = (existentes || [])
    .filter((row: any) => !atuais.has(chaveAtributo(row)))
    .map((row: any) => row.id);
  const resolver = [...new Set([...obsoletos, ...duplicadosExistentes])];
  if (resolver.length) {
    await supabase
      .from('alunos_emusys_atributos_divergencias')
      .update({ resolvido: true, decisao: 'resolvido_por_sync', updated_at: new Date().toISOString() })
      .in('id', resolver);
  }
}

async function fetchTodasMatriculasCompletoLegacy(token: string) {
  const porId = new Map<number, any>();
  // indexa TODOS os status para o fallback de nome — a reconciliação resolve o conflito depois
  const todasPorNome = new Map<string, any[]>();
  let cursor = '';
  for (let i = 0; i < 200; i++) {
    const url = `${EMUSYS_API}/matriculas?status=todas&limite=50${cursor ? `&cursor=${cursor}` : ''}`;
    const resp = await fetchEmusysMatriculas(url, token, 'todas');
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
    await sleep(EMUSYS_PAGE_THROTTLE_MS); // throttle: rate limit 60/min por IP
  }
  return { porId, ativasPorNome: todasPorNome };
}

type MatriculasFetchResult = {
  porId: Map<number, any>;
  ativasPorNome: Map<string, any[]>;
  snapshotCompleto: boolean;
  linhasRecebidas: number;
  linhasAtivas: number;
  linhasTrancadas: number;
};

async function fetchMatriculasOperacionais(token: string): Promise<MatriculasFetchResult> {
  const porId = new Map<number, any>();
  const todasPorNome = new Map<string, any[]>();
  let snapshotCompleto = true;

  // O escopo operacional consulta explicitamente status=ativa e status=trancada.
  for (const status of ['ativa', 'trancada']) {
    let cursor = '';
    let paginaCompleta = false;
    for (let i = 0; i < 200; i++) {
      const url = `${EMUSYS_API}/matriculas?status=${status}&limite=50${cursor ? `&cursor=${cursor}` : ''}`;
      const resp = await fetchEmusysMatriculas(url, token, status);
      if (!resp.ok) throw new Error(`API ${resp.status} (${status})`);
      const json = await resp.json();
      for (const m of json.items || []) {
        const id = Number(m.id);
        if (!Number.isFinite(id)) continue;
        porId.set(id, m);
        const k = normalizarNome(m.aluno?.nome || '');
        if (!todasPorNome.has(k)) todasPorNome.set(k, []);
        const existentes = todasPorNome.get(k)!;
        if (!existentes.some((existente) => Number(existente.id) === id)) existentes.push(m);
      }
      if (!json.paginacao?.tem_mais) {
        paginaCompleta = true;
        break;
      }
      if (!json.paginacao?.proximo_cursor) break;
      cursor = json.paginacao.proximo_cursor;
      await sleep(EMUSYS_PAGE_THROTTLE_MS); // throttle: rate limit 60/min por IP
    }
    if (!paginaCompleta) snapshotCompleto = false;
  }

  return {
    porId,
    ativasPorNome: todasPorNome,
    snapshotCompleto,
    linhasRecebidas: porId.size,
    linhasAtivas: [...porId.values()].filter((mat) => mat.status === 'ativa').length,
    linhasTrancadas: [...porId.values()].filter((mat) => mat.status === 'trancada').length,
  };
}

async function fetchTodasMatriculas(
  token: string,
  escopo: 'operacional' | 'completo' = 'completo',
): Promise<MatriculasFetchResult> {
  if (escopo === 'operacional') return fetchMatriculasOperacionais(token);
  const resultado = await fetchTodasMatriculasCompletoLegacy(token);
  return {
    ...resultado,
    snapshotCompleto: true,
    linhasRecebidas: resultado.porId.size,
    linhasAtivas: [...resultado.porId.values()].filter((mat) => mat.status === 'ativa').length,
    linhasTrancadas: [...resultado.porId.values()].filter((mat) => mat.status === 'trancada').length,
  };
}

function numeroFinitoOuNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function leadIdFinitoOuNull(value: unknown): number | null {
  const parsed = numeroFinitoOuNull(value);
  return parsed != null && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Resolve uma linha de aluno somente por identidade externa no escopo da
 * unidade. Se o aluno Emusys tiver mais de uma linha local (segundo curso),
 * o fallback por aluno fica ambíguo e nenhuma linha recebe Lead ID por nome.
 */
function localizarAlunoParaLeadId(
  alunos: any[],
  unidadeId: string,
  matricula: any,
): any | null {
  const matriculaId = numeroFinitoOuNull(matricula?.id);
  if (matriculaId == null) return null;

  const noEscopo = alunos.filter((aluno) => String(aluno.unidade_id) === String(unidadeId));
  const porMatricula = noEscopo.filter((aluno) =>
    numeroFinitoOuNull(aluno.emusys_matricula_id) === matriculaId
  );
  if (porMatricula.length === 1) return porMatricula[0];
  if (porMatricula.length > 1) return null;

  const alunoEmusysId = numeroFinitoOuNull(matricula?.aluno?.id);
  if (alunoEmusysId == null) return null;
  const porAluno = noEscopo.filter((aluno) =>
    numeroFinitoOuNull(aluno.emusys_student_id) === alunoEmusysId
  );
  return porAluno.length === 1 ? porAluno[0] : null;
}

type JornadaUpsertResumo = {
  atualizadas: number;
  erros: number;
  mensagens: Array<{
    mensagem: string;
    emusys_matricula_id: number | null;
    emusys_matricula_disciplina_id: number | null;
    aluno_nome: string | null;
    disciplina: string | null;
  }>;
};

function mergeJornadaResumo(target: JornadaUpsertResumo, partial: JornadaUpsertResumo) {
  target.atualizadas += partial.atualizadas;
  target.erros += partial.erros;
  target.mensagens.push(...partial.mensagens);
  if (target.mensagens.length > 10) target.mensagens = target.mensagens.slice(0, 10);
}

async function upsertJornadasEmLote(supabase: any, rows: any[]) {
  const result: JornadaUpsertResumo = { atualizadas: 0, erros: 0, mensagens: [] };
  if (!rows.length) return result;

  const porChave = new Map<string, any>();
  for (const row of rows) {
    porChave.set(`${row.unidade_id}|${row.emusys_matricula_disciplina_id}`, row);
  }

  const deduped = Array.from(porChave.values());
  for (let i = 0; i < deduped.length; i += 20) {
    const chunk = deduped.slice(i, i + 20);
    const { error } = await supabase
      .from('aluno_jornada_matricula_disciplina')
      .upsert(chunk, { onConflict: 'unidade_id,emusys_matricula_disciplina_id' });

    if (error) {
      const sample = chunk[0];
      mergeJornadaResumo(result, {
        atualizadas: 0,
        erros: chunk.length,
        mensagens: [{
          mensagem: error.message,
          emusys_matricula_id: sample?.emusys_matricula_id ?? null,
          emusys_matricula_disciplina_id: sample?.emusys_matricula_disciplina_id ?? null,
          aluno_nome: sample?.payload_snapshot?.matricula?.nome_aluno ?? null,
          disciplina: sample?.curso_nome_emusys ?? null,
        }],
      });
      console.error('[jornada-canonica] erro no upsert em lote', error.message);
    } else {
      result.atualizadas += chunk.length;
    }
  }

  return result;
}

function buildEstadoAtualRows(
  matriculas: Iterable<any>,
  alunoIdPorMatriculaEmusys: Map<number, number>,
  alunoIdPorAlunoEmusys: Map<number, number>,
) {
  const rows: any[] = [];

  for (const mat of matriculas) {
    const emusysMatriculaId = numeroFinitoOuNull(mat?.id);
    if (emusysMatriculaId == null) continue;

    const emusysAlunoId = numeroFinitoOuNull(mat?.aluno?.id);
    const alunoId = alunoIdPorMatriculaEmusys.get(emusysMatriculaId)
      ?? (emusysAlunoId == null ? null : alunoIdPorAlunoEmusys.get(emusysAlunoId))
      ?? null;
    const lifecycle = resolveEmusysMatriculaLifecycle(mat);

    rows.push({
      emusys_matricula_id: emusysMatriculaId,
      emusys_aluno_id: emusysAlunoId,
      aluno_id: alunoId,
      emusys_contrato_id: numeroFinitoOuNull(mat?.contrato_atual?.id),
      status_emusys: lifecycle.rawStatus,
      status_emusys_bruto: mat?.status == null ? null : String(mat.status),
      motivo_inativa: lifecycle.rawReason,
      motivo_inativa_bruto: mat?.motivo_inativa == null ? null : String(mat.motivo_inativa),
      status_local_resolvido: lifecycle.localStatus,
      status_jornada_resolvido: lifecycle.journeyStatus,
      tipo_movimento_resolvido: lifecycle.movementKind,
      transicao_automatica: lifecycle.automaticTransition,
      motivo_auditoria: lifecycle.auditReason,
      trancamento_id: lifecycle.lock?.id ?? null,
      trancamento_motivo: lifecycle.lock?.motivo ?? null,
      trancamento_data_inicial: lifecycle.lock?.dataInicial ?? null,
      trancamento_data_final: lifecycle.lock?.dataFinal ?? null,
      payload_snapshot: mat,
    });
  }

  return rows;
}

async function upsertEstadosAtuaisEmLote(supabase: any, u: { id: string }, rows: any[]) {
  const result = {
    recebidas: rows.length,
    gravadas: 0,
    rejeitadas: 0,
    erros: 0,
    mensagens: [] as string[],
  };

  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { data, error } = await supabase.rpc(
      'upsert_emusys_matriculas_estado_atual',
      {
        p_unidade_id: u.id,
        p_linhas: chunk,
      },
    );

    if (error) {
      result.erros += chunk.length;
      result.mensagens.push(error.message);
      continue;
    }

    result.gravadas += Number(data?.gravadas ?? 0);
    result.rejeitadas += Number(data?.rejeitadas ?? 0);
  }

  return result;
}

async function reconciliarEstadosOperacionaisAusentes(
  supabase: any,
  unidadeId: string,
  idsOperacionais: number[],
  sincronizadoEm: string,
) {
  let query = supabase
    .from('emusys_matriculas_estado_atual')
    .update({
      status_emusys: 'inativa',
      status_emusys_bruto: 'inativa',
      motivo_inativa: null,
      motivo_inativa_bruto: null,
      status_local_resolvido: null,
      status_jornada_resolvido: 'desconhecido',
      tipo_movimento_resolvido: null,
      transicao_automatica: false,
      motivo_auditoria: 'fora_do_snapshot_operacional',
      trancamento_id: null,
      trancamento_motivo: null,
      trancamento_data_inicial: null,
      trancamento_data_final: null,
      sincronizado_em: sincronizadoEm,
      updated_at: sincronizadoEm,
    })
    .eq('unidade_id', unidadeId)
    .in('status_emusys', ['ativa', 'trancada']);

  if (idsOperacionais.length > 0) {
    query = query.not(
      'emusys_matricula_id',
      'in',
      `(${idsOperacionais.join(',')})`,
    );
  }

  const { data, error } = await query.select('emusys_matricula_id');
  if (error) throw error;
  return (data || []).length;
}

// Wrapper fino: extrai a lista de disciplinas do formato da API e delega a regra ao
// modulo compartilhado. O webhook `matricula_alterada` chama a MESMA funcao passando
// `matricula.disciplinas` (formato dele). Nao reimplementar a regra aqui.
function resolverCursoContrato(mat: any, depara: Map<number, number | null>, banda: Set<number>) {
  return resolverCursoDasDisciplinas(mat?.contrato_atual?.disciplinas || [], depara, banda);
}

function matriculaCompativelComLinha(
  a: any,
  tipoCodigo: string | null,
  mat: any,
  depara: Map<number, number | null>,
  banda: Set<number>,
) {
  const linhaEhBanda = String(tipoCodigo || '').toUpperCase() === 'BANDA' || banda.has(Number(a.curso_id));
  const { cursos, cursosBanda } = resolverCursoContrato(mat, depara, banda);
  const emusysTemRegular = cursos.length > 0;
  const emusysTemBanda = cursosBanda.length > 0;

  // Disciplina ainda sem de/para vira revisao depois; nao bloqueia o match aqui.
  if (!emusysTemRegular && !emusysTemBanda) return true;
  if (linhaEhBanda) return emusysTemBanda;
  return emusysTemRegular || !emusysTemBanda;
}

// Wrapper fino sobre o modulo compartilhado — ver comentario de resolverCursoContrato.
function resolverProfessorContrato(mat: any, profMap: Map<number, number>) {
  return resolverProfessorDasDisciplinas(mat?.contrato_atual?.disciplinas || [], profMap);
}

function encontrarRenovacaoPendenteDaMesmaMatricula(
  pendentes: any[],
  aluno: any,
  matriculaEmusys: any,
  movimentacoesProcessadas: Set<number>,
) {
  const matriculaId = numeroFinitoOuNull(matriculaEmusys?.id);
  if (matriculaId == null) return null;

  const candidatas = pendentes.filter((mov: any) => {
    if (movimentacoesProcessadas.has(Number(mov.id))) return false;
    if (Number(mov.aluno_id) !== Number(aluno.id)) return false;
    if (mov.curso_id && aluno.curso_id && Number(mov.curso_id) !== Number(aluno.curso_id)) return false;

    const idRegistrado = numeroFinitoOuNull(mov.emusys_matricula_id);
    return idRegistrado == null || idRegistrado === matriculaId;
  });

  if (candidatas.length !== 1) return null;
  return { ...candidatas[0], emusys_matricula_id: matriculaId };
}

function temNaoRenovacaoCanonicaDaMesmaMatricula(
  naoRenovacoesCanonicas: any[],
  aluno: any,
  matriculaEmusys: any,
) {
  const matriculaId = numeroFinitoOuNull(matriculaEmusys?.id);
  if (matriculaId == null) return false;
  const lifecycle = resolveEmusysMatriculaLifecycle(matriculaEmusys);
  if (lifecycle.rawReason === 'interrompida') return false;
  const ehConclusaoV131 = lifecycle.rawReason === 'concluida';
  if (
    !ehConclusaoV131
    && lifecycle.rawStatus !== 'finalizada'
  ) return false;
  if (String(aluno?.status ?? '').toLowerCase() !== 'inativo') return false;

  return naoRenovacoesCanonicas.some((mov: any) => (
    Number(mov.aluno_id) === Number(aluno.id)
    && numeroFinitoOuNull(mov.emusys_matricula_id) === matriculaId
  ));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const bloqueioAcesso = await validarAcessoSync(req);
  if (bloqueioAcesso) return bloqueioAcesso;

  const url = new URL(req.url);
  const alvo = url.searchParams.get('u') || 'cg';
  const escopo = url.searchParams.get('escopo') === 'completo' ? 'completo' : 'operacional';
  const u = UNIDADES[alvo];
  if (!u) return new Response(JSON.stringify({ erro: 'unidade inválida; use ?u=cg|recreio|barra' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const resumo: any = {
    // 'aplicacao_direta' desde 2026-08-18: fato do Emusys entra no cadastro sem fila.
    modo: 'aplicacao_direta',
    unidade: u.nome,
    escopo,
    sync_execucao_id: null,
    aplicados: 0,
    aplicados_por_campo: {},
    fila: {},
    atributos: {},
    pendencias_fora_escopo: { atributos: 0, matriculas: 0 },
    jornadas: { atualizadas: 0, puladas: 0, erros: 0 },
    lead_id: {
      preenchidos: 0,
      idempotentes: 0,
      divergencias: 0,
      sem_dado: 0,
      sem_correspondencia: 0,
      ambiguos: 0,
      erros: 0,
    },
    estados_atual: { recebidas: 0, gravadas: 0, rejeitadas: 0, erros: 0 },
    nao_renovacoes_convertidas: 0,
    nao_renovacoes_erros: [],
    erros: 0,
  };
  const logs: any[] = [];
  const divs: any[] = [];
  const attrDivs: any[] = [];
  // Escopo operacional: alunos vinculados cuja matrícula NÃO veio no payload (provavelmente
  // finalizada). reconciliar() os pula, e eles ficam FORA de toda limpeza por rodada — senão
  // o "processado sem regenerar" apagaria pendências legítimas criadas pelo escopo completo.
  const alunosForaDoPayloadOperacional = new Set<number>();

  let syncExecucaoId: string | null = null;

  try {
    // ⚠️ 2026-08-19: cada disparo do cron chega aqui como 2-4 execucoes. Medido:
    // pg_cron roda 1x (20 execucoes em 20 min nos jobs de 1 min) e o pg_net manda
    // 1 request (4 crons/min -> 4 respostas/min; teste isolado 1->1), mas esta
    // tabela recebe 3 linhas por janela, com ids e horarios distintos. A
    // multiplicacao esta entre o pg_net e a execucao, fora do nosso alcance.
    //
    // Sem trava, as 3 varrem `GET /matriculas` da MESMA unidade ao mesmo tempo e
    // o Emusys derruba por rate limit: em 19/08 o CG (1o do rodizio, maior
    // volume) falhou nas 3 tentativas com "API 429 (ativa) apos 5 tentativas" e
    // nao sincronizou.
    //
    // O INSERT abaixo virou a TOMADA DE VEZ: o indice unico parcial
    // `uq_sync_matriculas_execucao_viva_por_unidade` (migration 20260819150000)
    // deixa passar so uma execucao viva por unidade. A 2a e a 3a batem em 23505
    // e saem aqui, sem tocar na API. Nao da para trocar por "SELECT antes do
    // INSERT": as 3 chegam em ~0,6s e as 3 leriam "nada rodando" antes de
    // qualquer gravacao (check-then-act). A trava e POR UNIDADE — CG nunca
    // bloqueia Barra/Recreio.
    //
    // Mesmo principio ja usado por `processarFilaAgente` em
    // `processar-mensagens-agendadas` (UPDATE ... WHERE processando = false).

    // Guarda de execucao travada: sem isto, uma linha presa em 'running' (crash,
    // timeout do runtime, deploy no meio do run) bloquearia a unidade para
    // sempre — o indice nao sabe de tempo. Best-effort: falha aqui nao derruba o
    // sync, so deixa a trava mais conservadora.
    try {
      const { error: liberacaoError } = await supabase
        .rpc('liberar_sync_matriculas_travado', { p_unidade_id: u.id });
      if (liberacaoError) {
        console.error(`[sync-matriculas] liberar_sync_matriculas_travado falhou: ${liberacaoError.message}`);
      }
    } catch (erroLiberacao: any) {
      console.error(`[sync-matriculas] liberar_sync_matriculas_travado excecao: ${erroLiberacao?.message ?? erroLiberacao}`);
    }

    const { data: execucao, error: execucaoError } = await supabase
      .from('emusys_matriculas_sync_execucoes')
      .insert({ unidade_id: u.id, escopo, status: 'running' })
      .select('id')
      .single();

    // 23505 = unique_violation. Nao e erro: e outra execucao da mesma janela ja
    // trabalhando. Responde 200 para o cron nao registrar falha, e sai ANTES de
    // qualquer chamada ao Emusys.
    if (execucaoError?.code === '23505') {
      return new Response(JSON.stringify({
        ...resumo,
        status: 'ignorado_concorrencia',
        motivo: 'ja existe execucao viva para esta unidade; invocacao duplicada saiu sem chamar a API',
      }, null, 2), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (execucaoError) throw execucaoError;
    syncExecucaoId = execucao.id;
    resumo.sync_execucao_id = syncExecucaoId;

    const {
      porId,
      ativasPorNome,
      snapshotCompleto,
      linhasRecebidas,
      linhasAtivas,
      linhasTrancadas,
    } = await fetchTodasMatriculas(u.token, escopo);
    resumo.snapshot_completo = snapshotCompleto;
    resumo.linhas_recebidas = linhasRecebidas;
    resumo.linhas_ativas = linhasAtivas;
    resumo.linhas_trancadas = linhasTrancadas;
    if (!snapshotCompleto) throw new Error('SNAPSHOT_OPERACIONAL_INCOMPLETO');

    const { data: cursosBanda } = await supabase.from('cursos').select('id').eq('is_projeto_banda', true);
    const banda = new Set<number>((cursosBanda || []).map((c: any) => c.id));

    const { data: dep } = await supabase.from('curso_emusys_depara').select('emusys_disciplina_id, curso_id').eq('unidade_id', u.id);
    const depara = new Map<number, number | null>((dep || []).map((d: any) => [d.emusys_disciplina_id, d.curso_id]));

    const { data: prof } = await supabase
      .from('professores_unidades')
      .select(`
        emusys_id,
        professor_id,
        emusys_ativo,
        validacao_status,
        identidade_historica_valida,
        professores:professor_id (ativo)
      `)
      .eq('unidade_id', u.id)
      .not('emusys_id', 'is', null);
    const profMap = new Map<number, number>();
    const profMapJornada = new Map<number, number>();
    for (const vinculo of prof || []) {
      const emusysId = Number((vinculo as any).emusys_id);
      if (!Number.isInteger(emusysId) || emusysId <= 0) continue;

      const relacaoProfessor = Array.isArray((vinculo as any).professores)
        ? (vinculo as any).professores[0]
        : (vinculo as any).professores;
      const historico = (vinculo as any).identidade_historica_valida === true;
      const operacional = (vinculo as any).emusys_ativo === true
        && (vinculo as any).validacao_status !== 'ignorado'
        && relacaoProfessor?.ativo === true;

      if (operacional) profMap.set(emusysId, (vinculo as any).professor_id);
      if (operacional || historico) {
        profMapJornada.set(emusysId, (vinculo as any).professor_id);
      }
    }

    const { data: formasPagamento } = await supabase.from('formas_pagamento').select('id, nome, sigla');
    const formasPagamentoMap = new Map<number, any>((formasPagamento || []).map((f: any) => [f.id, f]));

    const { data: alunos } = await supabase.from('alunos')
      // ⚠️ `data_nascimento` FALTAVA aqui até 2026-08-19 e isso gerava 1.184 tarefas FALSAS
      // por rodada: a detecção comparava o campo do Emusys contra `a.data_nascimento`, que
      // vinha sempre `undefined` por não ter sido selecionado. Toda data virava "nosso está
      // vazio" mesmo depois de preenchida — a fila se recriava sozinha todo dia. Medido em
      // 19/08: 690 alertas novos onde nosso e Emusys eram idênticos (ex.: Mateus Plácido
      // Coimbra, 2011-07-03 dos dois lados). Ao mexer na detecção de atributos, conferir
      // que TODO campo comparado está nesta lista.
      .select('id, unidade_id, nome, curso_id, professor_atual_id, emusys_matricula_id, emusys_student_id, emusys_lead_id, status, is_ex_aluno, data_fim_contrato, valor_cheio, desconto_fixo, desconto_condicional, valor_parcela, tipo_matricula_id, dia_aula, horario_aula, telefone, whatsapp, email, responsavel_nome, responsavel_telefone, foto_url, photo_url, instagram, instagram_nao_possui, status_pagamento, forma_pagamento_id, anamnese_preenchida, aguardando_renovacao, data_nascimento')
      .eq('unidade_id', u.id)
      .is('arquivado_em', null);

    const { data: renovacoesPendentes, error: renovacoesPendentesError } = await supabase
      .from('movimentacoes_admin')
      .select('id, unidade_id, aluno_id, curso_id, tipo, renovacao_status, emusys_matricula_id')
      .eq('unidade_id', u.id)
      .eq('tipo', 'renovacao')
      .in('renovacao_status', ['pendente_validacao', 'antecipada_pendente']);

    if (renovacoesPendentesError) throw renovacoesPendentesError;
    const movimentacoesNaoRenovacaoProcessadas = new Set<number>();

    const { data: naoRenovacoesCanonicas, error: naoRenovacoesCanonicasError } = await supabase
      .from('movimentacoes_admin')
      .select('id, aluno_id, emusys_matricula_id')
      .eq('unidade_id', u.id)
      .eq('tipo', 'nao_renovacao')
      .not('emusys_matricula_id', 'is', null);

    if (naoRenovacoesCanonicasError) throw naoRenovacoesCanonicasError;
    const alunosComStatusCanonico = new Set<number>();

    const alunosParaReconciliar = (alunos || []).filter((a: any) => {
      const status = String(a.status || '').trim().toLowerCase();
      return !['inativo', 'evadido'].includes(status) || temValor(a.emusys_matricula_id);
    });

    // Uma decisao local explicita protege o campo contra a fonte externa.
    const idsAlunos = (alunos || []).map((a: any) => Number(a.id)).filter(Number.isFinite);
    const fixadosMap = new Map<number, Set<string>>();
    if (idsAlunos.length) {
      const { data: camposFixados, error: camposFixadosError } = await supabase
        .from('matriculas_campos_fixados')
        .select('aluno_id, campo')
        .in('aluno_id', idsAlunos);
      if (camposFixadosError) throw camposFixadosError;
      for (const campoFixado of camposFixados || []) {
        if (!fixadosMap.has(campoFixado.aluno_id)) fixadosMap.set(campoFixado.aluno_id, new Set());
        fixadosMap.get(campoFixado.aluno_id)!.add(campoFixado.campo);
      }
    }

    const alunoIdPorMatriculaEmusys = new Map<number, number>();
    const alunoIdPorAlunoEmusys = new Map<number, number>();
    for (const aluno of alunos || []) {
      const matriculaId = numeroFinitoOuNull(aluno.emusys_matricula_id);
      if (matriculaId != null) alunoIdPorMatriculaEmusys.set(matriculaId, aluno.id);

      const alunoEmusysId = numeroFinitoOuNull(aluno.emusys_student_id);
      if (alunoEmusysId != null) alunoIdPorAlunoEmusys.set(alunoEmusysId, aluno.id);
    }

    const linhasEstadoAtual = buildEstadoAtualRows(
      porId.values(),
      alunoIdPorMatriculaEmusys,
      alunoIdPorAlunoEmusys,
    );
    resumo.estados_atual = await upsertEstadosAtuaisEmLote(
      supabase,
      u,
      linhasEstadoAtual,
    );
    if (resumo.estados_atual.erros > 0) {
      throw new Error(
        `Falha ao materializar ${resumo.estados_atual.erros} estados atuais de matricula`,
      );
    }

    // ─── A5. Jornada canônica ─────────────────────────────────────────────────
    // Espelha o contrato vigente de cada matrícula×disciplina em
    // aluno_jornada_matricula_disciplina: data da primeira/última aula, aulas
    // passadas/futuras, nr_faturas e data_primeira_fatura. É a fonte de
    // vw_jornada_aluno_atual (20+ consumidores: carteira, agenda, health score) e,
    // por ela, de vw_contratos_vencendo e vw_renovacao_ciclos.
    // `skipped` conta matrícula sem de-para de curso/aluno — não é erro, é linha
    // que não dá para posicionar. O upsert dispara trg_jornada_ciclo_sucedido,
    // que marca o ciclo antigo como sucedido quando a renovação cria um novo.
    //
    // ⚠️ Roda ANTES do return do escopo operacional de propósito. De 2026-08-11 a
    // 2026-08-12 este bloco ficou depois do return e o cron diário parou de
    // atualizar a jornada nas 3 unidades — Contratos Vencendo e Cobertura de
    // Renovação passaram a ler dado congelado, sem nenhum erro aparecer (a função
    // seguia respondendo 200/succeeded). Não mova para baixo do return.
    // ⚠️ No escopo operacional o snapshot traz só ativa+trancada: quem foi
    // finalizado some do payload e NÃO é atualizado aqui. Quem cobre isso é o
    // webhook matricula_finalizacao (tempo real) e o escopo completo.
    const linhasJornada: any[] = [];
    for (const mat of porId.values()) {
      const input = buildJornadaInputFromMatriculaApi(mat, u.id, 'sync-matriculas-emusys');
      if (!input) continue;
      const { rows, skipped } = buildJornadaRowsForUpsert(input, {
        alunoIdPorMatriculaEmusys,
        alunoIdPorAlunoEmusys,
        cursoIdPorDisciplinaEmusys: depara,
        professorIdPorProfessorEmusys: profMapJornada,
      });
      linhasJornada.push(...rows);
      resumo.jornadas.puladas += skipped;
    }

    const jornadas = await upsertJornadasEmLote(supabase, linhasJornada);
    resumo.jornadas.atualizadas += jornadas.atualizadas;
    resumo.jornadas.erros += jornadas.erros;
    if (jornadas.mensagens.length) {
      resumo.jornadas.mensagens = jornadas.mensagens;
    }

    // A fotografia diária também é responsável por fechar itens que já viraram
    // histórico local. Isso não apaga a divergência: só a fecha com motivo
    // auditável para ela não voltar à fila operacional.
    // Cadastro atual vem diretamente da matricula Emusys. Esta etapa fica
    // antes do retorno operacional porque e esse escopo que roda diariamente.
    const atributosSincronizados = await sincronizarAtributosCadastraisEmusys(
      supabase,
      u,
      alunos || [],
      porId,
      fixadosMap,
      logs,
      resumo,
    );

    const { data: pendenciasForaEscopo, error: pendenciasForaEscopoError } = await supabase.rpc(
      'resolver_pendencias_conciliacao_fora_escopo_operacional',
      { p_unidade_id: u.id },
    );
    if (pendenciasForaEscopoError) throw pendenciasForaEscopoError;
    resumo.pendencias_fora_escopo = pendenciasForaEscopo || resumo.pendencias_fora_escopo;

    // ─── A6b. Reconciliação de ausentes (só no operacional) ───────────────────
    // A fase B continua depois daqui com o `porId` já obtido. O escopo operacional
    // não infere ausência; essa semântica fica exclusiva da fotografia completa.
    if (escopo === 'operacional') {
      const sincronizadoEm = new Date().toISOString();
      const linhasInativadas = await reconciliarEstadosOperacionaisAusentes(
        supabase,
        u.id,
        [...porId.keys()],
        sincronizadoEm,
      );
      resumo.estados_atual.linhas_inativadas = linhasInativadas;
    }

    // ─── B2. Decisões canônicas ───────────────────────────────────────────────
    // Curadoria humana já registrada para uma matrícula Emusys (qual linha nossa
    // ela é, como classificar). Carregada antes da reconciliação para que o
    // veredito do usuário prevaleça sobre a heurística do sync.
    const { data: decisoesCanonicas } = await supabase
      .from('matriculas_emusys_decisoes_canonicas')
      .select('*')
      .eq('unidade_id', u.id);
    const decisoesCanonicasPorMatricula = new Map<string, any>(
      (decisoesCanonicas || []).map((d: any) => [String(d.emusys_matricula_id), d])
    );

    // ─── B3. Régua de classificação ───────────────────────────────────────────
    // tipo_matricula_id -> codigo (BOLSISTA_INT, REGULAR, etc.) para a régua de classificação
    const { data: tiposMat } = await supabase.from('tipos_matricula').select('id, codigo');
    const tipoCodigoMap = new Map<number, string>((tiposMat || []).map((t: any) => [t.id, t.codigo]));

    // IDs Emusys já vinculados a outros alunos ativos — usados para filtrar candidatos de ambíguo
    const idsVinculadosAtivos = new Set<number>(
      (alunos || []).filter((a: any) => a.emusys_matricula_id).map((a: any) => Number(a.emusys_matricula_id))
    );

    const ids = alunosParaReconciliar.map((a: any) => a.id);
    // dedup: (aluno_id|tipo) que o usuário já decidiu — não reenfileirar (respeita a decisão humana)
    const jaDecidido = new Set<string>();
    const jaDecididoCampo = new Set<string>();
    if (ids.length) {
      const { data: decididas } = await supabase
        .from('matriculas_divergencias_decisoes')
        .select('aluno_id, matriculas_divergencias!inner(tipo_divergencia,campo)')
        .in('aluno_id', ids);
      for (const d of decididas || []) {
        const tp = (d as any).matriculas_divergencias?.tipo_divergencia;
        const campo = (d as any).matriculas_divergencias?.campo || '';
        if (tp) jaDecidido.add(`${d.aluno_id}|${tp}`);
        if (tp) jaDecididoCampo.add(`${d.aluno_id}|${tp}|${campo}`);
      }
    }

    // ─── B4. Lead ID ──────────────────────────────────────────────────────────
    // Lead ID: identidade externa capturada na API, sempre resolvida por
    // (unidade + matricula) ou por aluno Emusys univoco. Segundo curso e
    // homonimo nunca entram como criterio de escolha.
    for (const mat of porId.values()) {
      const remoto = leadIdFinitoOuNull(mat?.aluno?.lead_id);
      if (remoto == null) {
        resumo.lead_id.sem_dado++;
        continue;
      }

      const alunoLocal = localizarAlunoParaLeadId(alunos || [], u.id, mat);
      if (!alunoLocal) {
        resumo.lead_id.sem_correspondencia++;
        logs.push({
          aluno_id: null,
          unidade_nome: u.nome,
          evento: 'sync_matriculas_lead_id',
          acao: 'sem_correspondencia_segura',
          detalhes: {
            unidade_id: u.id,
            emusys_matricula_id: mat.id,
            emusys_aluno_id: mat.aluno?.id ?? null,
            emusys_lead_id: remoto,
          },
          workflow_id: 'sync-matriculas-emusys',
          execution_id: new Date().toISOString(),
        });
        continue;
      }

      const decisao = decidirLeadId({
        unidadeId: u.id,
        local: numeroFinitoOuNull(alunoLocal.emusys_lead_id),
        emusys: remoto,
      });

      if (decisao.acao === 'manter') {
        resumo.lead_id.idempotentes++;
        continue;
      }
      if (decisao.acao === 'preencher') {
        const { error: leadUpdateError } = await supabase
          .from('alunos')
          .update({ emusys_lead_id: decisao.valor })
          .eq('id', alunoLocal.id)
          .eq('unidade_id', u.id)
          .is('emusys_lead_id', null);
        if (leadUpdateError) {
          resumo.lead_id.erros++;
          logs.push({
            aluno_id: alunoLocal.id,
            unidade_nome: u.nome,
            evento: 'sync_matriculas_lead_id',
            acao: 'erro_preenchimento',
            detalhes: {
              unidade_id: u.id,
              emusys_matricula_id: mat.id,
              emusys_lead_id: decisao.valor,
              erro: leadUpdateError.message,
            },
            workflow_id: 'sync-matriculas-emusys',
            execution_id: new Date().toISOString(),
          });
        } else {
          resumo.lead_id.preenchidos++;
        }
        continue;
      }
      if (decisao.acao !== 'auditar_divergencia') continue;

      resumo.lead_id.divergencias++;
      const jaTemDecisao = jaDecidido.has(`${alunoLocal.id}|lead_id_divergente`);
      if (!jaTemDecisao) {
        divs.push({
          aluno_id: alunoLocal.id,
          emusys_matricula_id: String(mat.id),
          unidade_id: u.id,
          tipo_divergencia: 'lead_id_divergente',
          campo: 'emusys_lead_id',
          fonte: 'sync',
          valor_nosso: {
            nome: alunoLocal.nome,
            emusys_lead_id: decisao.local,
          },
          valor_api: {
            emusys_matricula_id: mat.id,
            emusys_aluno_id: mat.aluno?.id ?? null,
            emusys_lead_id: decisao.remoto,
          },
          sugestao: null,
          severidade: 'alta',
          resolvido: false,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // ─── B5. Reconciliação por aluno ──────────────────────────────────────────
    // Compara cada linha nossa com a matrícula correspondente na API e decide o
    // destino: SUGESTÃO (auto_preview, aguarda aprovação humana na aba Conciliação),
    // FILA (divergência que exige decisão) ou nada. Aqui também mora a conversão de
    // renovação pendente em não-renovação, que escreve em movimentacoes_admin — a
    // tabela que alimenta a Taxa de Renovação. É o único ponto do sync que toca
    // KPI publicado; qualquer mudança nele é decisão de negócio, não técnica.
    for (const a of alunosParaReconciliar) {
      try {
        const tipoCodigo = a.tipo_matricula_id ? tipoCodigoMap.get(a.tipo_matricula_id) || null : null;
        const fixadosBase = fixadosMap.get(a.id) || new Set();
        const r = reconciliar(
          a, u, porId, ativasPorNome, depara, profMap, banda, fixadosBase,
          tipoCodigo, idsVinculadosAtivos, decisoesCanonicasPorMatricula,
          escopo === 'completo',
        );
        if (r.fora_do_payload_operacional) {
          alunosForaDoPayloadOperacional.add(a.id);
          continue;
        }
        const matAtributos = r.detalhes?.emusys_matricula_id
          ? porId.get(Number(r.detalhes.emusys_matricula_id))
          : (a.emusys_matricula_id ? porId.get(Number(a.emusys_matricula_id)) : null);
        const renovacaoPendente = matAtributos
          ? encontrarRenovacaoPendenteDaMesmaMatricula(
            renovacoesPendentes || [],
            a,
            matAtributos,
            movimentacoesNaoRenovacaoProcessadas,
          )
          : null;

        if (
          matAtributos
          && !r.detalhes?.sync_ignorado_por_decisao_canonica
          && deveConverterFinalizadaEmNaoRenovacao(matAtributos, matAtributos.id, renovacaoPendente)
        ) {
          const dataFinalizacaoReal = matAtributos.data_inativa
            || matAtributos.data_finalizacao
            || matAtributos.contrato_atual?.data_original_ultima_aula
            || matAtributos.contrato_atual?.data_ultima_aula
            || null;

          if (dataFinalizacaoReal) {
            const { error: conversaoError } = await supabase.rpc(
              'converter_renovacao_pendente_em_nao_renovacao',
              {
                p_movimentacao_id: renovacaoPendente.id,
                p_emusys_matricula_id: String(matAtributos.id),
                p_data: String(dataFinalizacaoReal).slice(0, 10),
                p_origem: 'sync-matriculas-emusys',
              },
            );

            movimentacoesNaoRenovacaoProcessadas.add(Number(renovacaoPendente.id));
            if (conversaoError) {
              console.error('[nao-renovacao] Falha ao converter renovacao pendente', {
                movimentacao_id: renovacaoPendente.id,
                aluno_id: a.id,
                emusys_matricula_id: matAtributos.id,
                erro: conversaoError.message,
              });
              resumo.nao_renovacoes_erros.push({
                movimentacao_id: renovacaoPendente.id,
                aluno_id: a.id,
                emusys_matricula_id: matAtributos.id,
                erro: conversaoError.message,
              });
            } else {
              resumo.nao_renovacoes_convertidas++;
              r.divergencias = r.divergencias.filter((dv: any) => dv.tipo !== 'status_divergente');
              alunosComStatusCanonico.add(Number(a.id));
            }
          } else {
            const lifecycle = resolveEmusysMatriculaLifecycle(matAtributos);
            r.divergencias.push({
              tipo: 'status_divergente',
              campo: 'status',
              severidade: 'alta',
              valorApi: {
                motivo: 'data_finalizacao_emusys_ausente',
                status_emusys: lifecycle.rawStatus,
                motivo_inativa: lifecycle.rawReason,
                emusys_matricula_id: matAtributos.id,
              },
              sugestao: null,
            });
            resumo.nao_renovacoes_erros.push({
              movimentacao_id: renovacaoPendente.id,
              aluno_id: a.id,
              emusys_matricula_id: matAtributos.id,
              erro: 'data_finalizacao_emusys_ausente',
            });
          }
        }

        if (
          matAtributos
          && temNaoRenovacaoCanonicaDaMesmaMatricula(naoRenovacoesCanonicas || [], a, matAtributos)
        ) {
          r.divergencias = r.divergencias.filter((dv: any) => dv.tipo !== 'status_divergente');
          alunosComStatusCanonico.add(Number(a.id));
        }

        // Estado/movimentação histórica acima segue sendo reconciliado. A partir
        // daqui só são produzidas tarefas para a equipe; aluno evadido/inativo
        // nunca deve voltar para a fila por ainda carregar um ID Emusys.
        if (!alunoEntraNaFilaOperacional(a)) {
          continue;
        }

        if (matAtributos && !r.detalhes?.sync_ignorado_por_decisao_canonica) {
          const formaPagamentoLocal = a.forma_pagamento_id ? formasPagamentoMap.get(Number(a.forma_pagamento_id)) : null;
          const decisaoAtributos = decisoesCanonicasPorMatricula.get(String(matAtributos.id));
          const fixadosAtributos = combinarCamposFixados(
            fixadosBase,
            camposBloqueadosPorDecisaoCanonica(decisaoAtributos),
          );
          // O enriquecimento direto ja foi aplicado antes da fase B, apenas
          // por unidade + matricula. Nao misturar esses campos no auto_preview:
          // sugestoes de grade/valor continuam humanas, cadastro atual nao.
          const alunoPosAuto = atributosSincronizados.get(a.id) || a;
          const formaPagamentoPosAuto = alunoPosAuto.forma_pagamento_id
            ? formasPagamentoMap.get(Number(alunoPosAuto.forma_pagamento_id))
            : formaPagamentoLocal;
          const atributos = detectarDivergenciasAtributosAluno(alunoPosAuto, matAtributos, formaPagamentoPosAuto, fixadosAtributos, tipoCodigo);
          for (const atributo of atributos) {
            resumo.atributos[atributo.tipo_divergencia] = (resumo.atributos[atributo.tipo_divergencia] || 0) + 1;
            attrDivs.push(atributo);
          }
        }

        // ⚠️ 2026-08-18 (decisão do Alf): o que está no Emusys é aplicado DIRETO em `alunos`.
        // Antes isto virava `auto_preview` na fila e esperava alguém aprovar item a item —
        // o que fazia a tela divergir do Emusys por dias (caso Bernardo/Isabela Bolzani:
        // trocaram de professor no Emusys e o cadastro aqui seguiu apontando o antigo).
        // Fila é para dúvida; troca de professor/turma não é dúvida, é fato já decidido lá.
        const patchEmusys = { ...(r.aplicar || {}), ...r.upd };
        if (Object.keys(patchEmusys).length) {
          const { error: aplicarError } = await supabase
            .from('alunos')
            .update({ ...patchEmusys, updated_at: new Date().toISOString() })
            .eq('id', a.id)
            .eq('unidade_id', u.id);
          if (aplicarError) {
            resumo.erros++;
            logs.push({
              aluno_id: a.id, unidade_nome: u.nome,
              evento: 'sync_matriculas_aplicacao_direta', acao: 'erro',
              detalhes: { patch: patchEmusys, erro: aplicarError.message },
              workflow_id: 'sync-matriculas-emusys', execution_id: new Date().toISOString(),
            });
          } else {
            resumo.aplicados++;
            for (const campo of Object.keys(patchEmusys)) {
              resumo.aplicados_por_campo[campo] = (resumo.aplicados_por_campo[campo] || 0) + 1;
            }
            // trilha de auditoria: o que mudou, de que valor para qual
            logs.push({
              aluno_id: a.id, unidade_nome: u.nome,
              evento: 'sync_matriculas_aplicacao_direta', acao: 'aplicado',
              detalhes: {
                emusys_matricula_id: a.emusys_matricula_id,
                patch: patchEmusys,
                diffs: { ...(r.diffsAplicar || {}), ...(r.detalhes?.diffs ?? {}) },
              },
              workflow_id: 'sync-matriculas-emusys', execution_id: new Date().toISOString(),
            });
            // o objeto local ficou velho: a detecção de atributos logo abaixo compara
            // contra `alunoPosAuto` e reabriria divergência do valor que acabamos de gravar
            Object.assign(a, patchEmusys);
            const jaSincronizado = atributosSincronizados.get(a.id);
            if (jaSincronizado) Object.assign(jaSincronizado, patchEmusys);
          }
        }

        // FILA: cada divergência vira uma linha (respeitando dedup de decisões humanas)
        for (const dv of r.divergencias) {
          // auto_preview não é mais gerado: virou aplicação direta acima.
          if (dv.tipo === 'auto_preview') continue;
          if (jaDecidido.has(`${a.id}|${dv.tipo}`) && !dv.reabrir) {
            continue;
          }
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

    // ─── B6. Persistência em lote e higiene da fila ───────────────────────────
    // inserts em lote
    if (logs.length) await supabase.from('automacao_log').insert(logs);
    await persistirDivergenciasAtributos(supabase, u.id, attrDivs);
    if (alunosComStatusCanonico.size) {
      const agora = new Date().toISOString();
      const { data: divergenciasStatus, error: divergenciasStatusError } = await supabase
        .from('matriculas_divergencias')
        .select('id, aluno_id')
        .in('aluno_id', [...alunosComStatusCanonico])
        .eq('unidade_id', u.id)
        .eq('tipo_divergencia', 'status_divergente')
        .eq('resolvido', false);
      if (divergenciasStatusError) throw divergenciasStatusError;

      if ((divergenciasStatus || []).length) {
        const { error: decisoesStatusError } = await supabase
          .from('matriculas_divergencias_decisoes')
          .upsert(
            (divergenciasStatus || []).map((divergencia: any) => ({
              divergencia_id: divergencia.id,
              aluno_id: divergencia.aluno_id,
              decisao: 'status_canonico_confirmado',
              valor_escolhido: { resolvido: true },
              motivo: 'Nao renovacao canonica registrada para a mesma matricula Emusys.',
              decidido_por: 'sync-matriculas-emusys',
              decidido_em: agora,
              metadata: { regra: 'nao_renovacao_canonica' },
            })),
            { onConflict: 'divergencia_id', ignoreDuplicates: true },
          );
        if (decisoesStatusError) throw decisoesStatusError;
      }

      await supabase.from('matriculas_divergencias')
        .update({
          resolvido: true,
          updated_at: agora,
        })
        .in('aluno_id', [...alunosComStatusCanonico])
        .eq('unidade_id', u.id)
        .eq('tipo_divergencia', 'status_divergente')
        .eq('resolvido', false);
    }
    // auto_preview foi aposentado (aplicação direta): fecha o que sobrou da fila antiga.
    // Sem exceção por payload operacional — a sugestão não existe mais como conceito, e
    // o que ela pediria já é aplicado a cada rodada.
    await supabase.from('matriculas_divergencias')
      .update({ resolvido: true, updated_at: new Date().toISOString() })
      .eq('unidade_id', u.id)
      .eq('tipo_divergencia', 'auto_preview')
      .eq('resolvido', false);
    if (divs.length) await supabase.from('matriculas_divergencias').upsert(divs, { onConflict: 'aluno_id,tipo_divergencia,campo' });

    // Limpa alertas obsoletos: alunos processados nesta rodada que não geraram o mesmo tipo
    // de novo. Caso típico do 'ambiguo': aluno tinha 3 candidatos, sync filtrou os já vinculados
    // e agora tem match único → row antigo ficaria para sempre sem ser sobrescrito.
    // Mesmo mecanismo agora cobre também status/valor/classificacao/disciplina — antes só
    // 'ambiguo' e 'auto_preview' se limpavam sozinhos; um status_divergente parado numa
    // matrícula que voltou a ficar ativa nunca fechava (achado manual 2026-07-15, caso
    // Giovanna Azevedo Chipitelli/Recreio: matrícula 1004 renovada, Emusys reaproveitou o
    // mesmo id, e a sync nunca soube que o alerta antigo de 'evadido' já não fazia sentido).
    {
      const TIPOS_COM_LIMPEZA_POR_RODADA = ['ambiguo', 'status_divergente', 'valor_divergente', 'classificacao_divergente', 'disciplina_nao_mapeada'];
      const idsProcessados = alunosParaReconciliar
        .map((a: any) => a.id)
        // Fora do payload operacional = não avaliado nesta rodada; não limpar.
        .filter((id: number) => !alunosForaDoPayloadOperacional.has(id));
      for (const tipo of TIPOS_COM_LIMPEZA_POR_RODADA) {
        const alunosComTipo = new Set(divs.filter((d: any) => d.tipo_divergencia === tipo).map((d: any) => d.aluno_id));
        const alunosSemTipo = idsProcessados.filter((id: number) => !alunosComTipo.has(id));
        if (alunosSemTipo.length) {
          await supabase.from('matriculas_divergencias')
            .update({ resolvido: true, updated_at: new Date().toISOString() })
            .in('aluno_id', alunosSemTipo)
            .eq('tipo_divergencia', tipo)
            .eq('resolvido', false)
            .eq('unidade_id', u.id);
        }
      }
    }

    // ─── VARREDURA REVERSA: contratos Emusys sem matrícula nossa ───
    // Detecta contratos ATIVOS OU TRANCADOS no Emusys sem correspondência no banco.
    // Trancada entra porque o LA Report conta trancado como aluno ativo (regra de negócio) —
    // sem isso, uma matrícula trancada órfã nunca vira alerta (achado manual 2026-07-15, caso Davi
    // Lima Queiroz/Recreio: matrícula 53 trancada no Emusys, nunca linkada aqui, sem alerta na fila).
    // Casos cobertos:
    //   1. Pessoa sem nenhuma linha no banco → orphan direto
    //   2. Pessoa COM linhas no banco mas com mais contratos Emusys ativos/trancados do que linhas
    //      disponíveis (ex: 2 linhas / 3 contratos → 1 orphan). Evita duplo-flag com ambiguo
    //      consultando os candidatos dos ambiguos existentes.
    {
      const { data: vinculadosDb } = await supabase
        .from('alunos')
        .select('emusys_matricula_id, nome')
        .eq('unidade_id', u.id)
        .is('arquivado_em', null)
        .not('emusys_matricula_id', 'is', null);

      const { data: alunosNaoArquivados } = await supabase
        .from('alunos')
        .select('id, nome, status, emusys_matricula_id')
        .eq('unidade_id', u.id)
        .is('arquivado_em', null);

      const idsVinculados = new Set<number>(
        (vinculadosDb || []).map((a: any) => Number(a.emusys_matricula_id))
      );

      // Contagem de linhas no banco por nome normalizado
      const bancoPorNome = new Map<string, number>();
      const candidatosBancoPorNome = new Map<string, any[]>();
      for (const a of (alunosNaoArquivados || [])) {
        const k = normalizarNome(a.nome);
        bancoPorNome.set(k, (bancoPorNome.get(k) || 0) + 1);
        if (!candidatosBancoPorNome.has(k)) candidatosBancoPorNome.set(k, []);
        candidatosBancoPorNome.get(k)!.push(a);
      }

      // Contagem de linhas JÁ vinculadas (emusys_matricula_id preenchido) por nome
      const linkedPorNome = new Map<string, number>();
      for (const a of (vinculadosDb || [])) {
        const k = normalizarNome(a.nome);
        linkedPorNome.set(k, (linkedPorNome.get(k) || 0) + 1);
      }

      // Contagem de contratos Emusys ativos NÃO vinculados por nome
      const unlinkedEmusysPorNome = new Map<string, number>();
      for (const [eid, mat] of porId) {
        if (mat.status !== 'ativa' && mat.status !== 'trancada') continue;
        if (idsVinculados.has(eid)) continue;
        const k = normalizarNome(mat.aluno?.nome || '');
        unlinkedEmusysPorNome.set(k, (unlinkedEmusysPorNome.get(k) || 0) + 1);
      }

      // IDs Emusys já expostos como candidatos em ambiguos ativos — evita duplo-flag
      const { data: ambiguosAtivos } = await supabase
        .from('matriculas_divergencias')
        .select('valor_api')
        .eq('unidade_id', u.id)
        .eq('tipo_divergencia', 'ambiguo')
        .eq('resolvido', false);

      const idsEmAmbiguo = new Set<number>();
      for (const row of (ambiguosAtivos || [])) {
        for (const c of (row.valor_api?.candidatos || [])) {
          idsEmAmbiguo.add(Number(c.id));
        }
      }

      const orfaosDivs: any[] = [];
      for (const [eid, mat] of porId) {
        if (mat.status !== 'ativa' && mat.status !== 'trancada') continue;
        if (idsVinculados.has(eid)) continue;
        if (idsEmAmbiguo.has(eid)) continue; // já aparece como candidato em ambiguo

        const nomeKey = normalizarNome(mat.aluno?.nome || '');
        const bancoCnt = bancoPorNome.get(nomeKey) || 0;
        const candidatosBanco = candidatosBancoPorNome.get(nomeKey) || [];
        const candidatoExistente = candidatosBanco
          .filter((a: any) => !a.emusys_matricula_id || Number(a.emusys_matricula_id) === eid)
          .sort((a: any, b: any) => Number(b.status === 'inativo') - Number(a.status === 'inativo'))[0] || null;
        const candidatoInativoExistente = candidatoExistente && candidatoExistente.status !== 'ativo';

        if (bancoCnt > 0) {
          // Pessoa existe no banco — só é orphan se tem mais contratos Emusys do que linhas disponíveis
          const linkedCnt = linkedPorNome.get(nomeKey) || 0;
          const unlinkedBanco = bancoCnt - linkedCnt;
          const unlinkedEmusys = unlinkedEmusysPorNome.get(nomeKey) || 0;
          if (unlinkedEmusys <= unlinkedBanco && !candidatoInativoExistente) continue;
        }

        const c = mat.contrato_atual || {};
        const disciplinas = (c.disciplinas || []).map((d: any) => d.nome).join(', ');
        orfaosDivs.push({
          aluno_id: candidatoExistente?.id || null,
          emusys_matricula_id: String(eid),
          unidade_id: u.id,
          tipo_divergencia: 'ausente_nosso_sistema',
          campo: '',
          fonte: 'sync',
          valor_nosso: candidatoExistente
            ? { nome: candidatoExistente.nome, status: candidatoExistente.status, acao_sugerida: 'reativar_vincular_existente' }
            : null,
          valor_api: {
            nome: mat.aluno?.nome || null,
            emusys_id: eid,
            status: mat.status,
            disciplinas: disciplinas || null,
          },
          sugestao: null,
          severidade: 'alta',
          resolvido: false,
          updated_at: new Date().toISOString(),
        });
      }
      resumo.fila['ausente_nosso_sistema'] = orfaosDivs.length;

      // Reconciliar sem upsert (aluno_id é null, constraint não cobre esse caso)
      const { data: existingOrfaos } = await supabase
        .from('matriculas_divergencias')
        .select('id, emusys_matricula_id')
        .eq('unidade_id', u.id)
        .eq('tipo_divergencia', 'ausente_nosso_sistema')
        .eq('resolvido', false);

      const existingEids = new Set((existingOrfaos || []).map((e: any) => e.emusys_matricula_id));
      const currentEids = new Set(orfaosDivs.map((o: any) => o.emusys_matricula_id));

      // Resolve os que foram corrigidos (não aparecem mais como órfãos)
      const toResolve = (existingOrfaos || [])
        .filter((e: any) => !currentEids.has(e.emusys_matricula_id))
        .map((e: any) => e.id);
      if (toResolve.length) {
        await supabase.from('matriculas_divergencias')
          .update({ resolvido: true, updated_at: new Date().toISOString() })
          .in('id', toResolve);
      }

      // Insere apenas os genuinamente novos (evita duplicatas)
      const novos = orfaosDivs.filter((o: any) => !existingEids.has(o.emusys_matricula_id));
      if (novos.length) {
        await supabase.from('matriculas_divergencias').insert(novos);
      }
    }

    // limpa ausente_api obsoletos: alunos que foram encontrados na API nesta rodada
    const encontradosIds = alunosParaReconciliar
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

    // (auto_preview não é mais gerado — a limpeza dele ficou no bloco acima, junto do upsert)

    const finalizacaoCompletaEm = new Date().toISOString();
    resumo.status = 'succeeded';
    await supabase
      .from('emusys_matriculas_sync_execucoes')
      .update({
        status: 'succeeded',
        completed_at: finalizacaoCompletaEm,
        linhas_recebidas: linhasRecebidas,
        linhas_ativas: linhasAtivas,
        linhas_trancadas: linhasTrancadas,
        linhas_inativadas: resumo.estados_atual.linhas_inativadas ?? 0,
        metadados: {
          snapshot_completo: snapshotCompleto,
          estados_gravados: resumo.estados_atual.gravadas,
          estados_rejeitados: resumo.estados_atual.rejeitadas,
          jornadas_atualizadas: resumo.jornadas.atualizadas,
          escopo,
          alunos_fora_do_payload_operacional: alunosForaDoPayloadOperacional.size,
        },
      })
      .eq('id', syncExecucaoId);
  } catch (e) {
    resumo.erro_unidade = descreverErroSync(e);
    resumo.status = 'failed';
    if (syncExecucaoId) {
      await supabase
        .from('emusys_matriculas_sync_execucoes')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          erro: descreverErroSync(e),
          metadados: {
            estados_atual: resumo.estados_atual,
            linhas_recebidas: resumo.linhas_recebidas ?? 0,
          },
        })
        .eq('id', syncExecucaoId);
    }
  }

  return new Response(JSON.stringify(resumo, null, 2), {
    status: resumo.erro_unidade ? 500 : 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});

// Pura (sem I/O): decide o que fazer com o aluno.
// Retorna { upd, detalhes, divergencias: [{tipo, campo, valorApi, severidade, sugestao}] }.
// `auto_preview` é reservado à grade; cadastro e financeiro têm filas próprias.
function reconciliar(
  a: any, u: any, porId: Map<number, any>, ativasPorNome: Map<string, any[]>,
  depara: Map<number, number | null>, profMap: Map<number, number>, banda: Set<number>, fixados: Set<string>,
  tipoCodigo: string | null, idsVinculados: Set<number> = new Set(),
  decisoesCanonicasPorMatricula: Map<string, any> = new Map(),
  // false = escopo operacional: ausência no payload não é sinal e não gera `ausente_api`.
  detectarAusencias = true,
): any {
  const upd: Record<string, any> = {};
  const divergencias: any[] = [];
  // `aplicar` = o que vai direto para `alunos` nesta rodada (fato do Emusys, já filtrado
  // por campos fixados e pelas guardas de valor). `diffsAplicar` é só a trilha de auditoria.
  const aplicar: Record<string, any> = {};
  const diffsAplicar: Record<string, any> = {};

  let mat: any = null;
  if (a.emusys_matricula_id && porId.has(Number(a.emusys_matricula_id))) {
    mat = porId.get(Number(a.emusys_matricula_id));
  } else if (!detectarAusencias && a.emusys_matricula_id) {
    // Operacional: matrícula vinculada fora do payload = provavelmente finalizada.
    // Sem o universo completo, o matching por nome abaixo poderia "vincular" o aluno
    // a OUTRA matrícula presente (ex.: o 2º curso dele) — fora do escopo diário.
    return { upd, divergencias, aplicar, diffsAplicar, fora_do_payload_operacional: true };
  } else {
    const candTodasRaw = (ativasPorNome.get(normalizarNome(a.nome)) || [])
      .filter((m: any) => !idsVinculados.has(Number(m.id)));
    const diaAluno = a.dia_aula ? normalizarNome(a.dia_aula) : null;
    const candidatosMeta = (m: any) => {
      const c = m.contrato_atual || {};
      const disc = c.disciplinas || [];
      const turmasArr = disc.map((d: any) => d.nome_turma).filter(Boolean);
      const dias = turmasArr.map((t: string) => parseDiaDeTurma(t)).filter(Boolean) as string[];
      const financeiro = analisarFinanceiroContrato(m);
      const { cursos, cursosBanda } = resolverCursoContrato(m, depara, banda);
      return {
        id: m.id, status: m.status, aluno_id: m.aluno?.id ?? null,
        disciplinas: disc.map((d: any) => d.nome),
        turmas: turmasArr,
        dia: dias[0] || null,
        curso_id: cursos[0] ?? null,
        curso_banda_id: cursosBanda[0] ?? null,
        somente_banda: cursosBanda.length > 0 && cursos.length === 0,
        professor_id: resolverProfessorContrato(m, profMap),
        cheio: financeiro.valorCheio,
        fixo: financeiro.descontoFixo,
        cond: financeiro.descontoCondicional,
        parcela: (financeiro.parcelaCanonica != null && financeiro.parcelaCanonica >= 0) ? financeiro.parcelaCanonica : null,
        parcela_invalida: financeiro.bloqueiaValorAutomatico,
        tipo_sugerido: financeiro.tipoSugerido,
        sem_fatura_sem_cobranca: financeiro.contratoSemFaturaSemCobranca,
        data_fim: c.data_original_ultima_aula || null,
        sugerido_por_turma: !!(diaAluno && dias.some((d) => normalizarNome(d) === diaAluno)),
      };
    };
    const candTodas = candTodasRaw.filter((m: any) => matriculaCompativelComLinha(a, tipoCodigo, m, depara, banda));
    if (candTodasRaw.length > 0 && candTodas.length === 0) {
      divergencias.push({
        tipo: 'ambiguo',
        campo: '',
        severidade: 'alta',
        valorApi: {
          motivo: 'candidatos_emusys_incompativeis_com_tipo_local',
          tipo_local: tipoCodigo,
          curso_id_local: a.curso_id,
          candidatos: candTodasRaw.map(candidatosMeta),
        },
      });
      return { upd, divergencias, aplicar, diffsAplicar };
    }
    // prefere ativas; só cai para qualquer status se não há ativa (ex: trancada no Emusys, ativo no nosso)
    const candAtivas = candTodas.filter((m: any) => m.status === 'ativa');
    const cand = candAtivas.length > 0 ? candAtivas : candTodas;
    if (cand.length === 1) mat = cand[0];
    else if (cand.length > 1) {
      // Mantém TODOS os candidatos (não descarta no narrowing — senão a 2ª matrícula do
      // caso 2x/semana some). Marca `sugerido_por_turma` no que bate com o dia_aula, e
      // enriquece cada um com curso/professor/valor/dia pra tela mostrar e o humano vincular.
      divergencias.push({ tipo: 'ambiguo', campo: '', severidade: 'media', valorApi: { candidatos: cand.map(candidatosMeta) } });
      return { upd, divergencias, aplicar, diffsAplicar };
    } else {
      // 'ausente_api' só faz sentido contra o universo COMPLETO — no operacional,
      // não estar no payload não significa não estar no Emusys.
      if (detectarAusencias) {
        divergencias.push({ tipo: 'ausente_api', campo: '', severidade: 'alta', valorApi: { nome: a.nome } });
        return { upd, divergencias, aplicar, diffsAplicar };
      }
      return { upd, divergencias, aplicar, diffsAplicar, fora_do_payload_operacional: true };
    }
    return { upd, divergencias, fora_do_payload_operacional: true };
  }

  const decisaoCanonica = decisoesCanonicasPorMatricula.get(String(mat.id)) || null;
  if (deveIgnorarSyncPorDecisaoCanonica(decisaoCanonica)) {
    return {
      upd,
      divergencias,
      detalhes: {
        emusys_matricula_id: mat.id,
        status_api: mat.status,
        sync_ignorado_por_decisao_canonica: true,
        decisao_canonica: decisaoCanonica.tipo_decisao,
      },
    };
  }
  const fixadosEfetivos = combinarCamposFixados(
    fixados,
    camposBloqueadosPorDecisaoCanonica(decisaoCanonica),
  );

  const lifecycle = resolveEmusysMatriculaLifecycle(mat);
  const statusAlvo = lifecycle.localStatus;
  const c = mat.contrato_atual || {};
  const financeiro = analisarFinanceiroContrato(mat);
  const cheio = financeiro.valorCheio;
  const fixo = financeiro.descontoFixo;
  const cond = financeiro.descontoCondicional;
  // Para regular cobravel: mensalidade menos desconto condicional.
  // Para bolsista integral/sem fatura: preco de tabela nao vira MRR/ticket.
  const parcelaComercial = financeiro.parcelaCanonica;
  const liquidoFinanceiro = financeiro.liquidoFinanceiro;
  const bolsa = financeiro.bolsa;
  const dataFim = (
    lifecycle.rawStatus === 'inativa'
    || lifecycle.rawStatus === 'finalizada'
  )
    ? (c.data_original_ultima_aula || c.data_ultima_aula || null)
    : null;
  const diffs: Record<string, any> = {};
  const patchRevisao: Record<string, any> = {};
  const diffsRevisao: Record<string, any> = {};
  const setCampo = (campo: string, vNovo: any, vAtual: any) => {
    if (vNovo == null || fixadosEfetivos.has(campo)) return;
    if (!valoresIguaisParaCampo(campo, vNovo, vAtual)) { upd[campo] = vNovo; diffs[campo] = { de: vAtual, para: vNovo }; }
  };
  const sugerirCampoRevisao = (campo: string, vNovo: any, vAtual: any) => {
    if (vNovo == null || fixadosEfetivos.has(campo)) return;
    if (!valoresIguaisParaCampo(campo, vNovo, vAtual)) {
      patchRevisao[campo] = vNovo;
      diffsRevisao[campo] = { de: vAtual, para: vNovo };
    }
  };

  if (
    !lifecycle.automaticTransition
    && !fixadosEfetivos.has('status')
  ) {
    divergencias.push({
      tipo: 'status_divergente',
      campo: 'status',
      severidade: 'alta',
      valorApi: {
        motivo: 'status_emusys_ambiguo',
        status_emusys: lifecycle.rawStatus,
        motivo_inativa: lifecycle.rawReason,
        motivo_auditoria: lifecycle.auditReason,
        transicao_automatica: lifecycle.automaticTransition,
        emusys_matricula_id: mat.id,
      },
      sugestao: null,
    });
  } else if (
    statusAlvo != null
    && statusAlvo !== a.status
    && !fixadosEfetivos.has('status')
  ) {
    divergencias.push({
      tipo: 'status_divergente',
      campo: 'status',
      severidade: 'alta',
      valorApi: {
        status_emusys: mat.status,
        status_sugerido_la_report: statusAlvo,
        data_fim: dataFim,
        emusys_matricula_id: mat.id,
      },
      sugestao: statusAlvo,
    });
  }
  if (dataFim && statusAlvo && statusAlvo !== 'ativo' && statusAlvo !== 'trancado') {
    sugerirCampoRevisao('data_fim_contrato', dataFim, a.data_fim_contrato);
  }
  // Regua de VALOR: contrato Emusys e a fonte da parcela comercial.
  if (cheio != null) {
    if (!financeiro.bloqueiaValorAutomatico && parcelaComercial != null && parcelaComercial >= 0) {
      sugerirCampoRevisao('valor_cheio', cheio, a.valor_cheio);
      sugerirCampoRevisao('desconto_fixo', fixo, a.desconto_fixo);
      sugerirCampoRevisao('desconto_condicional', cond, a.desconto_condicional);
      sugerirCampoRevisao('valor_parcela', parcelaComercial, a.valor_parcela);
    } else if (!fixadosEfetivos.has('valor_parcela')) {
      // Parcela inválida (a API às vezes embute o desconto_fixo no valor_mensalidade → líquido<0) → revisão humana.
      if ((parcelaComercial ?? 0) > 0 && Number(a.valor_parcela ?? 0) !== parcelaComercial) {
        divergencias.push({
          tipo: 'valor_divergente', campo: 'valor_parcela', severidade: 'media',
          valorApi: {
            cheio,
            fixo,
            cond,
            parcela_comercial: parcelaComercial,
            parcela_tabela: financeiro.parcelaTabela,
            liquido_financeiro: liquidoFinanceiro,
            bolsa,
            nr_faturas: financeiro.nrFaturas,
            valor_total: financeiro.valorTotal,
            sem_fatura_sem_cobranca: financeiro.contratoSemFaturaSemCobranca,
          },
          sugestao: parcelaComercial,
        });
      } else if (financeiro.bloqueiaValorAutomatico) {
        divergencias.push({
          tipo: 'valor_divergente', campo: 'valor_parcela', severidade: 'alta',
          valorApi: {
            cheio,
            fixo,
            cond,
            parcela_comercial: null,
            parcela_tabela: financeiro.parcelaTabela,
            liquido_financeiro: liquidoFinanceiro,
            bolsa,
            nr_faturas: financeiro.nrFaturas,
            valor_total: financeiro.valorTotal,
            sem_fatura_sem_cobranca: true,
            motivo: 'Contrato sem faturas e sem cobranca automatica. Valor de tabela bloqueado para MRR/ticket.',
          },
          sugestao: null,
        });
      }
    }
  }

  // Régua de CLASSIFICAÇÃO: tipo de matrícula do nosso x realidade da API (bolsa/valor).
  // Bolsista→REGULAR só quando paga o CHEIO integral (sem desconto algum) — o flag `bolsa=false` da API
  // não é confiável p/ parciais (que têm desconto real). REGULAR→bolsista quando a API marca bolsa=true.
  if (statusAlvo === 'ativo' && tipoCodigo && !fixadosEfetivos.has('tipo_matricula_id')) {
    const ehBolsista = tipoCodigo === 'BOLSISTA_INT' || tipoCodigo === 'BOLSISTA_PARC';
    if (ehBolsista && !bolsa && cheio != null && cheio > 0 && parcelaComercial === cheio && !financeiro.contratoSemFaturaSemCobranca) {
      divergencias.push({
        tipo: 'classificacao_divergente', campo: 'tipo_matricula_id', severidade: 'media',
        valorApi: { bolsa, efetivo: parcelaComercial, parcela_comercial: parcelaComercial, parcela_tabela: financeiro.parcelaTabela, liquido_financeiro: liquidoFinanceiro, cheio, fixo, cond, nr_faturas: financeiro.nrFaturas, valor_total: financeiro.valorTotal, tipo_sugerido: 'REGULAR' }, sugestao: 'REGULAR',
      });
    } else if (tipoCodigo === 'REGULAR' && financeiro.tipoSugerido) {
      const sug = financeiro.tipoSugerido;
      divergencias.push({
        tipo: 'classificacao_divergente', campo: 'tipo_matricula_id', severidade: 'media',
        valorApi: { bolsa, efetivo: parcelaComercial, parcela_comercial: parcelaComercial, parcela_tabela: financeiro.parcelaTabela, liquido_financeiro: liquidoFinanceiro, cheio, fixo, cond, nr_faturas: financeiro.nrFaturas, valor_total: financeiro.valorTotal, sem_fatura_sem_cobranca: financeiro.contratoSemFaturaSemCobranca, tipo_sugerido: sug }, sugestao: sug,
        reabrir: financeiro.contratoSemFaturaSemCobranca,
      });
    }
  }

  if (statusAlvo === 'ativo') {
    const { cursos, naoMapeada } = resolverCursoContrato(mat, depara, banda);
    if (naoMapeada != null && cursos.length === 0) {
      divergencias.push({ tipo: 'disciplina_nao_mapeada', campo: '', severidade: 'media', valorApi: { disciplina_id: naoMapeada } });
    } else if (cursos.length === 1) {
      if (!devePreservarCursoBase(a.curso_id, cursos[0])) sugerirCampoRevisao('curso_id', cursos[0], a.curso_id);
    } else if (cursos.length > 1 && !cursos.includes(a.curso_id)) {
      divergencias.push({ tipo: 'ambiguo', campo: '', severidade: 'media', valorApi: { motivo: 'multiplos_cursos', cursos } });
    }
    const profId = resolverProfessorContrato(mat, profMap);
    if (profId != null) sugerirCampoRevisao('professor_atual_id', profId, a.professor_atual_id);

    // Dia e horário da aula derivados do nome_turma (fonte determinística do Emusys).
    // Prefere a turma da disciplina que corresponde ao curso do aluno (caso multi-curso);
    // só aplica quando há um único dia/horário (turmas divergentes → não força).
    const discs = mat.contrato_atual?.disciplinas || [];
    let turmasAlvo = discs
      .filter((d: any) => depara.get(Number(d.disciplina_id)) === a.curso_id)
      .map((d: any) => d.nome_turma).filter(Boolean);
    if (turmasAlvo.length === 0) turmasAlvo = discs.map((d: any) => d.nome_turma).filter(Boolean);
    const diasSet = new Set(turmasAlvo.map((t: string) => parseDiaDeTurma(t)).filter(Boolean));
    const horasSet = new Set(turmasAlvo.map((t: string) => parseHorarioDeTurma(t)).filter(Boolean));
    if (diasSet.size === 1) sugerirCampoRevisao('dia_aula', [...diasSet][0] as string, a.dia_aula);
    if (horasSet.size === 1) sugerirCampoRevisao('horario_aula', [...horasSet][0] as string, a.horario_aula);
  }

  // ⚠️ 2026-08-18 (decisão do Alf): o que está no Emusys é aplicado DIRETO, sem fila.
  // Este patch só contém fato objetivo do Emusys — professor, curso, dia, horário,
  // data_fim e valor —, e cada campo já passou por duas guardas antes de chegar aqui:
  //   1. `fixadosEfetivos` — se alguém clicou "Manter LA Report", virou trava em
  //      matriculas_campos_fixados e o campo NUNCA entra no patch (sugerirCampoRevisao);
  //   2. valor só entra quando o payload é sadio (`!bloqueiaValorAutomatico` e parcela >= 0);
  //      payload corrompido (a API às vezes embute desconto_fixo no valor) vira
  //      `valor_divergente` na fila humana, não patch.
  // O que continua humano é só o que o sistema NÃO SABE responder: `ambiguo` (não se sabe
  // qual matrícula Emusys é a do aluno — aplicar vincularia a pessoa errada) e as réguas de
  // valor/classificação acima. Fila é para dúvida, não para dado que já existe no Emusys.
  Object.assign(aplicar, patchRevisao);
  Object.assign(diffsAplicar, diffsRevisao);

  return { upd, divergencias, aplicar, diffsAplicar, detalhes: { emusys_matricula_id: mat.id, status_api: mat.status, diffs } };
}
