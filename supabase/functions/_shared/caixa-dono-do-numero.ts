// Decide para onde vai a mensagem recebida na Caixa de Entrada, a partir da resposta de
// `resolver_aluno_caixa_por_telefone_v1`. Fica separada da edge porque e onde moram as tres
// armadilhas que ja custaram mensagem no passado, e todas se provam sem subir webhook:
//   - erro na resolucao NAO pode descartar a mensagem;
//   - "unico" sem aluno_id NAO pode virar conversa com dono indefinido;
//   - numero de irmaos NAO pode eleger um deles no palpite.
// @ts-nocheck

export interface ResolucaoDono {
  status?: string | null;
  aluno_id?: number | null;
  nome?: string | null;
  unidade_id?: string | null;
  candidatos?: unknown;
}

export type RotaDoNumero =
  | { rota: 'aluno'; aluno: { id: number; nome: string; unidade_id: string } }
  | { rota: 'externo'; motivo: 'sem_aluno' | 'ambiguo' | 'falha_na_resolucao'; candidatos?: unknown };

/**
 * `houveErro` e a falha da chamada da RPC. Conversa externa e recuperavel (a proxima
 * mensagem, ou o proximo envio nosso, vincula o aluno); mensagem descartada, nao.
 */
export function decidirRotaDoNumero(
  resolucao: ResolucaoDono | null | undefined,
  houveErro = false,
): RotaDoNumero {
  if (houveErro) return { rota: 'externo', motivo: 'falha_na_resolucao' };

  const status = resolucao?.status ?? null;

  if (status === 'ambiguo') {
    return { rota: 'externo', motivo: 'ambiguo', candidatos: resolucao?.candidatos ?? null };
  }

  if (status === 'unico') {
    const id = resolucao?.aluno_id;
    const unidadeId = resolucao?.unidade_id;
    // Resposta incompleta e defeito nosso, nao "aluno encontrado": gravar a conversa com
    // dono indefinido carimbaria o numero e o bloco de roteamento por conversa perpetuaria.
    if (typeof id === 'number' && Number.isFinite(id) && typeof unidadeId === 'string' && unidadeId) {
      return {
        rota: 'aluno',
        aluno: { id, nome: resolucao?.nome ?? 'Aluno', unidade_id: unidadeId },
      };
    }
    return { rota: 'externo', motivo: 'sem_aluno' };
  }

  return { rota: 'externo', motivo: 'sem_aluno' };
}
