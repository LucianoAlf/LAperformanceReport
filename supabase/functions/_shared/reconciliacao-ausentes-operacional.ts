/**
 * Regra de decisão para matrículas que somem do payload operacional.
 *
 * O cron do `sync-matriculas-emusys` roda em `escopo=operacional`, que pergunta ao
 * Emusys só por `status=ativa` e `status=trancada`. Uma matrícula que acabou de ser
 * concluída ou interrompida deixa de aparecer nessa foto — por definição, já não é
 * nem ativa nem trancada.
 *
 * Até 21/08/2026 a edge tratava essa ausência como o fato em si: marcava a linha como
 * `inativa` com `motivo_inativa = NULL`. O problema é que NULL não distingue
 * "concluiu o contrato" de "abandonou", e é justamente essa distinção que o Emusys
 * passou a expor em 29/07/2026 (API v1.3.1, campo `motivo_inativa`).
 *
 * Sem o motivo, `status_local_resolvido` fica NULL, a `vw_alunos_estado_operacional_v131`
 * resolve `status_operacional = 'desconhecido'` e o aluno cai num limbo: fora dos KPIs
 * canônicos, mas ainda contado na Lista de Alunos, que lê `alunos.status` cru.
 * Caso que revelou: Gabriela da Costa (Barra), contrato concluído em 18/08/2026.
 *
 * A saída é perguntar em vez de inferir: para cada ausente, consultar a API com
 * `status=todas` e reidratar o estado a partir do payload real. Só quem a API também
 * não devolver é que fica marcado como ausente — aí o rótulo diz a verdade.
 *
 * Este módulo tem só a parte pura (agrupar, planejar, decidir). A ida à rede e a
 * escrita ficam na edge, que reaproveita `buildEstadoAtualRows` +
 * `upsertEstadosAtuaisEmLote` — a derivação do estado continua tendo UMA fonte.
 */

export interface AusenteOperacional {
  emusys_matricula_id: number;
  emusys_aluno_id: number | null;
}

export interface GrupoConsulta {
  emusys_aluno_id: number;
  matriculas: number[];
}

export interface PlanoConsultas {
  consultar: GrupoConsulta[];
  /** Sem `emusys_aluno_id` não há como perguntar à API — `/matriculas` não filtra por matrícula. */
  semChaveDeConsulta: number[];
  /** Passaram do teto da rodada; ficam para a próxima (o estado é idempotente). */
  adiadas: number[];
}

export type DestinoAusente =
  | { acao: 'reidratar'; emusysMatriculaId: number; matricula: Record<string, unknown> }
  | { acao: 'confirmar_ausente'; emusysMatriculaId: number };

/**
 * Uma consulta `GET /matriculas?aluno_id=N` devolve TODAS as matrículas da pessoa.
 * Agrupar antes de sair perguntando evita repetir a mesma chamada para o aluno que
 * concluiu dois cursos no mesmo dia — caso comum, já que `alunos` é matrícula e não
 * pessoa, e uma pessoa com dois instrumentos tem duas linhas encerrando juntas.
 */
export function agruparAusentesPorAluno(ausentes: AusenteOperacional[]): {
  grupos: GrupoConsulta[];
  semChaveDeConsulta: number[];
} {
  const porAluno = new Map<number, number[]>();
  const semChaveDeConsulta: number[] = [];

  for (const ausente of ausentes) {
    const matriculaId = Number(ausente?.emusys_matricula_id);
    if (!Number.isFinite(matriculaId)) continue;

    const alunoId = Number(ausente?.emusys_aluno_id);
    if (!Number.isFinite(alunoId) || alunoId <= 0) {
      semChaveDeConsulta.push(matriculaId);
      continue;
    }

    if (!porAluno.has(alunoId)) porAluno.set(alunoId, []);
    const lista = porAluno.get(alunoId)!;
    if (!lista.includes(matriculaId)) lista.push(matriculaId);
  }

  const grupos = [...porAluno.entries()].map(([emusys_aluno_id, matriculas]) => ({
    emusys_aluno_id,
    matriculas,
  }));

  return { grupos, semChaveDeConsulta };
}

/**
 * O escopo operacional existe para caber no idle timeout de 150s (mede 42–54s hoje).
 * Cada consulta custa uma ida à API mais o throttle do rate limit, então a rodada
 * precisa de teto. Em operação normal são 2 a 6 ausentes por dia; um número muito
 * acima disso é sinal de foto anômala, não de gente concluindo contrato em massa —
 * nesse caso é melhor não sair consultando.
 */
export function planejarConsultas(
  ausentes: AusenteOperacional[],
  tetoDeConsultas: number,
): PlanoConsultas {
  const { grupos, semChaveDeConsulta } = agruparAusentesPorAluno(ausentes);

  const teto = Number.isFinite(tetoDeConsultas) && tetoDeConsultas > 0
    ? Math.floor(tetoDeConsultas)
    : 0;

  const consultar = grupos.slice(0, teto);
  const adiadas = grupos.slice(teto).flatMap((grupo) => grupo.matriculas);

  return { consultar, semChaveDeConsulta, adiadas };
}

/**
 * Decide o destino de cada matrícula do grupo à luz do que a API devolveu.
 *
 * `itensDaApi` é a resposta de `GET /matriculas?aluno_id=N&status=todas`, ou seja,
 * todas as matrículas da pessoa. Achou a matrícula? Reidrata com o payload real, que
 * traz o `motivo_inativa`. Não achou? Aí a ausência é o fato, e vale marcar.
 *
 * ⚠️ Matrícula que voltou a ser `ativa` ou `trancada` também é reidratada, de
 * propósito: se ela sumiu da foto por corrida entre páginas e não por ter encerrado,
 * o certo é devolver o estado verdadeiro, não marcá-la como inativa.
 *
 * ⚠️ Consulta que FALHOU não pode chegar aqui como lista vazia — sem resposta da API
 * não há informação nova, e todo o grupo viraria `confirmar_ausente`, produzindo
 * exatamente o limbo que este módulo veio consertar. A edge não chama esta função
 * quando a consulta falha; a linha fica intacta para a próxima rodada.
 */
export function decidirDestinos(
  grupo: GrupoConsulta,
  itensDaApi: Array<Record<string, unknown>> | null | undefined,
): DestinoAusente[] {
  const porId = new Map<number, Record<string, unknown>>();
  for (const item of itensDaApi || []) {
    const id = Number((item as { id?: unknown })?.id);
    if (Number.isFinite(id)) porId.set(id, item);
  }

  return grupo.matriculas.map((emusysMatriculaId) => {
    const matricula = porId.get(emusysMatriculaId);
    return matricula
      ? { acao: 'reidratar' as const, emusysMatriculaId, matricula }
      : { acao: 'confirmar_ausente' as const, emusysMatriculaId };
  });
}
