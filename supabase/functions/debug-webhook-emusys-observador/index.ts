/// <reference lib="deno.ns" />

// Edge Function: debug-webhook-emusys-observador
//
// [v1] Observador temporário: recebia webhooks do Emusys (matrícula, lead ou
// experimental) em paralelo ao n8n e SÓ gravava o payload bruto em automacao_log.
//
// [v2 — 2026-07-28] Passa a também PROCESSAR os eventos de lead e de aula
// experimental, que saem do n8n. A gravação do payload bruto continua IDÊNTICA
// e acontece primeiro: se o processamento falhar, o payload já está salvo e pode
// ser reprocessado. Matrícula NÃO é processada aqui — segue no n8n.
//
// Princípios (regra do dono: "pode adicionar, remover não"):
//   1. UPSERT parcial — só escreve colunas que vieram no payload. Campo ausente
//      nunca vira NULL numa linha existente (ver semNulos()).
//   2. Colunas com DEFAULT no banco (status, temperatura, tipo_aluno, quantidade,
//      contadores, booleanos, data_contato, data_primeiro_contato) NÃO são setadas
//      no insert: o Postgres aplica os mesmos defaults que aplica hoje pro n8n.
//   3. Chave de lead = (unidade_id, emusys_lead_id). NUNCA emusys_lead_id sozinho:
//      é namespaced por unidade e colide (393 ids / 789 leads afetados).
//   4. Professor resolvido por TELEFONE + ativo=true. Nome não serve: a mesma
//      pessoa tem nomes diferentes por unidade (Erick Osmy / Erick Cosme da Silva,
//      CPF idêntico) e há registros mesclados inativos com nome quase igual.
//   5. Etapa do pipeline nunca regride (ORDEM_ETAPA).
//
// OBSERVADOR_DRY_RUN=true (default) => processa mas NÃO escreve; só registra em
// automacao_log o que faria. Trocar para 'false' liga a escrita, sem redeploy.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DRY_RUN = (Deno.env.get('OBSERVADOR_DRY_RUN') ?? 'true') === 'true';

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

// ---------------------------------------------------------------- de-para ---

// estágio do funil no Emusys -> etapa do pipeline no LA Report (crm_pipeline_etapas)
const ETAPA_POR_ESTAGIO_EMUSYS: Record<string, number> = {
  '1': 1,  // Novo / Novo Lead             -> Novo Lead
  '3': 5,  // Aula experimental marcada    -> Experimental Agendada
  '4': 7,  // Aula experimental realizada  -> Experimental Realizada
  '5': 10, // Matriculados                 -> Matriculado
  '8': 9,  // Experimental não realizada   -> Faltou
};

// A etapa só avança: webhook atrasado não rebaixa lead que já progrediu por outro caminho.
const ORDEM_ETAPA: Record<number, number> = {
  1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 0,
};

const CANAL_POR_COMO_CONHECEU: Record<string, number> = {
  'INSTAGRAM': 1, 'FACEBOOK': 2, 'GOOGLE': 3, 'SITE DA ESCOLA': 4, 'INTERNET': 4,
  'LIGACAO': 5, 'PLACA DA FACHADA': 6, 'VISITA': 6, 'AMIGO': 7, 'INDICACAO': 7,
  'ALUNO DA ESCOLA': 7, 'EX ALUNO': 8, 'CONVENIOS': 9, 'PROFESSOR': 12, 'OUTROS': 12,
};

// ------------------------------------------------------------- utilitários ---

/** "(21) 98872-3386" -> "5521988723386" — mesmo formato que o n8n grava hoje. */
function normalizarTelefone(bruto: unknown): string | null {
  if (bruto === null || bruto === undefined) return null;
  const d = String(bruto).replace(/\D/g, '');
  if (!d) return null;
  if (d.length >= 12 && d.slice(0, 2) === '55') return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return d;
}

function normalizarTexto(s: unknown): string {
  const base = String(s ?? '').normalize('NFD');
  let out = '';
  for (const ch of base) {
    // apos NFD os diacriticos ficam fora do ASCII; manter so o basico
    if (ch.charCodeAt(0) < 128) out += ch;
  }
  return out.trim().toUpperCase();
}

/** "LA Music School Campo Grande" -> "Campo Grande" */
function nomeUnidade(escolaNome: unknown): string | null {
  const s = String(escolaNome ?? '').trim();
  if (!s) return null;
  return s.replace(/^LA Music School\s*/i, '').trim() || null;
}

