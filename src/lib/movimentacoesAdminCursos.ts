import { supabase } from '@/lib/supabase';

type RowComCursoId = {
  curso_id?: number | string | null;
  curso_nome?: string | null;
  cursos?: any;
};

export async function anexarCursosMovimentacoesAdmin<T extends RowComCursoId>(rows: T[] | null | undefined): Promise<T[]> {
  const lista = rows || [];
  const cursoIds = Array.from(new Set(
    lista
      .map(row => row.curso_id)
      .filter((id): id is number | string => id !== null && id !== undefined)
      .map(String)
  ));

  if (cursoIds.length === 0) return lista;

  const { data, error } = await supabase
    .from('cursos')
    .select('id, nome, is_projeto_banda')
    .in('id', cursoIds);

  if (error) throw error;

  const cursosMap = new Map((data || []).map((curso: any) => [String(curso.id), curso]));

  return lista.map(row => {
    const curso = row.curso_id !== null && row.curso_id !== undefined
      ? cursosMap.get(String(row.curso_id))
      : null;

    if (!curso) return row;

    return {
      ...row,
      curso_nome: row.curso_nome || curso.nome || null,
      cursos: row.cursos || {
        nome: curso.nome,
        is_projeto_banda: curso.is_projeto_banda,
      },
    };
  });
}
