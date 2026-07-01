type MatriculaBandaCandidate = {
  curso_id?: number | string | null;
  status?: string | null;
  tipo_matricula_id?: number | string | null;
  tipo_matricula_codigo?: string | null;
};

export function isMatriculaBandaAtivaOperacional(
  row: MatriculaBandaCandidate,
  cursosBandaIds: Array<number | string>,
): boolean {
  const status = String(row.status || '').toLowerCase();
  if (status !== 'ativo') return false;

  const cursoId = row.curso_id !== null && row.curso_id !== undefined ? Number(row.curso_id) : null;
  const tipoId = row.tipo_matricula_id !== null && row.tipo_matricula_id !== undefined ? Number(row.tipo_matricula_id) : null;
  const tipoCodigo = String(row.tipo_matricula_codigo || '').toUpperCase();
  const cursoEhBanda = cursoId !== null && cursosBandaIds.map(Number).includes(cursoId);

  return cursoEhBanda || tipoId === 5 || tipoCodigo === 'BANDA';
}
