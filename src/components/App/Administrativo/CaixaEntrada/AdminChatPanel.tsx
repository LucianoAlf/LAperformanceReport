import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Image, FileText, Music, Video, Loader2, ChevronUp, Check, CheckCheck, Clock, AlertCircle, User, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminConversa, AdminMensagem, AlunoInbox } from './types';

function getStatusAlunoTag(status: string | null | undefined) {
  if (!status || status === 'ativo') return null;
  const map: Record<string, { label: string; classes: string }> = {
    aviso_previo: { label: 'Aviso Previo', classes: 'bg-orange-500/20 text-orange-400' },
    trancado: { label: 'Trancado', classes: 'bg-yellow-500/20 text-yellow-400' },
    inativo: { label: 'Inativo', classes: 'bg-slate-500/20 text-slate-400' },
  };
  return map[status] || null;
}

interface AdminChatPanelProps {
  conversa: AdminConversa;
  aluno: AlunoInbox | null;
  mensagens: AdminMensagem[];
  loading: boolean;
  enviando: boolean;
  temMais: boolean;
  onCarregarMais: () => void;
  onEnviarMensagem: (conteudo: string) => Promise<any>;
  onEnviarMidia: (arquivo: File, tipo: 'imagem' | 'audio' | 'video' | 'documento', caption?: string) => Promise<any>;
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'enviando': return <Clock className="w-3 h-3 text-slate-500" />;
    case 'enviada': return <Check className="w-3 h-3 text-slate-500" />;
    case 'entregue': return <CheckCheck className="w-3 h-3 text-slate-500" />;
    case 'lida': return <CheckCheck className="w-3 h-3 text-blue-400" />;
    case 'erro': return <AlertCircle className="w-3 h-3 text-red-400" />;
    default: return null;
  }
}

function formatarHoraMsg(data: string): string {
  return new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function MidiaRender({ msg }: { msg: AdminMensagem }) {
  if (!msg.midia_url) return null;

  if (msg.tipo === 'imagem') {
    return (
      <img
        src={msg.midia_url}
        alt={msg.midia_nome || 'Imagem'}
        className="max-w-[280px] max-h-[300px] rounded-lg object-cover cursor-pointer"
        onClick={() => window.open(msg.midia_url!, '_blank')}
      />
    );
  }

  if (msg.tipo === 'audio') {
    return <audio controls src={msg.midia_url} className="max-w-[260px]" />;
  }

  if (msg.tipo === 'video') {
    return (
      <video controls src={msg.midia_url} className="max-w-[280px] max-h-[240px] rounded-lg" />
    );
  }

  if (msg.tipo === 'documento') {
    return (
      <a
        href={msg.midia_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition text-sm"
      >
        <FileText className="w-4 h-4 text-violet-400 flex-shrink-0" />
        <span className="text-slate-200 truncate">{msg.midia_nome || 'Documento'}</span>
      </a>
    );
  }

  return null;
}

function ChatBubble({ msg }: { msg: AdminMensagem }) {
  const isSaida = msg.direcao === 'saida';
  const isSistema = msg.remetente === 'sistema';

  if (isSistema) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[10px] text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">
          {msg.conteudo}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex mb-2', isSaida ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[70%] rounded-2xl px-3.5 py-2',
        isSaida
          ? 'bg-violet-600/80 text-white rounded-br-md'
          : 'bg-slate-700/70 text-slate-200 rounded-bl-md'
      )}>
        {/* Nome do remetente */}
        {!isSaida && (
          <p className="text-[10px] font-semibold text-slate-400 mb-0.5">
            {msg.remetente_nome || 'Aluno'}
          </p>
        )}
        {isSaida && msg.remetente_nome && (
          <p className="text-[10px] font-semibold text-violet-200/70 mb-0.5">
            {msg.remetente_nome}
          </p>
        )}

        {/* Mídia */}
        <MidiaRender msg={msg} />

        {/* Texto */}
        {msg.conteudo && (
          <p className="text-sm whitespace-pre-wrap break-words">{msg.conteudo}</p>
        )}

        {/* Hora + Status */}
        <div className={cn('flex items-center gap-1 mt-1', isSaida ? 'justify-end' : 'justify-start')}>
          <span className={cn('text-[10px]', isSaida ? 'text-violet-200/50' : 'text-slate-500')}>
            {formatarHoraMsg(msg.created_at)}
          </span>
          {isSaida && <StatusIcon status={msg.status_entrega} />}
        </div>
      </div>
    </div>
  );
}

