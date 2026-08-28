export type PresencaCanonicaEstado =
  | 'presente'
  | 'falta'
  | 'falta_justificada'
  | 'indeterminado'
  | 'roster_em_revisao'
  | 'dados_desatualizados';

export type PresencaFonte =
  | 'emusys'
  | 'emusys_politica_temporal'
  | 'agenda_secretaria'
  | 'professor_la_teacher'
  | 'fabio_audio'
  | 'manual';

export interface PresencaOcorrenciaAgenda {
  slot_key: string;
  aluno_id: number;
  ids_aulas_emusys: number[];
  resultado_canonico: string;
  fonte_decisao: string;
  decidido_em: string | null;
  possui_conflito: boolean;
  request_id: string | null;
  recibo_status: string | null;
}

export interface PresencaEnvelopeAdaptavel {
  dados_status: 'atualizados' | 'dados_desatualizados' | 'roster_em_revisao';
  sincronizado_em: string | null;
  regra_versao: string;
  rollout_modo?: 'legado' | 'sombra' | 'canonico_v2';
  ocorrencias: PresencaOcorrenciaAgenda[];
}

export interface ProfessorPresencaOcorrenciaAdaptavel {
  aula_emusys_id: number;
  professor_id: number;
  estado: 'presente' | 'ausente' | 'indeterminado';
  fonte: string;
  decidido_em: string | null;
  request_id: string | null;
  recibo_status: string | null;
}

export interface PresencaEnvelopeProfessorAdaptavel extends PresencaEnvelopeAdaptavel {
  professores_ocorrencias: ProfessorPresencaOcorrenciaAdaptavel[];
}

export interface PresencaCanonicaVisual {
  estado: PresencaCanonicaEstado;
  fonte: PresencaFonte | null;
  decididoEm: string | null;
  conflito: boolean;
  requestId: string | null;
  reciboStatus: string | null;
  regraVersao: string;
  sincronizadoEm: string | null;
}

export interface ProfessorPresencaCanonicaVisual {
  estado: 'presente' | 'ausente' | 'indeterminado' | 'roster_em_revisao' | 'dados_desatualizados';
  fonte: PresencaFonte | null;
  decididoEm: string | null;
  requestId: string | null;
  reciboStatus: string | null;
  regraVersao: string;
  sincronizadoEm: string | null;
}

const ROTULOS_FONTE: Record<PresencaFonte, string> = {
  emusys: 'Emusys',
  emusys_politica_temporal: 'Emusys (política temporal versionada)',
  agenda_secretaria: 'Agenda · secretaria',
  professor_la_teacher: 'LA Teacher · professor',
  fabio_audio: 'Fábio · áudio',
  manual: 'Registro manual',
};

export function rotuloPresencaFonte(fonte: PresencaFonte | null): string {
  return fonte ? ROTULOS_FONTE[fonte] : 'Sem decisão canônica';
}

interface AdaptarParams {
  alunoId: number | null;
  aulaEmusysId: number | null;
  emusysPresencaBruta?: string | null;
  envelope: PresencaEnvelopeAdaptavel;
}

function normalizarFonte(fonte: string): PresencaFonte | null {
  if (fonte === 'emusys') return 'emusys';
  if (fonte === 'emusys_politica_temporal') return 'emusys_politica_temporal';
  if (fonte === 'agenda_secretaria') return 'agenda_secretaria';
  if (fonte === 'professor_la_teacher') return 'professor_la_teacher';
  if (fonte === 'fabio_audio') return 'fabio_audio';
  if (fonte === 'manual' || fonte === 'professor_whatsapp') return 'manual';
  return null;
}

function normalizarEstado(resultado: string): PresencaCanonicaEstado {
  if (resultado === 'presente') return 'presente';
  if (resultado === 'falta') return 'falta';
  if (resultado === 'falta_justificada') return 'falta_justificada';
  return 'indeterminado';
}

/**
 * Única tradução do contrato SQL para a UI. O bruto do Emusys permanece
 * evidência: em especial, `ausente` jamais é promovido a falta aqui.
 */
export function adaptarPresencaCanonica({
  alunoId,
  aulaEmusysId,
  envelope,
}: AdaptarParams): PresencaCanonicaVisual {
  const base = {
    decididoEm: null,
    conflito: false,
    requestId: null,
    reciboStatus: null,
    regraVersao: envelope.regra_versao,
    sincronizadoEm: envelope.sincronizado_em,
  };

  if (envelope.dados_status === 'dados_desatualizados') {
    return { ...base, estado: 'dados_desatualizados', fonte: null };
  }
  if (envelope.dados_status === 'roster_em_revisao') {
    return { ...base, estado: 'roster_em_revisao', fonte: null };
  }

  const ocorrencia = envelope.ocorrencias.find((item) =>
    item.aluno_id === alunoId
    && aulaEmusysId != null
    && item.ids_aulas_emusys.includes(aulaEmusysId));
  if (!ocorrencia) return { ...base, estado: 'indeterminado', fonte: null };

  return {
    estado: normalizarEstado(ocorrencia.resultado_canonico),
    fonte: normalizarFonte(ocorrencia.fonte_decisao),
    decididoEm: ocorrencia.decidido_em,
    conflito: ocorrencia.possui_conflito,
    requestId: ocorrencia.request_id,
    reciboStatus: ocorrencia.recibo_status,
    regraVersao: envelope.regra_versao,
    sincronizadoEm: envelope.sincronizado_em,
  };
}

