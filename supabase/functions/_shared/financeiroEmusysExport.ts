export type DiaVarreduraFonte = {
  unidade_id: string;
  data: string;
  status: string;
  concluido_em: string | null;
  [campo: string]: unknown;
};

export type DiaVarreduraExportado = {
  data: string;
  status: string;
  concluido_em: string | null;
};

export function agruparDiasVarreduraPorUnidade(
  linhas: DiaVarreduraFonte[],
): Map<string, DiaVarreduraExportado[]> {
  const agrupados = new Map<string, DiaVarreduraExportado[]>();
  for (const linha of linhas) {
    const dias = agrupados.get(linha.unidade_id) ?? [];
    dias.push({
      data: linha.data,
      status: linha.status,
      concluido_em: linha.concluido_em,
    });
    agrupados.set(linha.unidade_id, dias);
  }
  for (const dias of agrupados.values()) {
    dias.sort((a, b) => a.data.localeCompare(b.data));
  }
  return agrupados;
}
