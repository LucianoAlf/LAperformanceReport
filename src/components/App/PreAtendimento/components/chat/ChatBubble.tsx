import { Check, CheckCheck, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MensagemCRM } from '../../types';

interface ChatBubbleProps {
  mensagem: MensagemCRM;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'enviando':
      return <Clock className="w-3.5 h-3.5 text-slate-500" />;
    case 'enviada':
      return <Check className="w-3.5 h-3.5 text-slate-400" />;
    case 'entregue':
      return <CheckCheck className="w-3.5 h-3.5 text-slate-400" />;
    case 'lida':
      return <CheckCheck className="w-3.5 h-3.5 text-blue-400" />;
    case 'erro':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    default:
      return null;
  }
}

function getRemetenteTag(remetente: string) {
  switch (remetente) {
    case 'mila':
      return { label: '🤖 Mila', classes: 'bg-cyan-500/15 text-cyan-400' };
    case 'andreza':
      return { label: '👩 Andreza', classes: 'bg-violet-500/15 text-violet-400' };
    default:
      return null;
  }
}

function formatarHora(data: string): string {
  return new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ChatBubble({ mensagem }: ChatBubbleProps) {
  const { direcao, tipo, conteudo, remetente, remetente_nome, status_entrega, is_sistema, created_at } = mensagem;

  // Mensagem de sistema (centralizada)
  if (is_sistema || tipo === 'sistema') {
    const isMilaPausada = conteudo?.includes('assumiu') || conteudo?.includes('pausada');
    const isMilaRetomada = conteudo?.includes('retomou');
    const isBastao = conteudo?.includes('bastão') || conteudo?.includes('passou');

    let bgClass = 'bg-slate-800/60 border-slate-700/30';
    let textClass = 'text-slate-400';

    if (isMilaPausada) {
      bgClass = 'bg-violet-900/30 border-violet-700/30';
      textClass = 'text-violet-300';
    } else if (isMilaRetomada) {
      bgClass = 'bg-cyan-900/30 border-cyan-700/30';
      textClass = 'text-cyan-300';
    } else if (isBastao) {
      bgClass = 'bg-amber-900/30 border-amber-700/30';
      textClass = 'text-amber-300';
    }

    return (
      <div className="flex justify-center animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className={cn('border rounded-lg px-4 py-1.5 max-w-md', bgClass)}>
          <p className={cn('text-[11px] text-center', textClass)}>
            {conteudo} · {formatarHora(created_at)}
          </p>
        </div>
      </div>
    );
  }

  const isSaida = direcao === 'saida';
  const tag = isSaida ? getRemetenteTag(remetente) : null;

  return (
    <div className={cn(
      'flex animate-in fade-in slide-in-from-bottom-2 duration-200',
      isSaida ? 'justify-end' : 'justify-start'
    )}>
      <div className="max-w-[70%]">
        {/* Bolha */}
        <div className={cn(
          'rounded-2xl px-4 py-2.5',
          isSaida
            ? 'bg-violet-600/20 border border-violet-500/20 rounded-tr-md'
            : 'bg-slate-800 border border-slate-700/50 rounded-tl-md'
        )}>
          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
            {conteudo || ''}
          </p>
        </div>

        {/* Metadados */}
        <div className={cn(
          'flex items-center gap-1.5 mt-1 px-1',
          isSaida ? 'justify-end' : 'justify-start'
        )}>
          {/* Tag do remetente (saída) */}
          {tag && (
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded font-medium', tag.classes)}>
              {tag.label}
            </span>
          )}
          {/* Nome do lead (entrada) */}
          {!isSaida && (
            <span className="text-[10px] text-slate-500">
              {remetente_nome || 'Lead'}
            </span>
          )}
          {/* Separador */}
          {!isSaida && <span className="text-[10px] text-slate-600">·</span>}
          {/* Hora */}
          <span className="text-[10px] text-slate-500">{formatarHora(created_at)}</span>
          {/* Status de entrega (saída) */}
          {isSaida && <StatusIcon status={status_entrega} />}
        </div>
      </div>
    </div>
  );
}
