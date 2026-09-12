export interface ExperimentalIdentity {
  unidadeId: string;
  emusysAulaId: number | null;
  emusysLeadId: number | null;
  emusysAlunoId?: number | null;
  data: string | null;
  horario: string | null;
  cursoId?: number | null;
}

export interface ExperimentalCandidate {
  id: number;
  status?: string | null;
  unidadeId?: string | null;
  emusysAulaId?: number | null;
  emusysLeadId?: number | null;
  emusysAlunoId?: number | null;
  dataAula?: string | null;
  horarioBanco?: string | null;
  cursoId?: number | null;
}

function normalizarData(value: string | null | undefined): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function horarioEmMinutos(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const horas = Number(match[1]);
  const minutos = Number(match[2]);
  if (horas < 0 || horas > 23 || minutos < 0 || minutos > 59) return null;
  return horas * 60 + minutos;
}

function candidatoNoEscopo(
  candidato: ExperimentalCandidate,
  unidadeId: string,
): boolean {
  return String(candidato.unidadeId ?? '') === String(unidadeId) &&
    candidato.status !== 'cancelada';
}

function camposEstaveisCorrespondem(
  identidade: ExperimentalIdentity,
  candidato: ExperimentalCandidate,
): boolean {
  if (normalizarData(candidato.dataAula) !== normalizarData(identidade.data)) return false;
  if (identidade.emusysLeadId != null && candidato.emusysLeadId !== identidade.emusysLeadId) {
    return false;
  }
  if (identidade.emusysAlunoId != null && candidato.emusysAlunoId !== identidade.emusysAlunoId) {
    return false;
  }
  if (identidade.cursoId != null && candidato.cursoId !== identidade.cursoId) return false;
  return identidade.emusysLeadId != null || identidade.emusysAlunoId != null;
}

function horarioCorrespondeExatamente(
  identidade: ExperimentalIdentity,
  candidato: ExperimentalCandidate,
): boolean {
  const horarioIdentidade = horarioEmMinutos(identidade.horario);
  const horarioCandidato = horarioEmMinutos(candidato.horarioBanco);
  return horarioIdentidade !== null &&
    horarioCandidato !== null &&
    horarioIdentidade === horarioCandidato;
}

/**
 * Seleciona uma linha sem usar nome como identidade.
 *
 * A aula externa e a chave mais forte: quando existe um unico candidato no
 * escopo da unidade, horario, data, curso e nome nao podem impedir o match.
 * Sem essa chave, o fallback exige identidade de lead/aluno, data e horario
 * exatos. Um reagendamento pode manter a mesma pessoa no mesmo dia, mas nunca
 * pode ligar uma aula das 09h a outra das 10h.
 */
export function selecionarCandidatoExperimental(
  identidade: ExperimentalIdentity,
  candidatos: ExperimentalCandidate[],
): ExperimentalCandidate | null {
  const escopo = candidatos.filter((candidato) =>
    candidatoNoEscopo(candidato, identidade.unidadeId)
  );

  if (identidade.emusysAulaId != null) {
    const porAula = escopo.filter((candidato) =>
      candidato.emusysAulaId === identidade.emusysAulaId
    );
    if (porAula.length === 1) return porAula[0];
    if (porAula.length > 1) return null;
  }

  const porIdentidade = escopo.filter((candidato) =>
    camposEstaveisCorrespondem(identidade, candidato) &&
    horarioCorrespondeExatamente(identidade, candidato)
  );
  if (porIdentidade.length === 1) return porIdentidade[0];
  return null;
}
