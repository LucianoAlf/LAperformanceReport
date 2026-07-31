import type { EmusysPaginaAulas } from "./emusys-aulas.ts";

export type SituacaoExperimental =
  | "agendada"
  | "presente"
  | "faltou"
  | "cancelada"
  | "sem_status";

export type ExperimentalAluno = {
  id_aluno?: number | string | null;
  id_lead?: number | string | null;
  nome_aluno?: string | null;
  email_aluno?: string | null;
  telefone_aluno?: string | null;
  presenca?: string | null;
  [key: string]: unknown;
};

export type AulaEmusys = {
  id: number;
  categoria?: string | null;
  cancelada?: boolean | null;
  data_hora_inicio: string;
  data_hora_fim?: string | null;
  curso_id?: number | string | null;
  curso_nome?: string | null;
  alunos?: ExperimentalAluno[] | null;
  [key: string]: unknown;
};

export type SnapshotInput = {
  unidadeId: string;
  execucaoId: string;
  aulas: AulaEmusys[];
  agora?: Date;
};

export type SnapshotRow = {
  raw_key: string;
  unidade_id: string;
  execucao_id: string;
  emusys_aula_id: number;
  participante_chave: string;
  emusys_lead_id: number | null;
  emusys_aluno_id: number | null;
  aluno_nome: string;
  data_aula: string;
  horario_aula: string;
  cancelada: boolean;
  presenca_emusys: string | null;
  situacao_operacional: SituacaoExperimental;
  payload_bruto: {
    schema_version: 1;
    data_aula: string;
    horario_aula: string;
    cancelada: boolean;
    aula: {
      id: number;
    };
    participante: {
      id_lead: number | null;
      id_aluno: number | null;
    };
  };
};

export type FetchAulasPageParams = {
  dataInicio: string;
  dataFim: string;
  cursor: string | null;
  limite: 100;
};

export type FetchTodasAulasInput = {
  dataInicio: string;
  dataFim: string;
  fetchPage: (
    params: FetchAulasPageParams,
  ) => Promise<EmusysPaginaAulas<AulaEmusys>>;
};

