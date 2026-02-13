import { useState } from 'react';
import { Check, CheckCheck, AlertCircle, Clock, Image, FileText, Download, Play, MapPin, User, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MensagemCRM } from '../../types';

interface ChatBubbleProps {
  mensagem: MensagemCRM;
  mensagemOriginal?: MensagemCRM | null;
  onResponder?: (mensagem: MensagemCRM) => void;
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

// Renderizar conteúdo de mídia dentro da bolha
function MidiaContent({ mensagem }: { mensagem: MensagemCRM }) {
  const [imagemExpandida, setImagemExpandida] = useState(false);
  const { tipo, conteudo, midia_url, midia_mimetype, midia_nome } = mensagem;

  switch (tipo) {
    case 'imagem':
      return (
        <div className="space-y-1.5">
          {midia_url ? (
            <>
              <img
                src={midia_url}
                alt={conteudo || 'Imagem'}
                className="rounded-lg max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition"
                onClick={() => setImagemExpandida(true)}
                loading="lazy"
              />
              {/* Lightbox */}
              {imagemExpandida && (
                <div
                  className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
                  onClick={() => setImagemExpandida(false)}
                >
                  <img
                    src={midia_url}
                    alt={conteudo || 'Imagem'}
                    className="max-w-full max-h-[90vh] object-contain rounded-lg"
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Image className="w-4 h-4" />
              <span>📷 Imagem</span>
            </div>
          )}
          {conteudo && (
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{conteudo}</p>
          )}
        </div>
      );

    case 'audio':
      return (
        <div className="min-w-[220px]">
          {midia_url ? (
            <audio controls className="w-full max-w-[280px] h-10" preload="metadata">
              <source src={midia_url} type={midia_mimetype || 'audio/ogg'} />
              Áudio não suportado
            </audio>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Play className="w-4 h-4" />
              <span>🎵 Áudio</span>
            </div>
          )}
        </div>
      );

    case 'video':
      return (
        <div className="space-y-1.5">
          {midia_url ? (
            <video
              controls
              className="rounded-lg max-w-full max-h-64"
              preload="metadata"
            >
              <source src={midia_url} type={midia_mimetype || 'video/mp4'} />
              Vídeo não suportado
            </video>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Play className="w-4 h-4" />
              <span>🎬 Vídeo</span>
            </div>
          )}
          {conteudo && (
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{conteudo}</p>
          )}
        </div>
      );

    case 'documento':
      return (
        <div className="space-y-1.5">
          {midia_url ? (
            <a
              href={midia_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/40 hover:bg-slate-700/60 transition group"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 truncate">{midia_nome || 'Documento'}</p>
                <p className="text-[10px] text-slate-500">{midia_mimetype || 'Arquivo'}</p>
              </div>
              <Download className="w-4 h-4 text-slate-400 group-hover:text-violet-400 transition flex-shrink-0" />
            </a>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <FileText className="w-4 h-4" />
              <span>📄 {midia_nome || 'Documento'}</span>
            </div>
          )}
          {conteudo && (
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">{conteudo}</p>
          )}
        </div>
      );

    case 'sticker':
      return midia_url ? (
        <img src={midia_url} alt="Sticker" className="w-32 h-32 object-contain" loading="lazy" />
      ) : (
        <span className="text-2xl">🏷️</span>
      );

    case 'localizacao':
      return (
        <div className="flex items-center gap-2 text-slate-300 text-sm">
          <MapPin className="w-4 h-4 text-red-400" />
          <span>📍 Localização: {conteudo || 'Enviada'}</span>
        </div>
      );

    case 'contato':
      return (
        <div className="flex items-center gap-2 text-slate-300 text-sm">
          <User className="w-4 h-4 text-blue-400" />
          <span>👤 Contato: {conteudo || 'Enviado'}</span>
        </div>
      );

    default:
      // Texto
      return (
        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap break-words">
          {conteudo || ''}
        </p>
      );
  }
}

export function ChatBubble({ mensagem, mensagemOriginal, onResponder }: ChatBubbleProps) {
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
  const isMidia = ['imagem', 'audio', 'video', 'documento', 'sticker'].includes(tipo);

  // Quote da mensagem original (reply)
  const quote = mensagem.reply_to_id && mensagemOriginal ? mensagemOriginal : null;

  return (
    <div className={cn(
      'group flex animate-in fade-in slide-in-from-bottom-2 duration-200',
      isSaida ? 'justify-end' : 'justify-start'
    )}>
      {/* Botão responder (hover, lado esquerdo para saída) */}
      {isSaida && onResponder && (
        <button
          onClick={() => onResponder(mensagem)}
          className="self-center mr-1 p-1.5 rounded-lg text-slate-600 hover:text-violet-400 hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-all"
          title="Responder"
        >
          <Reply className="w-4 h-4" />
        </button>
      )}
      <div className="max-w-[70%]">
        {/* Bolha */}
        <div className={cn(
          'rounded-2xl overflow-hidden',
          isMidia ? 'p-1.5' : 'px-4 py-2.5',
          isSaida
            ? 'bg-violet-600/20 border border-violet-500/20 rounded-tr-md'
            : 'bg-slate-800 border border-slate-700/50 rounded-tl-md'
        )}>
          {/* Quote (mensagem citada) */}
          {quote && (
            <div className="mb-2 px-3 py-1.5 rounded-lg bg-slate-700/40 border-l-2 border-violet-500">
              <p className="text-[10px] font-medium text-violet-400 mb-0.5">
                {quote.remetente_nome || (quote.direcao === 'saida' ? 'Você' : 'Lead')}
              </p>
              <p className="text-[11px] text-slate-400 line-clamp-2">
                {quote.tipo !== 'texto' ? `[${quote.tipo}] ` : ''}{quote.conteudo || ''}
              </p>
            </div>
          )}
          {isMidia && tipo !== 'audio' && (
            <div className="mb-1">
              <MidiaContent mensagem={mensagem} />
            </div>
          )}
          {isMidia && tipo === 'audio' && (
            <div className="px-2 py-1.5">
              <MidiaContent mensagem={mensagem} />
            </div>
          )}
          {!isMidia && (
            <MidiaContent mensagem={mensagem} />
          )}
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
      {/* Botão responder (hover, lado direito para entrada) */}
      {!isSaida && onResponder && (
        <button
          onClick={() => onResponder(mensagem)}
          className="self-center ml-1 p-1.5 rounded-lg text-slate-600 hover:text-violet-400 hover:bg-slate-800 opacity-0 group-hover:opacity-100 transition-all"
          title="Responder"
        >
          <Reply className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
