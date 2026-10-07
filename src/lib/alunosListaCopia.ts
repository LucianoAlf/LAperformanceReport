/**
 * Cópia da Lista de Alunos em MEMÓRIA (LAPE-42) — "mostra o que tem, atualiza por trás".
 *
 * Ao voltar para Alunos a página refazia ~26 leituras e mostrava spinner por 3-5 s. Agora ela
 * pinta na hora a última lista vista NESTA aba e a busca nova roda do mesmo jeito, sempre —
 * a cópia só ocupa o intervalo que era spinner.
 *
 * Três regras, e cada uma tem motivo:
 * - **Só memória, nunca localStorage/sessionStorage/IndexedDB.** A lista carrega nome,
 *   telefone, nascimento e diagnóstico da anamnese (dado sensível de saúde, LGPD); a OWASP
 *   manda não pôr dado pessoal em storage do navegador. Some ao fechar a aba, dar F5 ou sair.
 * - **A cópia NUNCA afirma nada sobre dinheiro.** Inadimplência é gravada como `undefined`
 *   ("não sei"), então banner, filtro e selo ficam em carregando até a leitura nova — mesma
 *   régua de `sem_captura` não virar "fora".
 * - **A chave é usuário + unidade + período.** Trocar a unidade nunca mostra a lista de outra,
 *   e outro login no mesmo navegador nunca lê a cópia do anterior.
 */

export const IDADE_MAXIMA_COPIA_MS = 30 * 60 * 1000;
export const MAX_COPIAS = 6;

export interface CopiaListaAlunos<TAluno = any, TTurma = any, TKpis = any> {
  alunos: TAluno[];
  turmas: TTurma[];
  kpis: TKpis;
  professores: { id: number; nome: string }[];
  cursos: { id: number; nome: string; is_projeto_banda?: boolean }[];
  tiposMatricula: { id: number; nome: string }[];
  salas: { id: number; nome: string; capacidade_maxima: number }[];
  horarios: { id: number; nome: string; hora_inicio: string }[];
  salvoEm: number;
}

const copias = new Map<string, CopiaListaAlunos>();

export function chaveCopiaListaAlunos(
  usuarioId: string | null | undefined,
  unidade: string | null | undefined,
  inicio: string | null | undefined,
  fim: string | null | undefined,
): string | null {
  // Sem usuário não há dono para a cópia — nada é guardado nem lido.
  if (!usuarioId) return null;
  return [usuarioId, unidade || 'todos', inicio || '', fim || ''].join('|');
}

const CAMPOS_FINANCEIROS_INDETERMINADOS = {
  inadimplente_emusys: undefined,
  _inadimplencia_atualizado_em: null,
  _inadimplencia_valor_atualizado: 0,
  _inadimplencia_total_faturas: 0,
} as const;

/** Tira da linha tudo que afirma situação financeira ao vivo, inclusive dos outros cursos. */
export function semLeituraFinanceira<T extends Record<string, any>>(aluno: T): T {
  return {
    ...aluno,
    ...CAMPOS_FINANCEIROS_INDETERMINADOS,
    outros_cursos: Array.isArray(aluno.outros_cursos)
      ? aluno.outros_cursos.map((oc: Record<string, any>) => ({ ...oc, ...CAMPOS_FINANCEIROS_INDETERMINADOS }))
      : aluno.outros_cursos,
  };
}

export function gravarCopiaListaAlunos(
  chave: string | null,
  copia: Omit<CopiaListaAlunos, 'salvoEm'>,
  agora: number = Date.now(),
): void {
  if (!chave) return;
  copias.delete(chave); // reinsere no fim: a ordem do Map vira ordem de uso
  copias.set(chave, {
    ...copia,
    alunos: copia.alunos.map(semLeituraFinanceira),
    salvoEm: agora,
  });
  while (copias.size > MAX_COPIAS) {
    const maisAntiga = copias.keys().next().value;
    if (maisAntiga === undefined) break;
    copias.delete(maisAntiga);
  }
}

export function lerCopiaListaAlunos(
  chave: string | null,
  agora: number = Date.now(),
): CopiaListaAlunos | null {
  if (!chave) return null;
  const copia = copias.get(chave);
  if (!copia) return null;
  // Cópia velha demais engana mais do que ajuda: melhor o spinner de sempre.
  if (agora - copia.salvoEm > IDADE_MAXIMA_COPIA_MS) {
    copias.delete(chave);
    return null;
  }
  return copia;
}

export function descartarCopiasListaAlunos(): void {
  copias.clear();
}

export function totalCopiasListaAlunos(): number {
  return copias.size;
}
