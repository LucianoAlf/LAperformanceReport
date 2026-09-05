export type ContratoAssinaturaObservacao = {
  unidade_id: string;
  emusys_matricula_id: string;
  emusys_aluno_id: string | null;
  contrato_emusys_id: string | null;
  contrato_assinado: boolean | null;
};

function idPositivoComoTexto(value: unknown, campo: string): string {
  const texto = String(value ?? '').trim();
  if (!/^[1-9]\d*$/.test(texto)) {
    throw new Error(`${campo} invalido`);
  }
  return texto;
}

function idOpcionalComoTexto(value: unknown): string | null {
  const texto = String(value ?? '').trim();
  return /^[1-9]\d*$/.test(texto) ? texto : null;
}

/**
 * Extrai somente a verdade sustentada por GET /matriculas.
 * `false` permanece booleano; a API nao informa motivo nem etapa da assinatura.
 */
export function normalizarMatriculaContrato(
  matricula: Record<string, unknown>,
  unidadeId: string,
): ContratoAssinaturaObservacao {
  const unidade = String(unidadeId ?? '').trim();
  if (!unidade) throw new Error('unidade invalida');

  const emusysMatriculaId = idPositivoComoTexto(matricula?.id, 'matricula.id');
  const aluno = matricula?.aluno && typeof matricula.aluno === 'object'
    ? matricula.aluno as Record<string, unknown>
    : null;
  const contrato = matricula?.contrato_atual;

  if (contrato === null || contrato === undefined) {
    return {
      unidade_id: unidade,
      emusys_matricula_id: emusysMatriculaId,
      emusys_aluno_id: idOpcionalComoTexto(aluno?.id),
      contrato_emusys_id: null,
      contrato_assinado: null,
    };
  }

  if (typeof contrato !== 'object' || Array.isArray(contrato)) {
    throw new Error('contrato_atual invalido');
  }

  const contratoRecord = contrato as Record<string, unknown>;
  const contratoId = idPositivoComoTexto(contratoRecord.id, 'contrato_atual.id');
  if (typeof contratoRecord.contrato_assinado !== 'boolean') {
    throw new Error('contrato_atual.contrato_assinado deve ser boolean');
  }

  return {
    unidade_id: unidade,
    emusys_matricula_id: emusysMatriculaId,
    emusys_aluno_id: idOpcionalComoTexto(aluno?.id),
    contrato_emusys_id: contratoId,
    contrato_assinado: contratoRecord.contrato_assinado,
  };
}
