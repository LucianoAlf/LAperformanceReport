export type EstadoAula =
  | 'visto'
  | 'ausente_no_snapshot_corrente'
  | 'movido'
  | 'cancelado'
  | 'historico_preservado';

export interface EstadoAulaInput {
  vistoNoSnapshotCorrente: boolean;
  presenteNoFechamentoHistorico?: boolean;
  movida?: boolean;
  cancelada?: boolean;
}

/** Classifica o estado sem transformar ausencia corrente em exclusao historica. */
export function classificarEstadoAula(input: EstadoAulaInput): EstadoAula {
  if (input.cancelada === true) return 'cancelado';
  if (input.movida === true) return 'movido';
  if (input.vistoNoSnapshotCorrente === true) return 'visto';
  if (input.presenteNoFechamentoHistorico === true) return 'historico_preservado';
  return 'ausente_no_snapshot_corrente';
}
