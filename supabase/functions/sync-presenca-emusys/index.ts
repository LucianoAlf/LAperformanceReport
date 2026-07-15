/// <reference lib="deno.ns" />

// Edge Function: sync-presenca-emusys
// Sincroniza aulas e presença dos alunos do Emusys para aulas_emusys + aluno_presenca
// Presenca completa em horarios fixos e metadados de agenda a cada 15 minutos.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  carregarMapaProfessoresEmusys,
  resolverProfessorDaAula,
  type EmusysProfessorRef,
} from '../_shared/professor-emusys.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const EMUSYS_API = 'https://api.emusys.com.br/v1';
const MATUREZA_FALTA_HORAS = 24;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret obrigatorio ausente: ${name}`);
  return value;
}

const UNIDADES = [
  { nome: 'Campo Grande', id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92', token: requiredEnv('EMUSYS_TOKEN_CG') },
  { nome: 'Barra',        id: '368d47f5-2d88-4475-bc14-ba084a9a348e', token: requiredEnv('EMUSYS_TOKEN_BARRA') },
  { nome: 'Recreio',      id: '95553e96-971b-4590-a6eb-0201d013c14d', token: requiredEnv('EMUSYS_TOKEN_RECREIO') },
];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalizar nome para matching (mesmo padrão do parseEmusysFile.ts)
function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalizar nome de curso: lowercase + sem acentos + remove sufixos do Emusys
// (" t" — turma, " para instrumento" — variante de Musicalizacao Preparatoria)
function normalizarCurso(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+para\s+instrumento$/, '')
    .replace(/\s+(t|ind)$/, '') // remove sufixo de visao: " t" (turma) e " ind" (individual)
    .replace(/\s+/g, ' ')
    .trim();
}

interface AlunoEmusys {
  nome_aluno: string;
  presenca: string;
  horario_presenca: string | null;
  data_nascimento_aluno?: string;
  email_aluno?: string;
  telefone_aluno?: string;
  nome_responsavel?: string;
  email_responsavel?: string;
  telefone_responsavel?: string;
  // IDs que a API /aulas já fornece: id_lead=0 quando já é aluno; id_aluno=null quando é lead puro
  id_lead?: number | null;
  id_aluno?: number | null;
}

interface AulaEmusys {
  id: number;
  nr_da_aula: number | null;
  qtd_aulas_contrato: number | null;
  matricula_disciplina_id?: number | null;
  tipo: string;
  categoria: string;
  turma_nome: string | null;
  curso_id: number | null;
  curso_nome: string;
  cancelada: boolean;
  reagendada?: boolean;
  justificada?: boolean;
  data_hora_inicio: string;
  data_hora_inicio_original?: string | null;
  data_hora_fim: string | null;
  duracao_minutos: number | null;
  sala_id: number | null;
  sala_nome: string | null;
  professores: Array<EmusysProfessorRef & { nome: string; presenca: string }>;
  alunos: AlunoEmusys[];
  anotacoes: string | null;
}

function podeMaterializarFalta(aula: AulaEmusys, agora = new Date()): boolean {
  if (aula.cancelada) return false;

  const fimIso = aula.data_hora_fim
    ? parseDataHoraEmusys(aula.data_hora_fim)
    : parseDataHoraEmusys(aula.data_hora_inicio);
  const fimAula = new Date(fimIso);
  const limite = new Date(agora.getTime() - MATUREZA_FALTA_HORAS * 60 * 60 * 1000);
  return fimAula <= limite;
}

function criarAlunoChave(aluno: AlunoEmusys, alunoId: number | undefined): string {
  if (aluno.id_aluno != null && aluno.id_aluno > 0) return `emusys:${aluno.id_aluno}`;
  if (alunoId != null) return `local:${alunoId}`;
  return `nome:${normalizarNome(aluno.nome_aluno || '')}:${aluno.data_nascimento_aluno || ''}`;
}

function resolverAlunoLocal(
  aluno: AlunoEmusys,
  cursoIdAula: number | null,
  mapaAlunosEmusys: Map<string, number[]>,
  mapaAlunosComposto: Map<string, number[]>,
  mapaAlunos: Map<string, number>
): number | undefined {
  if (aluno.id_aluno != null && aluno.id_aluno > 0) {
    const candidatosEmusys = mapaAlunosEmusys.get(String(aluno.id_aluno)) ?? [];
    if (candidatosEmusys.length === 1) return candidatosEmusys[0];
  }

  const nomeNorm = normalizarNome(aluno.nome_aluno || '');
  if (cursoIdAula != null) {
    const chave = `${nomeNorm}|${aluno.data_nascimento_aluno ?? ''}|${cursoIdAula}`;
    const candidatos = mapaAlunosComposto.get(chave) ?? [];
    if (candidatos.length === 1) return candidatos[0];
  }

  return mapaAlunos.get(nomeNorm);
}

// Buscar todas as aulas de um dia no Emusys (com paginação)
async function fetchAulasDia(token: string, data: string): Promise<AulaEmusys[]> {
  const todas: AulaEmusys[] = [];
  let cursor: string | null = null;
  let temMais = true;

  while (temMais) {
    let url = `${EMUSYS_API}/aulas/?data_hora_inicial=${data}T00:00:00&data_hora_final=${data}T23:59:59&limite=100`;
    if (cursor) url += `&cursor=${cursor}`;

    const resp = await fetch(url, { headers: { token } });
    if (!resp.ok) {
      console.error(`[sync-presenca] Emusys API error: ${resp.status}`);
      break;
    }

    const json = await resp.json();
    const items = json.items || [];
    todas.push(...items);

    const pag = json.paginacao || {};
    temMais = pag.tem_mais === true;
    cursor = pag.proximo_cursor || null;
  }

  return todas;
}

async function fetchAulasRange(
  token: string,
  dataInicio: string,
  dataFim: string
): Promise<AulaEmusys[]> {
  const todas: AulaEmusys[] = [];
  let cursor: string | null = null;
  let temMais = true;

  while (temMais) {
    let url = `${EMUSYS_API}/aulas/?data_hora_inicial=${dataInicio}T00:00:00&data_hora_final=${dataFim}T23:59:59&limite=100`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;

    const response = await fetch(url, { headers: { token } });
    if (!response.ok) {
      throw new Error(`Emusys API ${response.status} no intervalo ${dataInicio}..${dataFim}`);
    }

    const json = await response.json();
    todas.push(...(json.items || []));
    temMais = json.paginacao?.tem_mais === true;
    cursor = json.paginacao?.proximo_cursor || null;
  }

  return todas;
}

// Converter data_hora_inicio do Emusys ("2026-03-04 14:00") para ISO com timezone BRT
function parseDataHoraEmusys(dataHora: string): string {
  // Emusys retorna "YYYY-MM-DD HH:mm" em horário local (BRT = UTC-3)
  return dataHora.replace(' ', 'T') + ':00-03:00';
}

async function sincronizarMetadadosAulas(
  supabase: any,
  unidades: typeof UNIDADES,
  dataInicio: string,
  dataFim: string
) {
  const resultados: Array<Record<string, unknown>> = [];
  const chunkSize = 500;

  for (const unidade of unidades) {
    const mapaProfessores = await carregarMapaProfessoresEmusys(supabase, unidade.id);
    const aulas = await fetchAulasRange(unidade.token, dataInicio, dataFim);
    const linhas = aulas.map((aula) => {
      const profNome = aula.professores?.[0]?.nome || null;
      const professor = resolverProfessorDaAula(aula.professores, mapaProfessores);

      return {
        emusys_id: aula.id,
        unidade_id: unidade.id,
        data_aula: aula.data_hora_inicio.split(' ')[0],
        data_hora_inicio: parseDataHoraEmusys(aula.data_hora_inicio),
        data_hora_fim: aula.data_hora_fim
          ? parseDataHoraEmusys(aula.data_hora_fim)
          : null,
        duracao_minutos: aula.duracao_minutos,
        tipo: aula.tipo,
        categoria: aula.categoria,
        turma_nome: aula.turma_nome,
        curso_emusys_id: aula.curso_id,
        curso_nome: aula.curso_nome,
        sala_nome: aula.sala_nome,
        professor_nome: profNome,
        emusys_professor_id: professor.emusysProfessorId,
        professor_id: professor.professorId,
        sem_acompanhamento: professor.semAcompanhamento,
        cancelada: aula.cancelada === true,
        reagendada: aula.reagendada === true,
        justificada: aula.justificada === true,
        data_hora_inicio_original: aula.data_hora_inicio_original
          ? parseDataHoraEmusys(aula.data_hora_inicio_original)
          : null,
        professor_presenca: aula.professores?.[0]?.presenca ?? null,
        nr_da_aula: aula.nr_da_aula,
        matricula_disciplina_id: aula.matricula_disciplina_id ?? null,
        qtd_aulas_contrato: aula.qtd_aulas_contrato,
        qtd_alunos: aula.alunos?.length || 0,
        anotacoes: aula.anotacoes || null,
      };
    });

    let gravadas = 0;
    for (let offset = 0; offset < linhas.length; offset += chunkSize) {
      const lote = linhas.slice(offset, offset + chunkSize);
      const { error } = await supabase
        .from('aulas_emusys')
        .upsert(lote, { onConflict: 'emusys_id,unidade_id', ignoreDuplicates: false });
      if (error) {
        throw new Error(
          `Erro no lote ${offset} de ${unidade.nome}: ${error.message}`
        );
      }
      gravadas += lote.length;
    }

    resultados.push({
      unidade: unidade.nome,
      aulas_recebidas: aulas.length,
      aulas_gravadas: gravadas,
    });
  }

  return resultados;
}

// Dados coletados de aulas experimentais para reconciliação
interface ExperimentalParaReconciliar {
  emusysAulaId: number;
  dataAula: string;
  horario: string;
  professorId: number | null;
  professorNome: string | null;
  unidadeId: string;
  cancelada: boolean;
  cursoId: number | null;
  cursoNome: string | null;
  alunos: AlunoEmusys[];
}

// Normalizar telefone para formato do banco (55XXXXXXXXXXX)
function normalizarTelefone(tel: string | null | undefined): string | null {
  if (!tel) return null;
  const digits = tel.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.startsWith('55') ? digits : '55' + digits;
}

// Rede de segurança: reconciliar experimentais que o webhook não atualizou
// Parte das aulas experimentais do Emusys e busca leads correspondentes por telefone/nome
// Insere na lead_experimentais (não nas colunas legadas do lead)
function normalizarSituacaoExperimental(presenca: string | null | undefined, cancelada: boolean): string {
  if (cancelada) return 'cancelada';
  const raw = normalizarNome(presenca || '');
  if (raw.includes('matriculado')) return 'matriculado';
  if (raw.includes('presente') || raw === 'sim') return 'presente';
  if (raw.includes('falt') || raw.includes('ausente') || raw.includes('nao')) return 'faltou';
  return 'desconhecida';
}

function criarRawKey(unidadeId: string, aulaId: number, aluno: AlunoEmusys): string {
  const nome = normalizarNome(aluno.nome_aluno || '');
  const telefone = normalizarTelefone(aluno.telefone_aluno)
    || normalizarTelefone(aluno.telefone_responsavel)
    || '';
  const nascimento = aluno.data_nascimento_aluno || '';
  return `${unidadeId}:${aulaId}:${nome}:${telefone || nascimento}`;
}

async function upsertExperimentalRaw(
  supabase: any,
  params: {
    aula: AulaEmusys;
    aulaLocalId: number;
    unidadeId: string;
    dataAula: string;
    professorId: number | null;
    professorNome: string | null;
    cursoId: number | null;
    aluno: AlunoEmusys;
    alunoId?: number | null;
  }
) {
  const nome = params.aluno.nome_aluno?.trim();
  if (!nome) return;

  const telefoneAluno = normalizarTelefone(params.aluno.telefone_aluno) || '';
  const horario = params.aluno.horario_presenca
    || params.aula.data_hora_inicio?.split(' ')[1]
    || null;

  const { error } = await supabase
    .from('emusys_experimentais_raw')
    .upsert(
      {
        raw_key: criarRawKey(params.unidadeId, params.aula.id, params.aluno),
        emusys_aula_id: params.aula.id,
        aula_emusys_id: params.aulaLocalId,
        unidade_id: params.unidadeId,
        data_aula: params.dataAula,
        horario_aula: horario,
        aluno_nome: nome,
        aluno_nome_normalizado: normalizarNome(nome),
        aluno_telefone: telefoneAluno,
        responsavel_nome: params.aluno.nome_responsavel || null,
        responsavel_telefone: normalizarTelefone(params.aluno.telefone_responsavel),
        professor_nome: params.professorNome,
        professor_id: params.professorId,
        curso_nome: params.aula.curso_nome || null,
        curso_id: params.cursoId,
        presenca_emusys: params.aluno.presenca || null,
        situacao_operacional: normalizarSituacaoExperimental(params.aluno.presenca, params.aula.cancelada),
        aluno_id: params.alunoId || null,
        payload: {
          aluno: params.aluno,
          aula: {
            id: params.aula.id,
            categoria: params.aula.categoria,
            tipo: params.aula.tipo,
            turma_nome: params.aula.turma_nome,
            curso_nome: params.aula.curso_nome,
            sala_nome: params.aula.sala_nome,
            data_hora_inicio: params.aula.data_hora_inicio,
            data_hora_fim: params.aula.data_hora_fim,
          },
        },
      },
      { onConflict: 'raw_key', ignoreDuplicates: false }
    );

  if (error) {
    console.error(`[sync-presenca] Upsert experimental raw ${nome} aula ${params.aula.id}:`, error.message);
  }
}

async function reconciliarExperimentaisOrfas(
  supabase: any,
  experimentais: ExperimentalParaReconciliar[]
) {
  const logs: { lead_id: number | null; lead_nome: string; unidade: string; data: string; status: string; motivo: string }[] = [];
  const unidadeNomes = new Map(UNIDADES.map(u => [u.id, u.nome]));

  for (const exp of experimentais) {
    // Cancelada: marcar 'cancelada'. Casa pela AULA (emusys_aula_id) e, p/ legados sem id,
    // por nome+data (só linhas sem aula_id, p/ não cancelar o outro instrumento do dia).
    if (exp.cancelada) {
      await supabase
        .from('lead_experimentais')
        .update({ status: 'cancelada', updated_at: new Date().toISOString() })
        .eq('emusys_aula_id', exp.emusysAulaId)
        .neq('status', 'cancelada');
      for (const aluno of exp.alunos) {
        const nomeAluno = aluno.nome_aluno?.trim();
        if (!nomeAluno) continue;
        await supabase
          .from('lead_experimentais')
          .update({ status: 'cancelada', updated_at: new Date().toISOString() })
          .is('emusys_aula_id', null)
          .eq('nome_aluno', nomeAluno)
          .eq('data_experimental', exp.dataAula)
          .eq('unidade_id', exp.unidadeId)
          .neq('status', 'cancelada');
      }
      continue;
    }

    for (const aluno of exp.alunos) {
      const nomeAluno = aluno.nome_aluno?.trim();
      if (!nomeAluno) continue;

      const unidadeNome = unidadeNomes.get(exp.unidadeId) || exp.unidadeId;
      const telNorm = normalizarTelefone(aluno.telefone_aluno) || normalizarTelefone(aluno.telefone_responsavel);
      const idLead = Number(aluno.id_lead ?? 0);
      const idAluno = aluno.id_aluno != null ? Number(aluno.id_aluno) : null;

      const presente = aluno.presenca === 'presente';
      const novoStatus = presente ? 'experimental_realizada' : 'experimental_faltou';

      // 1. Match primário pela AULA real (emusys_aula_id) — não colapsa multi-instrumento.
      let { data: expExistente } = await supabase
        .from('lead_experimentais')
        .select('id, status, lead_id, curso_interesse_id, professor_experimental_id, emusys_aula_id, aluno_id')
        .eq('emusys_aula_id', exp.emusysAulaId)
        .neq('status', 'cancelada')
        .limit(1)
        .maybeSingle();

      // 2. Fallback legado: linha sem aula_id (criada antes), casa por nome+data+unidade.
      if (!expExistente) {
        const { data: legado } = await supabase
          .from('lead_experimentais')
          .select('id, status, lead_id, curso_interesse_id, professor_experimental_id, emusys_aula_id, aluno_id')
          .is('emusys_aula_id', null)
          .eq('nome_aluno', nomeAluno)
          .eq('data_experimental', exp.dataAula)
          .eq('unidade_id', exp.unidadeId)
          .neq('status', 'cancelada')
          .limit(1)
          .maybeSingle();
        expExistente = legado || null;
      }

      // 2b. Match por CHAVE DE NEGÓCIO: acha a linha criada pelo WEBHOOK, que tem
      //     emusys_aula_id de EVENTO (não da aula) e por isso escapa dos matches 1 e 2.
      //     O Emusys reenvia o webhook de experimental com um id de evento diferente a
      //     cada disparo; a identidade real da aula é unidade+data+horário+curso+aluno.
      //     Sem este match, a sync INSERE uma 2ª linha e duplica as realizadas.
      if (!expExistente && exp.cursoId != null) {
        const { data: porNegocio } = await supabase
          .from('lead_experimentais')
          .select('id, status, lead_id, curso_interesse_id, professor_experimental_id, emusys_aula_id, aluno_id')
          .eq('unidade_id', exp.unidadeId)
          .eq('data_experimental', exp.dataAula)
          .eq('horario_experimental', exp.horario + ':00')
          .eq('curso_interesse_id', exp.cursoId)
          .eq('nome_aluno', nomeAluno)
          .neq('status', 'cancelada')
          .limit(1)
          .maybeSingle();
        expExistente = porNegocio || null;
      }

      if (expExistente) {
        // Sobrescrever SEMPRE curso/professor com a verdade do /aulas (pega remarcação/troca);
        // gravar emusys_aula_id/aluno_id se faltavam.
        const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const statusMudou = expExistente.status !== novoStatus;
        if (statusMudou) {
          patch.status = novoStatus;
          patch.etapa_pipeline_id = presente ? 7 : 9;
        }
        if (exp.cursoId != null && expExistente.curso_interesse_id !== exp.cursoId) patch.curso_interesse_id = exp.cursoId;
        if (exp.professorId != null && expExistente.professor_experimental_id !== exp.professorId) patch.professor_experimental_id = exp.professorId;
        if (expExistente.emusys_aula_id == null) patch.emusys_aula_id = exp.emusysAulaId;
        if (idAluno != null && expExistente.aluno_id == null) patch.aluno_id = idAluno;

        if (Object.keys(patch).length > 1) {
          await supabase.from('lead_experimentais').update(patch).eq('id', expExistente.id);
          // Propagar status para leads só quando o status mudou (não sobrescrever convertidos/matriculados)
          if (statusMudou && expExistente.lead_id) {
            await supabase.from('leads').update({
              experimental_realizada: presente,
              faltou_experimental: !presente,
              status: novoStatus,
              etapa_pipeline_id: presente ? 7 : 9,
              updated_at: new Date().toISOString()
            }).eq('id', expExistente.lead_id)
              .not('status', 'in', '("convertido","matriculado")');
          }
        }
        continue;
      }

      // 3. Não existe: resolver identidade (lead puro OU aluno existente) e inserir.
      let leadId: number | null = null;
      let matchadoPorNome = false;

      // 3a. Lead pelo id_lead da API (emusys_lead_id)
      if (idLead > 0) {
        const { data: leadPorEmusys } = await supabase
          .from('leads').select('id').eq('emusys_lead_id', idLead).limit(1).maybeSingle();
        if (leadPorEmusys) leadId = leadPorEmusys.id;
      }
      // 3b. Lead por telefone
      if (!leadId && telNorm) {
        const { data: leadPorTel } = await supabase
          .from('leads').select('id')
          .eq('telefone', telNorm).eq('unidade_id', exp.unidadeId).eq('arquivado', false)
          .limit(1).maybeSingle();
        if (leadPorTel) leadId = leadPorTel.id;
      }
      // 3c. Fallback por nome — só quando NÃO é aluno existente (sem id_aluno)
      if (!leadId && idAluno == null) {
        const nomeNorm = normalizarNome(nomeAluno);
        const { data: leads } = await supabase
          .from('leads').select('id, nome, data_experimental')
          .eq('unidade_id', exp.unidadeId).eq('arquivado', false).limit(100);
        const match = (leads || []).find((l: any) => l.nome && normalizarNome(l.nome) === nomeNorm);
        // Guard: match por nome só vale se o lead tem data_experimental (evita falso positivo)
        if (match && match.data_experimental) {
          leadId = match.id;
          matchadoPorNome = true;
        }
      }

      // Régua do professor é SÓ LEAD por ora (dúvida em aberto: experimental de aluno
      // antigo conta? — decidir com o Alf). Sem lead → não insere, p/ não inflar o
      // denominador da régua com linhas que nunca entram no numerador. O id_aluno segue
      // sendo capturado (match/raw) p/ quando a decisão for tomada.
      if (!leadId) continue;

      // 2c. Último match por LEAD + chave de negócio (data+horário+curso), agora que o lead
      //     está resolvido. Cobre o que o 2b não pega: curso NULL (2b exige cursoId) e
      //     nome_aluno divergente. Espelha o índice único uq_lead_exp_negocio_novo (id>1227):
      //     sem isto a sync tentaria INSERIR e o índice rejeitaria (presença ficaria sem
      //     reconciliar). Aqui ATUALIZA a linha do webhook em vez de duplicar/falhar.
      {
        let qLead = supabase
          .from('lead_experimentais')
          .select('id, status, lead_id, curso_interesse_id, professor_experimental_id, emusys_aula_id, aluno_id')
          .eq('lead_id', leadId)
          .eq('data_experimental', exp.dataAula)
          .eq('horario_experimental', exp.horario + ':00')
          .neq('status', 'cancelada');
        qLead = exp.cursoId != null
          ? qLead.eq('curso_interesse_id', exp.cursoId)
          : qLead.is('curso_interesse_id', null);
        const { data: porLead } = await qLead.limit(1).maybeSingle();
        if (porLead) {
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          const statusMudou = porLead.status !== novoStatus;
          if (statusMudou) { patch.status = novoStatus; patch.etapa_pipeline_id = presente ? 7 : 9; }
          if (exp.cursoId != null && porLead.curso_interesse_id !== exp.cursoId) patch.curso_interesse_id = exp.cursoId;
          if (exp.professorId != null && porLead.professor_experimental_id !== exp.professorId) patch.professor_experimental_id = exp.professorId;
          if (porLead.emusys_aula_id == null) patch.emusys_aula_id = exp.emusysAulaId;
          if (idAluno != null && porLead.aluno_id == null) patch.aluno_id = idAluno;
          if (Object.keys(patch).length > 1) {
            await supabase.from('lead_experimentais').update(patch).eq('id', porLead.id);
            if (statusMudou && porLead.lead_id) {
              await supabase.from('leads').update({
                experimental_realizada: presente,
                faltou_experimental: !presente,
                status: novoStatus,
                etapa_pipeline_id: presente ? 7 : 9,
                updated_at: new Date().toISOString()
              }).eq('id', porLead.lead_id).not('status', 'in', '("convertido","matriculado")');
            }
          }
          logs.push({
            lead_id: porLead.lead_id,
            lead_nome: nomeAluno,
            unidade: unidadeNome,
            data: exp.dataAula,
            status: presente ? 'reconciliada_presente' : 'reconciliada_faltou',
            motivo: `Experimental ${presente ? 'realizada' : 'faltou'} via match lead+negócio (aulaId=${exp.emusysAulaId}, curso=${exp.cursoId ?? 'null'})`
          });
          continue;
        }
      }

      // Inserir já no estado final (lead puro).
      const { error } = await supabase
        .from('lead_experimentais')
        .insert({
          lead_id: leadId,
          aluno_id: idAluno,
          nome_aluno: nomeAluno,
          unidade_id: exp.unidadeId,
          data_experimental: exp.dataAula,
          horario_experimental: exp.horario + ':00',
          professor_experimental_id: exp.professorId,
          curso_interesse_id: exp.cursoId,
          emusys_aula_id: exp.emusysAulaId,
          emusys_lead_id: idLead > 0 ? idLead : null,
          status: novoStatus,
          etapa_pipeline_id: presente ? 7 : 9,
        });

      if (!error && leadId) {
        // Propagar para leads (não sobrescrever leads já convertidos/matriculados)
        await supabase.from('leads').update({
          experimental_realizada: presente,
          faltou_experimental: !presente,
          status: novoStatus,
          etapa_pipeline_id: presente ? 7 : 9,
          updated_at: new Date().toISOString()
        }).eq('id', leadId)
          .not('status', 'in', '("convertido","matriculado")');
      }

      logs.push({
        lead_id: leadId,
        lead_nome: nomeAluno,
        unidade: unidadeNome,
        data: exp.dataAula,
        status: error ? 'erro' : (presente ? 'reconciliada_presente' : 'reconciliada_faltou'),
        motivo: error
          ? error.message
          : `Experimental ${presente ? 'realizada' : 'faltou'} via reconciliação (aulaId=${exp.emusysAulaId}, matchadoPorNome=${matchadoPorNome}, alunoExistente=${idAluno != null})`
      });
    }
  }

  // Gravar logs
  for (const log of logs) {
    await supabase.from('leads_automacao_log').insert({
      lead_id: log.lead_id,
      lead_nome: log.lead_nome,
      unidade_nome: log.unidade,
      evento: 'sync_experimental_reconciliacao',
      acao: log.status,
      detalhes: { data: log.data, motivo: log.motivo },
      workflow_id: 'sync-presenca-emusys',
      execution_id: new Date().toISOString()
    });
  }

  const reconciliadas = logs.filter(l => l.status.startsWith('reconciliada_'));
  console.log(`[sync-presenca] Reconciliação experimentais: ${reconciliadas.length} reconciliadas de ${logs.length} processadas`);

  return logs;
}

// Confirmar experimentais: cruzar aulas_emusys (categoria=experimental) com lead_experimentais agendadas
async function confirmarExperimentais(
  supabase: any,
  _datasProcessar: string[]
) {
  const logs: { lead_id: number; lead_nome: string; unidade: string; data: string; professor: string; status: string; motivo: string }[] = [];

  const hoje = new Date();
  const hojeBRT = new Date(hoje.getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
  const limiteAntiguidadeDias = 14;
  const limiteAutoFaltouDias = 15; // > janela do cron (5-7d) p/ dar tempo da presença real chegar
  const dataLimite = new Date(hoje.getTime() - limiteAntiguidadeDias * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dataAutoFaltou = new Date(hoje.getTime() - limiteAutoFaltouDias * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Auto-marcar "faltou" SUBORDINADO AO EMUSYS: só marca falta quando existe prova de
  // que a aula aconteceu (aula_emusys experimental na data/unidade, não cancelada) e a
  // reconciliação não registrou presença. Sem aula sincronizada => NÃO marca (o sync pode
  // não ter alcançado aquele dia; marcar faltou por silêncio gera falta falsa — caso Rodolfo/José).
  const { data: expExpiradas } = await supabase
    .from('lead_experimentais')
    .select('id, lead_id, nome_aluno, unidade_id, data_experimental')
    .eq('status', 'experimental_agendada')
    .lt('data_experimental', dataAutoFaltou);

  let autoFaltouCount = 0;
  if (expExpiradas?.length) {
    for (const exp of expExpiradas) {
      const { data: aulaProva } = await supabase
        .from('aulas_emusys')
        .select('id')
        .eq('data_aula', exp.data_experimental)
        .eq('unidade_id', exp.unidade_id)
        .eq('categoria', 'experimental')
        .eq('cancelada', false)
        .limit(1)
        .maybeSingle();
      if (!aulaProva) continue; // sem prova no Emusys → não marca faltou, deixa 'agendada'

      await supabase.from('lead_experimentais').update({
        status: 'experimental_faltou', updated_at: new Date().toISOString()
      }).eq('id', exp.id);
      // NUNCA regredir lead já convertido
      await supabase.from('leads').update({
        faltou_experimental: true, status: 'experimental_faltou', etapa_pipeline_id: 9, updated_at: new Date().toISOString()
      }).eq('id', exp.lead_id).not('status', 'in', '("convertido","matriculado")');
      autoFaltouCount++;
    }
    console.log(`[sync-presenca] Auto-faltou: ${autoFaltouCount} de ${expExpiradas.length} expiradas (subordinado ao Emusys, +${limiteAutoFaltouDias}d)`);
  }

  // Buscar experimentais pendentes dos últimos 14 dias (não mais antigas)
  const { data: expPendentes } = await supabase
    .from('lead_experimentais')
    .select('id, lead_id, nome_aluno, data_experimental, horario_experimental, professor_experimental_id, unidade_id')
    .eq('status', 'experimental_agendada')
    .gte('data_experimental', dataLimite)
    .lte('data_experimental', hojeBRT);

  if (!expPendentes?.length) return logs;

  const unidadeNomes = new Map(UNIDADES.map(u => [u.id, u.nome]));

  for (const exp of expPendentes) {
    if (!exp.professor_experimental_id) {
      logs.push({
        lead_id: exp.lead_id,
        lead_nome: exp.nome_aluno || 'Sem nome',
        unidade: unidadeNomes.get(exp.unidade_id) || exp.unidade_id,
        data: exp.data_experimental,
        professor: 'sem_professor',
        status: 'nao_encontrada',
        motivo: 'Experimental sem professor vinculado'
      });
      continue;
    }

    // Buscar aula experimental no aulas_emusys
    let { data: aulasMatch } = await supabase
      .from('aulas_emusys')
      .select('id, data_hora_inicio, cancelada')
      .eq('data_aula', exp.data_experimental)
      .eq('professor_id', exp.professor_experimental_id)
      .eq('unidade_id', exp.unidade_id)
      .eq('categoria', 'experimental')
      .limit(5);

    // Fallback: se não encontrou com professor, buscar por data+unidade+categoria
    // (professor pode ter mudado no reagendamento)
    if (!aulasMatch?.length && exp.horario_experimental) {
      const { data: aulasFallback } = await supabase
        .from('aulas_emusys')
        .select('id, data_hora_inicio, cancelada')
        .eq('data_aula', exp.data_experimental)
        .eq('unidade_id', exp.unidade_id)
        .eq('categoria', 'experimental')
        .limit(10);

      if (aulasFallback?.length) {
        const horaExp = exp.horario_experimental.slice(0, 5);
        const matchHorario = aulasFallback.find((a: any) => {
          const horaAula = new Date(a.data_hora_inicio).toISOString().slice(11, 16);
          return horaAula === horaExp;
        });
        if (matchHorario) aulasMatch = [matchHorario];
      }
    }

    const unidadeNome = unidadeNomes.get(exp.unidade_id) || exp.unidade_id;

    if (!aulasMatch?.length) {
      logs.push({
        lead_id: exp.lead_id,
        lead_nome: exp.nome_aluno || 'Sem nome',
        unidade: unidadeNome,
        data: exp.data_experimental,
        professor: String(exp.professor_experimental_id),
        status: 'nao_encontrada',
        motivo: 'Aula experimental não encontrada no Emusys'
      });
      continue;
    }

    // Filtrar por horário
    let aulaFinal = aulasMatch[0];
    if (exp.horario_experimental && aulasMatch.length > 1) {
      const horaExp = exp.horario_experimental.slice(0, 5);
      const matchHorario = aulasMatch.find((a: any) => {
        const horaAula = new Date(a.data_hora_inicio).toISOString().slice(11, 16);
        return horaAula === horaExp;
      });
      if (matchHorario) aulaFinal = matchHorario;
    }

    if (aulaFinal.cancelada) {
      await supabase
        .from('lead_experimentais')
        .update({ status: 'cancelada', updated_at: new Date().toISOString() })
        .eq('id', exp.id);
      logs.push({
        lead_id: exp.lead_id,
        lead_nome: exp.nome_aluno || 'Sem nome',
        unidade: unidadeNome,
        data: exp.data_experimental,
        professor: String(exp.professor_experimental_id),
        status: 'cancelada',
        motivo: 'Aula experimental cancelada no Emusys'
      });
      continue;
    }

    // Atualizar na lead_experimentais
    const { error: expError } = await supabase
      .from('lead_experimentais')
      .update({
        status: 'experimental_realizada',
        etapa_pipeline_id: 7,
        updated_at: new Date().toISOString()
      })
      .eq('id', exp.id);

    // Atualizar colunas legadas do lead (compatibilidade)
    // NUNCA regredir lead já convertido — só atualizar se não está convertido
    await supabase
      .from('leads')
      .update({
        experimental_realizada: true,
        status: 'experimental_realizada',
        etapa_pipeline_id: 7,
        updated_at: new Date().toISOString()
      })
      .eq('id', exp.lead_id)
      .not('status', 'in', '("convertido","matriculado")');

    logs.push({
      lead_id: exp.lead_id,
      lead_nome: exp.nome_aluno || 'Sem nome',
      unidade: unidadeNome,
      data: exp.data_experimental,
      professor: String(exp.professor_experimental_id),
      status: expError ? 'erro' : 'confirmada',
      motivo: expError ? expError.message : 'Experimental confirmada via sync Emusys'
    });
  }

  // Gravar logs
  for (const log of logs) {
    await supabase.from('leads_automacao_log').insert({
      lead_id: log.lead_id,
      lead_nome: log.lead_nome,
      unidade_nome: log.unidade,
      evento: 'sync_experimental_presenca',
      acao: log.status,
      detalhes: { data: log.data, professor_id: log.professor, motivo: log.motivo },
      workflow_id: 'sync-presenca-emusys',
      execution_id: new Date().toISOString()
    });
  }

  console.log(`[sync-presenca] Experimentais: ${logs.filter(l => l.status === 'confirmada').length} confirmadas, ${logs.filter(l => l.status === 'nao_encontrada').length} não encontradas, ${logs.filter(l => l.status === 'cancelada').length} canceladas`);

  return logs;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parâmetros: data (YYYY-MM-DD, default hoje), dias (default 1), unidade_index (0-2, default todas)
    let dataFim: string;
    let dias = 1;
    let diasFuturos = 14;
    let modo: 'presenca' | 'agenda' | 'metadados' = 'presenca';
    let unidadeIndex: number | null = null;
    try {
      const body = await req.json();
      dataFim = body.data || '';
      dias = Math.min(Math.max(body.dias || 1, 1), 30); // 1-30 dias
      diasFuturos = Math.min(Math.max(body.dias_futuros || 14, 1), 35);
      modo = body.modo === 'agenda'
        ? 'agenda'
        : body.modo === 'metadados'
          ? 'metadados'
          : 'presenca';
      unidadeIndex = body.unidade_index ?? null;
    } catch {
      dataFim = '';
    }

    if (!dataFim) {
      const now = new Date();
      const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      dataFim = brt.toISOString().split('T')[0];
    }

    // Metadados cobrem passado recente e futuro para detectar reagendamentos rapidamente.
    const datasProcessar: string[] = [];
    if (modo === 'metadados') {
      for (let d = dias - 1; d >= 0; d--) {
        const dt = new Date(dataFim + 'T12:00:00');
        dt.setDate(dt.getDate() - d);
        datasProcessar.push(dt.toISOString().split('T')[0]);
      }
      for (let d = 1; d <= diasFuturos; d++) {
        const dt = new Date(dataFim + 'T12:00:00');
        dt.setDate(dt.getDate() + d);
        datasProcessar.push(dt.toISOString().split('T')[0]);
      }
    } else if (modo === 'agenda') {
      for (let d = 0; d < diasFuturos; d++) {
        const dt = new Date(dataFim + 'T12:00:00');
        dt.setDate(dt.getDate() + d);
        datasProcessar.push(dt.toISOString().split('T')[0]);
      }
    } else {
      for (let d = dias - 1; d >= 0; d--) {
        const dt = new Date(dataFim + 'T12:00:00');
        dt.setDate(dt.getDate() - d);
        datasProcessar.push(dt.toISOString().split('T')[0]);
      }
    }

    if (unidadeIndex !== null && !UNIDADES[unidadeIndex]) {
      throw new Error('unidade_index invalido');
    }

    const unidadesProcessar = unidadeIndex !== null ? [UNIDADES[unidadeIndex]] : UNIDADES;
    console.log(`[sync-presenca] Modo ${modo}: ${datasProcessar[0]} a ${datasProcessar.at(-1)}, unidade: ${unidadeIndex !== null ? unidadesProcessar[0].nome : 'todas'}`);

    if (modo === 'metadados') {
      const resultados = await sincronizarMetadadosAulas(
        supabase,
        unidadesProcessar,
        datasProcessar[0],
        datasProcessar.at(-1)!
      );
      return new Response(
        JSON.stringify({
          success: true,
          modo,
          dias,
          data_inicio: datasProcessar[0],
          data_fim: datasProcessar.at(-1),
          resultados,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar todos os alunos ativos para matching (paginado para contornar limite de 1000 rows do PostgREST)
    const alunosDB: {
      id: number;
      nome: string;
      unidade_id: string;
      data_nascimento: string | null;
      curso_id: number | null;
      emusys_student_id: string | null;
    }[] = [];
    const PAGE_SIZE = 1000;
    let offset = 0;
    let hasMore = true;
    while (hasMore) {
      const { data: page, error: pageError } = await supabase
        .from('alunos')
        .select('id, nome, unidade_id, data_nascimento, curso_id, emusys_student_id')
        .in('status', ['ativo', 'aviso_previo'])
        .range(offset, offset + PAGE_SIZE - 1);
      if (pageError) throw new Error(`Erro ao buscar alunos: ${pageError.message}`);
      alunosDB.push(...(page || []));
      hasMore = (page?.length || 0) === PAGE_SIZE;
      offset += PAGE_SIZE;
    }
    console.log(`[sync-presenca] ${alunosDB.length} alunos ativos carregados`);

    if (alunosDB.length === 0) {
      throw new Error('Nenhum aluno ativo encontrado');
    }

    const mapasProfessoresPorUnidade = new Map<string, Map<number, number>>();
    for (const unidade of unidadesProcessar) {
      mapasProfessoresPorUnidade.set(
        unidade.id,
        await carregarMapaProfessoresEmusys(supabase, unidade.id),
      );
    }

    // Mapa de cursos: nome_normalizado -> curso_id (nossa base)
    const { data: cursosDB } = await supabase
      .from('cursos')
      .select('id, nome')
      .eq('ativo', true);
    const cursoMapa = new Map<string, number>();
    for (const curso of cursosDB || []) {
      cursoMapa.set(normalizarCurso(curso.nome), curso.id);
    }

    // O ID do Emusys e namespaced por unidade e tem prioridade sobre matching textual.
    const alunosPorUnidadeEmusys = new Map<string, Map<string, number[]>>();

    // Criar mapa de aluno por unidade com chave composta (nome + data_nasc + curso_id)
    // Entrada contem array de ids para detectar ambiguidade (nao atualizar se >1 match)
    // Tambem mantem um mapa de fallback com chave simples (nome) para compatibilidade do match de presenca.
    const alunosPorUnidadeComposta = new Map<string, Map<string, number[]>>();
    const alunosPorUnidadeSimples = new Map<string, Map<string, number>>();
    for (const aluno of alunosDB || []) {
      const uid = aluno.unidade_id;
      if (!alunosPorUnidadeEmusys.has(uid)) alunosPorUnidadeEmusys.set(uid, new Map());
      if (!alunosPorUnidadeComposta.has(uid)) alunosPorUnidadeComposta.set(uid, new Map());
      if (!alunosPorUnidadeSimples.has(uid)) alunosPorUnidadeSimples.set(uid, new Map());

      if (aluno.emusys_student_id) {
        const mapaEmusys = alunosPorUnidadeEmusys.get(uid)!;
        const idsEmusys = mapaEmusys.get(aluno.emusys_student_id) ?? [];
        idsEmusys.push(aluno.id);
        mapaEmusys.set(aluno.emusys_student_id, idsEmusys);
      }

      const nomeNorm = normalizarNome(aluno.nome);
      const chaveComposta = `${nomeNorm}|${aluno.data_nascimento ?? ''}|${aluno.curso_id ?? ''}`;
      const mapaComp = alunosPorUnidadeComposta.get(uid)!;
      const arr = mapaComp.get(chaveComposta) ?? [];
      arr.push(aluno.id);
      mapaComp.set(chaveComposta, arr);

      alunosPorUnidadeSimples.get(uid)!.set(nomeNorm, aluno.id);
    }

    const resultados = [];
    const experimentaisColetadas: ExperimentalParaReconciliar[] = [];

    for (const dataAlvo of datasProcessar) {
      console.log(`[sync-presenca] === Processando data: ${dataAlvo} ===`);

      for (const unidade of unidadesProcessar) {
        console.log(`[sync-presenca] ${dataAlvo} - ${unidade.nome}...`);

        // 1. Buscar aulas do dia no Emusys
        const aulas = await fetchAulasDia(unidade.token, dataAlvo);
        const mapaProfessores = mapasProfessoresPorUnidade.get(unidade.id) ?? new Map();

        const mapaAlunosEmusys = alunosPorUnidadeEmusys.get(unidade.id) || new Map();
        const mapaAlunos = alunosPorUnidadeSimples.get(unidade.id) || new Map();
        const mapaAlunosComposto = alunosPorUnidadeComposta.get(unidade.id) || new Map();
        let totalPresencas = 0;
        let matched = 0;
        let naoEncontrados = 0;
        const nomesNaoEncontrados: string[] = [];
        let presentes = 0;
        let ausentes = 0;
        let faltasAguardandoMaturidade = 0;
        let rosterSincronizados = 0;
        let aulasProcessadas = 0;

        // 2. Processar aula por aula (não mais agrupado por dia)
        for (const aula of aulas) {
          const profNome = aula.professores?.[0]?.nome || null;
          const professor = resolverProfessorDaAula(aula.professores, mapaProfessores);
          const professorId = professor.professorId;

          // Coletar aulas experimentais para reconciliação ANTES de pular canceladas:
          // a reconciliação precisa da aula cancelada p/ marcar status 'cancelada'
          // (senão o auto-faltou a deixa como 'faltou'). Tambem carrega o curso da aula.
          if (aula.categoria === 'experimental') {
            const horario = aula.data_hora_inicio?.split(' ')[1] || '00:00';
            experimentaisColetadas.push({
              emusysAulaId: aula.id,
              dataAula: dataAlvo,
              horario,
              professorId,
              professorNome: profNome,
              unidadeId: unidade.id,
              cancelada: aula.cancelada,
              cursoId: cursoMapa.get(normalizarCurso(aula.curso_nome || '')) ?? null,
              cursoNome: aula.curso_nome || null,
              alunos: aula.alunos || [],
            });
          }

          // 2a. UPSERT dados da aula na aulas_emusys (sempre, inclusive cancelada —
          // se o Emusys marcou cancelada, nosso espelho tem que refletir isso, senão
          // fica desalinhado: a aula simplesmente não existiria aqui).
          const { data: aulaDB, error: aulaError } = await supabase
            .from('aulas_emusys')
            .upsert(
              {
                emusys_id: aula.id,
                unidade_id: unidade.id,
                data_aula: dataAlvo,
                data_hora_inicio: parseDataHoraEmusys(aula.data_hora_inicio),
                data_hora_fim: aula.data_hora_fim ? parseDataHoraEmusys(aula.data_hora_fim) : null,
                duracao_minutos: aula.duracao_minutos,
                tipo: aula.tipo,
                categoria: aula.categoria,
                turma_nome: aula.turma_nome,
                curso_emusys_id: aula.curso_id,
                curso_nome: aula.curso_nome,
                sala_nome: aula.sala_nome,
                professor_nome: profNome,
                emusys_professor_id: professor.emusysProfessorId,
                professor_id: professorId,
                sem_acompanhamento: professor.semAcompanhamento,
                cancelada: aula.cancelada,
                reagendada: aula.reagendada === true,
                justificada: aula.justificada === true,
                data_hora_inicio_original: aula.data_hora_inicio_original
                  ? parseDataHoraEmusys(aula.data_hora_inicio_original)
                  : null,
                professor_presenca: aula.professores?.[0]?.presenca ?? null,
                nr_da_aula: aula.nr_da_aula,
                matricula_disciplina_id: aula.matricula_disciplina_id ?? null,
                qtd_aulas_contrato: aula.qtd_aulas_contrato,
                qtd_alunos: aula.alunos?.length || 0,
                anotacoes: aula.anotacoes || null,
              },
              { onConflict: 'emusys_id,unidade_id', ignoreDuplicates: false }
            )
            .select('id')
            .single();

          if (aulaError) {
            console.error(`[sync-presenca] Upsert aula ${aula.id} error:`, aulaError.message);
            continue;
          }

          const aulaLocalId = aulaDB.id;

          // Resolver curso_id local da aula (para match composto)
          const cursoIdAula = cursoMapa.get(normalizarCurso(aula.curso_nome || '')) ?? null;

          // Roster e justificativa sao sincronizados sem criar uma resposta de presenca.
          for (const aluno of aula.alunos || []) {
            const nome = aluno.nome_aluno?.trim();
            if (!nome) continue;

            const alunoId = resolverAlunoLocal(
              aluno,
              cursoIdAula,
              mapaAlunosEmusys,
              mapaAlunosComposto,
              mapaAlunos
            );
            const sincronizadoEm = new Date().toISOString();

            const { error: rosterError } = await supabase
              .from('aula_alunos_emusys')
              .upsert(
                {
                  aula_emusys_id: aulaLocalId,
                  unidade_id: unidade.id,
                  aluno_chave: criarAlunoChave(aluno, alunoId),
                  aluno_emusys_id: aluno.id_aluno ?? null,
                  aluno_id: alunoId ?? null,
                  aluno_nome: nome,
                  aluno_nome_normalizado: normalizarNome(nome),
                  sincronizado_em: sincronizadoEm,
                  updated_at: sincronizadoEm,
                },
                {
                  onConflict: 'aula_emusys_id,aluno_chave',
                  ignoreDuplicates: false,
                }
              );

            if (rosterError) {
              console.error(`[sync-presenca] Roster ${nome} aula ${aula.id}:`, rosterError.message);
            } else {
              rosterSincronizados++;
            }

            if (alunoId != null) {
              const { error: administrativoError } = await supabase
                .from('aluno_presenca_administrativo')
                .upsert(
                  {
                    aluno_id: alunoId,
                    aula_emusys_id: aulaLocalId,
                    unidade_id: unidade.id,
                    justificada: aula.justificada === true,
                    fonte: 'emusys',
                    sincronizado_em: sincronizadoEm,
                    updated_at: sincronizadoEm,
                  },
                  {
                    onConflict: 'aluno_id,aula_emusys_id',
                    ignoreDuplicates: false,
                  }
                );

              if (administrativoError) {
                console.error(`[sync-presenca] Administrativo ${nome} aula ${aula.id}:`, administrativoError.message);
              }
            }
          }

          // Aula cancelada: só espelha em emusys_experimentais_raw (auditoria/conciliação
          // já sabe lidar com situacao_operacional='cancelada'), sem processar presença —
          // não houve aula de verdade, não há frequência real pra sincronizar.
          if (aula.cancelada) {
            if (aula.categoria === 'experimental') {
              for (const aluno of aula.alunos || []) {
                if (!aluno.nome_aluno?.trim()) continue;
                await upsertExperimentalRaw(supabase, {
                  aula,
                  aulaLocalId,
                  unidadeId: unidade.id,
                  dataAula: dataAlvo,
                  professorId,
                  professorNome: profNome,
                  cursoId: cursoIdAula,
                  aluno,
                  alunoId: null,
                });
              }
            }
            continue;
          }

          aulasProcessadas++;

          if (modo === 'agenda') {
            continue;
          }

          // 2b. Processar presença de cada aluno nesta aula
          for (const aluno of aula.alunos || []) {
            const nome = aluno.nome_aluno?.trim();
            if (!nome) continue;

            totalPresencas++;
            const alunoId = resolverAlunoLocal(
              aluno,
              cursoIdAula,
              mapaAlunosEmusys,
              mapaAlunosComposto,
              mapaAlunos
            );

            if (aula.categoria === 'experimental') {
              await upsertExperimentalRaw(supabase, {
                aula,
                aulaLocalId,
                unidadeId: unidade.id,
                dataAula: dataAlvo,
                professorId,
                professorNome: profNome,
                cursoId: cursoIdAula,
                aluno,
                alunoId: alunoId ?? null,
              });
            }

            if (!alunoId) {
              naoEncontrados++;
              if (!nomesNaoEncontrados.includes(nome)) {
                nomesNaoEncontrados.push(nome);
                // Log individual para alunos não encontrados
                await supabase.from('automacao_log').insert({
                  aluno_nome: nome,
                  aluno_id: null,
                  unidade_nome: unidade.nome,
                  evento: 'sync_presenca',
                  acao: 'nao_encontrado',
                  detalhes: { curso: aula.curso_nome, professor: profNome, data: dataAlvo },
                  workflow_id: 'sync-presenca-emusys',
                  execution_id: new Date().toISOString()
                });
              }
              continue;
            }

            matched++;
            const status = aluno.presenca === 'presente' ? 'presente' : 'ausente';
            if (status === 'presente') presentes++;
            else if (podeMaterializarFalta(aula)) ausentes++;
            else {
              faltasAguardandoMaturidade++;
              continue;
            }

            // Reconcilia apenas a evidencia bruta do Emusys. A RPC preserva
            // respostas humanas e permite corrigir um "ausente" default quando
            // uma presenca positiva chega em sincronizacao posterior.
            const sincronizadoEm = new Date().toISOString();
            const { error: upsertError } = await supabase
              .rpc('upsert_presenca_emusys_bruta', {
                p_aluno_id: alunoId,
                p_aula_emusys_id: aulaLocalId,
                p_professor_id: professorId,
                p_unidade_id: unidade.id,
                p_data_aula: dataAlvo,
                p_horario_aula: aluno.horario_presenca,
                p_status_origem: aluno.presenca,
                p_curso_nome: aula.curso_nome,
                p_turma_nome: aula.turma_nome,
                p_sala_nome: aula.sala_nome,
                p_sincronizado_em: sincronizadoEm,
              });

            if (upsertError) {
              console.error(`[sync-presenca] Upsert presença ${nome} aula ${aula.id}:`, upsertError.message);
            }
            // O calculo de dia_aula/horario_aula foi movido para a funcao SQL
            // sincronizar_grade_horaria_alunos (deriva por pessoa+curso a partir de
            // aluno_presenca, robusta a homonimos/multi-curso). O edge so registra presenca.
          }
        }

        // 3. Log
        await supabase.from('emusys_sync_log').insert({
          unidade_id: unidade.id,
          unidade_nome: unidade.nome,
          data_sync: dataAlvo,
          total_aulas: aulasProcessadas,
          total_registros: totalPresencas,
          presentes,
          ausentes,
          alunos_matched: matched,
          alunos_nao_encontrados: naoEncontrados,
          nomes_nao_encontrados: nomesNaoEncontrados,
        });

        resultados.push({
          data: dataAlvo,
          unidade: unidade.nome,
          aulas: aulasProcessadas,
          registros_presenca: totalPresencas,
          matched,
          nao_encontrados: naoEncontrados,
          presentes,
          ausentes,
          faltas_aguardando_maturidade: faltasAguardandoMaturidade,
          roster_sincronizados: rosterSincronizados,
        });
      }
    }

    if (modo === 'agenda') {
      return new Response(
        JSON.stringify({
          success: true,
          modo,
          dias: diasFuturos,
          data_inicio: datasProcessar[0],
          data_fim: datasProcessar.at(-1),
          resultados,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Recalcular percentual_presenca para todas as unidades (uma vez no final)
    for (const unidade of UNIDADES) {
      await supabase.rpc('atualizar_percentual_presenca', { p_unidade_id: unidade.id });
    }

    // Reconciliar experimentais órfãs (rede de segurança do webhook)
    const logsReconciliacao = await reconciliarExperimentaisOrfas(supabase, experimentaisColetadas);
    console.log(`[sync-presenca] Reconciliação experimentais: ${logsReconciliacao.length}`);

    // Confirmar experimentais com base nas aulas sincronizadas
    const logsExperimentais = await confirmarExperimentais(supabase, datasProcessar);
    console.log(`[sync-presenca] Experimentais processadas: ${logsExperimentais.length}`);

    return new Response(
      JSON.stringify({ success: true, modo, dias, data_inicio: datasProcessar[0], data_fim: datasProcessar.at(-1), resultados, experimentais_reconciliadas: logsReconciliacao, experimentais_confirmadas: logsExperimentais }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-presenca] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
