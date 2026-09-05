export const CONTRATO_ASSINATURA_STATUS = [
  'assinado',
  'nao_assinado',
  'sem_contrato',
  'nao_verificado',
  'dispensado',
] as const;

export type ContratoAssinaturaStatus = typeof CONTRATO_ASSINATURA_STATUS[number];

type ApresentacaoContrato = {
  status: ContratoAssinaturaStatus;
  label: string;
  descricao: string;
  classes: string;
};

const APRESENTACOES: Record<ContratoAssinaturaStatus, Omit<ApresentacaoContrato, 'status'>> = {
  assinado: {
    label: 'Contrato assinado',
    descricao: 'O Emusys informa contrato_assinado=true. Isso confirma a assinatura, mas não informa o modo nem a data real.',
    classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  },
  nao_assinado: {
    label: 'Não assinado',
    descricao: 'O Emusys informa contrato_assinado=false. O LA Report não sabe se o contrato ainda não foi enviado ou se aguarda a assinatura do aluno.',
    classes: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  },
  sem_contrato: {
    label: 'Sem contrato no Emusys',
    descricao: 'A matrícula ativa foi observada sem contrato_atual.',
    classes: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  },
  nao_verificado: {
    label: 'Contrato não verificado',
    descricao: 'O LA Report não possui reconciliação fresca e completa para afirmar o estado.',
    classes: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
  },
  dispensado: {
    label: 'Contrato dispensado',
    descricao: 'A pessoa possui somente matrícula explicitamente classificada como projeto, banda, coral ou atividade extra.',
    classes: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  },
};

export function normalizarContratoAssinaturaStatus(value: unknown): ContratoAssinaturaStatus {
  return CONTRATO_ASSINATURA_STATUS.includes(value as ContratoAssinaturaStatus)
    ? value as ContratoAssinaturaStatus
    : 'nao_verificado';
}

export function apresentarContratoAssinatura(value: unknown): ApresentacaoContrato {
  const status = normalizarContratoAssinaturaStatus(value);
  return { status, ...APRESENTACOES[status] };
}

export function formatarObservacaoContrato(value: string | null | undefined): string {
  if (!value) return 'Ainda não observado';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Ainda não observado';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}
