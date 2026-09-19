export type EmusysMatriculaCpfParaHmac = {
  emusys_matricula_id: number;
  emusys_aluno_id: number | null;
  aluno_id: number | null;
  emusys_responsavel_id: number | null;
  aluno_cpf: string | null;
  responsavel_cpf: string | null;
};

function numeroFinitoOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export function normalizarCpfDigitos(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const digitos = String(valor).replace(/\D/g, '');
  return digitos.length === 11 ? digitos : null;
}

function chaveContemCpfClaro(chave: string): boolean {
  const normalizada = chave
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return normalizada.includes('cpf') && !normalizada.includes('hash');
}

/**
 * Clona um valor JSON removendo qualquer chave que represente CPF em claro.
 * Campos de digest, como `cpf_hash`, sao preservados.
 */
export function removerCpfClaro(valor: unknown): unknown {
  if (Array.isArray(valor)) {
    return valor.map((item) => removerCpfClaro(item));
  }
  if (valor && typeof valor === 'object') {
    const limpo: Record<string, unknown> = {};
    for (const [chave, conteudo] of Object.entries(valor as Record<string, unknown>)) {
      if (chaveContemCpfClaro(chave)) continue;
      limpo[chave] = removerCpfClaro(conteudo);
    }
    return limpo;
  }
  return valor;
}

/**
 * Extrai o minimo necessario para a RPC calcular os HMACs no banco. Os digitos
 * existem somente neste objeto transitorio e nunca devem ser logados.
 */
export function extrairMatriculasCpfParaHmac(
  matriculas: Iterable<unknown>,
  alunoIdPorMatriculaEmusys: Map<number, number>,
  alunoIdPorAlunoEmusys: Map<number, number>,
): EmusysMatriculaCpfParaHmac[] {
  const resultado: EmusysMatriculaCpfParaHmac[] = [];

  for (const valor of matriculas) {
    const matricula = valor as Record<string, any>;
    const emusysMatriculaId = numeroFinitoOuNull(matricula?.id);
    if (emusysMatriculaId === null) continue;

    const emusysAlunoId = numeroFinitoOuNull(matricula?.aluno?.id);
    const alunoId = alunoIdPorMatriculaEmusys.get(emusysMatriculaId)
      ?? (emusysAlunoId === null ? null : alunoIdPorAlunoEmusys.get(emusysAlunoId))
      ?? null;

    resultado.push({
      emusys_matricula_id: emusysMatriculaId,
      emusys_aluno_id: emusysAlunoId,
      aluno_id: alunoId,
      emusys_responsavel_id: numeroFinitoOuNull(matricula?.responsavel?.id),
      aluno_cpf: normalizarCpfDigitos(matricula?.aluno?.cpf),
      responsavel_cpf: normalizarCpfDigitos(matricula?.responsavel?.cpf),
    });
  }

  return resultado;
}
