// Cliente de escrita de presenca no Emusys (API 1.7.0, changelog 23/09/2026).
//
// PATCH /aulas/presenca/aluno     -> { aula_id, presente, horario? }
//   aula_id = linha INDIVIDUAL do aluno na turma (alunos[].aula_id do GET),
//   nunca a mestre.
// PATCH /aulas/presenca/professor -> { aula_id, professor_id, presente, horario? }
//   aceita mestre ou individual; professor_id sempre enviado.
// Ambos devolvem { status, aula } — a aula inteira serve de recibo "depois".
// Sem campo `horario`, o Emusys usa o horario AGENDADO da aula (nao a hora do
// PATCH). Nao existe canal de `justificada`: presente aceita so true/false.

import { EMUSYS_API_BASE, EmusysApiError } from './emusys-aulas.ts';

export interface EmusysAlunoPresencaLinha {
  aula_id?: number | null;
  id_aluno?: number | null;
  presenca?: string | null;
  horario_presenca?: string | null;
  justificada?: boolean | null;
  cancelada?: boolean | null;
}

export interface EmusysProfessorPresencaLinha {
  id?: number | null;
  presenca?: string | null;
  horario_presenca?: string | null;
}

export interface EmusysAulaDetalhe {
  id?: number | null;
  tipo?: string | null;
  turma_nome?: string | null;
  cancelada?: boolean | null;
  justificada?: boolean | null;
  reagendada?: boolean | null;
  alunos?: EmusysAlunoPresencaLinha[] | null;
  professor?: EmusysProfessorPresencaLinha | null;
  professores?: EmusysProfessorPresencaLinha[] | null;
  [campo: string]: unknown;
}

export interface EmusysRespostaAula {
  status?: number | null;
  aula: EmusysAulaDetalhe;
  bruto: unknown;
}

function extrairAula(payload: unknown, operacao: string): EmusysRespostaAula {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new Error(`${operacao}_PAYLOAD_INVALIDO`);
  }
  const corpo = payload as Record<string, unknown>;
  // GET /aula e PATCH devolvem a aula dentro de `aula`; tolera resposta direta.
  const aula = (corpo.aula ?? corpo) as EmusysAulaDetalhe;
  if (typeof aula !== 'object' || aula === null || Array.isArray(aula)) {
    throw new Error(`${operacao}_PAYLOAD_INVALIDO`);
  }
  return {
    status: typeof corpo.status === 'number' ? corpo.status : null,
    aula,
    bruto: payload,
  };
}

async function chamarEmusys(
  operacao: string,
  url: string,
  init: RequestInit,
): Promise<EmusysRespostaAula> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new EmusysApiError(
      response.status,
      response.headers.get('Retry-After'),
      `${operacao}: Emusys API respondeu HTTP ${response.status}`,
    );
  }
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error(`${operacao}_JSON_INVALIDO`);
  }
  return extrairAula(json, operacao);
}

export function montarUrlAulaEmusys(aulaId: number, apiBase = EMUSYS_API_BASE): string {
  return `${apiBase.replace(/\/$/, '')}/aula?aula_id=${aulaId}`;
}

/** GET /aula?aula_id= — leitura do estado antes de qualquer escrita. */
export async function buscarAulaEmusys({
  token,
  aulaId,
  signal,
  apiBase = EMUSYS_API_BASE,
}: {
  token: string;
  aulaId: number;
  signal?: AbortSignal;
  apiBase?: string;
}): Promise<EmusysRespostaAula> {
  return chamarEmusys(
    'EMUSYS_AULA_GET',
    montarUrlAulaEmusys(aulaId, apiBase),
    { method: 'GET', headers: { token }, signal },
  );
}

/** PATCH /aulas/presenca/aluno — aulaId e a linha individual do aluno. */
export async function gravarPresencaAlunoEmusys({
  token,
  aulaId,
  presente,
  horario,
  signal,
  apiBase = EMUSYS_API_BASE,
}: {
  token: string;
  aulaId: number;
  presente: boolean;
  horario?: string;
  signal?: AbortSignal;
  apiBase?: string;
}): Promise<EmusysRespostaAula> {
  const corpo: Record<string, unknown> = { aula_id: aulaId, presente };
  if (horario) corpo.horario = horario;
  return chamarEmusys(
    'EMUSYS_PRESENCA_ALUNO_PATCH',
    `${apiBase.replace(/\/$/, '')}/aulas/presenca/aluno`,
    {
      method: 'PATCH',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal,
    },
  );
}

/** PATCH /aulas/presenca/professor — resolve na mestre; professor_id sempre vai. */
export async function gravarPresencaProfessorEmusys({
  token,
  aulaId,
  professorId,
  presente,
  horario,
  signal,
  apiBase = EMUSYS_API_BASE,
}: {
  token: string;
  aulaId: number;
  professorId: number;
  presente: boolean;
  horario?: string;
  signal?: AbortSignal;
  apiBase?: string;
}): Promise<EmusysRespostaAula> {
  const corpo: Record<string, unknown> = {
    aula_id: aulaId,
    professor_id: professorId,
    presente,
  };
  if (horario) corpo.horario = horario;
  return chamarEmusys(
    'EMUSYS_PRESENCA_PROFESSOR_PATCH',
    `${apiBase.replace(/\/$/, '')}/aulas/presenca/professor`,
    {
      method: 'PATCH',
      headers: { token, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal,
    },
  );
}
