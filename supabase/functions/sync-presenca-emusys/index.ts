/// <reference lib="deno.ns" />

// Edge Function: sync-presenca-emusys
// Sincroniza aulas e presença dos alunos do Emusys para aulas_emusys + aluno_presenca
// Presenca completa em horarios fixos e metadados de agenda a cada 15 minutos.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buscarPaginaAulasEmusys,
  criarAlunoChave,
  montarVinculosAulaAlunos,
  gravarVinculosAulaAlunos,
} from '../_shared/emusys-aulas.ts';
import {
  montarSnapshotGradeEmusys,
  reconciliarGradeSnapshotEmusys,
  type ResultadoReconciliacaoGradeSnapshot,
} from '../_shared/reconciliacao-grade-snapshot.ts';
import {
  buscarTodasAulas,
  normalizarSituacaoExperimental as normalizarSituacaoSnapshot,
  type AulaEmusys as AulaSnapshotEmusys,
  type ExperimentalAluno,
} from '../_shared/experimental-snapshot.ts';
import {
  carregarMapaProfessoresEmusys,
  resolverProfessorDaAula,
  type EmusysProfessorRef,
} from '../_shared/professor-emusys.ts';
import {
  SnapshotRequestError,
  SnapshotUpstreamError,
  aplicarSnapshotsMetadados,
  classificarErroSnapshot,
  executarModoExperimentais,
  executarSnapshotExperimentais,
  horarioExperimentalParaBanco,
  montarPatchReconciliacaoExperimental,
  normalizarHorarioExperimental,
  selecionarIdsCancelamentoPorAula,
  selecionarIdsCancelamentoEstavel,
  type CursoDePara,
  type ExperimentalParaReconciliar,
  type SnapshotDeps,
  type SyncMode,
} from '../_shared/sync-experimentais-mode.ts';
import {
  lerCorpoSyncPresenca,
  prepararExecucaoSyncPresenca,
  resolverSolicitacaoSyncPresenca,
  SolicitacaoSyncPresencaInvalida,
  type CorpoSyncPresenca,
  type ModoSyncPresenca,
} from '../_shared/sync-presenca-authorization.ts';
import { selecionarCandidatoExperimental } from '../_shared/experimental-reconciliacao.ts';
import {
  resolverAlunoLocal,
  normalizarNomeMatcher,
  normalizarDiaSemana,
  horarioHHMM,
  type ContextoAulaMatcher,
  type JornadaContrato,
} from '../_shared/matcher-presenca.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MATUREZA_FALTA_HORAS = 24;

type SyncRequestBody = CorpoSyncPresenca & {
  data?: string;
  dias?: number;
  dias_futuros?: number;
  modo?: SyncMode;
  unidade_index?: number;
  unidade_id?: string;
  data_inicio?: string;
  data_fim?: string;
  deadline_epoch_ms?: number;
};

