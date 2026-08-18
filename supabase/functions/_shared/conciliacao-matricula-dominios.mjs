/**
 * Delimita os domínios da conciliação de matrícula.
 *
 * `auto_preview` é uma fila de decisão humana exclusivamente para grade. Não
 * usar esta classificação para aplicar mudanças; ela existe para impedir que
 * metadados cadastrais ou financeiros sejam apresentados como Sync grade.
 */
export const CAMPOS_GRADE_MATRICULA = new Set([
  'curso_id',
  'professor_atual_id',
  'dia_aula',
  'horario_aula',
]);

export const CAMPOS_CADASTRO_MATRICULA = new Set([
  'telefone',
  'email',
  'responsavel_nome',
  'responsavel_telefone',
  'foto_url',
  'instagram',
]);

export const CAMPOS_FINANCEIRO_MATRICULA = new Set([
  'forma_pagamento_id',
  'status_pagamento',
]);

export const CAMPOS_VALORES_CONTRATO_MATRICULA = new Set([
  'valor_cheio',
  'desconto_fixo',
  'desconto_condicional',
  'valor_parcela',
  'data_fim_contrato',
  'status',
  'data_saida',
]);

function selecionarCampos(patch, campos) {
  return Object.fromEntries(
    Object.entries(patch || {}).filter(([campo, valor]) => (
      campos.has(campo) && valor !== undefined && valor !== null
    )),
  );
}

/**
 * Separa um patch, inclusive os registros legados mistos, sem supor que
 * ausência de campo ou item da fonte tenha qualquer significado financeiro.
 */
export function separarPatchConciliacaoMatricula(patch) {
  const seguro = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
  const grade = selecionarCampos(seguro, CAMPOS_GRADE_MATRICULA);
  const cadastro = selecionarCampos(seguro, CAMPOS_CADASTRO_MATRICULA);
  const financeiro = selecionarCampos(seguro, CAMPOS_FINANCEIRO_MATRICULA);
  const valoresContrato = selecionarCampos(seguro, CAMPOS_VALORES_CONTRATO_MATRICULA);
  const conhecidos = new Set([
    ...CAMPOS_GRADE_MATRICULA,
    ...CAMPOS_CADASTRO_MATRICULA,
    ...CAMPOS_FINANCEIRO_MATRICULA,
    ...CAMPOS_VALORES_CONTRATO_MATRICULA,
  ]);
  const desconhecidos = Object.fromEntries(
    Object.entries(seguro).filter(([campo, valor]) => (
      !conhecidos.has(campo) && valor !== undefined && valor !== null
    )),
  );

  const quantidadeGrade = Object.keys(grade).length;
  const quantidadeForaDaGrade = Object.keys(cadastro).length
    + Object.keys(financeiro).length
    + Object.keys(valoresContrato).length
    + Object.keys(desconhecidos).length;

  return {
    grade,
    cadastro,
    financeiro,
    valoresContrato,
    desconhecidos,
    ehSomenteGrade: quantidadeGrade > 0 && quantidadeForaDaGrade === 0,
  };
}
