import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Phone, Info, Pause, Play, Send, FileText, Loader2, ChevronUp,
  Paperclip, ImageIcon, Mic, File, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { ChatBubble } from './ChatBubble';
import { TemplateSelector } from './TemplateSelector';
import type { ConversaCRM, MensagemCRM, LeadCRM } from '../../types';

interface ChatPanelProps {
  conversa: ConversaCRM;
  lead: LeadCRM;
  mensagens: MensagemCRM[];
  loading: boolean;
  enviando: boolean;
  temMais: boolean;
  onCarregarMais: () => void;
  onEnviarMensagem: (conteudo: string) => Promise<any>;
  onEnviarMidia: (arquivo: File, tipo: 'imagem' | 'audio' | 'video' | 'documento', caption?: string) => Promise<any>;
  onToggleFicha: () => void;
}

// Detectar tipo de mídia pelo MIME type
function detectarTipoMidia(file: File): 'imagem' | 'audio' | 'video' | 'documento' {
  if (file.type.startsWith('image/')) return 'imagem';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'documento';
}

// Formatar tamanho do arquivo
function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ChatPanel({
  conversa,
  lead,
  mensagens,
  loading,
  enviando,
  temMais,
  onCarregarMais,
  onEnviarMensagem,
  onEnviarMidia,
  onToggleFicha,
}: ChatPanelProps) {
  const [texto, setTexto] = useState('');
  const [templateAberto, setTemplateAberto] = useState(false);
  const [milaPausada, setMilaPausada] = useState(conversa.mila_pausada);
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false);
  const [arquivoPreview, setArquivoPreview] = useState<{ file: File; tipo: 'imagem' | 'audio' | 'video' | 'documento'; previewUrl?: string } | null>(null);
  const [captionMidia, setCaptionMidia] = useState('');
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMensagensLength = useRef(0);
  const inputImagemRef = useRef<HTMLInputElement>(null);
  const inputDocumentoRef = useRef<HTMLInputElement>(null);
  const inputAudioRef = useRef<HTMLInputElement>(null);

  // Scroll para o final quando novas mensagens chegam
  useEffect(() => {
    if (mensagens.length > prevMensagensLength.current) {
      const el = chatAreaRef.current;
      if (el) {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      }
    }
    prevMensagensLength.current = mensagens.length;
  }, [mensagens.length]);

  // Scroll inicial
  useEffect(() => {
    const el = chatAreaRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [conversa.id]);

  // Sync mila_pausada com conversa
  useEffect(() => {
    setMilaPausada(conversa.mila_pausada);
  }, [conversa.mila_pausada]);

  // Auto-resize textarea
  const handleTextareaInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 128) + 'px';
    }
  }, []);

  // Enviar mensagem
  const handleEnviar = useCallback(async () => {
    const msg = texto.trim();
    if (!msg || enviando) return;

    setTexto('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await onEnviarMensagem(msg);
  }, [texto, enviando, onEnviarMensagem]);

  // Enter para enviar, Shift+Enter para nova linha
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  }, [handleEnviar]);

  // Selecionar arquivo para envio
  const handleArquivoSelecionado = useCallback((e: React.ChangeEvent<HTMLInputElement>, tipoForcar?: 'imagem' | 'audio' | 'documento') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const tipo = tipoForcar || detectarTipoMidia(file);
    let previewUrl: string | undefined;

    if (tipo === 'imagem') {
      previewUrl = URL.createObjectURL(file);
    }

    setArquivoPreview({ file, tipo, previewUrl });
    setCaptionMidia('');
    setMenuAnexoAberto(false);

    // Limpar input para permitir re-selecionar o mesmo arquivo
    e.target.value = '';
  }, []);

  // Enviar mídia
  const handleEnviarMidia = useCallback(async () => {
    if (!arquivoPreview || enviando) return;

    const { file, tipo } = arquivoPreview;
    const caption = captionMidia.trim() || undefined;

    // Limpar preview
    if (arquivoPreview.previewUrl) {
      URL.revokeObjectURL(arquivoPreview.previewUrl);
    }
    setArquivoPreview(null);
    setCaptionMidia('');

    await onEnviarMidia(file, tipo, caption);
  }, [arquivoPreview, captionMidia, enviando, onEnviarMidia]);

  // Cancelar preview de mídia
  const handleCancelarMidia = useCallback(() => {
    if (arquivoPreview?.previewUrl) {
      URL.revokeObjectURL(arquivoPreview.previewUrl);
    }
    setArquivoPreview(null);
    setCaptionMidia('');
  }, [arquivoPreview]);

  // Fechar menu de anexo ao clicar fora
  useEffect(() => {
    if (!menuAnexoAberto) return;
    const handleClickFora = () => setMenuAnexoAberto(false);
    document.addEventListener('click', handleClickFora);
    return () => document.removeEventListener('click', handleClickFora);
  }, [menuAnexoAberto]);

  // Toggle Mila
  const handleToggleMila = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('toggle_mila_conversa', {
        p_conversa_id: conversa.id,
        p_pausar: !milaPausada,
        p_operador: 'andreza',
      });
      if (data?.success) {
        setMilaPausada(!milaPausada);
      }
    } catch (err) {
      console.error('[ChatPanel] Erro ao toggle Mila:', err);
    }
  }, [conversa.id, milaPausada]);

  // Usar template
  const handleUsarTemplate = useCallback((conteudo: string) => {
    // Substituir placeholders com dados do lead
    const texto = conteudo
      .replace(/\{nome\}/g, lead.nome || 'Lead')
      .replace(/\{curso\}/g, lead.cursos?.nome || 'música')
      .replace(/\{unidade\}/g, lead.unidades?.nome || 'LA Music')
      .replace(/\{data\}/g, lead.data_experimental || '__/__')
      .replace(/\{hora\}/g, lead.horario_experimental || '__:__');

    setTexto(texto);
    setTemplateAberto(false);
    textareaRef.current?.focus();
    requestAnimationFrame(handleTextareaInput);
  }, [lead, handleTextareaInput]);

  const isMila = conversa.atribuido_a === 'mila';
  const etapaNome = lead.crm_pipeline_etapas?.nome || lead.status || '';

  // Agrupar mensagens por data
  const mensagensComSeparadores = agruparPorData(mensagens);

  return (
    <div className="flex-1 flex flex-col bg-slate-900 min-w-0">
      {/* Header do Chat */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between flex-shrink-0 bg-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
            {getIniciais(lead.nome)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-white text-sm">{lead.nome || 'Lead'}</h3>
              {isMila && !milaPausada && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 font-medium">
                  🤖 Mila atendendo
                </span>
              )}
              {milaPausada && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 font-medium">
                  👩 Andreza atendendo
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              {lead.telefone || ''} · {lead.cursos?.nome || ''} · {lead.unidades?.codigo || ''} · {etapaNome}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Botão Pausar/Retomar Mila */}
          <button
            onClick={handleToggleMila}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition',
              milaPausada
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/30'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30'
            )}
          >
            {milaPausada ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {milaPausada ? 'Devolver p/ Mila' : 'Assumir conversa'}
          </button>
          {/* Botão Ligar */}
          <a
            href={`tel:${lead.telefone || ''}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition"
          >
            <Phone className="w-3.5 h-3.5" />
            Ligar
          </a>
          {/* Toggle ficha */}
          <button
            onClick={onToggleFicha}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition"
            title="Mostrar/ocultar ficha do lead"
          >
            <Info className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Área de mensagens */}
      <div
        ref={chatAreaRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
        style={{ background: 'linear-gradient(180deg, #0f172a 0%, #0d1424 100%)' }}
      >
        {/* Botão carregar mais */}
        {temMais && (
          <div className="flex justify-center">
            <button
              onClick={onCarregarMais}
              disabled={loading}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-400 transition px-3 py-1.5 rounded-lg bg-slate-800/50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronUp className="w-3 h-3" />}
              Carregar mensagens anteriores
            </button>
          </div>
        )}

        {loading && mensagens.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
          </div>
        )}

        {/* Mensagens */}
        {mensagensComSeparadores.map((item) => {
          if (item.tipo === 'separador') {
            return (
              <div key={item.key} className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-slate-700/50" />
                <span className="text-[10px] text-slate-500 font-medium bg-slate-800 px-3 py-1 rounded-full">
                  {item.label}
                </span>
                <div className="flex-1 h-px bg-slate-700/50" />
              </div>
            );
          }
          return <ChatBubble key={item.mensagem.id} mensagem={item.mensagem} />;
        })}
      </div>

      {/* Barra de templates */}
      {templateAberto && (
        <TemplateSelector
          onSelecionar={handleUsarTemplate}
          onFechar={() => setTemplateAberto(false)}
        />
      )}

      {/* Preview de mídia antes de enviar */}
      {arquivoPreview && (
        <div className="px-4 py-3 border-t border-slate-700 bg-slate-800/50 flex-shrink-0">
          <div className="flex items-start gap-3">
            {/* Preview */}
            <div className="flex-shrink-0">
              {arquivoPreview.tipo === 'imagem' && arquivoPreview.previewUrl ? (
                <img
                  src={arquivoPreview.previewUrl}
                  alt="Preview"
                  className="w-20 h-20 rounded-lg object-cover border border-slate-600"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-slate-700 flex items-center justify-center">
                  {arquivoPreview.tipo === 'audio' ? <Mic className="w-6 h-6 text-violet-400" /> :
                   arquivoPreview.tipo === 'video' ? <Play className="w-6 h-6 text-violet-400" /> :
                   <File className="w-6 h-6 text-violet-400" />}
                </div>
              )}
            </div>
            {/* Info + Caption */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm text-slate-300 truncate">{arquivoPreview.file.name}</p>
                <button
                  onClick={handleCancelarMidia}
                  className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-500 mb-2">{formatarTamanho(arquivoPreview.file.size)}</p>
              {arquivoPreview.tipo !== 'audio' && (
                <input
                  type="text"
                  value={captionMidia}
                  onChange={(e) => setCaptionMidia(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEnviarMidia(); }}
                  placeholder="Adicionar legenda..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 focus:ring-1 focus:ring-violet-500 outline-none"
                  autoFocus
                />
              )}
            </div>
            {/* Botão enviar */}
            <button
              onClick={handleEnviarMidia}
              disabled={enviando}
              className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition flex-shrink-0 self-end"
              title="Enviar mídia"
            >
              {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}

      {/* Input de mensagem */}
      {!arquivoPreview && (
        <div className="px-4 py-3 border-t border-slate-700 flex-shrink-0 bg-slate-800/30">
          <div className="flex items-end gap-2">
            {/* Botão anexar */}
            <div className="relative pb-1">
              <button
                onClick={(e) => { e.stopPropagation(); setMenuAnexoAberto(!menuAnexoAberto); }}
                className="p-2 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700 transition"
                title="Anexar arquivo"
              >
                <Paperclip className="w-5 h-5" />
              </button>
              {/* Menu dropdown de anexo */}
              {menuAnexoAberto && (
                <div
                  className="absolute bottom-full left-0 mb-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-1 min-w-[180px] z-10 animate-in fade-in slide-in-from-bottom-2 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => inputImagemRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-400" />
                    Imagem ou Vídeo
                  </button>
                  <button
                    onClick={() => inputDocumentoRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition"
                  >
                    <File className="w-4 h-4 text-blue-400" />
                    Documento
                  </button>
                  <button
                    onClick={() => inputAudioRef.current?.click()}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 hover:text-white transition"
                  >
                    <Mic className="w-4 h-4 text-amber-400" />
                    Áudio
                  </button>
                </div>
              )}
            </div>
            {/* Campo de texto */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                rows={1}
                value={texto}
                onChange={(e) => { setTexto(e.target.value); handleTextareaInput(); }}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua mensagem..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none max-h-32"
              />
            </div>
            {/* Botões */}
            <div className="flex items-center gap-1 pb-1">
              <button
                onClick={() => setTemplateAberto(!templateAberto)}
                className="p-2 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700 transition"
                title="Templates rápidos"
              >
                <FileText className="w-5 h-5" />
              </button>
              <button
                onClick={handleEnviar}
                disabled={!texto.trim() || enviando}
                className={cn(
                  'p-2.5 rounded-xl transition',
                  texto.trim() && !enviando
                    ? 'bg-violet-600 hover:bg-violet-500 text-white'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                )}
                title="Enviar"
              >
                {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inputs de arquivo ocultos */}
      <input
        ref={inputImagemRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => handleArquivoSelecionado(e)}
      />
      <input
        ref={inputDocumentoRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
        className="hidden"
        onChange={(e) => handleArquivoSelecionado(e, 'documento')}
      />
      <input
        ref={inputAudioRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => handleArquivoSelecionado(e, 'audio')}
      />
    </div>
  );
}

// Helpers

function getIniciais(nome: string | null): string {
  if (!nome) return '??';
  return nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

type SeparadorItem = { tipo: 'separador'; key: string; label: string };
type MensagemItem = { tipo: 'mensagem'; mensagem: MensagemCRM };

function agruparPorData(mensagens: MensagemCRM[]): (SeparadorItem | MensagemItem)[] {
  const resultado: (SeparadorItem | MensagemItem)[] = [];
  let ultimaData = '';

  for (const msg of mensagens) {
    const data = new Date(msg.created_at);
    const dataStr = data.toLocaleDateString('pt-BR');
    const hoje = new Date().toLocaleDateString('pt-BR');
    const ontem = new Date(Date.now() - 86400000).toLocaleDateString('pt-BR');

    if (dataStr !== ultimaData) {
      let label = dataStr;
      if (dataStr === hoje) {
        label = `Hoje, ${data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`;
      } else if (dataStr === ontem) {
        label = `Ontem, ${data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`;
      } else {
        label = data.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
      }
      resultado.push({ tipo: 'separador', key: `sep-${dataStr}`, label });
      ultimaData = dataStr;
    }

    resultado.push({ tipo: 'mensagem', mensagem: msg });
  }

  return resultado;
}