/** Campo personalizado "Como conheceu a escola" — o valor vem como string
 *  ou como objeto {id, valor}; os dois formatos aparecem em produção. */
function comoConheceu(lead: any): string | null {
  const campos = lead?.campos_personalizados;
  if (!Array.isArray(campos)) return null;
  const c = campos.find((x: any) => normalizarTexto(x?.nome).indexOf('CONHECEU') >= 0);
  if (!c) return null;
  const v = c.valor;
  const bruto = v && typeof v === 'object' ? v.valor : v;
  const s = normalizarTexto(bruto);
  return s || null;
}

/** Remove chaves nulas — é o que garante o "nunca apaga": campo ausente
 *  no payload não entra no UPDATE. */
function semNulos(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}

// --------------------------------------------------------------- resolvers ---

async function resolverUnidade(sb: any, body: any): Promise<string | null> {
  const nome = nomeUnidade(body?.escola_nome);
  if (!nome) return null;
  const { data } = await sb.from('unidades').select('id').eq('nome', nome).maybeSingle();
  return data ? data.id : null;
}

async function resolverCurso(sb: any, nomeCurso: unknown): Promise<number | null> {
  const alvo = normalizarTexto(nomeCurso);
  if (!alvo) return null;
  const { data } = await sb.from('cursos').select('id, nome');
  if (!data) return null;
  let achado = data.find((c: any) => normalizarTexto(c.nome) === alvo);
  if (!achado) {
    achado = data.find((c: any) => normalizarTexto(c.nome).replace(/ IND$/, '') === alvo);
  }
  return achado ? achado.id : null;
}

/** Professor por TELEFONE (identidade da pessoa) + ativo. Nunca por nome solto. */
async function resolverProfessor(sb: any, aula: any): Promise<number | null> {
  const tel = normalizarTelefone(aula?.telefone_professor);
  if (tel) {
    const { data } = await sb
      .from('professores')
      .select('id')
      .eq('telefone_whatsapp', tel)
      .eq('ativo', true)
      .limit(1);
    if (data && data.length) return data[0].id;
  }
  // fallback: nome como aparece NA UNIDADE, que distingue os homônimos por unidade
  const nome = String(aula?.nome_professor ?? '').trim();
  if (!nome) return null;
  const { data } = await sb
    .from('professores_unidades')
    .select('professor_id')
    .eq('emusys_nome', nome)
    .limit(1);
  return data && data.length ? data[0].professor_id : null;
}

// ---------------------------------------------------------------- handlers ---

async function processarLead(sb: any, body: any, unidadeId: string) {
  const lead = body?.lead ?? {};
  const emusysLeadId = lead?.id ? Number(lead.id) : null;
  if (!emusysLeadId) return { acao: 'ignorado', motivo: 'sem lead.id' };

  const estagioId = String(lead?.estagio_funil?.id ?? '');
  const etapaAlvo = ETAPA_POR_ESTAGIO_EMUSYS[estagioId] ?? null;
  const cc = comoConheceu(lead);

  const campos = semNulos({
    nome: String(lead?.nome_aluno ?? '').trim(),
    telefone: normalizarTelefone(lead?.telefone),
    email: String(lead?.email ?? '').trim(),
    curso_interesse_id: await resolverCurso(sb, lead?.instrumento),
    canal_origem_id: cc ? CANAL_POR_COMO_CONHECEU[cc] ?? null : null,
    motivo_arquivamento: String(lead?.arquivamento?.motivo_nome ?? '').trim(),
    agente_comercial: String(lead?.nome_atendente ?? '').trim(),
  });

  const { data: existente } = await sb
    .from('leads')
    .select('id, etapa_pipeline_id')
    .eq('unidade_id', unidadeId)
    .eq('emusys_lead_id', emusysLeadId)
    .maybeSingle();

  if (etapaAlvo !== null) {
    const atual = existente ? existente.etapa_pipeline_id : null;
    const ordemAtual = atual ? ORDEM_ETAPA[atual] ?? 0 : 0;
    if ((ORDEM_ETAPA[etapaAlvo] ?? 0) > ordemAtual) campos.etapa_pipeline_id = etapaAlvo;
  }

  if (DRY_RUN) {
    return { acao: existente ? 'update(dry)' : 'insert(dry)', lead_id: existente ? existente.id : null, campos };
  }

  if (existente) {
    await sb.from('leads').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', existente.id);
    return { acao: 'update', lead_id: existente.id, campos };
  }

  const { data: novo } = await sb
    .from('leads')
    .insert({ ...campos, unidade_id: unidadeId, emusys_lead_id: emusysLeadId })
    .select('id')
    .maybeSingle();
  return { acao: 'insert', lead_id: novo ? novo.id : null, campos };
}

