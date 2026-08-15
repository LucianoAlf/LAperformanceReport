import type { AulaSnapshotGrade } from "./reconciliacao-grade-snapshot.ts";

export interface AulaLocalParaPrevisualizacao {
  id: number;
  emusys_id: number;
}

export interface VinculoLocalParaPrevisualizacao {
  id: number;
  aula_emusys_id: number;
  aluno_id: number | null;
  aluno_emusys_id: number | null;
  aluno_chave: string;
}

export interface PresencaParaPrevisualizacao {
  aula_emusys_id: number;
  aluno_id: number;
  status: string | null;
  status_presenca: string | null;
  respondido_por: string | null;
}

export interface ItemTecnicoPrevisualizacao {
  aula_local_id: number;
  emusys_aula_id: number;
  vinculo_id: number | null;
}

export interface ResultadoPrevisualizacaoReconciliacaoGrade {
  candidatas: {
    aulas_cancelar: ItemTecnicoPrevisualizacao[];
    vinculos_remover: ItemTecnicoPrevisualizacao[];
  };
  protegidas: {
    marcacao_fechada_aula: ItemTecnicoPrevisualizacao[];
    marcacao_fechada_vinculo: ItemTecnicoPrevisualizacao[];
    identidade_ambigua: ItemTecnicoPrevisualizacao[];
  };
}

const ORIGENS_HUMANAS_FORTES = new Set([
  "professor_la_teacher",
  "fabio_audio",
  "manual",
  "professor_whatsapp",
  "agenda_secretaria",
]);

function statusCanonico(presenca: PresencaParaPrevisualizacao): string | null {
  if (presenca.status_presenca !== null) return presenca.status_presenca;
  if (presenca.status === "presente") return "presente";
  if (presenca.status === "ausente") return "falta";
  return null;
}

/** Espelha `fn_presenca_fecha_chamada`, inclusive o fallback legado de status. */
export function presencaFechaChamada(
  presenca: PresencaParaPrevisualizacao,
): boolean {
  const status = statusCanonico(presenca);
  const terminal = status === "presente" || status === "falta" ||
    status === "falta_justificada";
  return terminal && (
    ORIGENS_HUMANAS_FORTES.has(presenca.respondido_por ?? "") ||
    (presenca.respondido_por === "emusys" && status === "presente")
  );
}

function itemTecnico(
  aula: AulaLocalParaPrevisualizacao,
  vinculoId: number | null,
): ItemTecnicoPrevisualizacao {
  return {
    aula_local_id: aula.id,
    emusys_aula_id: aula.emusys_id,
    vinculo_id: vinculoId,
  };
}

function vinculoExisteNaFonte(
  vinculo: VinculoLocalParaPrevisualizacao,
  alunoChavesFonte: Set<string>,
): boolean {
  return alunoChavesFonte.has(vinculo.aluno_chave) ||
    (
      vinculo.aluno_emusys_id !== null &&
      alunoChavesFonte.has(`emusys:${vinculo.aluno_emusys_id}`)
    );
}

/**
 * `montarSnapshotGradeEmusys` so produz `local:` quando recebe um id local,
 * coisa que a fotografia bruta do Emusys nunca recebe. Logo, qualquer chave
 * que nao comece com `emusys:` e um fallback por nome/data; ela nao prova que
 * um vinculo local especifico desapareceu da turma.
 */
function fonteTemSomenteIdentidadesEstaveis(
  alunoChavesFonte: Set<string>,
): boolean {
  // Um roster vazio nao prova que todos os alunos foram removidos: pode ser
  // apenas uma resposta parcial da fonte. Sem pelo menos uma identidade
  // estavel recebida, a reconciliacao deve preservar os vinculos locais.
  return alunoChavesFonte.size > 0 &&
    [...alunoChavesFonte].every((chave) => chave.startsWith("emusys:"));
}

/**
 * Replica em memória, sem DML e sem expor chaves de aluno, as decisões da RPC
 * de reconciliação. A Edge usa este resultado apenas para auditar a fotografia
 * antes de qualquer migration ou reparo aplicado.
 */
export function previsualizarReconciliacaoGrade(params: {
  snapshot: AulaSnapshotGrade[];
  aulas: AulaLocalParaPrevisualizacao[];
  vinculos: VinculoLocalParaPrevisualizacao[];
  presencas: PresencaParaPrevisualizacao[];
}): ResultadoPrevisualizacaoReconciliacaoGrade {
  const snapshotPorAula = new Map<number, Set<string>>(
    params.snapshot.map((aula) => [aula.emusys_id, new Set(aula.aluno_chaves)]),
  );
  const presencasQueFecham = params.presencas.filter(presencaFechaChamada);
  const aulaComMarcacaoFechada = new Set(
    presencasQueFecham.map((presenca) => presenca.aula_emusys_id),
  );
  const alunoComMarcacaoFechada = new Set(
    presencasQueFecham.map((presenca) =>
      `${presenca.aula_emusys_id}:${presenca.aluno_id}`
    ),
  );
  const vinculosPorAula = new Map<number, VinculoLocalParaPrevisualizacao[]>();

  for (const vinculo of params.vinculos) {
    const itens = vinculosPorAula.get(vinculo.aula_emusys_id) ?? [];
    itens.push(vinculo);
    vinculosPorAula.set(vinculo.aula_emusys_id, itens);
  }

  const resultado: ResultadoPrevisualizacaoReconciliacaoGrade = {
    candidatas: { aulas_cancelar: [], vinculos_remover: [] },
    protegidas: {
      marcacao_fechada_aula: [],
      marcacao_fechada_vinculo: [],
      identidade_ambigua: [],
    },
  };

  for (const aula of [...params.aulas].sort((a, b) => a.id - b.id)) {
    const alunoChavesFonte = snapshotPorAula.get(aula.emusys_id);
    if (!alunoChavesFonte) {
      const item = itemTecnico(aula, null);
      if (aulaComMarcacaoFechada.has(aula.id)) {
        resultado.protegidas.marcacao_fechada_aula.push(item);
      } else {
        resultado.candidatas.aulas_cancelar.push(item);
      }
      continue;
    }

    for (
      const vinculo of [...(vinculosPorAula.get(aula.id) ?? [])]
        .sort((a, b) => a.id - b.id)
    ) {
      if (vinculoExisteNaFonte(vinculo, alunoChavesFonte)) continue;

      const item = itemTecnico(aula, vinculo.id);
      if (
        !fonteTemSomenteIdentidadesEstaveis(alunoChavesFonte) ||
        vinculo.aluno_id === null ||
        vinculo.aluno_emusys_id === null
      ) {
        resultado.protegidas.identidade_ambigua.push(item);
      } else if (
        alunoComMarcacaoFechada.has(`${aula.id}:${vinculo.aluno_id}`)
      ) {
        resultado.protegidas.marcacao_fechada_vinculo.push(item);
      } else {
        resultado.candidatas.vinculos_remover.push(item);
      }
    }
  }

  return resultado;
}
