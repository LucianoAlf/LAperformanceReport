export interface DataPrevistaAvisoValidada {
  dataPrevista: string | null;
  fonteInvalida: boolean;
}

/**
 * Valida a única invariável cronológica que a fonte precisa respeitar.
 * Não calcula uma data substituta: quando o Emusys se contradiz, o payload
 * bruto continua no log e o dado inválido não vira cobrança automática.
 */
export function validarDataPrevistaAviso(
  dataAviso: string | null,
  dataPrevista: string | null,
): DataPrevistaAvisoValidada {
  if (!dataPrevista) {
    return { dataPrevista: null, fonteInvalida: false };
  }
  if (dataAviso && dataPrevista < dataAviso) {
    return { dataPrevista: null, fonteInvalida: true };
  }
  return { dataPrevista, fonteInvalida: false };
}
