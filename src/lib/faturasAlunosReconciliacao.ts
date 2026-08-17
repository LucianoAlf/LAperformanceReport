export type ReconciliationDecisionType =
  | 'pagamento_confirmado'
  | 'renovacao'
  | 'trancamento'
  | 'ultima_parcela_aviso_previo'
  | 'conferido_sem_cobranca';

export type ReconciliationGuidance =
  | {
      kind: 'decision';
      title: string;
      instruction: string;
      options: Array<{ value: ReconciliationDecisionType; label: string }>;
    }
  | {
      kind: 'payment_method';
      title: string;
      instruction: string;
      options: [];
    }
  | {
      kind: 'outside_operation';
      title: string;
      instruction: string;
      options: [];
    }
  | {
      kind: 'review';
      title: string;
      instruction: string;
      options: [];
    };

type ReconciliationGuidanceInput = {
  motivos?: string[];
  aluno?: {
    id?: number | null;
    nome?: string | null;
    estado_operacional?: string | null;
  };
  forma_pagamento?: {
    nome?: string | null;
    fonte?: string | null;
  };
};

const DECISION_OPTIONS: Array<{ value: ReconciliationDecisionType; label: string }> = [
  { value: 'pagamento_confirmado', label: 'Pagamento confirmado pela unidade' },
  { value: 'renovacao', label: 'Renovação / primeira parcela em nova data' },
  { value: 'trancamento', label: 'Trancamento' },
  { value: 'ultima_parcela_aviso_previo', label: 'Última parcela / aviso prévio' },
  { value: 'conferido_sem_cobranca', label: 'Conferido — não cobrar nesta competência' },
];

export function getReconciliationGuidance(item: ReconciliationGuidanceInput): ReconciliationGuidance {
  const motivos = new Set(item.motivos ?? []);
  if (motivos.has('historico_ex_aluno') || motivos.has('registro_nao_aluno')) {
    return {
      kind: 'outside_operation',
      title: 'Fora da cobrança operacional',
      instruction: 'Este registro fica no histórico e não entra na fila de cobrança de alunos.',
      options: [],
    };
  }
  if (motivos.has('source_missing') && item.aluno?.id != null) {
    return {
      kind: 'decision',
      title: 'Confirme o que aconteceu com esta fatura',
      instruction: 'Selecione o caso e registre a decisão aqui; isso tira o ruído da fila sem inventar um pagamento no Emusys.',
      options: DECISION_OPTIONS,
    };
  }
  if (motivos.has('forma_pagamento_ausente') || item.forma_pagamento?.fonte === 'ausente') {
    return {
      kind: 'payment_method',
      title: 'Informe a forma de pagamento',
      instruction: 'Escolha a forma usada pela família. Isso corrige o cadastro local e não altera o status da fatura.',
      options: [],
    };
  }
  return {
    kind: 'review',
    title: 'Revisão necessária',
    instruction: 'Confira os dados de origem e resolva a pendência com os identificadores exatos.',
    options: [],
  };
}
