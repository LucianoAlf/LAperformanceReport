/// <reference lib="deno.ns" />

// Edge Function: sync-matriculas-emusys v2
// Varredura de reconciliação Emusys × banco (espelha o estado atual da API).
// Spec: docs/superpowers/specs/2026-06-22-sync-matriculas-emusys-design.md
//
// Processa UMA unidade por invocação (?u=cg|barra|recreio) — o cron chama as 3 defasadas,
// para caber no idle timeout de 150s do Supabase apesar do throttle do rate limit (60/min).
//
// Trilha SUGESTÃO (antigo AUTO): status, data_fim, curso_id, professor_atual_id, valor LIMPO.
//   Nunca aplica automaticamente — registra como `auto_preview` na fila para aprovação humana.
// Trilha FILA (matriculas_divergencias): ambiguo, ausente_api, disciplina_nao_mapeada,
//   valor_divergente (parcela comercial divergente), classificacao_divergente (bolsa x tipo).
// Dedup: (aluno|tipo) já com decisão humana não é reenfileirado.
//
// Salvaguardas: por matrícula (não por pessoa); data_saida = data real da API;
//   respeita matriculas_campos_fixados; tudo logado em automacao_log (lote).

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { analisarFinanceiroContrato, deveIgnorarStatusFinanceiroPorTipo } from './financeiro.ts';

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
const UNIDADES: Record<string, { nome: string; id: string; token: string }> = {
  cg: { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', token: 'nEAlBC5gjtqojA7qberYVOttD1lXdx' },
  recreio: { nome: 'Recreio', id: '95553e96-971b-4590-a6eb-0201d013c14d', token: 'rUI85cQTePX1ecpLwWLbAWY9UM9yiF' },
  barra: { nome: 'Barra', id: '368d47f5-2d88-4475-bc14-ba084a9a348e', token: '4reVMLdiBmdNTOBQKa4m7WGYQaRDKI' },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const STATUS_API_PARA_NOSSO: Record<string, string> = { ativa: 'ativo', trancada: 'trancado', finalizada: 'evadido' };

function normalizarDiaParaComparacao(v: any): string {
  const s = normalizarNome(String(v ?? ''));
  const semFeira = s.replace(/\s*-\s*feira$/, '').replace(/\s+feira$/, '');
  const mapa: Record<string, string> = {
    segunda: 'segunda',
    seg: 'segunda',
    terca: 'terca',
    ter: 'terca',
    quarta: 'quarta',
    qua: 'quarta',
    quinta: 'quinta',
    qui: 'quinta',
    sexta: 'sexta',
    sex: 'sexta',
    sabado: 'sabado',
    sab: 'sabado',
  };
  return mapa[semFeira] || semFeira;
}

function valoresIguaisParaCampo(campo: string, vNovo: any, vAtual: any): boolean {
  if (campo === 'dia_aula') {
    return normalizarDiaParaComparacao(vNovo) === normalizarDiaParaComparacao(vAtual);
  }
  if (campo === 'horario_aula') {
    return String(vNovo ?? '').slice(0, 5) === String(vAtual ?? '').slice(0, 5);
  }
  return String(vNovo) === String(vAtual ?? '');
}

function autoPreviewCampo(upd: Record<string, any>): string {
  const partes = Object.entries(upd)
    .filter(([, valor]) => valor !== undefined && valor !== null)
    .map(([campo, valor]) => `${campo}=${String(valor).slice(0, 80)}`)
    .sort();
  return partes.length ? `auto:${partes.join('|')}` : 'auto:vazio';
}

function temValor(v: any): boolean {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function normalizarTextoValor(v: any): string {
  return normalizarNome(String(v ?? '')).replace(/[^\w\s@.-]/g, '').trim();
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

function setCampoVazioConfiavel(
  patch: Record<string, any>,
  diffs: Record<string, any>,
  campo: string,
  valorNovo: any,
  valorAtual: any,
  fixados: Set<string>,
) {
  if (fixados.has(campo) || !temValor(valorNovo) || temValor(valorAtual)) return;
  patch[campo] = valorNovo;
  diffs[campo] = { de: valorAtual ?? null, para: valorNovo };
}

function gerarPatchAtributosVaziosConfiaveis(
  a: any,
  mat: any,
  formasPagamento: Map<number, any>,
  fixados: Set<string>,
) {
  const patch: Record<string, any> = {};
  const diffs: Record<string, any> = {};

  const fotoEmusys = extrairFotoAluno(mat);
  if (!temValor(a.foto_url) && !temValor(a.photo_url)) {
    setCampoVazioConfiavel(patch, diffs, 'foto_url', fotoEmusys, a.foto_url, fixados);
  }

  setCampoVazioConfiavel(patch, diffs, 'instagram', extrairInstagramAluno(mat), a.instagram, fixados);
  setCampoVazioConfiavel(patch, diffs, 'telefone', mat?.aluno?.telefone, a.telefone || a.whatsapp, fixados);
  setCampoVazioConfiavel(patch, diffs, 'email', mat?.aluno?.email, a.email, fixados);

  const responsavel = mat?.responsavel || {};
  setCampoVazioConfiavel(patch, diffs, 'responsavel_nome', responsavel.nome, a.responsavel_nome, fixados);
  setCampoVazioConfiavel(patch, diffs, 'responsavel_telefone', responsavel.telefone, a.responsavel_telefone, fixados);

  const aguardandoRenovacaoEmusys = extrairAguardandoRenovacaoEmusys(mat);
  if (!fixados.has('aguardando_renovacao') && aguardandoRenovacaoEmusys !== null && a.aguardando_renovacao == null) {
    patch.aguardando_renovacao = aguardandoRenovacaoEmusys;
    diffs.aguardando_renovacao = { de: a.aguardando_renovacao ?? null, para: aguardandoRenovacaoEmusys };
  }

  const formaEmusys = extrairFormaPagamentoEmusys(mat);
  const formaId = resolverFormaPagamentoId(formaEmusys, formasPagamento);
  if (!fixados.has('forma_pagamento_id') && !temValor(a.forma_pagamento_id) && formaId) {
    patch.forma_pagamento_id = formaId;
    diffs.forma_pagamento_id = { de: a.forma_pagamento_id ?? null, para: formaId, forma_pagamento: formaEmusys };
  }

  return { patch, diffs };
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
  if (!fixados.has('instagram') && instagramEmusys && !temValor(instagramNosso)) {
    rows.push(criarDivergenciaAtributo(
      a, mat, 'instagram_ausente', 'instagram',
      { instagram: instagramNosso ?? null },
      { instagram: instagramEmusys },
      { instagram: instagramEmusys },
      'baixa',
    ));
  } else if (!fixados.has('instagram') && instagramEmusys && normalizarInstagramValor(instagramEmusys) !== normalizarInstagramValor(instagramNosso)) {
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
  const ignoraStatusFinanceiro = deveIgnorarStatusFinanceiroPorTipo(
    tipoCodigo,
    a.status_pagamento,
    statusFinanceiroEmusys,
  );
  if (!fixados.has('status_pagamento') && statusFinanceiroEmusys && !ignoraStatusFinanceiro && normalizarTextoValor(statusFinanceiroEmusys) !== normalizarTextoValor(a.status_pagamento)) {
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

const CURSO_MUSICALIZACAO_PREPARATORIA_ID = 40;

function devePreservarCursoBase(a: any, cursoSugerido: number) {
  // /matriculas expõe disciplinas/turmas internas. Em Musicalizacao Preparatoria,
  // a disciplina pode ser Teclado/Piano/Bateria, mas o curso comercial segue MP.
  return Number(a.curso_id) === CURSO_MUSICALIZACAO_PREPARATORIA_ID
    && Number(cursoSugerido) !== CURSO_MUSICALIZACAO_PREPARATORIA_ID;
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

  const bloqueioAcesso = await validarAcessoSync(req);
  if (bloqueioAcesso) return bloqueioAcesso;

  const alvo = new URL(req.url).searchParams.get('u') || 'cg';
  const u = UNIDADES[alvo];
  if (!u) return new Response(JSON.stringify({ erro: 'unidade inválida; use ?u=cg|recreio|barra' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const resumo: any = { modo: 'sugestao', unidade: u.nome, auto: 0, fila: {}, atributos: {}, erros: 0 };
  const logs: any[] = [];
  const divs: any[] = [];
  const attrDivs: any[] = [];
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

    const { data: formasPagamento } = await supabase.from('formas_pagamento').select('id, nome, sigla');
    const formasPagamentoMap = new Map<number, any>((formasPagamento || []).map((f: any) => [f.id, f]));

    const { data: alunos } = await supabase.from('alunos')
      .select('id, unidade_id, nome, curso_id, professor_atual_id, emusys_matricula_id, emusys_student_id, status, data_fim_contrato, valor_cheio, desconto_fixo, desconto_condicional, valor_parcela, tipo_matricula_id, dia_aula, horario_aula, telefone, whatsapp, email, responsavel_nome, responsavel_telefone, foto_url, photo_url, instagram, status_pagamento, forma_pagamento_id, anamnese_preenchida, aguardando_renovacao')
      .eq('unidade_id', u.id)
      .is('arquivado_em', null);

    const alunosParaReconciliar = (alunos || []).filter((a: any) => {
      return a.status === 'ativo' || temValor(a.emusys_matricula_id);
    });

    const { data: decisoesCanonicas } = await supabase
      .from('matriculas_emusys_decisoes_canonicas')
      .select('*')
      .eq('unidade_id', u.id);
    const decisoesCanonicasPorMatricula = new Map<string, any>(
      (decisoesCanonicas || []).map((d: any) => [String(d.emusys_matricula_id), d])
    );

    // tipo_matricula_id -> codigo (BOLSISTA_INT, REGULAR, etc.) para a régua de classificação
    const { data: tiposMat } = await supabase.from('tipos_matricula').select('id, codigo');
    const tipoCodigoMap = new Map<number, string>((tiposMat || []).map((t: any) => [t.id, t.codigo]));

    // IDs Emusys já vinculados a outros alunos ativos — usados para filtrar candidatos de ambíguo
    const idsVinculadosAtivos = new Set<number>(
      (alunos || []).filter((a: any) => a.emusys_matricula_id).map((a: any) => Number(a.emusys_matricula_id))
    );

    const ids = alunosParaReconciliar.map((a: any) => a.id);
    const fixadosMap = new Map<number, Set<string>>();
    // dedup: (aluno_id|tipo) que o usuário já decidiu — não reenfileirar (respeita a decisão humana)
    const jaDecidido = new Set<string>();
    const jaDecididoCampo = new Set<string>();
    if (ids.length) {
      const { data: fx } = await supabase.from('matriculas_campos_fixados').select('aluno_id, campo').in('aluno_id', ids);
      for (const f of fx || []) {
        if (!fixadosMap.has(f.aluno_id)) fixadosMap.set(f.aluno_id, new Set());
        fixadosMap.get(f.aluno_id)!.add(f.campo);
      }
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

    for (const a of alunosParaReconciliar) {
      try {
        const tipoCodigo = a.tipo_matricula_id ? tipoCodigoMap.get(a.tipo_matricula_id) || null : null;
        const fixadosBase = fixadosMap.get(a.id) || new Set();
        const r = reconciliar(a, u, porId, ativasPorNome, depara, profMap, banda, fixadosBase, tipoCodigo, idsVinculadosAtivos, decisoesCanonicasPorMatricula);
        const matAtributos = r.detalhes?.emusys_matricula_id
          ? porId.get(Number(r.detalhes.emusys_matricula_id))
          : (a.emusys_matricula_id ? porId.get(Number(a.emusys_matricula_id)) : null);
        if (matAtributos && !r.detalhes?.sync_ignorado_por_decisao_canonica) {
          const formaPagamentoLocal = a.forma_pagamento_id ? formasPagamentoMap.get(Number(a.forma_pagamento_id)) : null;
          const decisaoAtributos = decisoesCanonicasPorMatricula.get(String(matAtributos.id));
          const fixadosAtributos = combinarCamposFixados(
            fixadosBase,
            camposBloqueadosPorDecisaoCanonica(decisaoAtributos),
          );
          const autoAtributos = gerarPatchAtributosVaziosConfiaveis(a, matAtributos, formasPagamentoMap, fixadosAtributos);
          if (Object.keys(autoAtributos.patch).length) {
            r.upd = { ...r.upd, ...autoAtributos.patch };
            r.detalhes = r.detalhes || { emusys_matricula_id: matAtributos.id, status_api: matAtributos.status, diffs: {} };
            r.detalhes.diffs = { ...(r.detalhes.diffs || {}), ...autoAtributos.diffs };
            resumo.auto_atributos = (resumo.auto_atributos || 0) + Object.keys(autoAtributos.patch).length;
          }

          const alunoPosAuto = { ...a, ...r.upd };
          const formaPagamentoPosAuto = alunoPosAuto.forma_pagamento_id
            ? formasPagamentoMap.get(Number(alunoPosAuto.forma_pagamento_id))
            : formaPagamentoLocal;
          const atributos = detectarDivergenciasAtributosAluno(alunoPosAuto, matAtributos, formaPagamentoPosAuto, fixadosAtributos, tipoCodigo);
          for (const atributo of atributos) {
            resumo.atributos[atributo.tipo_divergencia] = (resumo.atributos[atributo.tipo_divergencia] || 0) + 1;
            attrDivs.push(atributo);
          }
        }

        // SUGESTÃO: nunca aplica automaticamente — sempre registra como `auto_preview` na fila
        // para aprovação humana na aba de Conciliação.
        if (Object.keys(r.upd).length) {
          resumo.auto++;
          const campoPreview = autoPreviewCampo(r.upd);
          if (!jaDecididoCampo.has(`${a.id}|auto_preview|${campoPreview}`)) {
            previewAlunoIds.push(a.id);
            divs.push({
              aluno_id: a.id, emusys_matricula_id: a.emusys_matricula_id, unidade_id: u.id,
              tipo_divergencia: 'auto_preview', campo: campoPreview, fonte: 'sync',
              valor_nosso: { nome: a.nome },
              // `patch` = o que o "Aprovar" da tela vai gravar
              valor_api: { diffs: r.detalhes?.diffs ?? {}, patch: r.upd, status_api: r.detalhes?.status_api },
              sugestao: null, severidade: 'baixa',
              resolvido: false, updated_at: new Date().toISOString(),
            });
          }
        }

        // FILA: cada divergência vira uma linha (respeitando dedup de decisões humanas)
        for (const dv of r.divergencias) {
          if (jaDecidido.has(`${a.id}|${dv.tipo}`) && !dv.reabrir) continue;
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
    await persistirDivergenciasAtributos(supabase, u.id, attrDivs);
    await supabase.from('matriculas_divergencias')
      .update({ resolvido: true, updated_at: new Date().toISOString() })
      .eq('unidade_id', u.id)
      .eq('tipo_divergencia', 'auto_preview')
      .eq('resolvido', false);
    if (divs.length) await supabase.from('matriculas_divergencias').upsert(divs, { onConflict: 'aluno_id,tipo_divergencia,campo' });

    // Limpa ambíguos obsoletos: alunos processados nesta rodada que não geraram novo ambíguo.
    // Caso típico: aluno era ambíguo (3 candidatos), sync filtrou candidatos já vinculados e
    // agora tem match único → row antigo ficaria para sempre sem ser sobrescrito.
    {
      const alunosComAmbiguo = new Set(divs.filter((d: any) => d.tipo_divergencia === 'ambiguo').map((d: any) => d.aluno_id));
      const alunosSemAmbiguo = alunosParaReconciliar.map((a: any) => a.id).filter((id: number) => !alunosComAmbiguo.has(id));
      if (alunosSemAmbiguo.length) {
        await supabase.from('matriculas_divergencias')
          .update({ resolvido: true, updated_at: new Date().toISOString() })
          .in('aluno_id', alunosSemAmbiguo)
          .eq('tipo_divergencia', 'ambiguo')
          .eq('resolvido', false)
          .eq('unidade_id', u.id);
      }
    }

    // ─── VARREDURA REVERSA: contratos Emusys sem matrícula nossa ───
    // Detecta contratos ATIVOS no Emusys sem correspondência no banco.
    // Casos cobertos:
    //   1. Pessoa sem nenhuma linha no banco → orphan direto
    //   2. Pessoa COM linhas no banco mas com mais contratos Emusys ativos do que linhas
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
        if (mat.status !== 'ativa') continue;
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
        if (mat.status !== 'ativa') continue;
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

// Extrai o horário da aula do nome da turma (último segmento numérico).
// "G_Ter_14" → "14:00:00", "G_Seg_18" → "18:00:00", "X_Qua_1430" → "14:30:00".
// Retorna null se o sufixo não for um horário reconhecível.
function parseHorarioDeTurma(nomeTurma: string): string | null {
  const partes = (nomeTurma || '').split('_');
  if (partes.length < 3) return null;
  const ult = partes[partes.length - 1];
  if (!/^\d{1,4}$/.test(ult)) return null;
  let h: number, m = 0;
  if (ult.length <= 2) { h = parseInt(ult, 10); }
  else { h = parseInt(ult.slice(0, ult.length - 2), 10); m = parseInt(ult.slice(-2), 10); }
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

// Pura (sem I/O): decide o que fazer com o aluno.
// Retorna { upd, detalhes, divergencias: [{tipo, campo, valorApi, severidade, sugestao}] }.
// `upd` = mudanças AUTO seguras; `divergencias` = casos de fila (decisão humana). Podem coexistir.
function reconciliar(
  a: any, u: any, porId: Map<number, any>, ativasPorNome: Map<string, any[]>,
  depara: Map<number, number | null>, profMap: Map<number, number>, banda: Set<number>, fixados: Set<string>,
  tipoCodigo: string | null, idsVinculados: Set<number> = new Set(),
  decisoesCanonicasPorMatricula: Map<string, any> = new Map(),
): any {
  const upd: Record<string, any> = {};
  const divergencias: any[] = [];

  let mat: any = null;
  if (a.emusys_matricula_id && porId.has(Number(a.emusys_matricula_id))) {
    mat = porId.get(Number(a.emusys_matricula_id));
  } else {
    const candTodas = (ativasPorNome.get(normalizarNome(a.nome)) || [])
      .filter((m: any) => !idsVinculados.has(Number(m.id)));
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
        const financeiro = analisarFinanceiroContrato(m);
        const { cursos } = resolverCursoContrato(m, depara, banda);
        return {
          id: m.id, status: m.status, aluno_id: m.aluno?.id ?? null,
          disciplinas: disc.map((d: any) => d.nome),
          turmas: turmasArr,
          dia: dias[0] || null,
          curso_id: cursos[0] ?? null,
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
      divergencias.push({ tipo: 'ambiguo', campo: '', severidade: 'media', valorApi: { candidatos: cand.map(candidatosMeta) } });
      return { upd, divergencias };
    } else {
      divergencias.push({ tipo: 'ausente_api', campo: '', severidade: 'alta', valorApi: { nome: a.nome } });
      return { upd, divergencias };
    }
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

  const statusAlvo = STATUS_API_PARA_NOSSO[mat.status] || 'ativo';
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
  const dataFim = c.data_original_ultima_aula || null;
  const statusFinanceiroEmusys = financeiro.statusPagamentoCanonico ?? extrairStatusFinanceiroEmusys(mat);
  const fotoEmusys = extrairFotoAluno(mat);

  const diffs: Record<string, any> = {};
  const setCampo = (campo: string, vNovo: any, vAtual: any) => {
    if (vNovo == null || fixadosEfetivos.has(campo)) return;
    if (!valoresIguaisParaCampo(campo, vNovo, vAtual)) { upd[campo] = vNovo; diffs[campo] = { de: vAtual, para: vNovo }; }
  };

  if (statusAlvo !== a.status) {
    upd.status = statusAlvo; diffs.status = { de: a.status, para: statusAlvo };
    if (statusAlvo === 'evadido' && dataFim && !fixadosEfetivos.has('data_saida')) upd.data_saida = dataFim;
  }
  setCampo('data_fim_contrato', dataFim, a.data_fim_contrato);
  setCampo('status_pagamento', statusFinanceiroEmusys, a.status_pagamento);
  if (!temValor(a.foto_url) && !temValor(a.photo_url)) {
    setCampo('foto_url', fotoEmusys, a.foto_url);
  }

  // Regua de VALOR: contrato Emusys e a fonte da parcela comercial.
  if (cheio != null) {
    if (!financeiro.bloqueiaValorAutomatico && parcelaComercial != null && parcelaComercial >= 0) {
      setCampo('valor_cheio', cheio, a.valor_cheio);
      setCampo('desconto_fixo', fixo, a.desconto_fixo);
      setCampo('desconto_condicional', cond, a.desconto_condicional);
      setCampo('valor_parcela', parcelaComercial, a.valor_parcela);
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
      if (!devePreservarCursoBase(a, cursos[0])) setCampo('curso_id', cursos[0], a.curso_id);
    } else if (cursos.length > 1 && !cursos.includes(a.curso_id)) {
      divergencias.push({ tipo: 'ambiguo', campo: '', severidade: 'media', valorApi: { motivo: 'multiplos_cursos', cursos } });
    }
    const profId = resolverProfessorContrato(mat, profMap);
    if (profId != null) setCampo('professor_atual_id', profId, a.professor_atual_id);

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
    if (diasSet.size === 1) setCampo('dia_aula', [...diasSet][0] as string, a.dia_aula);
    if (horasSet.size === 1) setCampo('horario_aula', [...horasSet][0] as string, a.horario_aula);
  }

  return { upd, divergencias, detalhes: { emusys_matricula_id: mat.id, status_api: mat.status, diffs } };
}
