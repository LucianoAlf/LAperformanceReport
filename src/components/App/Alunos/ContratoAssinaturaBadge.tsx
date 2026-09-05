import { CheckCircle2, CircleSlash2, FileX2, ShieldQuestion } from 'lucide-react';
import {
  apresentarContratoAssinatura,
  formatarObservacaoContrato,
  type ContratoAssinaturaStatus,
} from '@/lib/contratoAssinatura';

type Props = {
  status: ContratoAssinaturaStatus | string | null | undefined;
  contrato_dado_fresco: boolean;
  observadoEm?: string | null;
  loading?: boolean;
  detalhado?: boolean;
};

const ICONES = {
  assinado: CheckCircle2,
  sem_assinatura_eletronica: ShieldQuestion,
  sem_contrato: FileX2,
  nao_verificado: ShieldQuestion,
  dispensado: CircleSlash2,
};

export function ContratoAssinaturaBadge({
  status,
  contrato_dado_fresco,
  observadoEm,
  loading = false,
  detalhado = false,
}: Props) {
  const apresentacao = apresentarContratoAssinatura(loading ? 'nao_verificado' : status);
  const Icon = ICONES[apresentacao.status];
  const label = loading ? 'Verificando contrato' : apresentacao.label;
  const frescor = contrato_dado_fresco ? 'Reconciliação de hoje concluída.' : 'Dado não confirmado hoje.';
  const title = `${apresentacao.descricao} ${frescor}`;

  return (
    <span
      aria-label={`Contrato: ${label}`}
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${apresentacao.classes}`}
    >
      <Icon className={`h-3 w-3 ${loading ? 'animate-pulse' : ''}`} aria-hidden="true" />
      <span>{label}</span>
      {detalhado && (
        <span className="font-normal opacity-75">
          · Observado pelo LA Report em {formatarObservacaoContrato(observadoEm)}
        </span>
      )}
    </span>
  );
}
