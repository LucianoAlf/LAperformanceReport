import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import type { FuncaoCaixa, WhatsAppConnectionStatus } from '../../types';

interface WhatsAppBannerProps {
  status: WhatsAppConnectionStatus;
  caixaNome?: string;
  /** Função da caixa vinculada à conversa selecionada (quando houver). */
  caixaFuncao?: FuncaoCaixa | null;
  /** Existe uma conversa selecionada, mas sem caixa nenhuma vinculada (caixa_id null). */
  temConversaSemCaixa?: boolean;
}

const FUNCOES_PRE_ATENDIMENTO: FuncaoCaixa[] = ['agente', 'ambos'];

export function WhatsAppBanner({ status, caixaNome, caixaFuncao, temConversaSemCaixa }: WhatsAppBannerProps) {
  const nomeCaixa = caixaNome || status.caixaNome;

  // Conversa vinculada a uma caixa que não é do Pré-Atendimento (ex: Lia/Sucesso do Aluno)
  // ou sem nenhuma caixa vinculada — não faz sentido herdar o status global de conexão.
  const caixaForaDoModulo = !!caixaFuncao && !FUNCOES_PRE_ATENDIMENTO.includes(caixaFuncao);
  if (caixaForaDoModulo || temConversaSemCaixa) {
    return (
      <div className="bg-amber-900/40 border-b border-amber-800/50 px-4 py-1.5 flex items-center gap-2 flex-shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs text-amber-300 font-medium">
          Nenhum número do Pré-Atendimento vinculado a esta conversa
        </span>
        {caixaForaDoModulo && nomeCaixa && (
          <span className="text-xs text-amber-500">— caixa atual: {nomeCaixa}</span>
        )}
      </div>
    );
  }

  if (status.connected) {
    return (
      <div className="bg-emerald-900/40 border-b border-emerald-800/50 px-4 py-1.5 flex items-center gap-2 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <Wifi className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs text-emerald-300 font-medium">WhatsApp conectado</span>
        {nomeCaixa && (
          <span className="text-xs text-emerald-500">— {nomeCaixa}</span>
        )}
        {status.phone && (
          <span className="text-xs text-emerald-500">• {status.phone}</span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-red-900/40 border-b border-red-800/50 px-4 py-2 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
        <WifiOff className="w-3.5 h-3.5 text-red-400" />
        <span className="text-xs text-red-300 font-semibold">WhatsApp desconectado</span>
        {nomeCaixa && (
          <span className="text-xs text-red-400">— {nomeCaixa}</span>
        )}
        {status.error && (
          <span className="text-xs text-red-400">• {status.error}</span>
        )}
      </div>
    </div>
  );
}