const TIME_ZONE = "America/Sao_Paulo";
const SAO_PAULO_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function externalId(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function externalIdComMarcadorZero(value: unknown): number | null {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : Number.NaN;

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizarTexto(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

function hashFnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const bytes = new TextEncoder().encode(value);

  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }

  return hash.toString(16).padStart(16, "0");
}

/**
 * Identidade operacional do participante dentro da unidade.
 *
 * O fallback textual serve somente para tornar a linha raw determinística.
 * Ele não é evidência de vínculo canônico e nunca deve conciliar lead/aluno.
 */
export function participanteChave(aluno: ExperimentalAluno): string {
  const leadId = externalId(aluno.id_lead);
  if (leadId !== null) return `lead:${leadId}`;

  const alunoId = externalId(aluno.id_aluno);
  if (alunoId !== null) return `aluno:${alunoId}`;

  const fallback = [
    normalizarTexto(aluno.nome_aluno),
    normalizarTexto(aluno.email_aluno),
    typeof aluno.telefone_aluno === "string"
      ? aluno.telefone_aluno.replace(/\D/g, "")
      : "",
  ].join("|");

  return `fallback:${hashFnv1a64(fallback)}`;
}

function partsInTimeZone(epochMs: number): Record<string, number> {
  return Object.fromEntries(
    SAO_PAULO_FORMATTER
      .formatToParts(new Date(epochMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

function localSaoPauloToEpoch(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}): number {
  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let candidate = wallClockAsUtc;

  // Duas iterações cobrem mudanças históricas de offset sem depender do TZ
  // configurado na máquina que executa a edge/teste.
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const zoned = partsInTimeZone(candidate);
    const representedAsUtc = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
    );
    const offset = representedAsUtc - candidate;
    candidate = wallClockAsUtc - offset;
  }

  return candidate;
}

function diasNoMes(year: number, month: number): number {
  if (month === 2) {
    const bissexto = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return bissexto ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDataHoraLocalEmusys(dataHoraInicio: string): {
  dataAula: string;
  horarioAula: string;
  epochMs: number;
} {
  const match = dataHoraInicio.trim().match(
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) throw new Error("DATA_HORA_EXPERIMENTAL_INVALIDA");

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText = "00",
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (
    year < 1 ||
    month < 1 || month > 12 ||
    day < 1 || day > diasNoMes(year, month) ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59 ||
    second < 0 || second > 59
  ) {
    throw new Error("DATA_HORA_EXPERIMENTAL_INVALIDA");
  }

  const dataAula = `${yearText}-${monthText}-${dayText}`;
  const horarioAula = `${hourText}:${minuteText}:${secondText}`;
  return {
    dataAula,
    horarioAula,
    epochMs: localSaoPauloToEpoch({
      year,
      month,
      day,
      hour,
      minute,
      second,
    }),
  };
}

function normalizarSituacaoComEpoch(input: {
  presenca: string | null | undefined;
  cancelada: boolean;
  inicioEpochMs: number;
  agora: Date;
}): SituacaoExperimental {
  if (input.cancelada) return "cancelada";
  if (input.inicioEpochMs > input.agora.getTime()) return "agendada";

  const presenca = normalizarTexto(input.presenca);
  if (presenca === "presente" || presenca === "matriculado") {
    return "presente";
  }
  if (presenca === "faltou" || presenca === "ausente") return "faltou";
  return "sem_status";
}

export function normalizarSituacaoExperimental(input: {
  presenca: string | null | undefined;
  cancelada: boolean;
  dataHoraInicio: string;
  agora: Date;
}): SituacaoExperimental {
  const { epochMs } = parseDataHoraLocalEmusys(input.dataHoraInicio);
  return normalizarSituacaoComEpoch({
    presenca: input.presenca,
    cancelada: input.cancelada,
    inicioEpochMs: epochMs,
    agora: input.agora,
  });
}

export function montarLinhasSnapshot(input: SnapshotInput): SnapshotRow[] {
  const agora = input.agora ?? new Date();
  const rows = new Map<string, SnapshotRow>();

  for (const aula of input.aulas) {
    if (normalizarTexto(aula.categoria) !== "experimental") continue;
    if (!Number.isSafeInteger(aula.id) || aula.id <= 0) {
      throw new Error("EMUSYS_AULA_ID_INVALIDO");
    }

    const { dataAula, horarioAula, epochMs } = parseDataHoraLocalEmusys(
      aula.data_hora_inicio,
    );
    const cancelada = aula.cancelada === true;

    for (const participante of aula.alunos ?? []) {
      const nome = typeof participante.nome_aluno === "string"
        ? participante.nome_aluno.trim()
        : "";
      if (!nome) continue;

      const participanteKey = participanteChave(participante);
      const rawKey = [
        input.unidadeId,
        aula.id,
        participanteKey,
        input.execucaoId,
      ].join(":");
      const presenca = typeof participante.presenca === "string"
        ? participante.presenca
        : null;
      const emusysLeadId = externalId(participante.id_lead);
      const emusysAlunoId = externalId(participante.id_aluno);
      const emusysLeadIdPayload = externalIdComMarcadorZero(
        participante.id_lead,
      );

      rows.set(rawKey, {
        raw_key: rawKey,
        unidade_id: input.unidadeId,
        execucao_id: input.execucaoId,
        emusys_aula_id: aula.id,
        participante_chave: participanteKey,
        emusys_lead_id: emusysLeadId,
        emusys_aluno_id: emusysAlunoId,
        aluno_nome: nome,
        data_aula: dataAula,
        horario_aula: horarioAula,
        cancelada,
        presenca_emusys: presenca,
        situacao_operacional: normalizarSituacaoComEpoch({
          presenca,
          cancelada,
          inicioEpochMs: epochMs,
          agora,
        }),
        payload_bruto: {
          schema_version: 1,
          data_aula: dataAula,
          horario_aula: horarioAula,
          cancelada,
          aula: {
            id: aula.id,
          },
          participante: {
            id_lead: emusysLeadIdPayload,
            id_aluno: emusysAlunoId,
          },
        },
      });
    }
  }

  return [...rows.values()];
}

export async function buscarTodasAulas(
  input: FetchTodasAulasInput,
): Promise<AulaEmusys[]> {
  const acumuladas: AulaEmusys[] = [];
  const cursoresConsumidos = new Set<string>();
  let cursor: string | null = null;

  while (true) {
    const pagina = await input.fetchPage({
      dataInicio: input.dataInicio,
      dataFim: input.dataFim,
      cursor,
      limite: 100,
    });

    acumuladas.push(...pagina.items);
    if (!pagina.paginacao.tem_mais) return acumuladas;

    const proximoCursor = typeof pagina.paginacao.proximo_cursor === "string"
      ? pagina.paginacao.proximo_cursor.trim()
      : "";
    if (!proximoCursor) {
      throw new Error("EMUSYS_AULAS_CURSOR_AUSENTE");
    }
    if (cursoresConsumidos.has(proximoCursor)) {
      throw new Error("EMUSYS_AULAS_CURSOR_REPETIDO");
    }

    cursoresConsumidos.add(proximoCursor);
    cursor = proximoCursor;
  }
}
