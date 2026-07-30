/// <reference lib="deno.ns" />

// Edge Function: debug-webhook-emusys-observador
//
// [v1] Observador temporário: recebia webhooks do Emusys (matrícula, lead ou
// experimental) em paralelo ao n8n e SÓ gravava o payload bruto em automacao_log.
//
// [v2 — 2026-07-28] Passou a também PROCESSAR os eventos de lead e de aula
// experimental, reimplementando em TypeScript o que o n8n faz. Matrícula NÃO é
// processada aqui — segue no n8n.
//
// [v3 — 2026-07-29] A reimplementação foi DESFEITA. Dois dias de sombra mostraram
// que ela regredia em três frentes (50% das experimentais sem lead, curso NULL em
// toda Campo Grande, chave de upsert errada). Lidos os workflows na fonte, o n8n
// não tem lógica própria: ele chama duas RPCs canônicas. Agora o observador chama
// AS MESMAS RPCs, com os mesmos argumentos — a única diferença é o resolvedor de
// professor. Assim a paridade é por construção, não por transcrição.
//
//   lead        -> upsert_lead(..., 'emusys', ...)      [workflow EB0LibpOJCLhKp7M]
//   experimental-> registrar_experimental(...)          [workflow j41tPbyjGXUQUxrN]
//
// O que o observador ADICIONA sobre o n8n (regra do dono: "pode adicionar, remover não"):
//   1. Professor por TELEFONE + ativo=true. O n8n usa
//      `professores.nome ILIKE '%'||$1||'%'` sem filtrar ativo, e cai em cadastro
//      mesclado/inativo (Erick 54 em vez de 52).
//   2. Campos que o n8n descarta: agente_comercial (nome_atendente),
//      motivo_arquivamento e etapa_pipeline_id derivada do estágio do funil.
//      Aplicados DEPOIS da RPC, como delta, sem tocar no que ela gravou.
//   3. Etapa do pipeline nunca regride (ORDEM_ETAPA): webhook atrasado não rebaixa lead.
//
// OBSERVADOR_DRY_RUN=true (default) => NÃO chama as RPCs. Roda um preview só de
// leitura, que replica o matching das RPCs para o diff em sombra, e registra em
// automacao_log o que faria. Trocar para 'false' liga a escrita, sem redeploy.
// ⚠️ O preview é diagnóstico; quem escreve é a RPC. Se os dois divergirem, a RPC vale.

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

function semAcento(s: unknown): string {
  const base = String(s ?? '').normalize('NFD');
  let out = '';
  for (const ch of base) {
    // apos NFD os diacriticos ficam fora do ASCII; manter so o basico
    if (ch.charCodeAt(0) < 128) out += ch;
  }
  return out;
}

/** "LA Music School Campo Grande" -> "Campo Grande" */
function nomeUnidade(escolaNome: unknown): string | null {
  const s = String(escolaNome ?? '').trim();
  if (!s) return null;
  return s.replace(/^LA Music School\s*/i, '').trim() || null;
}

/** Campo personalizado "Como conheceu a escola" — o valor vem como string ou como
 *  objeto {id, valor}; os dois formatos aparecem em produção. Devolve o texto CRU:
 *  o de-para de canal (com acento: 'LOJA DE MÚSICA', 'RÁDIO') é da upsert_lead. */
function comoConheceu(lead: any): string | null {
  const campos = lead?.campos_personalizados;
  if (!Array.isArray(campos)) return null;
  const c = campos.find((x: any) => semAcento(x?.nome).toUpperCase().indexOf('CONHECEU') >= 0);
  if (!c) return null;
  const v = c.valor;
  const bruto = v && typeof v === 'object' ? v.valor : v;
  const s = String(bruto ?? '').trim();
  return s || null;
}

