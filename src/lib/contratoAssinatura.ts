export const CONTRATO_ASSINATURA_STATUS = [
  'assinado',
  'sem_assinatura_eletronica',
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
    label: 'Assinado eletronicamente',
    descricao: 'O Emusys informa contrato_assinado=true pelo fluxo eletrônico. Isso não informa a data real da assinatura.',
    classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  },
  sem_assinatura_eletronica: {
    label: 'Sem assinatura eletrônica',
    descricao: 'O Emusys só informa a assinatura eletrônica. Contrato assinado manualmente aparece aqui e não é pendência. Conferir a data de assinatura na tela do Emusys.',
    classes: 'border-slate-500/40 bg-slate-500/10 text-slate-300',
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