async function processarExperimental(sb: any, body: any, unidadeId: string, evento: string) {
  const aula = body?.aula ?? {};
  const emusysLeadId = aula?.lead_id ? Number(aula.lead_id) : null;
  if (!emusysLeadId) return { acao: 'ignorado', motivo: 'sem aula.lead_id' };

  const { data: lead } = await sb
    .from('leads')
    .select('id')
    .eq('unidade_id', unidadeId)
    .eq('emusys_lead_id', emusysLeadId)
    .maybeSingle();
  if (!lead) return { acao: 'ignorado', motivo: 'lead nao encontrado na unidade', emusys_lead_id: emusysLeadId };

  const professorId = await resolverProfessor(sb, aula);
  const status = evento === 'aula_experimental_cancelada' ? 'cancelada' : 'experimental_agendada';
  const dataExp = String(aula?.data ?? '').trim();

  const campos = semNulos({
    lead_id: lead.id,
    unidade_id: unidadeId,
    nome_aluno: String(aula?.nome_aluno ?? '').trim(),
    data_experimental: dataExp,
    horario_experimental: String(aula?.horario ?? '').trim(),
    professor_experimental_id: professorId,
    curso_interesse_id: await resolverCurso(sb, aula?.curso),
    status,
  });

  if (DRY_RUN) return { acao: 'upsert(dry)', campos };
  if (!dataExp) return { acao: 'ignorado', motivo: 'sem data da aula' };

  const { data: ja } = await sb
    .from('lead_experimentais')
    .select('id')
    .eq('lead_id', lead.id)
    .eq('data_experimental', dataExp)
    .maybeSingle();

  if (ja) {
    await sb.from('lead_experimentais').update(campos).eq('id', ja.id);
    return { acao: 'update', id: ja.id, campos };
  }
  const { data: novo } = await sb.from('lead_experimentais').insert(campos).select('id').maybeSingle();
  return { acao: 'insert', id: novo ? novo.id : null, campos };
}

// -------------------------------------------------------------------- main ---

const EVENTOS_LEAD = ['lead_criado', 'lead_editado'];
const EVENTOS_EXP = ['aula_experimental_criada', 'aula_experimental_reagendada', 'aula_experimental_cancelada'];

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

  // (1) LOG BRUTO — idêntico à v1. Sempre primeiro.
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

  // (2) PROCESSAMENTO — só lead e experimental. Matrícula segue no n8n.
  const evento: string = body?.evento ?? 'observador_desconhecido';
  const ehLead = EVENTOS_LEAD.indexOf(evento) >= 0;
  const ehExp = EVENTOS_EXP.indexOf(evento) >= 0;

  if (ehLead || ehExp) {
    let resultado: unknown = null;
    let acao = DRY_RUN ? 'processado_sombra' : 'processado';
    try {
      const unidadeId = await resolverUnidade(supabase, body);
      if (!unidadeId) {
        resultado = { acao: 'ignorado', motivo: 'unidade nao resolvida', escola: body?.escola_nome ?? null };
      } else if (ehLead) {
        resultado = await processarLead(supabase, body, unidadeId);
      } else {
        resultado = await processarExperimental(supabase, body, unidadeId, evento);
      }
    } catch (e: any) {
      acao = 'erro_processamento';
      resultado = { erro: String(e?.message ?? e) };
      console.error('[observador/worker] falha ao processar:', e?.message ?? e);
    }
    try {
      await supabase.from('automacao_log').insert({
        evento,
        acao,
        aluno_nome: extrairNome(body),
        unidade_nome: extrairUnidade(body),
        detalhes: resultado,
        workflow_id: 'observador-worker',
        execution_id: new Date().toISOString(),
        idempotency_key: body?.id != null ? String(body.id) : null,
      });
    } catch (e: any) {
      console.error('[observador/worker] falha ao gravar resultado:', e?.message ?? e);
    }
  }

  return new Response(JSON.stringify({ status: 'ok' }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
