export type ModalidadeDisciplina = "individual" | "turma";

export type DisciplinaCatalogo = {
  emusysDisciplinaId: number;
  nomeEmusys: string;
  modalidade: ModalidadeDisciplina;
  payloadSnapshot: {
    id: number;
    nome: string;
    tipo: ModalidadeDisciplina;
  };
};

export type ProfessorDisciplina = {
  emusysProfessorId: number;
  nomeEmusys: string;
  payloadSnapshot: {
    id: number;
    nome: string;
  };
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of keys) {
    if (Array.isArray(payload[key])) return payload[key] as unknown[];
  }

  const data = payload.data;
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const key of keys) {
      if (Array.isArray(data[key])) return data[key] as unknown[];
    }
  }

  return [];
}

function positiveInteger(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : Number.NaN;

    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return null;
}

export function parseDisciplinasCatalogo(
  payload: unknown,
  modalidade: ModalidadeDisciplina,
): DisciplinaCatalogo[] {
  const rows = extractArray(payload, ["disciplinas", "cursos", "items"]);
  const byId = new Map<number, DisciplinaCatalogo>();

  for (const value of rows) {
    if (!isRecord(value)) continue;
    const id = positiveInteger(value.id, value.disciplina_id, value.curso_id);
    if (!id || byId.has(id)) continue;

    const nome = firstNonEmptyString(
      value.nome,
      value.nome_disciplina,
      value.nome_curso,
    ) ?? `Disciplina ${id}`;

    byId.set(id, {
      emusysDisciplinaId: id,
      nomeEmusys: nome,
      modalidade,
      payloadSnapshot: { id, nome, tipo: modalidade },
    });
  }

  if (byId.size === 0) throw new Error("DISCIPLINAS_EMUSYS_INVALIDAS");
  return [...byId.values()].sort((a, b) =>
    a.emusysDisciplinaId - b.emusysDisciplinaId
  );
}

export function parseProfessoresDisciplina(
  payload: unknown,
): ProfessorDisciplina[] {
  const rows = extractArray(payload, ["professores", "items"]);
  const byId = new Map<number, ProfessorDisciplina>();

  for (const value of rows) {
    if (!isRecord(value)) continue;
    const id = positiveInteger(value.id, value.professor_id, value.prof_id);
    if (!id || byId.has(id)) continue;

    const nome = firstNonEmptyString(
      value.nome,
      value.nome_professor,
      value.professor_nome,
    ) ?? `Professor ${id}`;

    byId.set(id, {
      emusysProfessorId: id,
      nomeEmusys: nome,
      payloadSnapshot: { id, nome },
    });
  }

  if (rows.length > 0 && byId.size === 0) {
    throw new Error("PROFESSORES_EMUSYS_INVALIDOS");
  }

  return [...byId.values()].sort((a, b) =>
    a.emusysProfessorId - b.emusysProfessorId
  );
}

export function assertCatalogosDisjuntos(
  turma: DisciplinaCatalogo[],
  individual: DisciplinaCatalogo[],
): void {
  const turmaIds = new Set(turma.map((item) => item.emusysDisciplinaId));
  const conflitos = individual
    .map((item) => item.emusysDisciplinaId)
    .filter((id) => turmaIds.has(id))
    .sort((a, b) => a - b);

  if (conflitos.length > 0) {
    throw new Error(
      `DISCIPLINAS_MODALIDADE_CONFLITANTE:${conflitos.join(",")}`,
    );
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export async function hashPayloadAllowlist(snapshot: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(
    JSON.stringify(canonicalize(snapshot)),
  );
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function retryAfterMilliseconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;

  const date = Date.parse(value);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}

export async function waitForRateLimit(
  headers: Headers,
  fallbackDelayMs: number,
): Promise<number> {
  if (!Number.isFinite(fallbackDelayMs) || fallbackDelayMs < 0) {
    throw new RangeError("fallbackDelayMs deve ser um numero nao negativo");
  }

  const remaining = Number(headers.get("x-ratelimit-remaining"));
  const retryDelay = Number.isFinite(remaining) && remaining <= 0
    ? retryAfterMilliseconds(headers.get("retry-after"))
    : null;
  const delay = retryDelay ?? fallbackDelayMs;

  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  return delay;
}
