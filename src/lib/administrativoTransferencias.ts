type Relation<T> = T | T[] | null | undefined;

export interface AlunoAdministrativoLike {
  is_segundo_curso?: boolean | null;
  tipo_matricula_id?: number | string | null;
  tipos_matricula?: Relation<{
    codigo?: string | null;
  }>;
}

function firstAdminRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export function codigoTipoMatriculaAdministrativo(row: AlunoAdministrativoLike): string {
  return String(firstAdminRelation(row?.tipos_matricula)?.codigo || '').trim().toUpperCase();
}

export function isAlunoTransferenciaAdministrativa(row: AlunoAdministrativoLike): boolean {
  return codigoTipoMatriculaAdministrativo(row) === 'TRANSFERENCIA';
}

export function isAlunoNovoPaganteAdministrativo(row: AlunoAdministrativoLike): boolean {
  return (
    Boolean(row?.tipo_matricula_id) &&
    row?.is_segundo_curso !== true &&
    !CODIGOS_TIPO_MATRICULA_FORA_NOVA_ADMIN.has(codigoTipoMatriculaAdministrativo(row))
  );
}

export function isAlunoNovoForaComercial(row: AlunoAdministrativoLike): boolean {
  return (
    row?.is_segundo_curso !== true &&
    CODIGOS_TIPO_MATRICULA_FORA_NOVA_ADMIN.has(codigoTipoMatriculaAdministrativo(row))
  );
}

const CODIGOS_TIPO_MATRICULA_FORA_NOVA_ADMIN = new Set([
  'BOLSISTA_INT',
  'BOLSISTA_PARC',
  'BANDA',
  'SEGUNDO_CURSO',
  'TRANSFERENCIA',
]);