export function adaptarPresencaProfessorCanonica({
  professorId,
  aulaIds,
  envelope,
}: {
  professorId: number;
  aulaIds: number[];
  envelope: PresencaEnvelopeProfessorAdaptavel;
}): ProfessorPresencaCanonicaVisual {
  const base = {
    fonte: null,
    decididoEm: null,
    requestId: null,
    reciboStatus: null,
    regraVersao: envelope.regra_versao,
    sincronizadoEm: envelope.sincronizado_em,
  } satisfies Omit<ProfessorPresencaCanonicaVisual, 'estado'>;

  if (envelope.dados_status === 'dados_desatualizados') {
    return { ...base, estado: 'dados_desatualizados' };
  }
  if (envelope.dados_status === 'roster_em_revisao') {
    return { ...base, estado: 'roster_em_revisao' };
  }

  const decisoes = envelope.professores_ocorrencias
    .filter((item) => item.professor_id === professorId && aulaIds.includes(item.aula_emusys_id))
    .sort((a, b) => (b.decidido_em ?? '').localeCompare(a.decidido_em ?? ''));
  if (decisoes.length === 0) return { ...base, estado: 'indeterminado' };

  const estados = new Set(decisoes.map((item) => item.estado));
  if (estados.size !== 1 || estados.has('indeterminado')) {
    return { ...base, estado: 'indeterminado' };
  }
  const decisao = decisoes[0];
  return {
    estado: decisao.estado,
    fonte: normalizarFonte(decisao.fonte),
    decididoEm: decisao.decidido_em,
    requestId: decisao.request_id,
    reciboStatus: decisao.recibo_status,
    regraVersao: envelope.regra_versao,
    sincronizadoEm: envelope.sincronizado_em,
  };
}

interface AulaResumoAdaptavel {
  cancelada: boolean;
  alunos: Array<{
    aluno_id: number | null;
    aula_emusys_id: number | null;
    emusys_presenca_bruta?: string | null;
  }>;
  experimental_leads?: Array<{ status: string | null }>;
}

export interface ResumoAulaPresencaCanonica {
  total: number;
  presente: number;
  falta: number;
  falta_justificada: number;
  indeterminado: number;
  estrutural: boolean;
  completa: boolean;
  pendencias: number;
}

/** Resumo unico usado pelas visoes Dia e Semana; a UI apenas renderiza. */
export function resumirAulaPresencaCanonica({
  aula,
  envelope,
  ocorrida,
}: {
  aula: AulaResumoAdaptavel;
  envelope: PresencaEnvelopeAdaptavel;
  ocorrida: boolean;
}): ResumoAulaPresencaCanonica {
  const vinculados = aula.alunos.filter((aluno) => aluno.aluno_id != null);
  const estados = vinculados.map((aluno) => adaptarPresencaCanonica({
    alunoId: aluno.aluno_id,
    aulaEmusysId: aluno.aula_emusys_id,
    emusysPresencaBruta: aluno.emusys_presenca_bruta,
    envelope,
  }).estado);
  const experimentais = (aula.experimental_leads ?? []).map((lead) => {
    if (lead.status === 'experimental_realizada') return 'presente';
    if (lead.status === 'experimental_faltou') return 'falta';
    return 'indeterminado';
  });
  const estrutural = envelope.dados_status !== 'atualizados';
  const contar = (estado: string) => estados.filter((item) => item === estado).length;
  const indeterminado = contar('indeterminado');
  const experimentaisIndeterminados = experimentais.filter((estado) => estado === 'indeterminado').length;
  const totalParticipantes = estados.length + experimentais.length;

  return {
    total: estados.length,
    presente: contar('presente'),
    falta: contar('falta'),
    falta_justificada: contar('falta_justificada'),
    indeterminado,
    estrutural,
    completa: aula.cancelada || (
      !estrutural
      && totalParticipantes > 0
      && indeterminado === 0
      && experimentaisIndeterminados === 0
    ),
    pendencias: ocorrida && !aula.cancelada && !estrutural
      ? indeterminado + experimentaisIndeterminados
      : 0,
  };
}
