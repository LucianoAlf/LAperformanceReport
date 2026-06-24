type Relation<T> = T | T[] | null | undefined;

export interface AlunoAdministrativoLike {
  is_segundo_curso?: boolean | null;
  tipo_matricula_id?: number | string | null;
  tipos_matricula?: Relation<{
    codigo?: string | null;
  }>;
}

export interface TransferenciaAdministrativaLike {
  tipo?: string | null;
  aluno_id?: number | string | null;
  unidade_origem_id?: string | null;
  unidade_destino_id?: string | null;
  data_transferencia?: string | null;
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

export function isTransferenciaMovimentacaoInterna(row: TransferenciaAdministrativaLike): boolean {
  return String(row?.tipo || '').trim().toLowerCase() === 'transferencia'
    || Boolean(row?.aluno_id && row?.unidade_origem_id && row?.unidade_destino_id);
}

export function transferenciaContaComoMatriculaNovaAdministrativa(
  row: TransferenciaAdministrativaLike
): boolean {
  return !isTransferenciaMovimentacaoInterna(row);
}

export function transferenciaContaComoEvasaoAdministrativa(
  row: TransferenciaAdministrativaLike
): boolean {
  return !isTransferenciaMovimentacaoInterna(row);
}

const CODIGOS_TIPO_MATRICULA_FORA_NOVA_ADMIN = new Set([
  'BOLSISTA_INT',
  'BOLSISTA_PARC',
  'BANDA',
  'SEGUNDO_CURSO',
  'TRANSFERENCIA',
]);
