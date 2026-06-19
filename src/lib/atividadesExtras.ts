type Relation<T> = T | T[] | null | undefined;

type CursoLike = {
  nome?: string | null;
  is_projeto_banda?: boolean | null;
  is_coral?: boolean | null;
};

function firstRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

function normalizarTexto(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function cursoDeLinha(row: any): CursoLike | null {
  const cursoDireto = firstRelation<CursoLike>(row?.cursos);
  if (cursoDireto) return cursoDireto;

  const aluno = firstRelation<any>(row?.alunos);
  const cursoAluno = firstRelation<CursoLike>(aluno?.cursos);
  if (cursoAluno) return cursoAluno;

  if (row?.curso_nome) return { nome: row.curso_nome };
  if (row?.curso) return { nome: row.curso };

  return null;
}

export function isAtividadeExtraAcademica(row: any): boolean {
  const curso = cursoDeLinha(row);
  const nome = normalizarTexto(curso?.nome);

  return (
    curso?.is_projeto_banda === true ||
    curso?.is_coral === true ||
    nome.includes('canto coral') ||
    nome.includes('power kids') ||
    nome.includes('minha banda') ||
    nome.includes('garageband') ||
    nome.includes('percussion kids')
  );
}

export function filtrarRetencaoCanonica<T extends any>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(row => !isAtividadeExtraAcademica(row));
}
