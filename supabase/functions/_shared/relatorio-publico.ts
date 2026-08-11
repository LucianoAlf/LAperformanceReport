const TERMOS_TECNICOS_PUBLICOS = [
  /\bget_[a-z0-9_]+\b/i,
  /\b(?:GET|POST|PATCH|DELETE)\s+\//i,
  /\bRPC\b/i,
  /\bsnapshot\b/i,
  /\bcoorte\b/i,
  /\bfonte\s+can[oô]nica\b/i,
  /\bcan[oô]nico\s+v\d+\b/i,
  /\bAmerica\/Sao_Paulo\b/i,
] as const;

// UTF-8 recodificado como Latin-1/Windows-1252 aparece como "NÃ£o",
// "â€¢" ou "ðŸ…". Bloqueamos esse estado antes de gravar/enviar a fila;
// uma mensagem pública corrompida não deve ser considerada um envio válido.
const PADRAO_MOJIBAKE_UTF8 = /(?:[ÃÂ](?=[\u0080-\uFFFF])|â[\u0080-\uFFFF]|ðŸ|�)/u;

export function formatarDataPublica(dataIso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataIso);
  if (!match) {
    throw new Error("RELATORIO_DATA_PUBLICA_INVALIDA");
  }

  const [, ano, mes, dia] = match;
  const anoNumero = Number(ano);
  const mesNumero = Number(mes);
  const diaNumero = Number(dia);
  const data = new Date(Date.UTC(anoNumero, mesNumero - 1, diaNumero));
  if (
    data.getUTCFullYear() !== anoNumero ||
    data.getUTCMonth() !== mesNumero - 1 ||
    data.getUTCDate() !== diaNumero
  ) {
    throw new Error("RELATORIO_DATA_PUBLICA_INVALIDA");
  }

  return `${dia}/${mes}/${ano}`;
}

export function formatarDataHoraPublica(
  dataIso: string,
  hora?: string | null,
): string {
  const data = formatarDataPublica(dataIso);
  const horaCurta = hora?.trim().slice(0, 5);
  return horaCurta ? `${data} às ${horaCurta}` : data;
}

export function validarTextoPublicoRelatorio(texto: string): string {
  if (PADRAO_MOJIBAKE_UTF8.test(texto)) {
    throw new Error("RELATORIO_TEXTO_ENCODING");
  }
  if (TERMOS_TECNICOS_PUBLICOS.some((padrao) => padrao.test(texto))) {
    throw new Error("RELATORIO_TEXTO_TECNICO");
  }
  return texto;
}