function textoOuNulo(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

/** "2026-03-27 14:25:46" -> ISO em BRT. É o que o n8n faz com
 *  ($8::timestamp AT TIME ZONE 'America/Sao_Paulo') ao passar p_created_at. */
function dataHoraBRT(bruto: unknown): string | null {
  const s = String(bruto ?? '').trim();
  if (!s) return null;
  return s.replace(' ', 'T') + '-03:00';
}

// --------------------------------------------------------------- resolvers ---

async function resolverUnidade(sb: any, body: any): Promise<string | null> {
  const nome = nomeUnidade(body?.escola_nome);
  if (!nome) return null;
  const { data } = await sb.from('unidades').select('id').eq('nome', nome).maybeSingle();
  return data ? data.id : null;
}

/** Professor por TELEFONE (identidade da pessoa) + ativo. Nunca por nome solto:
 *  a mesma pessoa tem nomes diferentes por unidade e há cadastros mesclados
 *  inativos com nome quase igual (Erick Osmy 54 x Erick Cosme da Silva 52). */
async function resolverProfessor(sb: any, aula: any, unidadeId: string) {
  const tel = normalizarTelefone(aula?.telefone_professor);
  if (tel) {
    const { data } = await sb
      .from('professores')
      .select('id')
      .eq('telefone_whatsapp', tel)
      .eq('ativo', true)
      .limit(1);
    if (data && data.length) return { id: data[0].id as number, via: 'telefone' };
  }
  // fallback: nome como aparece NA UNIDADE — distingue os homônimos entre escolas
  const nome = String(aula?.nome_professor ?? '').trim();
  if (!nome) return { id: null, via: 'nao_resolvido' };
  const { data } = await sb
    .from('professores_unidades')
    .select('professor_id, professores!inner(ativo)')
    .eq('emusys_nome', nome)
    .eq('unidade_id', unidadeId)
    .eq('professores.ativo', true)
    .limit(1);
  if (data && data.length) return { id: data[0].professor_id as number, via: 'emusys_nome_da_unidade' };
  return { id: null, via: 'nao_resolvido' };
}

// ------------------------------------------------- preview (só em DRY_RUN) ---

/** Replica a normalização de curso da registrar_experimental para o preview.
 *  Na escrita real quem resolve é a RPC — isto aqui é diagnóstico. */
function normalizarCurso(nomeCurso: unknown): string {
  return semAcento(nomeCurso)
    .toLowerCase()
    .replace(/\s+para\s+instrumento$/g, '')
    .replace(/\s+(t|ind)$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function previewCurso(sb: any, nomeCurso: unknown): Promise<number | null> {
  const alvo = normalizarCurso(nomeCurso);
  if (!alvo) return null;
  const { data } = await sb.from('cursos').select('id, nome').order('id');
  if (!data) return null;
  const candidatos = data.filter((c: any) => normalizarCurso(c.nome) === alvo);
  if (!candidatos.length) return null;
  // mesmo desempate da RPC: quem NÃO termina em ' IND' primeiro, depois menor id
  candidatos.sort((a: any, b: any) => {
    const ai = /\sIND$/i.test(a.nome) ? 1 : 0;
    const bi = /\sIND$/i.test(b.nome) ? 1 : 0;
    return ai - bi || a.id - b.id;
  });
  return candidatos[0].id;
}

/** Espelha o match de lead da upsert_lead (source_type 'emusys'). */
async function previewLead(sb: any, unidadeId: string, emusysLeadId: number | null, telefone: string | null) {
  if (emusysLeadId) {
    const { data } = await sb
      .from('leads').select('id')
      .eq('emusys_lead_id', emusysLeadId).eq('unidade_id', unidadeId).limit(1);
    if (data && data.length) return { lead_id: data[0].id as number, via: 'emusys_lead_id' };
  }
  if (telefone) {
    const { data } = await sb
      .from('leads').select('id')
      .eq('telefone', telefone).eq('unidade_id', unidadeId).eq('arquivado', false).limit(1);
    if (data && data.length) return { lead_id: data[0].id as number, via: 'telefone' };
  }
  return { lead_id: null, via: 'sera_criado' };
}

/** Espelha o match de lead da registrar_experimental: emusys_lead_id -> telefone -> nome.
 *  ⚠️ A camada 1 da RPC NÃO filtra unidade (bug conhecido — emusys_lead_id colide entre
 *  escolas). O preview reproduz isso de propósito e sinaliza quando acontece. */
async function previewLeadExperimental(
  sb: any, unidadeId: string, emusysLeadId: number | null, telefone: string | null, nomeAluno: string | null,
) {
  if (emusysLeadId) {
    const { data } = await sb.from('leads').select('id, unidade_id').eq('emusys_lead_id', emusysLeadId).limit(1);
    if (data && data.length) {
      const fora = data[0].unidade_id !== unidadeId;
      return {
        lead_id: data[0].id as number,
        via: 'emusys_lead_id',
        ...(fora ? { alerta: 'emusys_lead_id casou em OUTRA unidade (colisão entre escolas)' } : {}),
      };
    }
  }
  if (telefone && telefone.replace(/\D/g, '').length >= 10) {
    const { data } = await sb
      .from('leads').select('id')
      .eq('telefone', telefone).eq('unidade_id', unidadeId).eq('arquivado', false).limit(1);
    if (data && data.length) return { lead_id: data[0].id as number, via: 'telefone' };
  }
  if (nomeAluno) {
    const { data } = await sb
      .from('leads').select('id')
      .ilike('nome', nomeAluno).eq('unidade_id', unidadeId).eq('arquivado', false)
      .order('created_at', { ascending: false }).limit(1);
    if (data && data.length) return { lead_id: data[0].id as number, via: 'nome' };
  }
  return { lead_id: null, via: 'nao_encontrado' };
}

// ---------------------------------------------------------------- handlers ---

/** Campos que a upsert_lead não conhece. Aplicados DEPOIS dela, só onde há valor,
 *  e a etapa só quando avança. Nunca apaga: chave ausente não entra no UPDATE. */
async function aplicarDeltaLead(sb: any, leadId: number, lead: any) {
  const delta: Record<string, unknown> = {};
  const agente = textoOuNulo(lead?.nome_atendente);
  if (agente) delta.agente_comercial = agente;
  const motivo = textoOuNulo(lead?.arquivamento?.motivo_nome);
  if (motivo) delta.motivo_arquivamento = motivo;

  const etapaAlvo = ETAPA_POR_ESTAGIO_EMUSYS[String(lead?.estagio_funil?.id ?? '')] ?? null;
  if (etapaAlvo !== null) {
    const { data: atual } = await sb.from('leads').select('etapa_pipeline_id').eq('id', leadId).maybeSingle();
    const ordemAtual = atual?.etapa_pipeline_id ? ORDEM_ETAPA[atual.etapa_pipeline_id] ?? 0 : 0;
    if ((ORDEM_ETAPA[etapaAlvo] ?? 0) > ordemAtual) delta.etapa_pipeline_id = etapaAlvo;
  }

  if (!Object.keys(delta).length) return null;
  await sb.from('leads').update(delta).eq('id', leadId);
  return delta;
}

async function processarLead(sb: any, body: any, unidadeId: string) {
  const lead = body?.lead ?? {};
  const emusysLeadId = lead?.id ? Number(lead.id) : null;
  if (!emusysLeadId) return { acao: 'ignorado', motivo: 'sem lead.id' };

  const telefone = normalizarTelefone(lead?.telefone);
  // paridade com o n8n: o nó "tem numero?2" descarta lead sem telefone antes do upsert.
  if (!telefone) return { acao: 'ignorado', motivo: 'sem telefone (mesma regra do n8n)', emusys_lead_id: emusysLeadId };

  const args = {
    p_nome: textoOuNulo(lead?.nome_aluno),
    p_telefone: telefone,
    p_email: textoOuNulo(lead?.email),
    p_unidade_id: unidadeId,
    p_curso: textoOuNulo(lead?.instrumento),
    p_canal: comoConheceu(lead),
    p_source_id: emusysLeadId,
    p_source_type: 'emusys',
    p_arquivar: false,
    p_data_contato: String(lead?.data_hora_criacao ?? '').trim().substring(0, 10) || null,
  };

  if (DRY_RUN) {
    const achado = await previewLead(sb, unidadeId, emusysLeadId, telefone);
    return { acao: `upsert_lead(dry) -> ${achado.lead_id ? 'update' : 'insert'}`, match: achado, args };
  }

  const { data, error } = await sb.rpc('upsert_lead', args);
  if (error) return { acao: 'erro_rpc', rpc: 'upsert_lead', erro: error.message, args };

  const leadId = data?.lead_id ?? null;
  const delta = leadId ? await aplicarDeltaLead(sb, leadId, lead) : null;
  return { acao: 'upsert_lead', resultado: data, delta_observador: delta, args };
}

async function processarExperimental(sb: any, body: any, unidadeId: string, evento: string) {
  const aula = body?.aula ?? {};
  const cancelamento = evento === 'aula_experimental_cancelada';
  const telefone = normalizarTelefone(aula?.telefone);
  const nomeAluno = textoOuNulo(aula?.nome_aluno);
  const emusysLeadId = aula?.lead_id ? Number(aula.lead_id) : null;

  if (!telefone && !emusysLeadId && !nomeAluno) {
    return { acao: 'ignorado', motivo: 'sem telefone, lead_id e nome — nada para casar' };
  }

  const professor = cancelamento
    ? { id: null, via: 'nao_se_aplica' }
    : await resolverProfessor(sb, aula, unidadeId);

  // Mesmos argumentos do nó "Agendar Experimental"/"Cancelar Experimental" do n8n.
  const args: Record<string, unknown> = {
    p_telefone: telefone,
    p_nome_aluno: nomeAluno,
    p_unidade_id: unidadeId,
    p_status: cancelamento ? 'cancelada' : 'experimental_agendada',
    p_etapa: cancelamento ? 1 : 5,
    p_data_experimental: cancelamento ? null : textoOuNulo(aula?.data),
    p_horario_experimental: cancelamento ? null : textoOuNulo(aula?.horario),
    p_professor_id: professor.id,
    p_emusys_lead_id: emusysLeadId,
    p_curso: cancelamento ? null : textoOuNulo(aula?.curso),
    p_emusys_aula_id: body?.id != null ? Number(body.id) : null,
  };
  const criadoEm = dataHoraBRT(body?.data_hora_criacao);
  // omitir p_created_at deixa a RPC aplicar o default now(), como o n8n faz com ''
  if (criadoEm) args.p_created_at = criadoEm;

  if (DRY_RUN) {
    const achado = await previewLeadExperimental(sb, unidadeId, emusysLeadId, telefone, nomeAluno);
    const cursoId = cancelamento ? null : await previewCurso(sb, aula?.curso);
    return {
      acao: `registrar_experimental(dry) -> ${achado.lead_id ? 'registra' : 'lead_not_found'}`,
      match: achado,
      professor_via: professor.via,
      curso_id_previsto: cursoId,
      args,
    };
  }

  const { data, error } = await sb.rpc('registrar_experimental', args);
  if (error) return { acao: 'erro_rpc', rpc: 'registrar_experimental', erro: error.message, args };
  return { acao: 'registrar_experimental', resultado: data, professor_via: professor.via, args };
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
