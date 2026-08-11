export type LeadIdDecision =
  | { acao: 'preencher'; valor: number }
  | { acao: 'manter'; valor: number }
  | { acao: 'auditar_divergencia'; local: number; remoto: number }
  | { acao: 'sem_dado' };

export interface LeadIdReconciliationInput {
  unidadeId: string;
  local: number | null;
  emusys: number | null;
}

/**
 * Decide apenas o estado do identificador. A unidade faz parte do contrato
 * para obrigar o chamador a resolver a linha no escopo correto; esta funcao
 * nunca consulta ou cruza nomes de alunos.
 */
export function decidirLeadId(input: LeadIdReconciliationInput): LeadIdDecision {
  void input.unidadeId;
  if (input.emusys == null) return { acao: 'sem_dado' };
  if (input.local == null) return { acao: 'preencher', valor: input.emusys };
  if (input.local === input.emusys) return { acao: 'manter', valor: input.local };
  return {
    acao: 'auditar_divergencia',
    local: input.local,
    remoto: input.emusys,
  };
}
