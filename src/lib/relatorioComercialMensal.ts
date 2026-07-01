export type RangeRelatorioMensalComercial = {
  ano: number;
  mes: number;
  dataInicio: string;
  dataFim: string;
  dataInicioObj: Date;
  dataFimObj: Date;
  periodoLabel: string;
};

const formatarDataISO = (data: Date) => {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
};

export function calcularRangeRelatorioMensalComercial(
  ano: number,
  mes: number
): RangeRelatorioMensalComercial {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    throw new Error(`Competencia mensal comercial invalida: ${ano}/${mes}`);
  }

  const dataInicioObj = new Date(ano, mes - 1, 1);
  const dataFimObj = new Date(ano, mes, 0);
  const mesNome = dataInicioObj.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();

  return {
    ano,
    mes,
    dataInicio: formatarDataISO(dataInicioObj),
    dataFim: formatarDataISO(dataFimObj),
    dataInicioObj,
    dataFimObj,
    periodoLabel: `${mesNome}/${ano}`,
  };
}