export function AdminChatPanel({
  conversa,
  aluno,
  mensagens,
  loading,
  enviando,
  temMais,
  onCarregarMais,
  onEnviarMensagem,
  onEnviarMidia,
}: AdminChatPanelProps) {
  const [texto, setTexto] = useState('');
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tipoUpload, setTipoUpload] = useState<'imagem' | 'audio' | 'video' | 'documento'>('imagem');

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensagens]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [texto]);

  const handleEnviar = useCallback(async () => {
    if (!texto.trim() || enviando) return;
    const msg = texto;
    setTexto('');
    await onEnviarMensagem(msg);
  }, [texto, enviando, onEnviarMensagem]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  }, [handleEnviar]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onEnviarMidia(file, tipoUpload);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setMenuAnexoAberto(false);
  }, [onEnviarMidia, tipoUpload]);

  const abrirUpload = useCallback((tipo: 'imagem' | 'audio' | 'video' | 'documento') => {
    setTipoUpload(tipo);
    setMenuAnexoAberto(false);
    setTimeout(() => fileInputRef.current?.click(), 50);
  }, []);

  const acceptMap = {
    imagem: 'image/*',
    audio: 'audio/*',
    video: 'video/*',
    documento: '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv',
  };

  return (
    <div className="flex-1 flex flex-col" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #0d1424 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          {aluno ? (
            <>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                {aluno.nome?.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '??'}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{aluno.nome}</p>
                <p className="text-[11px] text-slate-500">
                  {aluno.cursos?.nome || 'Sem curso'} · {aluno.telefone || aluno.whatsapp || 'Sem telefone'}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white">
                <Phone className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {conversa.nome_externo || conversa.telefone_externo || 'Contato desconhecido'}
                </p>
                <p className="text-[11px] text-slate-500">
                  {conversa.telefone_externo || 'Sem telefone'}
                </p>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!aluno && (
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-slate-600/30 text-slate-400">
              Nao cadastrado
            </span>
          )}
          {(() => {
            const statusAluno = getStatusAlunoTag(aluno?.status);
            return statusAluno ? (
              <span className={cn('text-[9px] px-2 py-0.5 rounded-full font-bold uppercase', statusAluno.classes)}>
                {statusAluno.label}
              </span>
            ) : null;
          })()}
          {aluno?.status_pagamento && (
            <span className={cn(
              'text-[9px] px-2 py-0.5 rounded-full font-bold uppercase',
              aluno.status_pagamento === 'em_dia' ? 'bg-emerald-500/20 text-emerald-400' :
              aluno.status_pagamento === 'atrasado' ? 'bg-yellow-500/20 text-yellow-400' :
              'bg-red-500/20 text-red-400'
            )}>
              {aluno.status_pagamento === 'em_dia' ? 'Em dia' : aluno.status_pagamento === 'atrasado' ? 'Atrasado' : 'Inadimplente'}
            </span>
          )}
        </div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Carregar mais */}
        {temMais && (
          <div className="flex justify-center mb-4">
            <button
              onClick={onCarregarMais}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-violet-400 transition"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronUp className="w-3 h-3" />}
              Mensagens anteriores
            </button>
          </div>
        )}

        {loading && mensagens.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        ) : mensagens.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <User className="w-8 h-8 text-slate-600 mb-2" />
            <p className="text-sm text-slate-500">Nenhuma mensagem ainda</p>
            <p className="text-xs text-slate-600 mt-1">Envie a primeira mensagem para {aluno?.nome?.split(' ')[0] || conversa.nome_externo?.split(' ')[0] || 'este contato'}</p>
          </div>
        ) : (
          mensagens.map(msg => <ChatBubble key={msg.id} msg={msg} />)
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-700/50">
        <div className="flex items-end gap-2">
          {/* Botão anexo */}
          <div className="relative">
            <button
              onClick={() => setMenuAnexoAberto(prev => !prev)}
              className="p-2 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700/50 transition"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            {menuAnexoAberto && (
              <div className="absolute bottom-12 left-0 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1.5 min-w-[160px] z-10">
                <button onClick={() => abrirUpload('imagem')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 transition">
                  <Image className="w-4 h-4 text-emerald-400" /> Imagem
                </button>
                <button onClick={() => abrirUpload('audio')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 transition">
                  <Music className="w-4 h-4 text-cyan-400" /> Áudio
                </button>
                <button onClick={() => abrirUpload('video')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 transition">
                  <Video className="w-4 h-4 text-purple-400" /> Vídeo
                </button>
                <button onClick={() => abrirUpload('documento')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 transition">
                  <FileText className="w-4 h-4 text-orange-400" /> Documento
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptMap[tipoUpload]}
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite uma mensagem..."
            rows={1}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
          />

          {/* Botão enviar */}
          <button
            onClick={handleEnviar}
            disabled={!texto.trim() || enviando}
            className={cn(
              'p-2.5 rounded-xl transition',
              texto.trim() && !enviando
                ? 'bg-violet-600 text-white hover:bg-violet-500'
                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
            )}
          >
            {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