const SNAPSHOT_DEADLINE_TOTAL_MS = 160_000;
const SNAPSHOT_EMUSYS_TIMEOUT_MS = 60_000;

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Secret obrigatorio ausente: ${name}`);
  return value;
}

const UNIDADES_CONFIGURADAS = [
  {
    nome: 'Campo Grande',
    id: '2ec861f6-023f-4d7b-9927-3960ad8c2a92',
    tokenEnv: 'EMUSYS_TOKEN_CG',
  },
  {
    nome: 'Barra',
    id: '368d47f5-2d88-4475-bc14-ba084a9a348e',
    tokenEnv: 'EMUSYS_TOKEN_BARRA',
  },
  {
    nome: 'Recreio',
    id: '95553e96-971b-4590-a6eb-0201d013c14d',
    tokenEnv: 'EMUSYS_TOKEN_RECREIO',
  },
] as const;

type UnidadeEmusys = {
  nome: string;
  id: string;
  token: string;
};

function carregarUnidadesProvedor(unidadesIds: string[]): UnidadeEmusys[] {
  return unidadesIds.map((unidadeId) => {
    const unidade = UNIDADES_CONFIGURADAS.find((item) => item.id === unidadeId);
    if (!unidade) {
      throw new SolicitacaoSyncPresencaInvalida('UNIDADE_DESCONHECIDA');
    }
    return {
      nome: unidade.nome,
      id: unidade.id,
      token: requiredEnv(unidade.tokenEnv),
    };
  });
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-token',
};

// Normalizar nome para matching (mesmo padrão do parseEmusysFile.ts).
// Vive em _shared/matcher-presenca.ts junto com o resolver de aluno local.
const normalizarNome = normalizarNomeMatcher;

function dataAtualBrt(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
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

interface AlunoEmusys extends ExperimentalAluno {
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

interface AulaEmusys extends AulaSnapshotEmusys {
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

// criarAlunoChave vive em _shared/emusys-aulas.ts: as duas edges que gravam em
// aula_alunos_emusys precisam produzir EXATAMENTE a mesma chave, senao o mesmo
// aluno na mesma aula vira duas linhas.
// resolverAlunoLocal (e o desempate por contrato/dia-horario) vive em
// _shared/matcher-presenca.ts, importado no topo deste arquivo.

// Buscar todas as aulas de um dia no Emusys (com paginação)
async function fetchAulasDia(token: string, data: string): Promise<AulaEmusys[]> {
  // Uma pagina ausente nao e prova de que a aula saiu da grade. O coletor
  // compartilhado falha fechado em HTTP, cursor ausente ou cursor repetido.
  return fetchAulasRange(token, data, data);
}

async function fetchAulasRange(
  token: string,
  dataInicio: string,
  dataFim: string,
  signal?: AbortSignal,
): Promise<AulaEmusys[]> {
  try {
    const aulas = await buscarTodasAulas({
      dataInicio,
      dataFim,
      fetchPage: ({ cursor, limite }) =>
        buscarPaginaAulasEmusys<AulaEmusys>({
          token,
          dataInicio,
          dataFim,
          cursor,
          limite,
          signal,
        }),
    });
    return aulas as AulaEmusys[];
  } catch {
    throw new SnapshotUpstreamError();
  }
}

// Converter data_hora_inicio do Emusys ("2026-03-04 14:00") para ISO com timezone BRT
function parseDataHoraEmusys(dataHora: string): string {
  // Emusys retorna "YYYY-MM-DD HH:mm" em horário local (BRT = UTC-3)
  return dataHora.replace(' ', 'T') + ':00-03:00';
}

// Cancelamento humano (secretaria na Agenda, app_cancelar_aula) NAO pode ser
// desfeito pelo sync: se o Emusys reativar a aula, mantemos cancelada e
// registramos o conflito para revisao. Mesma filosofia do upsert_presenca_emusys_bruta:
// resposta humana vence evidencia automatica.
async function carregarCancelamentosHumanos(
  supabase: any,
  unidadeId: string,
  dataInicio: string,
  dataFim: string
): Promise<Set<number>> {
  const { data, error } = await supabase
    .from('aulas_emusys')
    .select('emusys_id')
    .eq('unidade_id', unidadeId)
    .eq('cancelada_origem', 'agenda_secretaria')
    .gte('data_aula', dataInicio)
    .lte('data_aula', dataFim);
  if (error) {
    console.error('[sync-presenca] Falha ao carregar cancelamentos humanos:', error.message);
    return new Set();
  }
  return new Set((data || []).map((r: { emusys_id: number }) => r.emusys_id));
}

async function sincronizarMetadadosAulas(
  supabase: any,
  unidades: readonly UnidadeEmusys[],
  dataInicio: string,
  dataFim: string
) {  const resultados: Array<Record<string, unknown>> = [];
  const aulasPorUnidade: Array<{
    unidade: UnidadeEmusys;
    dataInicio: string;
    dataFim: string;
    aulas: AulaEmusys[];
  }> = [];
  // IMPORTANTE: chunkSize precisa ficar < 1000. O retorno de cada upsert
  // (.select() abaixo) alimenta idPorEmusysId; se o lote crescer para 1000+
  // o PostgREST corta a resposta e reintroduz o truncamento silencioso.
  const chunkSize = 500;

  for (const unidade of unidades) {
    const mapaProfessores = await carregarMapaProfessoresEmusys(supabase, unidade.id);
    const cancelamentosHumanos = await carregarCancelamentosHumanos(supabase, unidade.id, dataInicio, dataFim);
    const aulas = await fetchAulasRange(unidade.token, dataInicio, dataFim);
    const linhas = aulas.map((aula) => {
      const profNome = aula.professores?.[0]?.nome || null;
      const professor = resolverProfessorDaAula(aula.professores, mapaProfessores);
      if (cancelamentosHumanos.has(aula.id) && aula.cancelada !== true) {
        console.warn(`[sync-presenca] Conflito: aula ${aula.id} cancelada pela secretaria e reativada no Emusys (metadados)`);
      }

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
        cancelada: cancelamentosHumanos.has(aula.id) ? true : aula.cancelada === true,
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

    // idPorEmusysId e construido a partir do retorno do proprio upsert
    // (.select()), nao de um SELECT separado depois: um SELECT sem paginacao
    // sobre a janela inteira (dias + dias_futuros = 37 dias => 2.590-4.203
    // aulas por unidade) estoura o teto padrao de 1000 linhas do PostgREST e
    // trunca o mapa silenciosamente — aula fora do mapa = vinculo descartado
    // sem erro e sem log. Foi o bug corrigido na sync-grade-futura-emusys e
    // reintroduzido aqui; a partir de ~D+9 nenhum vinculo era tocado.
    let gravadas = 0;
    const idPorEmusysId = new Map<number, number>();
    for (let offset = 0; offset < linhas.length; offset += chunkSize) {
      const lote = linhas.slice(offset, offset + chunkSize);
      const { data: loteGravado, error } = await supabase
        .from('aulas_emusys')
        .upsert(lote, { onConflict: 'emusys_id,unidade_id', ignoreDuplicates: false })
        .select('id, emusys_id');
      if (error) {
        throw new Error(
          `Erro no lote ${offset} de ${unidade.nome}: ${error.message}`
        );
      }
      gravadas += lote.length;
      for (const linhaGravada of loteGravado || []) {
        idPorEmusysId.set(linhaGravada.emusys_id as number, linhaGravada.id as number);
      }
    }

    if (idPorEmusysId.size < aulas.length) {
      console.log(
        `[sync-presenca] ${unidade.nome}: aulas=${aulas.length} mapeadas=${idPorEmusysId.size} (diferenca indica retorno de upsert incompleto)`,
      );
    }

    // Casa os vinculos aluno-aula tambem no sync de 15 min: sem isso, um
    // reagendamento ou aluno incluido depois do ultimo sync-grade-futura
    // (roda 1x/dia) so apareceria no dia seguinte.
    const vinculos = montarVinculosAulaAlunos(aulas, idPorEmusysId, unidade.id, normalizarNome);
    const resultadoVinculos = await gravarVinculosAulaAlunos(supabase, vinculos);
    if (resultadoVinculos.erros.length > 0) {
      console.error(`[sync-presenca] ${unidade.nome}: upsert de roster falhou; reconciliação preservada`);
      resultados.push({
        unidade: unidade.nome,
        status: 'roster_incompleto_preservado',
        aulas_recebidas: aulas.length,
        aulas_gravadas: gravadas,
        vinculos_gravados: resultadoVinculos.gravados,
        vinculos_com_erro: resultadoVinculos.erros.length,
      });
      aulasPorUnidade.push({ unidade, dataInicio, dataFim, aulas });
      continue;
    }

    // O modo de metadados ja recebe a foto paginada da janela inteira. So a
    // faixa de hoje em diante pode alterar a grade; ontem continua no webhook
    // individual para nao reescrever historico por ausencia de uma foto atual.
    const hojeReconciliacao = dataAtualBrt();
    const inicioReconciliacao = dataInicio < hojeReconciliacao
      ? hojeReconciliacao
      : dataInicio;
    const reconciliacaoGrade: ResultadoReconciliacaoGradeSnapshot = inicioReconciliacao <= dataFim
      ? await reconciliarGradeSnapshotEmusys(supabase, {
          unidadeId: unidade.id,
          dataInicio: inicioReconciliacao,
          dataFim,
          snapshot: montarSnapshotGradeEmusys(
            aulas.filter((aula) =>
              aula.categoria === 'normal'
              && aula.data_hora_inicio.split(' ')[0] >= inicioReconciliacao
              && aula.data_hora_inicio.split(' ')[0] <= dataFim
            ),
            normalizarNome,
          ),
        })
      : { status: 'fora_da_janela_operacional' };

    resultados.push({
      unidade: unidade.nome,
      aulas_recebidas: aulas.length,
      aulas_gravadas: gravadas,
      vinculos_gravados: resultadoVinculos.gravados,
      vinculos_com_erro: resultadoVinculos.erros.length,
      reconciliacao_grade: {
        status: reconciliacaoGrade.status,
        aulas_canceladas: reconciliacaoGrade.aulas_canceladas ?? 0,
        vinculos_removidos: reconciliacaoGrade.vinculos_removidos ?? 0,
      },
    });
    aulasPorUnidade.push({ unidade, dataInicio, dataFim, aulas });
  }

  return { resultados, aulasPorUnidade };
}

// Dados coletados de aulas experimentais para reconciliação
async function carregarCursoDeParaCanonico(
  supabase: SupabaseClient,
  unidadeId: string,
): Promise<Map<number, CursoDePara>> {
  const { data, error } = await supabase
    .from('curso_emusys_depara')
    .select('emusys_disciplina_id, curso_id, cursos:curso_id(nome)')
    .eq('unidade_id', unidadeId);
  if (error) throw new Error('FALHA_CARREGAR_CURSO_DEPARA_SNAPSHOT');

  const mapa = new Map<number, CursoDePara>();
  for (const linha of data ?? []) {
    const disciplinaId = Number(linha.emusys_disciplina_id);
    const cursoId = Number(linha.curso_id);
    if (
      !Number.isSafeInteger(disciplinaId) ||
      disciplinaId <= 0 ||
      !Number.isSafeInteger(cursoId) ||
      cursoId <= 0
    ) {
      continue;
    }

    const relacaoCurso = Array.isArray(linha.cursos)
      ? linha.cursos[0]
      : linha.cursos;
    mapa.set(disciplinaId, {
      cursoId,
      cursoNome: typeof relacaoCurso?.nome === 'string'
        ? relacaoCurso.nome
        : null,
    });
  }
  return mapa;
}

function criarDependenciasSnapshot(
  supabase: SupabaseClient,
  publicacao: 'admitida' | 'metadados',
): SnapshotDeps {
  return {
    criarExecucaoId: () => crypto.randomUUID(),
    agora: () => new Date(),
    aplicarSnapshotRpc: async (input) => {
      let rpcNome: string | null = null;
      if (input.admissaoId) {
        rpcNome = 'aplicar_snapshot_experimentais_emusys_admitido_v1';
      } else if (publicacao === 'metadados') {
        rpcNome = 'aplicar_snapshot_experimentais_emusys_metadados_v1';
      }
      if (!rpcNome) {
        throw new Error('SNAPSHOT_ADMISSAO_OBRIGATORIA');
      }
      const rpcParametros = {
        ...(input.admissaoId
          ? { p_admissao_id: input.admissaoId }
          : {}),
        p_execucao_id: input.execucaoId,
        p_unidade_id: input.unidadeId,
        p_data_inicio: input.dataInicio,
        p_data_fim: input.dataFim,
        p_itens: input.linhas,
      };
      const { data, error } = await supabase
        .rpc(rpcNome, rpcParametros);
      if (error) throw new Error('FALHA_APLICAR_SNAPSHOT_EXPERIMENTAIS');
      if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('RESPOSTA_SNAPSHOT_EXPERIMENTAIS_INVALIDA');
      }
      return data as Record<string, unknown>;
    },
    carregarCursoDePara: (unidadeId) =>
      carregarCursoDeParaCanonico(supabase, unidadeId),
    carregarResolverProfessor: async (unidadeId) => {
      const mapaProfessores = await carregarMapaProfessoresEmusys(
        supabase,
        unidadeId,
      );
      return (aula) =>
        resolverProfessorDaAula(
          (aula as AulaEmusys).professores,
          mapaProfessores,
        ).professorId;
    },
    reconciliar: (experimentais) =>
      reconciliarExperimentaisOrfas(
        supabase,
        experimentais,
        { somenteIdentidadesEstaveis: true },
      ),
  };
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

function normalizarIdExterno(
  valor: number | string | null | undefined,
  aceitarZero = false,
): number | null {
  const id = typeof valor === 'number'
    ? valor
    : typeof valor === 'string' && valor.trim() !== ''
    ? Number(valor)
    : Number.NaN;
  const minimo = aceitarZero ? 0 : 1;
  return Number.isSafeInteger(id) && id >= minimo ? id : null;
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
  const emusysLeadIdPayload = normalizarIdExterno(
    params.aluno.id_lead,
    true,
  );
  const emusysLeadId = normalizarIdExterno(params.aluno.id_lead);
  const emusysAlunoId = normalizarIdExterno(params.aluno.id_aluno);

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
        emusys_lead_id: emusysLeadId,
        emusys_aluno_id: emusysAlunoId,
        participante_chave: emusysLeadId !== null
          ? `lead:${emusysLeadId}`
          : emusysAlunoId !== null
          ? `aluno:${emusysAlunoId}`
          : null,
        payload: {
          schema_version: 1,
          data_aula: params.dataAula,
          horario_aula: horario,
          cancelada: params.aula.cancelada === true,
          aula: {
            id: params.aula.id,
          },
          participante: {
            id_lead: emusysLeadIdPayload,
            id_aluno: emusysAlunoId,
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
  experimentais: ExperimentalParaReconciliar[],
  options: { somenteIdentidadesEstaveis?: boolean } = {},
) {
  const somenteIdentidadesEstaveis =
    options.somenteIdentidadesEstaveis === true;
  const logs: { lead_id: number | null; lead_nome: string; unidade: string; data: string; status: string; motivo: string }[] = [];
  const unidadeNomes = new Map<string, string>(
    UNIDADES_CONFIGURADAS.map((unidade) => [unidade.id, unidade.nome]),
  );

  for (const exp of experimentais) {
    // Cancelada: marcar 'cancelada'. Casa pela AULA (emusys_aula_id) e, p/ legados sem id,
    // por nome+data (só linhas sem aula_id, p/ não cancelar o outro instrumento do dia).
    if (exp.cancelada) {
      const { data: candidatosAula, error: candidatosAulaError } = await supabase
        .from('lead_experimentais')
        .select('id, status, unidade_id, emusys_aula_id')
        .eq('unidade_id', exp.unidadeId)
        .eq('emusys_aula_id', exp.emusysAulaId);
      if (somenteIdentidadesEstaveis && candidatosAulaError) {
        throw new Error('FALHA_CONSULTAR_CANCELAMENTO_AULA_SNAPSHOT');
      }

      const idsCancelamentoAula = selecionarIdsCancelamentoPorAula({
        unidadeId: exp.unidadeId,
        emusysAulaId: exp.emusysAulaId,
        candidatos: (candidatosAula || []).map((candidato: any) => ({
          id: Number(candidato.id),
          status: candidato.status,
          unidadeId: String(candidato.unidade_id),
          emusysAulaId: candidato.emusys_aula_id == null
            ? null
            : Number(candidato.emusys_aula_id),
        })),
      });
      if (idsCancelamentoAula.length > 0) {
        const { error: cancelamentoError } = await supabase
          .from('lead_experimentais')
          .update({ status: 'cancelada', updated_at: new Date().toISOString() })
          .in('id', idsCancelamentoAula)
          .neq('status', 'cancelada')
          .not('status', 'in', '("convertido","matriculado")');
        if (somenteIdentidadesEstaveis && cancelamentoError) {
          throw new Error('FALHA_RECONCILIAR_CANCELAMENTO_SNAPSHOT');
        }
      }
      if (somenteIdentidadesEstaveis) {
        let consultaCandidatos = supabase
          .from('lead_experimentais')
          .select('id, status, unidade_id, emusys_aula_id, data_experimental, horario_experimental, curso_interesse_id, emusys_lead_id, lead_id, aluno_id')
          .eq('unidade_id', exp.unidadeId)
          .eq('data_experimental', exp.dataAula)
          .eq('horario_experimental', exp.horarioBanco)
          .neq('status', 'cancelada');
        consultaCandidatos = exp.cursoId != null
          ? consultaCandidatos.eq('curso_interesse_id', exp.cursoId)
          : consultaCandidatos.is('curso_interesse_id', null);

        const { data: candidatos, error: candidatosError } =
          await consultaCandidatos;
        if (candidatosError) {
          throw new Error('FALHA_CONSULTAR_CANCELAMENTO_SNAPSHOT');
        }

        const idsCancelamento = new Set<number>();
        for (const aluno of exp.alunos) {
          const emusysLeadIdBruto = Number(aluno.id_lead ?? 0);
          const emusysLeadId = Number.isSafeInteger(emusysLeadIdBruto) &&
              emusysLeadIdBruto > 0
            ? emusysLeadIdBruto
            : null;
          const emusysAlunoIdBruto = Number(aluno.id_aluno ?? 0);
          const emusysAlunoId = Number.isSafeInteger(emusysAlunoIdBruto) &&
              emusysAlunoIdBruto > 0
            ? emusysAlunoIdBruto
            : null;
          let leadId: number | null = null;
          let alunoId: number | null = null;

          if (emusysLeadId !== null) {
            const { data: leads, error: leadsError } = await supabase
              .from('leads')
              .select('id')
              .eq('unidade_id', exp.unidadeId)
              .eq('emusys_lead_id', emusysLeadId)
              .limit(2);
            if (leadsError) {
              throw new Error('FALHA_RESOLVER_LEAD_CANCELAMENTO_SNAPSHOT');
            }
            if (leads?.length === 1) leadId = Number(leads[0].id);
          }

          if (emusysAlunoId !== null) {
            const { data: alunos, error: alunosError } = await supabase
              .from('alunos')
              .select('id')
              .eq('unidade_id', exp.unidadeId)
              .eq('emusys_student_id', String(emusysAlunoId))
              .limit(2);
            if (alunosError) {
              throw new Error('FALHA_RESOLVER_ALUNO_CANCELAMENTO_SNAPSHOT');
            }
            if (alunos?.length === 1) alunoId = Number(alunos[0].id);
          }

          const ids = selecionarIdsCancelamentoEstavel({
            identidade: {
              unidadeId: exp.unidadeId,
              dataAula: exp.dataAula,
              horarioBanco: exp.horarioBanco,
              cursoId: exp.cursoId,
              emusysLeadId,
              leadId,
              alunoId,
            },
            candidatos: (candidatos || []).map((candidato: any) => ({
              id: Number(candidato.id),
              status: candidato.status,
              unidadeId: String(candidato.unidade_id),
              emusysAulaId: candidato.emusys_aula_id == null
                ? null
                : Number(candidato.emusys_aula_id),
              dataAula: String(candidato.data_experimental),
              horarioBanco: String(candidato.horario_experimental),
              cursoId: candidato.curso_interesse_id == null
                ? null
                : Number(candidato.curso_interesse_id),
              emusysLeadId: candidato.emusys_lead_id == null
                ? null
                : Number(candidato.emusys_lead_id),
              leadId: candidato.lead_id == null
                ? null
                : Number(candidato.lead_id),
              alunoId: candidato.aluno_id == null
                ? null
                : Number(candidato.aluno_id),
            })),
          });
          ids.forEach((id) => idsCancelamento.add(id));
        }

        if (idsCancelamento.size > 0) {
          const { error: identidadeError } = await supabase
            .from('lead_experimentais')
            .update({
              status: 'cancelada',
              updated_at: new Date().toISOString(),
            })
            .in('id', [...idsCancelamento])
            .neq('status', 'cancelada')
            .not('status', 'in', '("convertido","matriculado")');
          if (identidadeError) {
            throw new Error('FALHA_ATUALIZAR_CANCELAMENTO_SNAPSHOT');
          }
        }
      }
      if (!somenteIdentidadesEstaveis) {
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
            .neq('status', 'cancelada')
            .not('status', 'in', '("convertido","matriculado")');
        }
      }
      continue;
    }

    for (const aluno of exp.alunos) {
      const nomeAluno = aluno.nome_aluno?.trim();
      if (!nomeAluno) continue;

      const unidadeNome = unidadeNomes.get(exp.unidadeId) || exp.unidadeId;
      const telNorm = normalizarTelefone(aluno.telefone_aluno) || normalizarTelefone(aluno.telefone_responsavel);
      const idLeadBruto = Number(aluno.id_lead ?? 0);
      const idLead = Number.isSafeInteger(idLeadBruto) && idLeadBruto > 0
        ? idLeadBruto
        : 0;
      const idAlunoEmusys = aluno.id_aluno != null
        ? Number(aluno.id_aluno)
        : null;
      let idAluno = somenteIdentidadesEstaveis ? null : idAlunoEmusys;

      if (
        somenteIdentidadesEstaveis &&
        idAlunoEmusys != null &&
        Number.isSafeInteger(idAlunoEmusys) &&
        idAlunoEmusys > 0
      ) {
        const { data: candidatosAluno, error: candidatosAlunoError } =
          await supabase
            .from('alunos')
            .select('id')
            .eq('unidade_id', exp.unidadeId)
            .eq('emusys_student_id', String(idAlunoEmusys))
            .limit(2);
        if (candidatosAlunoError) {
          throw new Error('FALHA_RESOLVER_ALUNO_SNAPSHOT');
        }
        if (candidatosAluno?.length === 1) {
          idAluno = Number(candidatosAluno[0].id);
        }
      }

      const situacaoSnapshot = somenteIdentidadesEstaveis &&
          exp.dataHoraInicio
        ? normalizarSituacaoSnapshot({
          presenca: aluno.presenca,
          cancelada: exp.cancelada,
          dataHoraInicio: exp.dataHoraInicio,
          agora: new Date(),
        })
        : null;
      if (
        somenteIdentidadesEstaveis &&
        situacaoSnapshot !== 'presente' &&
        situacaoSnapshot !== 'faltou'
      ) {
        continue;
      }

      const presente = somenteIdentidadesEstaveis
        ? situacaoSnapshot === 'presente'
        : aluno.presenca === 'presente';
      const novoStatus = presente ? 'experimental_realizada' : 'experimental_faltou';

      // 1. Match primário pela AULA real (emusys_aula_id) — não colapsa multi-instrumento.
      const camposCandidato = 'id, status, unidade_id, lead_id, curso_interesse_id, professor_experimental_id, emusys_aula_id, emusys_lead_id, aluno_id, data_experimental, horario_experimental';
      const { data: candidatosPorAula, error: candidatosPorAulaError } = await supabase
        .from('lead_experimentais')
        .select(camposCandidato)
        .eq('unidade_id', exp.unidadeId)
        .eq('emusys_aula_id', exp.emusysAulaId)
        .neq('status', 'cancelada')
        .limit(20);
      if (somenteIdentidadesEstaveis && candidatosPorAulaError) {
        throw new Error('FALHA_CONSULTAR_EXPERIMENTAL_SNAPSHOT');
      }

      const identidadeExperimental = {
        unidadeId: exp.unidadeId,
        emusysAulaId: exp.emusysAulaId,
        emusysLeadId: idLead > 0 ? idLead : null,
        emusysAlunoId: idAluno,
        data: exp.dataAula,
        horario: exp.horarioBanco,
        cursoId: exp.cursoId,
      };
      const normalizarCandidato = (candidato: any) => ({
        ...candidato,
        id: Number(candidato.id),
        unidadeId: String(candidato.unidade_id),
        emusysAulaId: candidato.emusys_aula_id == null ? null : Number(candidato.emusys_aula_id),
        emusysLeadId: candidato.emusys_lead_id == null ? null : Number(candidato.emusys_lead_id),
        emusysAlunoId: candidato.aluno_id == null ? null : Number(candidato.aluno_id),
        dataAula: candidato.data_experimental == null ? null : String(candidato.data_experimental),
        horarioBanco: candidato.horario_experimental == null ? null : String(candidato.horario_experimental),
        cursoId: candidato.curso_interesse_id == null ? null : Number(candidato.curso_interesse_id),
      });
      let expExistente = selecionarCandidatoExperimental(
        identidadeExperimental,
        (candidatosPorAula || []).map(normalizarCandidato),
      ) as any;
      const aulaAmbigua = (candidatosPorAula || []).length > 1;

      // Se a aula ainda nao estiver ligada, usa Lead/data/campos estaveis para
      // recuperar a linha legada do webhook. Nao usa nome e nunca usa maybeSingle
      // antes de o seletor provar unicidade.
      if (!expExistente && !aulaAmbigua && (idLead > 0 || idAluno != null)) {
        const { data: candidatosPorIdentidade, error: candidatosPorIdentidadeError } = await supabase
          .from('lead_experimentais')
          .select(camposCandidato)
          .eq('unidade_id', exp.unidadeId)
          .eq('data_experimental', exp.dataAula)
          .neq('status', 'cancelada')
          .limit(50);
        if (somenteIdentidadesEstaveis && candidatosPorIdentidadeError) {
          throw new Error('FALHA_CONSULTAR_EXPERIMENTAL_SNAPSHOT');
        }
        expExistente = selecionarCandidatoExperimental(
          { ...identidadeExperimental, emusysAulaId: null },
          (candidatosPorIdentidade || []).map(normalizarCandidato),
        ) as any;
      }

      // 2. Fallback legado: linha sem aula_id (criada antes), casa por nome+data+unidade.
      if (!expExistente && !somenteIdentidadesEstaveis) {
        const { data: legado } = await supabase
          .from('lead_experimentais')
          .select('id, status, lead_id, curso_interesse_id, professor_experimental_id, emusys_aula_id, emusys_lead_id, aluno_id')
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
      if (
        !expExistente &&
        !somenteIdentidadesEstaveis &&
        exp.cursoId != null
      ) {
        const { data: porNegocio } = await supabase
          .from('lead_experimentais')
          .select('id, status, lead_id, curso_interesse_id, professor_experimental_id, emusys_aula_id, emusys_lead_id, aluno_id')
          .eq('unidade_id', exp.unidadeId)
          .eq('data_experimental', exp.dataAula)
          .eq('horario_experimental', exp.horarioBanco)
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
        const { patch, statusMudou } = montarPatchReconciliacaoExperimental({
          atual: {
            status: expExistente.status,
            cursoId: expExistente.curso_interesse_id,
            professorId: expExistente.professor_experimental_id,
            emusysAulaId: expExistente.emusys_aula_id,
            emusysLeadId: expExistente.emusys_lead_id,
            alunoId: expExistente.aluno_id,
          },
          desejado: {
            status: novoStatus,
            etapaPipelineId: presente ? 7 : 9,
            cursoId: exp.cursoId,
            professorId: exp.professorId,
            emusysAulaId: exp.emusysAulaId,
            emusysLeadId: idLead > 0 ? idLead : null,
            alunoId: idAluno,
          },
          atualizadoEm: new Date().toISOString(),
        });

        if (Object.keys(patch).length > 1) {
          const { error: atualizacaoExperimentalError } = await supabase
            .from('lead_experimentais')
            .update(patch)
            .eq('id', expExistente.id);
          if (somenteIdentidadesEstaveis && atualizacaoExperimentalError) {
            throw new Error('FALHA_ATUALIZAR_EXPERIMENTAL_SNAPSHOT');
          }
          // Propagar status para leads só quando o status mudou (não sobrescrever convertidos/matriculados)
          if (statusMudou && expExistente.lead_id) {
            const { error: atualizacaoLeadError } = await supabase.from('leads').update({
              experimental_realizada: presente,
              faltou_experimental: !presente,
              status: novoStatus,
              etapa_pipeline_id: presente ? 7 : 9,
              updated_at: new Date().toISOString()
            }).eq('id', expExistente.lead_id)
              .not('status', 'in', '("convertido","matriculado")');
            if (somenteIdentidadesEstaveis && atualizacaoLeadError) {
              throw new Error('FALHA_ATUALIZAR_LEAD_SNAPSHOT');
            }
          }
        }
        if (somenteIdentidadesEstaveis) {
          logs.push({
            lead_id: expExistente.lead_id,
            lead_nome: '',
            unidade: unidadeNome,
            data: exp.dataAula,
            status: presente
              ? 'reconciliada_presente'
              : 'reconciliada_faltou',
            motivo: 'reconciliacao_por_identidade_estavel',
          });
        }
        continue;
      }

      // 3. Não existe: resolver identidade (lead puro OU aluno existente) e inserir.
      let leadId: number | null = null;
      let matchadoPorNome = false;

      // 3a. Lead pelo id_lead da API (emusys_lead_id)
      if (idLead > 0) {
        const { data: leadPorEmusys, error: leadPorEmusysError } =
          await supabase
          .from('leads')
          .select('id')
          .eq('unidade_id', exp.unidadeId)
          .eq('emusys_lead_id', idLead)
          .limit(1)
          .maybeSingle();
        if (somenteIdentidadesEstaveis && leadPorEmusysError) {
          throw new Error('FALHA_RESOLVER_LEAD_SNAPSHOT');
        }
        if (leadPorEmusys) leadId = leadPorEmusys.id;
      }
      // 3b. Lead por telefone
      if (!somenteIdentidadesEstaveis && !leadId && telNorm) {
        const { data: leadPorTel } = await supabase
          .from('leads').select('id')
          .eq('telefone', telNorm).eq('unidade_id', exp.unidadeId).eq('arquivado', false)
          .limit(1).maybeSingle();
        if (leadPorTel) leadId = leadPorTel.id;
      }
      // 3c. Fallback por nome — só quando NÃO é aluno existente (sem id_aluno)
      if (!somenteIdentidadesEstaveis && !leadId && idAluno == null) {
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
          .select('id, status, lead_id, curso_interesse_id, professor_experimental_id, emusys_aula_id, emusys_lead_id, aluno_id')
          .eq('lead_id', leadId)
          .eq('data_experimental', exp.dataAula)
          .eq('horario_experimental', exp.horarioBanco)
          .neq('status', 'cancelada');
        qLead = exp.cursoId != null
          ? qLead.eq('curso_interesse_id', exp.cursoId)
          : qLead.is('curso_interesse_id', null);
        const { data: porLead, error: porLeadError } =
          await qLead.limit(1).maybeSingle();
        if (somenteIdentidadesEstaveis && porLeadError) {
          throw new Error('FALHA_CONSULTAR_LEAD_EXPERIMENTAL_SNAPSHOT');
        }
        if (porLead) {
          const { patch, statusMudou } = montarPatchReconciliacaoExperimental({
            atual: {
              status: porLead.status,
              cursoId: porLead.curso_interesse_id,
              professorId: porLead.professor_experimental_id,
              emusysAulaId: porLead.emusys_aula_id,
              emusysLeadId: porLead.emusys_lead_id,
              alunoId: porLead.aluno_id,
            },
            desejado: {
              status: novoStatus,
              etapaPipelineId: presente ? 7 : 9,
              cursoId: exp.cursoId,
              professorId: exp.professorId,
              emusysAulaId: exp.emusysAulaId,
              emusysLeadId: idLead > 0 ? idLead : null,
              alunoId: idAluno,
            },
            atualizadoEm: new Date().toISOString(),
          });
          if (Object.keys(patch).length > 1) {
            const { error: atualizarPorLeadError } = await supabase
              .from('lead_experimentais')
              .update(patch)
              .eq('id', porLead.id);
            if (somenteIdentidadesEstaveis && atualizarPorLeadError) {
              throw new Error('FALHA_ATUALIZAR_EXPERIMENTAL_SNAPSHOT');
            }
            if (statusMudou && porLead.lead_id) {
              const { error: atualizarLeadError } = await supabase.from('leads').update({
                experimental_realizada: presente,
                faltou_experimental: !presente,
                status: novoStatus,
                etapa_pipeline_id: presente ? 7 : 9,
                updated_at: new Date().toISOString()
              }).eq('id', porLead.lead_id).not('status', 'in', '("convertido","matriculado")');
              if (somenteIdentidadesEstaveis && atualizarLeadError) {
                throw new Error('FALHA_ATUALIZAR_LEAD_SNAPSHOT');
              }
            }
          }
          logs.push({
            lead_id: porLead.lead_id,
            lead_nome: somenteIdentidadesEstaveis ? '' : nomeAluno,
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
          horario_experimental: exp.horarioBanco,
          professor_experimental_id: exp.professorId,
          curso_interesse_id: exp.cursoId,
          emusys_aula_id: exp.emusysAulaId,
          emusys_lead_id: idLead > 0 ? idLead : null,
          status: novoStatus,
          etapa_pipeline_id: presente ? 7 : 9,
        });

      if (somenteIdentidadesEstaveis && error) {
        throw new Error('FALHA_INSERIR_EXPERIMENTAL_SNAPSHOT');
      }
      if (!error && leadId) {
        // Propagar para leads (não sobrescrever leads já convertidos/matriculados)
        const { error: atualizarLeadError } = await supabase.from('leads').update({
          experimental_realizada: presente,
          faltou_experimental: !presente,
          status: novoStatus,
          etapa_pipeline_id: presente ? 7 : 9,
          updated_at: new Date().toISOString()
        }).eq('id', leadId)
          .not('status', 'in', '("convertido","matriculado")');
        if (somenteIdentidadesEstaveis && atualizarLeadError) {
          throw new Error('FALHA_ATUALIZAR_LEAD_SNAPSHOT');
        }
      }

      logs.push({
        lead_id: leadId,
        lead_nome: somenteIdentidadesEstaveis ? '' : nomeAluno,
        unidade: unidadeNome,
        data: exp.dataAula,
        status: error ? 'erro' : (presente ? 'reconciliada_presente' : 'reconciliada_faltou'),
        motivo: error
          ? (somenteIdentidadesEstaveis ? 'falha_reconciliacao' : error.message)
          : `Experimental ${presente ? 'realizada' : 'faltou'} via reconciliação (aulaId=${exp.emusysAulaId}, matchadoPorNome=${matchadoPorNome}, alunoExistente=${idAluno != null})`
      });
    }
  }

  // Gravar logs
  for (const log of logs) {
    const { error: logError } = await supabase.from('leads_automacao_log').insert({
      lead_id: log.lead_id,
      lead_nome: log.lead_nome,
      unidade_nome: log.unidade,
      evento: 'sync_experimental_reconciliacao',
      acao: log.status,
      detalhes: { data: log.data, motivo: log.motivo },
      workflow_id: 'sync-presenca-emusys',
      execution_id: new Date().toISOString()
    });
    if (somenteIdentidadesEstaveis && logError) {
      throw new Error('FALHA_REGISTRAR_RECONCILIACAO_SNAPSHOT');
    }
  }

  const reconciliadas = logs.filter(l => l.status.startsWith('reconciliada_'));
  console.log(`[sync-presenca] Reconciliação experimentais: ${reconciliadas.length} reconciliadas de ${logs.length} processadas`);

  return logs;
}

// Confirmar experimentais: cruzar aulas_emusys (categoria=experimental) com lead_experimentais agendadas
async function confirmarExperimentais(
  supabase: any,
  _datasProcessar: string[],
  unidadesIds: string[],
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
    .in('unidade_id', unidadesIds)
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
    .in('unidade_id', unidadesIds)
    .gte('data_experimental', dataLimite)
    .lte('data_experimental', hojeBRT);

  if (!expPendentes?.length) return logs;

  const unidadeNomes = new Map<string, string>(
    UNIDADES_CONFIGURADAS.map((unidade) => [unidade.id, unidade.nome]),
  );

  // Backoff: buscar logs de nao_encontrada das últimas 24h para suprimir duplicatas.
  // O sync roda a cada 15 min; sem isso, o mesmo lead órfão é logado dezenas de vezes.
  const backoffLimite = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: logsRecentesNaoEncontrados } = await supabase
    .from('leads_automacao_log')
    .select('lead_id, detalhes')
    .eq('workflow_id', 'sync-presenca-emusys')
    .eq('acao', 'nao_encontrada')
    .gte('created_at', backoffLimite);

  const backoffChaves = new Set<string>();
  for (const log of logsRecentesNaoEncontrados ?? []) {
    const detalhe = log.detalhes as { data?: string } | null;
    const chave = `${log.lead_id}|${detalhe?.data ?? ''}`;
    backoffChaves.add(chave);
  }

  let suprimidosBackoff = 0;

  for (const exp of expPendentes) {
    // Suprimir log duplicado: se já logamos nao_encontrada para este lead+data nas últimas 24h, pular
    const chaveBackoff = `${exp.lead_id}|${exp.data_experimental ?? ''}`;
    if (backoffChaves.has(chaveBackoff)) {
      suprimidosBackoff++;
      continue;
    }

    if (!exp.professor_experimental_id) {
      backoffChaves.add(chaveBackoff); // marcar como já logado para próximas iterações do mesmo run
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
      backoffChaves.add(chaveBackoff); // marcar como já logado para próximas iterações do mesmo run
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

  console.log(`[sync-presenca] Experimentais: ${logs.filter(l => l.status === 'confirmada').length} confirmadas, ${logs.filter(l => l.status === 'nao_encontrada').length} não encontradas, ${logs.filter(l => l.status === 'cancelada').length} canceladas${suprimidosBackoff > 0 ? `, ${suprimidosBackoff} suprimidas (backoff 24h)` : ''}`);

  return logs;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let modo: ModoSyncPresenca = 'presenca';
  try {
    // Parâmetros: data, janela, modo e alvo por unidade_id/unidade_index.
    const bodyRecebido = await lerCorpoSyncPresenca(req) as SyncRequestBody;

    const solicitacao = resolverSolicitacaoSyncPresenca(
      bodyRecebido,
      UNIDADES_CONFIGURADAS,
    );
    modo = solicitacao.modo;
    const preparacao = await prepararExecucaoSyncPresenca(
      {
        authorization: req.headers.get('authorization'),
        xSyncToken: req.headers.get('x-sync-token'),
        solicitacao,
      },
      {
        chaveServiceRole: SUPABASE_SERVICE_ROLE_KEY,
        validarTokenInterno: async (token) => {
          const clienteValidador = createClient(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
          );
          const { data, error } = await clienteValidador.rpc(
            'validar_token_sync_presenca_interno_v1',
            { p_token: token },
          );
          return !error && data === true;
        },
        criarClienteUsuario: (token) => createClient(
          SUPABASE_URL,
          SUPABASE_ANON_KEY,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
              detectSessionInUrl: false,
            },
            global: {
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        ),
        criarClienteAdministrativo: () =>
          createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
        carregarUnidadesProvedor,
      },
    );
    if (preparacao.permitido === false) {
      return new Response(
        JSON.stringify({ error: preparacao.codigo }),
        {
          status: preparacao.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    const supabase = preparacao.clienteAdministrativo;
    const unidadesProcessar = preparacao.unidadesProvedor;
    let dataFim = typeof bodyRecebido.data === 'string'
      ? bodyRecebido.data
      : '';
    const dias = Math.min(Math.max(bodyRecebido.dias || 1, 1), 30);
    const diasFuturos = Math.min(
      Math.max(bodyRecebido.dias_futuros || 14, 1),
      35,
    );

    if (modo === 'experimentais') {
      const agoraMs = Date.now();
      const deadlineRecebido = bodyRecebido.deadline_epoch_ms;
      if (
        deadlineRecebido !== undefined &&
        (!Number.isSafeInteger(deadlineRecebido) || deadlineRecebido <= agoraMs)
      ) {
        throw new SnapshotRequestError('DEADLINE_EXPERIMENTAIS_INVALIDO');
      }
      const deadlineEpochMs = Math.min(
        deadlineRecebido ?? agoraMs + SNAPSHOT_DEADLINE_TOTAL_MS,
        agoraMs + SNAPSHOT_DEADLINE_TOTAL_MS,
      );
      const signalTotal = AbortSignal.timeout(deadlineEpochMs - agoraMs);
      const signalEmusys = AbortSignal.any([
        signalTotal,
        AbortSignal.timeout(SNAPSHOT_EMUSYS_TIMEOUT_MS),
      ]);
      const supabaseSnapshot = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
            detectSessionInUrl: false,
          },
          global: {
            fetch: (input, init) =>
              fetch(input, { ...init, signal: signalTotal }),
          },
        },
      );
      const resposta = await executarModoExperimentais({
        body: bodyRecebido,
        unidades: unidadesProcessar,
        deadlineMs: deadlineEpochMs,
        signal: signalEmusys,
        deps: {
          ...criarDependenciasSnapshot(supabaseSnapshot, 'admitida'),
          buscarTodasAulas: ({ unidade, dataInicio, dataFim, signal }) => {
            const configuracao = unidadesProcessar.find((item) =>
              item.id === unidade.id
            );
            if (!configuracao) {
              throw new SnapshotRequestError('UNIDADE_DESCONHECIDA');
            }
            return fetchAulasRange(
              configuracao.token,
              dataInicio,
              dataFim,
              signal,
            );
          },
        },
      });

      return new Response(
        JSON.stringify(resposta),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
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

    console.log(`[sync-presenca] Modo ${modo}: ${datasProcessar[0]} a ${datasProcessar.at(-1)}, unidade: ${solicitacao.alvoExato ? unidadesProcessar[0].nome : 'todas'}`);

    if (modo === 'metadados') {
      const metadados = await sincronizarMetadadosAulas(
        supabase,
        unidadesProcessar,
        datasProcessar[0],
        datasProcessar.at(-1)!
      );
      const dependenciasSnapshot = criarDependenciasSnapshot(
        supabase,
        'metadados',
      );
      const snapshots = await aplicarSnapshotsMetadados({
        lotes: metadados.aulasPorUnidade,
        aplicarSnapshot: (lote) =>
          executarSnapshotExperimentais({
            ...lote,
            permitirPublicacaoAdiada: true,
            deps: dependenciasSnapshot,
          }),
      });
      return new Response(
        JSON.stringify({
          success: true,
          modo,
          dias,
          data_inicio: datasProcessar[0],
          data_fim: datasProcessar.at(-1),
          resultados: metadados.resultados,
          snapshots,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // População viva canônica: trancados e estados ambíguos não entram no denominador.
    const { data: alunosCanonicos, error: alunosCanonicosError } = await supabase
      .rpc('get_alunos_ativos_atuais_canonicos', {
        p_unidade_id: solicitacao.alvoExato
          ? solicitacao.unidadesIds[0]
          : null,
      });
    if (alunosCanonicosError) {
      throw new Error(`Erro ao buscar alunos ativos canônicos: ${alunosCanonicosError.message}`);
    }
    const alunosDB = (Array.isArray(alunosCanonicos) ? alunosCanonicos : []).map((aluno: any) => ({
      id: Number(aluno.id),
      nome: String(aluno.nome || ''),
      unidade_id: String(aluno.unidade_id),
      data_nascimento: aluno.data_nascimento ?? null,
      curso_id: aluno.curso_id == null ? null : Number(aluno.curso_id),
      emusys_student_id: aluno.emusys_student_id ?? null,
    }));
    console.log(`[sync-presenca] ${alunosDB.length} alunos ativos canônicos carregados`);

    if (alunosDB.length === 0) {
      throw new Error('Nenhum aluno ativo canônico encontrado');
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

    // Jornada ativa (contrato -> aluno, com dia/horario da grade). Fonte do
    // desempate quando a pessoa tem varias matriculas: o contrato da aula
    // aponta exatamente para qual delas, e o dia/horario desempata a linha
    // container (tipo=turma). Carregada paginada: sao ~1.3k linhas no total,
    // acima do teto padrao de 1000 do PostgREST.
    const contratosPorUnidade = new Map<string, Map<number, JornadaContrato>>();
    const jornadaPorAlunoPorUnidade = new Map<string, Map<number, JornadaContrato[]>>();
    {
      const idsCanonicos = new Set<number>(alunosDB.map((aluno) => aluno.id));
      const idsUnidades = new Set<string>(alunosDB.map((aluno) => aluno.unidade_id));
      for (const uid of idsUnidades) {
        contratosPorUnidade.set(uid, new Map());
        jornadaPorAlunoPorUnidade.set(uid, new Map());
      }

      const TAMANHO_PAGINA = 1000;
      for (let offset = 0; ; offset += TAMANHO_PAGINA) {
        const { data: pagina, error: jornadaError } = await supabase
          .from('aluno_jornada_matricula_disciplina')
          .select('unidade_id, aluno_id, emusys_matricula_disciplina_id, dia_semana, horario')
          .or('status_matricula.is.null,status_matricula.neq.finalizada')
          .range(offset, offset + TAMANHO_PAGINA - 1);
        if (jornadaError) {
          console.error('[sync-presenca] Falha ao carregar jornada p/ matcher:', jornadaError.message);
          break;
        }
        if (!pagina || pagina.length === 0) break;

        for (const linha of pagina as Array<{
          unidade_id: string;
          aluno_id: number;
          emusys_matricula_disciplina_id: number | null;
          dia_semana: string | null;
          horario: string | null;
        }>) {
          const alunoId = Number(linha.aluno_id);
          // Mesmo universo do matcher antigo: so alunos ativos canonicos.
          if (!idsCanonicos.has(alunoId)) continue;
          const uid = String(linha.unidade_id);
          const entrada: JornadaContrato = {
            alunoId,
            diaSemana: normalizarDiaSemana(linha.dia_semana),
            horario: horarioHHMM(linha.horario),
          };
          if (linha.emusys_matricula_disciplina_id != null && linha.emusys_matricula_disciplina_id > 0) {
            const mapaContratos = contratosPorUnidade.get(uid) ?? new Map<number, JornadaContrato>();
            mapaContratos.set(Number(linha.emusys_matricula_disciplina_id), entrada);
            contratosPorUnidade.set(uid, mapaContratos);
          }
          const mapaAluno = jornadaPorAlunoPorUnidade.get(uid) ?? new Map<number, JornadaContrato[]>();
          const arr = mapaAluno.get(alunoId) ?? [];
          arr.push(entrada);
          mapaAluno.set(alunoId, arr);
          jornadaPorAlunoPorUnidade.set(uid, mapaAluno);
        }
        if (pagina.length < TAMANHO_PAGINA) break;
      }
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
        const cancelamentosHumanos = await carregarCancelamentosHumanos(supabase, unidade.id, dataAlvo, dataAlvo);

        const mapaAlunosEmusys = alunosPorUnidadeEmusys.get(unidade.id) || new Map();
        const mapaAlunos = alunosPorUnidadeSimples.get(unidade.id) || new Map();
        const mapaAlunosComposto = alunosPorUnidadeComposta.get(unidade.id) || new Map();
        const mapaContratos = contratosPorUnidade.get(unidade.id) || new Map<number, JornadaContrato>();
        const mapaJornadaPorAluno = jornadaPorAlunoPorUnidade.get(unidade.id) || new Map<number, JornadaContrato[]>();
        let totalPresencas = 0;
        let matched = 0;
        let naoEncontrados = 0;
        const nomesNaoEncontrados: string[] = [];
        let presentes = 0;
        let ausentes = 0;
        let faltasAguardandoMaturidade = 0;
        let rosterSincronizados = 0;
        let aulasProcessadas = 0;
        let gradeIncompleta = false;

        // 2. Processar aula por aula (não mais agrupado por dia)
        for (const aula of aulas) {
          const profNome = aula.professores?.[0]?.nome || null;
          const professor = resolverProfessorDaAula(aula.professores, mapaProfessores);
          const professorId = professor.professorId;

          // Coletar aulas experimentais para reconciliação ANTES de pular canceladas:
          // a reconciliação precisa da aula cancelada p/ marcar status 'cancelada'
          // (senão o auto-faltou a deixa como 'faltou'). Tambem carrega o curso da aula.
          if (aula.categoria === 'experimental') {
            const horario = normalizarHorarioExperimental(
              aula.data_hora_inicio,
            );
            experimentaisColetadas.push({
              emusysAulaId: aula.id,
              dataAula: dataAlvo,
              dataHoraInicio: aula.data_hora_inicio,
              horario,
              horarioBanco: horarioExperimentalParaBanco(horario),
              professorId,
              professorNome: profNome,
              unidadeId: unidade.id,
              cancelada: cancelamentosHumanos.has(aula.id) ? true : aula.cancelada,
              cursoId: cursoMapa.get(normalizarCurso(aula.curso_nome || '')) ?? null,
              cursoNome: aula.curso_nome || null,
              alunos: aula.alunos || [],
            });
          }

          // 2a. UPSERT dados da aula na aulas_emusys (sempre, inclusive cancelada —
          // se o Emusys marcou cancelada, nosso espelho tem que refletir isso, senão
          // fica desalinhado: a aula simplesmente não existiria aqui).
          // Excecao: cancelamento humano (agenda_secretaria) nunca e desfeito pelo Emusys.
          const canceladaEfetiva = cancelamentosHumanos.has(aula.id) ? true : aula.cancelada;
          if (cancelamentosHumanos.has(aula.id) && aula.cancelada !== true) {
            console.warn(`[sync-presenca] Conflito: aula ${aula.id} cancelada pela secretaria e reativada no Emusys`);
            await supabase.from('automacao_log').insert({
              aluno_nome: aula.alunos
                .map((aluno) => aluno.nome_aluno?.trim())
                .filter(Boolean)
                .join(', ') || `Aula Emusys ${aula.id} sem roster`,
              unidade_nome: unidade.nome,
              evento: 'sync_presenca',
              acao: 'conflito_cancelamento_humano',
              detalhes: { emusys_aula_id: aula.id, data: dataAlvo, curso: aula.curso_nome, professor: profNome },
              workflow_id: 'sync-presenca-emusys',
              execution_id: new Date().toISOString(),
            });
          }
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
                cancelada: canceladaEfetiva === true,
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
            console.error(`[sync-presenca] Aula ${aula.id} não foi gravada; reconciliação preservada`);
            gradeIncompleta = true;
            continue;
          }

          const aulaLocalId = aulaDB.id;

          // Resolver curso_id local da aula (para match composto)
          const cursoIdAula = cursoMapa.get(normalizarCurso(aula.curso_nome || '')) ?? null;

          // Contexto do matcher: contrato da aula + horario (original quando
          // reagendada, pois a jornada reflete a grade regular do contrato).
          const contextoAula: ContextoAulaMatcher = {
            matriculaDisciplinaId: aula.matricula_disciplina_id ?? null,
            dataHoraInicio: aula.data_hora_inicio ?? null,
            dataHoraInicioOriginal: aula.data_hora_inicio_original ?? null,
          };

          for (const aluno of aula.alunos || []) {
            const nome = aluno.nome_aluno?.trim();
            if (!nome) continue;

            const alunoId = resolverAlunoLocal(
              aluno,
              cursoIdAula,
              contextoAula,
              mapaAlunosEmusys,
              mapaAlunosComposto,
              mapaAlunos,
              mapaContratos,
              mapaJornadaPorAluno
            );
            const sincronizadoEm = new Date().toISOString();

            const { error: rosterError } = await supabase
              .from('aula_alunos_emusys')
              .upsert(
                {
                  aula_emusys_id: aulaLocalId,
                  unidade_id: unidade.id,
                  aluno_chave: criarAlunoChave(aluno, alunoId, normalizarNome),
                  aluno_emusys_id: aluno.id_aluno ?? null,
                  // A API manda 0 quando ja e aluno cadastrado (nao e lead) — vira null,
                  // senao o join da costura da experimental casaria coisa errada.
                  emusys_lead_id:
                    (aluno as { id_lead?: number | null }).id_lead != null &&
                    (aluno as { id_lead?: number | null }).id_lead! > 0
                      ? (aluno as { id_lead?: number | null }).id_lead
                      : null,
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
              console.error(`[sync-presenca] Roster aula ${aula.id} falhou; reconciliação preservada`);
              gradeIncompleta = true;
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
          // canceladaEfetiva inclui o cancelamento humano (agenda_secretaria): aula
          // cancelada pela secretaria tambem nao gera presenca, mesmo ativa no Emusys.
          if (canceladaEfetiva) {
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
              contextoAula,
              mapaAlunosEmusys,
              mapaAlunosComposto,
              mapaAlunos,
              mapaContratos,
              mapaJornadaPorAluno
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
                  // Os ids vem no payload do GET /aulas e eram descartados: sem eles o
                  // log so dizia "o nome tal nao casou", sem permitir diagnostico nem
                  // religar o vinculo depois. `resolverAlunoLocal` ja tenta id_aluno ->
                  // nome+nascimento+curso -> nome; cair aqui significa que as tres
                  // falharam, e o id_aluno e justamente o que diz se o aluno tem
                  // emusys_id do nosso lado ou se o nome bateu em 2+ cadastros.
                  detalhes: {
                    curso: aula.curso_nome,
                    professor: profNome,
                    data: dataAlvo,
                    id_aluno_emusys: aluno.id_aluno ?? null,
                    id_lead_emusys: aluno.id_lead ?? null,
                    aula_emusys_id: aula.id ?? null,
                    aula_local_id: aulaLocalId ?? null,
                    categoria: aula.categoria ?? null,
                  },
                  workflow_id: 'sync-presenca-emusys',
                  execution_id: new Date().toISOString()
                });
              }
              continue;
            }

            matched++;
            const status = aluno.presenca === 'presente' ? 'presente' : 'ausente';
            if (status === 'presente') presentes++;
            else ausentes++;

            // 2026-08-11: removida a maturidade de 24h. Ausente do Emusys grava
            // imediatamente como evidencia bruta (status_presenca = NULL = neutro).
            // A equipe decide na Chamada se e falta ou se foi erro de marcacao.

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

        const hojeReconciliacao = dataAtualBrt();
        const reconciliacaoGrade: ResultadoReconciliacaoGradeSnapshot = dataAlvo >= hojeReconciliacao && !gradeIncompleta
          ? await reconciliarGradeSnapshotEmusys(supabase, {
              unidadeId: unidade.id,
              dataInicio: dataAlvo,
              dataFim: dataAlvo,
              snapshot: montarSnapshotGradeEmusys(
                aulas.filter((aula) =>
                  aula.categoria === 'normal'
                  && aula.data_hora_inicio.split(' ')[0] === dataAlvo
                ),
                normalizarNome,
              ),
            })
          : {
              status: gradeIncompleta
                ? 'grade_incompleta_preservada'
                : 'fora_da_janela_operacional',
            };

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
          reconciliacao_grade: {
            status: reconciliacaoGrade.status,
            aulas_canceladas: reconciliacaoGrade.aulas_canceladas ?? 0,
            vinculos_removidos: reconciliacaoGrade.vinculos_removidos ?? 0,
          },
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

    // Recalcular percentual_presenca somente nos alvos autorizados.
    for (const unidade of unidadesProcessar) {
      await supabase.rpc('atualizar_percentual_presenca', { p_unidade_id: unidade.id });
    }

    // Motor de reposicoes: depois de cada sync, casa creditos pendentes com
    // aulas reagendadas (elo direto) ou novas (rede) e marca as realizadas.
    const { data: casamento, error: erroCasamento } = await supabase.rpc('casar_reposicoes');
    if (erroCasamento) {
      console.error('[sync-presenca] casar_reposicoes falhou (best effort):', erroCasamento.message);
    } else {
      console.log('[sync-presenca] casar_reposicoes:', JSON.stringify(casamento));
    }

    // Reconciliar experimentais órfãs (rede de segurança do webhook)
    const logsReconciliacao = await reconciliarExperimentaisOrfas(supabase, experimentaisColetadas);
    console.log(`[sync-presenca] Reconciliação experimentais: ${logsReconciliacao.length}`);

    // Confirmar experimentais com base nas aulas sincronizadas
    const logsExperimentais = await confirmarExperimentais(
      supabase,
      datasProcessar,
      solicitacao.unidadesIds,
    );
    console.log(`[sync-presenca] Experimentais processadas: ${logsExperimentais.length}`);

    return new Response(
      JSON.stringify({ success: true, modo, dias, data_inicio: datasProcessar[0], data_fim: datasProcessar.at(-1), resultados, experimentais_reconciliadas: logsReconciliacao, experimentais_confirmadas: logsExperimentais }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const classificacao = classificarErroSnapshot(error);
    const solicitacaoInvalida = error instanceof SolicitacaoSyncPresencaInvalida;
    const mensagemPublica = solicitacaoInvalida
      ? error.message
      : modo === 'experimentais' || modo === 'metadados'
        ? classificacao.mensagem
        : error instanceof Error
          ? error.message
          : 'Erro interno';
    console.error(`[sync-presenca] Falha no modo ${modo}: ${mensagemPublica}`);
    return new Response(
      JSON.stringify({ error: mensagemPublica }),
      {
        status: solicitacaoInvalida ? error.status : classificacao.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
