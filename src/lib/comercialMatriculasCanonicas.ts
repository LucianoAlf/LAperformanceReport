type Relation<T> = T | T[] | null | undefined;

export interface MatriculaComercialCanonicaLike {
  data_matricula?: string | null;
  valor_parcela?: number | string | null;
  valor_passaporte?: number | string | null;
  is_segundo_curso?: boolean | null;
  is_banda?: boolean | null;
  status?: string | null;
  curso_nome?: string | null;
  cursos?: Relation<{
    nome?: string | null;
    is_projeto_banda?: boolean | null;
  }>;
  tipos_matricula?: Relation<{
    codigo?: string | null;
    conta_como_pagante?: boolean | null;
    entra_ticket_medio?: boolean | null;
  }>;
}

export function firstRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export function toComercialMoneyNumber(valor: unknown): number {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  if (typeof valor === 'string') {
    const trimmed = valor.trim();
    const normalizado = trimmed.includes(',')
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed;
    const numero = Number(normalizado);
    return Number.isFinite(numero) ? numero : 0;
  }
  return 0;
}

export const CODIGOS_TIPO_MATRICULA_FORA_NOVA_COMERCIAL = new Set([
  'BOLSISTA_INT',
  'BOLSISTA_PARC',
  'BANDA',
  'SEGUNDO_CURSO',
  'TRANSFERENCIA',
]);

export function isTipoMatriculaForaNovaComercial(codigo: unknown): boolean {
  return CODIGOS_TIPO_MATRICULA_FORA_NOVA_COMERCIAL.has(
    String(codigo || '').trim().toUpperCase(),
  );
}

export function ehMatriculaComercialCanonica(
  matricula: MatriculaComercialCanonicaLike,
): boolean {
  const tipo = firstRelation(matricula.tipos_matricula);
  const curso = firstRelation(matricula.cursos);
  const cursoNome = String(curso?.nome || matricula.curso_nome || '').toLowerCase();
  const status = String(matricula.status || '').toLowerCase();
  const ehBanda =
    matricula.is_banda === true ||
    curso?.is_projeto_banda === true ||
    cursoNome.includes('banda');
  const ehCoral = cursoNome.includes('canto coral');
  const codigoTipo = String(tipo?.codigo || '').toUpperCase();

  if (status === 'excluido' || status === 'excluida' || status === 'cancelado' || status === 'cancelada') {
    return false;
  }
  if (matricula.is_segundo_curso === true) return false;
  if (ehBanda || ehCoral) return false;
  if (isTipoMatriculaForaNovaComercial(codigoTipo)) return false;

  return (
    (tipo?.conta_como_pagante === true || tipo?.entra_ticket_medio === true) &&
    toComercialMoneyNumber(matricula.valor_parcela) > 0
  );
}

export function calcularFinanceiroMatriculasCanonicas<T extends MatriculaComercialCanonicaLike>(
  matriculas: T[],
) {
  const matriculasCanonicas = matriculas.filter(ehMatriculaComercialCanonica);
  const matriculasComPassaporte = matriculasCanonicas.filter(
    (matricula) => toComercialMoneyNumber(matricula.valor_passaporte) > 0,
  );
  const matriculasComParcela = matriculasCanonicas.filter(
    (matricula) => toComercialMoneyNumber(matricula.valor_parcela) > 0,
  );
  const faturamentoPassaportes = matriculasComPassaporte.reduce(
    (acc, matricula) => acc + toComercialMoneyNumber(matricula.valor_passaporte),
    0,
  );
  const faturamentoParcelas = matriculasCanonicas.reduce(
    (acc, matricula) => acc + toComercialMoneyNumber(matricula.valor_parcela),
    0,
  );

  return {
    matriculasCanonicas,
    matriculasComPassaporte,
    matriculasComParcela,
    faturamentoPassaportes,
    faturamentoParcelas,
    ticketMedioPassaporte:
      matriculasComPassaporte.length > 0
        ? faturamentoPassaportes / matriculasComPassaporte.length
        : 0,
    ticketMedioParcela:
      matriculasComParcela.length > 0
        ? faturamentoParcelas / matriculasComParcela.length
        : 0,
  };
}

export function calcularTicketParcelaCanonicoPorMes<T extends MatriculaComercialCanonicaLike>(
  matriculas: T[],
  meses: number[],
): Map<number, number> {
  const mesesPermitidos = new Set(meses);
  const acumulado = new Map<number, { total: number; quantidade: number }>();

  matriculas.filter(ehMatriculaComercialCanonica).forEach((matricula) => {
    const mes = Number(String(matricula.data_matricula || '').slice(5, 7));
    if (!mesesPermitidos.has(mes)) return;

    const atual = acumulado.get(mes) || { total: 0, quantidade: 0 };
    atual.total += toComercialMoneyNumber(matricula.valor_parcela);
    atual.quantidade += 1;
    acumulado.set(mes, atual);
  });

  return new Map(
    Array.from(acumulado.entries()).map(([mes, item]) => [
      mes,
      item.quantidade > 0 ? Math.round(item.total / item.quantidade) : 0,
    ]),
  );
}
