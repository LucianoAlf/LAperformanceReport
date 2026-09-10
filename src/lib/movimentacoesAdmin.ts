// Utilitários de leitura de movimentacoes_admin.
// ⚠️ movimentacoes_admin NÃO tem FK declarada para cursos nem para alunos —
// qualquer embed tipo `cursos(...)`/`alunos(...)` nessa tabela derruba a
// consulta inteira com PGRST200. O vínculo se resolve em lote por aqui.

export interface AlunoVinculoMovimento {
  id: number;
  nome: string | null;
  tipo_matricula_id: number | null;
  curso_id: number | null;
  cursos: { nome: string | null; is_projeto_banda: boolean | null } | { nome: string | null; is_projeto_banda: boolean | null }[] | null;
}

interface MovimentoComAlunoId {
  aluno_id: number | null;
}

const TAMANHO_LOTE = 200; // URL do PostgREST estoura com muitos ids em .in()

/**
 * Anexa `alunos` (mesmo formato que o embed devolveria: objeto único) em cada
 * movimentação que tem aluno_id. Sem vínculo (lançamento manual antigo), o
 * campo fica null e as regras canônicas seguem fail-open, como já era.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function anexarAlunosEmMovimentos<T extends MovimentoComAlunoId & Record<string, any>>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  movimentos: T[] | null | undefined,
): Promise<(T & { alunos: AlunoVinculoMovimento | null })[]> {
  const linhas = movimentos ?? [];
  const ids = [...new Set(
    linhas.map((m) => Number(m.aluno_id)).filter((id) => Number.isFinite(id) && id > 0),
  )];
  if (ids.length === 0) return linhas.map((m) => ({ ...m, alunos: null }));

  const alunos = new Map<number, AlunoVinculoMovimento>();
  for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
    const { data, error } = await sb
      .from('alunos')
      .select('id, nome, tipo_matricula_id, curso_id, cursos(nome, is_projeto_banda)')
      .in('id', ids.slice(i, i + TAMANHO_LOTE));
    if (error) throw error;
    for (const aluno of data ?? []) alunos.set(aluno.id, aluno);
  }

  return linhas.map((m) => ({
    ...m,
    alunos: alunos.get(Number(m.aluno_id)) ?? null,
  }));
}
