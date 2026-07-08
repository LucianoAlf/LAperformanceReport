import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Send, Paperclip, Image, FileText, Music, Video, Loader2, ChevronUp, Check, CheckCheck, Clock, AlertCircle, User, Phone, Mic, X, Play, Pause, Settings, Trash2, Pencil, Zap, MapPin, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { Tooltip } from '@/components/ui/Tooltip';
import { formatarWhatsApp } from '@/lib/whatsappFormat';
import { TemplateSelector, isTemplateAutomacao } from '@/components/App/PreAtendimento/components/chat/TemplateSelector';
import type { VcardChip } from '@/components/App/PreAtendimento/components/chat/TemplateSelector';
import { useVcardsUnidade } from '@/components/App/SucessoCliente/hooks/useVcardsUnidade';
import { ModalGerenciarTemplates } from '@/components/App/PreAtendimento/components/chat/ModalGerenciarTemplates';
import type { TemplateWhatsApp } from '@/components/App/PreAtendimento/types';
import { toast } from 'sonner';
import type { AdminConversa, AdminMensagem, AlunoInbox } from './types';
import { parseVcard } from './parseVcard';
import { VcardPreview } from '@/components/App/SucessoCliente/VcardPreview';

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
  onApagarMensagem?: (id: string) => void;
  onEditarMensagem?: (id: string, novoConteudo: string) => void;
  /** Caixa de templates a usar (cada caixa tem suas mensagens prontas). */
  contexto?: string;
  /** Nome do usuário logado, para registrar autoria ao disparar cartões de contato. */
  remetenteNome?: string;
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

function AudioPlayer({ src, isSaida }: { src: string; isSaida: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoaded = () => setDuration(audio.duration || 0);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => { setPlaying(false); setCurrentTime(0); };

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); } else { audio.play(); }
    setPlaying(!playing);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(audio.currentTime);
  };

  const formatTime = (s: number) => {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2.5 min-w-[200px] max-w-[260px]">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        onClick={togglePlay}
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition',
          isSaida
            ? 'bg-white/20 hover:bg-white/30 text-white'
            : 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-400'
        )}
      >
        {playing
          ? <Pause className="w-4 h-4" />
          : <Play className="w-4 h-4 ml-0.5" />
        }
      </button>

      <div className="flex-1 min-w-0">
        {/* Barra de progresso */}
        <div
          className={cn(
            'h-1.5 rounded-full cursor-pointer relative',
            isSaida ? 'bg-white/20' : 'bg-slate-600'
          )}
          onClick={handleSeek}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all',
              isSaida ? 'bg-white/70' : 'bg-violet-400'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Tempo */}
        <div className="flex justify-between mt-1">
          <span className={cn('text-[10px]', isSaida ? 'text-violet-100/60' : 'text-slate-500')}>
            {formatTime(playing ? currentTime : duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

function MidiaRender({ msg, isSaida }: { msg: AdminMensagem; isSaida: boolean }) {
  if (msg.tipo === 'contato') {
    const { fullName, telefones, organizacao } = parseVcard(msg.conteudo);
    const nome = msg.midia_nome || fullName || 'Contato';
    return <VcardPreview compact fullName={nome} telefones={telefones} organizacao={organizacao} />;
  }

  if (msg.tipo === 'localizacao') {
    const [lat, lng] = (msg.conteudo || '').split(',').map(s => s.trim());
    if (!lat || !lng) return <span className="text-sm text-slate-300">📍 Localização</span>;
    const href = `https://www.google.com/maps?q=${lat},${lng}`;
    // Se houver miniatura do mapa (JPEGThumbnail), mostra a imagem clicável; senão, só o link.
    if (msg.midia_url) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={msg.midia_url}
            alt="Localização"
            className="max-w-[260px] max-h-[180px] rounded-lg object-cover"
            loading="lazy"
          />
          <span className="flex items-center gap-1.5 mt-1 text-xs text-rose-400">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" /> Abrir no mapa
          </span>
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition text-sm"
      >
        <MapPin className="w-4 h-4 text-rose-400 flex-shrink-0" />
        <span className="text-slate-200">Abrir localização no mapa</span>
      </a>
    );
  }

  if (msg.tipo === 'sticker') {
    return msg.midia_url ? (
      <img src={msg.midia_url} alt="Sticker" className="w-32 h-32 object-contain" loading="lazy" />
    ) : (
      <span className="text-2xl">🏷️</span>
    );
  }

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
    return <AudioPlayer src={msg.midia_url} isSaida={isSaida} />;
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

type SeparadorItem = { tipo: 'separador'; key: string; label: string };
type MensagemItem = { tipo: 'mensagem'; mensagem: AdminMensagem };

function agruparPorData(mensagens: AdminMensagem[]): (SeparadorItem | MensagemItem)[] {
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

function ChatBubble({ msg, onApagar, onEditar, nomeAgente }: { msg: AdminMensagem; onApagar?: (id: string) => void; onEditar?: (msg: AdminMensagem) => void; nomeAgente?: string }) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  // Fala do agente/bot: enviada pelo nosso lado (remetente='sistema'), mas NÃO é aviso de sistema.
  // O aviso de sistema legítimo usa tipo='sistema' e segue como pílula centralizada.
  const isAgente = msg.remetente === 'sistema' && msg.tipo !== 'sistema';
  const isSaida = msg.direcao === 'saida';
  const isSistema = msg.tipo === 'sistema';
  const podeEditar = isSaida && msg.tipo === 'texto' && !!msg.whatsapp_message_id;

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const MENU_W = 180;
    const MENU_H = podeEditar ? 88 : 48;
    const x = Math.min(e.clientX, window.innerWidth - MENU_W - 8);
    const y = Math.min(e.clientY, window.innerHeight - MENU_H - 8);
    setMenuPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }, [podeEditar]);

  const handleApagar = useCallback(() => {
    setMenuPos(null);
    onApagar?.(msg.id);
  }, [msg.id, onApagar]);

  const handleEditar = useCallback(() => {
    setMenuPos(null);
    onEditar?.(msg);
  }, [msg, onEditar]);

  useEffect(() => {
    if (!menuPos) return;
    const fechar = () => setMenuPos(null);
    const t = setTimeout(() => {
      document.addEventListener('mousedown', fechar);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', fechar);
    };
  }, [menuPos]);

  let interativoData: { texto: string; opcoes: { id: string; label: string }[] } | null = null;
  if (msg.tipo === 'interativo' && msg.conteudo) {
    try { interativoData = JSON.parse(msg.conteudo); } catch { /* fallback texto */ }
  }

  let carrosselData: { texto: string; cards: { nome: string; cargo: string; foto: string | null }[]; botao?: { texto: string; url: string } } | null = null;
  if (msg.tipo === 'carrossel' && msg.conteudo) {
    try { carrosselData = JSON.parse(msg.conteudo); } catch { /* fallback texto */ }
  }

  if (isSistema) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[10px] text-slate-500 bg-slate-800/50 px-3 py-1 rounded-full">
          {msg.conteudo}
        </span>
      </div>
    );
  }

  if (msg.deletada) {
    return (
      <div className={cn('flex mb-2', isSaida ? 'justify-end' : 'justify-start')}>
        <div className={cn(
          'flex items-center gap-1.5 px-3.5 py-2 rounded-2xl border border-dashed text-xs italic',
          isSaida
            ? 'border-violet-500/30 text-violet-300/40 rounded-br-md'
            : 'border-slate-600/40 text-slate-600 rounded-bl-md'
        )}>
          <Trash2 className="w-3 h-3 opacity-50" />
          Mensagem apagada
        </div>
      </div>
    );
  }

  return (
    <>
      {menuPos && createPortal(
        <div
          className="fixed z-[9999] bg-slate-800 border border-slate-700 rounded-lg shadow-2xl py-1 min-w-[160px]"
          style={{ top: menuPos.y, left: menuPos.x }}
          onMouseDown={e => e.stopPropagation()}
        >
          {podeEditar && (
            <button
              onMouseDown={e => { e.stopPropagation(); handleEditar(); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700/50 transition"
            >
              <Pencil className="w-3.5 h-3.5" />
              Editar mensagem
            </button>
          )}
          <button
            onMouseDown={e => { e.stopPropagation(); handleApagar(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Apagar mensagem
          </button>
        </div>,
        document.body
      )}
    <div className={cn('flex mb-2', isSaida ? 'justify-end' : 'justify-start')} onContextMenu={handleContextMenu}>
      <div className={cn(
        'max-w-[70%] rounded-2xl px-3.5 py-2',
        isAgente
          ? 'bg-cyan-600/25 border border-cyan-400/25 text-slate-100 rounded-br-md'
          : isSaida
          ? 'bg-violet-600/80 text-white rounded-br-md'
          : 'bg-slate-700/70 text-slate-200 rounded-bl-md'
      )}>
        {/* Nome do remetente */}
        {isAgente ? (
          <p className="text-[10px] font-semibold text-cyan-300 mb-0.5 flex items-center gap-1">
            <Bot className="w-3 h-3" />
            {nomeAgente || 'Assistente'}
          </p>
        ) : !isSaida ? (
          <p className="text-[10px] font-semibold text-slate-400 mb-0.5">
            {msg.remetente_nome || 'Aluno'}
          </p>
        ) : msg.remetente_nome ? (
          <p className="text-[10px] font-semibold text-violet-200/70 mb-0.5">
            {msg.remetente_nome}
          </p>
        ) : null}

        {/* Mídia */}
        <MidiaRender msg={msg} isSaida={isSaida} />

        {/* Conteúdo */}
        {carrosselData ? (
          <div className="flex flex-col gap-2 min-w-[240px]">
            <p className="text-sm whitespace-pre-wrap break-words">{formatarWhatsApp(carrosselData.texto)}</p>
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5">
              {(carrosselData.cards || []).map((c, i) => (
                <div key={i} className="flex-shrink-0 w-24 bg-slate-900/50 border border-slate-600/40 rounded-xl overflow-hidden">
                  {c.foto ? (
                    <img src={c.foto} alt={c.nome} className="w-24 h-24 object-cover" loading="lazy" />
                  ) : (
                    <div className="w-24 h-24 bg-slate-700/60 flex items-center justify-center">
                      <User className="w-7 h-7 text-slate-400" />
                    </div>
                  )}
                  <div className="p-1.5">
                    <p className="text-[11px] font-semibold text-slate-100 truncate">{c.nome}</p>
                    <p className="text-[10px] text-slate-400 truncate">{c.cargo}</p>
                  </div>
                </div>
              ))}
            </div>
            {carrosselData.botao?.url && (
              <a
                href={carrosselData.botao.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-center text-xs font-medium text-violet-200 bg-white/10 border border-white/20 rounded-lg py-1.5 hover:bg-white/20 transition"
              >
                {carrosselData.botao.texto || 'Abrir'}
              </a>
            )}
          </div>
        ) : interativoData ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm whitespace-pre-wrap break-words">{formatarWhatsApp(interativoData.texto)}</p>
            <div className="flex flex-wrap gap-1.5 mt-0.5">
              {interativoData.opcoes.map((op) => (
                <span
                  key={op.id}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-full border cursor-default select-none',
                    isSaida
                      ? 'border-white/30 bg-white/10 text-violet-100'
                      : 'border-slate-500/50 bg-slate-600/40 text-slate-300'
                  )}
                >
                  {op.label}
                </span>
              ))}
            </div>
          </div>
        ) : (msg.conteudo && msg.tipo !== 'contato' && msg.tipo !== 'localizacao') ? (
          <p className="text-sm whitespace-pre-wrap break-words">{formatarWhatsApp(msg.conteudo)}</p>
        ) : null}

        {/* Hora + Status */}
        <div className={cn('flex items-center gap-1 mt-1', isSaida ? 'justify-end' : 'justify-start')}>
          {msg.editada && (
            <span className={cn('text-[10px] italic', isAgente ? 'text-cyan-200/50' : isSaida ? 'text-violet-200/40' : 'text-slate-600')}>
              editada
            </span>
          )}
          <span className={cn('text-[10px]', isAgente ? 'text-cyan-200/60' : isSaida ? 'text-violet-200/50' : 'text-slate-500')}>
            {formatarHoraMsg(msg.created_at)}
          </span>
          {isSaida && msg.status_entrega === 'erro' ? (
            <Tooltip content={msg.erro_motivo || 'Falha ao enviar mensagem'} side="top">
              <span className="cursor-help"><StatusIcon status={msg.status_entrega} /></span>
            </Tooltip>
          ) : isSaida ? (
            <StatusIcon status={msg.status_entrega} />
          ) : null}
        </div>

        {/* Reações */}
        {msg.reacoes && msg.reacoes.length > 0 && (
          <div className={cn('flex gap-1 mt-0.5 px-1', isSaida ? 'justify-end' : 'justify-start')}>
            {msg.reacoes.map((r, i) => (
              <span
                key={`${r.emoji}-${i}`}
                className="text-sm bg-slate-800/80 border border-slate-700/50 rounded-full px-1.5 py-0.5 cursor-default hover:scale-110 transition-transform"
              >
                {r.emoji}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
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
  onApagarMensagem,
  onEditarMensagem,
  contexto = 'administrativo',
  remetenteNome = 'Admin',
}: AdminChatPanelProps) {
  const [texto, setTexto] = useState('');
  const [editandoMsg, setEditandoMsg] = useState<AdminMensagem | null>(null);
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false);
  const [templateAberto, setTemplateAberto] = useState(false);
  const [templateDropdownAberto, setTemplateDropdownAberto] = useState(false);
  const [templateFiltroInicial, setTemplateFiltroInicial] = useState('');
  const [modalTemplatesAberto, setModalTemplatesAberto] = useState(false);
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(conversa.foto_perfil_url || null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tipoUpload, setTipoUpload] = useState<'imagem' | 'audio' | 'video' | 'documento'>('imagem');
  const [automacaoConfirmar, setAutomacaoConfirmar] = useState<TemplateWhatsApp | null>(null);
  const [disparandoAutomacao, setDisparandoAutomacao] = useState(false);

  // Cartões de contato (vCard) — só no inbox Sucesso do Aluno.
  // O hook é sempre chamado (regra dos hooks); o resultado só é usado quando há unidade real,
  // pois 'todos' carregaria cartões de todas as unidades.
  const unidadeCartoes = contexto === 'sucesso_aluno'
    ? (aluno?.unidade_id || conversa.unidade_id || null)
    : null;
  // Nome do agente/bot vem da CAIXA da conversa (ex.: "Lia - Sucesso do Aluno" → "Lia").
  // NÃO usar remetente_nome: o webhook grava "Sol" fixo/legado (caixa renomeada de Sol→Lia).
  const nomeAgente = conversa.caixa?.nome?.split(/[-–—]/)[0].trim() || 'Assistente';

  const mensagensComSeparadores = useMemo(() => agruparPorData(mensagens), [mensagens]);

  const { cartoes: vcardsRaw } = useVcardsUnidade(unidadeCartoes || 'todos');
  const vcards: VcardChip[] = (contexto === 'sucesso_aluno' && unidadeCartoes)
    ? vcardsRaw.map(c => ({ id: c.id, titulo: c.titulo, full_name: c.full_name, qtdTelefones: c.telefones.length }))
    : [];

  // Dispara um cartão de contato na conversa (envio direto, sem modal).
  const dispararVcard = useCallback(async (vcardId: string) => {
    let jid = conversa.whatsapp_jid;
    if (!jid) {
      const tel = (aluno?.whatsapp || aluno?.telefone || '').replace(/\D/g, '');
      if (!tel) { toast.error('Conversa sem telefone para envio'); return; }
      jid = `${tel.startsWith('55') ? tel : '55' + tel}@s.whatsapp.net`;
    }
    try {
      const { data, error } = await supabase.functions.invoke('enviar-vcard', {
        body: { vcardId, numeroDestino: jid, conversaId: conversa.id, remetenteNome },
      });
      if (error || !data?.ok) {
        toast.error('Falha ao enviar cartão: ' + (data?.erro || error?.message || 'erro desconhecido'));
      } else {
        toast.success('Cartão enviado');
        // A timeline atualiza via realtime (useAdminMensagens assina INSERT de admin_mensagens).
      }
    } catch (err: any) {
      toast.error('Erro ao enviar cartão: ' + (err?.message || 'desconhecido'));
    }
  }, [conversa.whatsapp_jid, conversa.id, aluno, remetenteNome]);

  // Sync foto from conversa prop
  useEffect(() => {
    setFotoPerfil(conversa.foto_perfil_url || null);
  }, [conversa.id, conversa.foto_perfil_url]);

  // Buscar foto de perfil se nao cacheada
  useEffect(() => {
    if (conversa.foto_perfil_url || !conversa.whatsapp_jid) return;

    supabase.functions.invoke('buscar-foto-perfil', {
      body: {
        conversa_id: conversa.id,
        whatsapp_jid: conversa.whatsapp_jid,
        tabela: 'admin_conversas',
      },
    }).then(({ data }) => {
      if (data?.foto_perfil_url) {
        setFotoPerfil(data.foto_perfil_url);
      }
    }).catch(() => {});
  }, [conversa.id, conversa.foto_perfil_url, conversa.whatsapp_jid]);

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
    if (editandoMsg) {
      const id = editandoMsg.id;
      setEditandoMsg(null);
      setTexto('');
      onEditarMensagem?.(id, msg);
      return;
    }
    setTexto('');
    await onEnviarMensagem(msg);
  }, [texto, enviando, onEnviarMensagem, editandoMsg, onEditarMensagem]);

  const handleIniciarEdicao = useCallback((m: AdminMensagem) => {
    setEditandoMsg(m);
    setTexto(m.conteudo || '');
    setTemplateAberto(false);
    setTemplateDropdownAberto(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleCancelarEdicao = useCallback(() => {
    setEditandoMsg(null);
    setTexto('');
  }, []);

  // Detectar / no início do texto para abrir dropdown de templates
  const handleTextoChange = useCallback((novoTexto: string) => {
    setTexto(novoTexto);
    if (novoTexto.startsWith('/')) {
      setTemplateFiltroInicial(novoTexto.slice(1));
      setTemplateDropdownAberto(true);
    } else if (templateDropdownAberto) {
      setTemplateDropdownAberto(false);
    }
  }, [templateDropdownAberto]);

  // Aplicar template: substitui placeholders com dados do aluno/contato
  const handleUsarTemplate = useCallback((conteudo: string) => {
    const nome = aluno?.nome || conversa.nome_externo || 'aluno';
    const textoFinal = conteudo
      .replace(/\{nome\}/g, nome)
      .replace(/\{curso\}/g, aluno?.cursos?.nome || 'seu curso')
      .replace(/\{unidade\}/g, aluno?.unidades?.nome || 'LA Music');

    setTexto(textoFinal);
    setTemplateDropdownAberto(false);
    setTemplateAberto(false);
    textareaRef.current?.focus();
  }, [aluno, conversa.nome_externo]);

  // Roteia a seleção de mensagem pronta: automação dispara ação; texto comum preenche o campo.
  const handleSelecionarTemplate = useCallback((t: TemplateWhatsApp) => {
    setTemplateDropdownAberto(false);
    setTemplateAberto(false);
    if (isTemplateAutomacao(t.tipo)) {
      setTexto('');
      setAutomacaoConfirmar(t);
    } else {
      handleUsarTemplate(t.conteudo);
    }
  }, [handleUsarTemplate]);

  // Dispara a automação confirmada (hoje: pesquisa pós-1ª aula com botões).
  const dispararAutomacao = useCallback(async () => {
    if (!automacaoConfirmar) return;
    setDisparandoAutomacao(true);
    try {
      let jid = conversa.whatsapp_jid;
      let alunoPayload: Record<string, unknown>;

      if (aluno) {
        const { data: alunoRow } = await supabase
          .from('alunos')
          .select('data_matricula')
          .eq('id', aluno.id)
          .maybeSingle();

        if (!jid) {
          const tel = (aluno.whatsapp || aluno.telefone || '').replace(/\D/g, '');
          if (!tel) { toast.error('Aluno sem telefone para envio'); setDisparandoAutomacao(false); return; }
          jid = `${tel.startsWith('55') ? tel : '55' + tel}@s.whatsapp.net`;
        }

        alunoPayload = {
          aluno_id: aluno.id,
          unidade_id: aluno.unidade_id || conversa.unidade_id,
          whatsapp_jid: jid,
          nome: aluno.nome,
          curso: aluno.cursos?.nome || null,
          data_matricula: alunoRow?.data_matricula || new Date().toISOString().slice(0, 10),
        };
      } else {
        // Contato externo: sem registro no banco, só envia a mensagem
        if (!jid) { toast.error('Conversa sem JID para envio'); setDisparandoAutomacao(false); return; }
        alunoPayload = {
          aluno_id: null,
          unidade_id: conversa.unidade_id,
          whatsapp_jid: jid,
          nome: conversa.nome_externo || null,
          curso: null,
          data_matricula: new Date().toISOString().slice(0, 10),
        };
      }

      const { data, error } = await supabase.functions.invoke('enviar-pesquisa-pos-primeira-aula', {
        body: { alunos: [alunoPayload] },
      });

      const resultado = (data as any)?.resultados?.[0];
      if (error || (resultado && !resultado.ok)) {
        toast.error('Falha ao enviar a pesquisa: ' + (resultado?.erro || error?.message || 'erro desconhecido'));
      } else {
        toast.success('Pesquisa de 1ª aula enviada');
      }
    } catch (err: any) {
      toast.error('Erro ao disparar a pesquisa: ' + (err?.message || 'desconhecido'));
    } finally {
      setDisparandoAutomacao(false);
      setAutomacaoConfirmar(null);
    }
  }, [automacaoConfirmar, aluno, conversa.whatsapp_jid, conversa.unidade_id, conversa.nome_externo]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Se o dropdown de templates está aberto, deixa ele capturar as teclas de navegação
    if (templateDropdownAberto && ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  }, [handleEnviar, templateDropdownAberto]);

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

  // === Gravação de áudio ===
  const [gravando, setGravando] = useState(false);
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const pararTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const limparGravacao = useCallback(() => {
    pararTimer();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setGravando(false);
    setTempoGravacao(0);
  }, [pararTimer]);

  const iniciarGravacao = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start();
      setGravando(true);
      setTempoGravacao(0);
      timerRef.current = setInterval(() => setTempoGravacao(prev => prev + 1), 1000);
    } catch {
      // Permissão negada ou mic indisponível
    }
  }, []);

  const enviarGravacao = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const ext = recorder.mimeType.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: recorder.mimeType });
      limparGravacao();
      await onEnviarMidia(file, 'audio');
    };
    recorder.stop();
  }, [limparGravacao, onEnviarMidia]);

  const cancelarGravacao = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    limparGravacao();
  }, [limparGravacao]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      pararTimer();
    };
  }, [pararTimer]);

  const formatarTempo = (s: number) => {
    const min = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

  return (
    <div className="flex-1 flex flex-col" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #0d1424 100%)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
        <div className="flex items-center gap-3">
          {aluno ? (
            <>
              {fotoPerfil ? (
                <img
                  src={fotoPerfil}
                  alt={aluno.nome}
                  className="w-9 h-9 rounded-full object-cover"
                  onError={() => setFotoPerfil(null)}
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                  {aluno.nome?.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '??'}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-white">{aluno.nome}</p>
                <p className="text-[11px] text-slate-500">
                  {aluno.cursos?.nome || 'Sem curso'} · {aluno.telefone || aluno.whatsapp || 'Sem telefone'}
                </p>
                {aluno.responsavel_nome && aluno.responsavel_nome.trim().toLowerCase() !== aluno.nome.trim().toLowerCase() && (
                  <p className="text-[11px] text-violet-300 flex items-center gap-1 mt-0.5">
                    <User className="w-2.5 h-2.5 flex-shrink-0" />
                    Falando com o responsável: {aluno.responsavel_nome}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              {fotoPerfil ? (
                <img
                  src={fotoPerfil}
                  alt={conversa.nome_externo || 'Contato'}
                  className="w-9 h-9 rounded-full object-cover"
                  onError={() => setFotoPerfil(null)}
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white">
                  <Phone className="w-4 h-4" />
                </div>
              )}
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
          mensagensComSeparadores.map(item => {
            if (item.tipo === 'separador') {
              return (
                <div key={item.key} className="flex items-center gap-3 py-2">
                  <div className="flex-1 h-px bg-slate-700/50" />
                  <span className="text-[10px] text-slate-500 font-medium bg-slate-800 px-3 py-1 rounded-full capitalize">
                    {item.label}
                  </span>
                  <div className="flex-1 h-px bg-slate-700/50" />
                </div>
              );
            }
            return (
              <ChatBubble
                key={item.mensagem.id}
                msg={item.mensagem}
                onApagar={onApagarMensagem}
                onEditar={handleIniciarEdicao}
                nomeAgente={nomeAgente}
              />
            );
          })
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-700/50">
        {/* Banner de edição */}
        {editandoMsg && (
          <div className="mb-2 flex items-center gap-2 bg-violet-500/10 border-l-2 border-violet-500 rounded px-3 py-2">
            <Pencil className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-violet-400">Editando mensagem</p>
              <p className="text-xs text-slate-400 truncate">{editandoMsg.conteudo}</p>
            </div>
            <button
              onClick={handleCancelarEdicao}
              className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700/50 transition flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {/* Barra de templates (botões) */}
        {!gravando && templateAberto && (
          <div className="mb-2">
            <TemplateSelector
              contexto={contexto}
              onSelecionar={handleUsarTemplate}
              onSelecionarTemplate={handleSelecionarTemplate}
              onFechar={() => setTemplateAberto(false)}
              vcards={vcards}
              onSelecionarVcard={dispararVcard}
            />
          </div>
        )}
        {gravando ? (
          /* === Modo Gravação === */
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
            <button
              onClick={cancelarGravacao}
              className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-400 transition"
            >
              <X className="w-4 h-4" />
              Cancelar
            </button>

            <div className="flex-1 flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm font-mono text-red-400">{formatarTempo(tempoGravacao)}</span>
            </div>

            <button
              onClick={enviarGravacao}
              className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-500 transition"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        ) : (
          /* === Modo Normal === */
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
                    <Music className="w-4 h-4 text-cyan-400" /> Áudio (arquivo)
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

            {/* Botão templates rápidos */}
            <Tooltip content="Mensagens prontas" side="top">
              <button
                onClick={() => setTemplateAberto(prev => !prev)}
                className={cn(
                  'p-2 rounded-lg transition',
                  templateAberto
                    ? 'text-violet-400 bg-slate-700/50'
                    : 'text-slate-400 hover:text-violet-400 hover:bg-slate-700/50'
                )}
              >
                <FileText className="w-5 h-5" />
              </button>
            </Tooltip>

            {/* Botão gerenciar mensagens prontas */}
            <Tooltip content="Gerenciar mensagens prontas" side="top">
              <button
                onClick={() => setModalTemplatesAberto(true)}
                className="p-2 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700/50 transition"
              >
                <Settings className="w-5 h-5" />
              </button>
            </Tooltip>

            {/* Textarea + dropdown de templates */}
            <div className="flex-1 relative">
              {templateDropdownAberto && (
                <TemplateSelector
                  modo="dropdown"
                  contexto={contexto}
                  filtroInicial={templateFiltroInicial}
                  onSelecionar={handleUsarTemplate}
                  onSelecionarTemplate={handleSelecionarTemplate}
                  onFechar={() => { setTemplateDropdownAberto(false); setTexto(''); textareaRef.current?.focus(); }}
                  vcards={vcards}
                  onSelecionarVcard={dispararVcard}
                />
              )}
              <textarea
                ref={textareaRef}
                value={texto}
                onChange={e => handleTextoChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite uma mensagem... (/ para mensagens prontas)"
                rows={1}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none"
              />
            </div>

            {/* Botão mic ou enviar */}
            {texto.trim() ? (
              <button
                onClick={handleEnviar}
                disabled={enviando}
                className={cn(
                  'p-2.5 rounded-xl transition',
                  !enviando
                    ? 'bg-violet-600 text-white hover:bg-violet-500'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                )}
              >
                {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              </button>
            ) : (
              <button
                onClick={iniciarGravacao}
                className="p-2.5 rounded-xl bg-violet-600 text-white hover:bg-violet-500 transition"
              >
                <Mic className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal de gerenciamento de mensagens prontas (filtrado pela caixa) */}
      <ModalGerenciarTemplates
        aberto={modalTemplatesAberto}
        onFechar={() => setModalTemplatesAberto(false)}
        contexto={contexto}
      />

      {/* Confirmação de automação (ex: pesquisa pós-1ª aula com botões) */}
      {automacaoConfirmar && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4" onClick={() => !disparandoAutomacao && setAutomacaoConfirmar(null)}>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-sm w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-400" />
              </span>
              <h3 className="text-sm font-semibold text-white">{automacaoConfirmar.nome}</h3>
            </div>
            {aluno ? (
              <p className="text-sm text-slate-300 mb-4">
                Enviar a <strong>pesquisa de 1ª aula com botões</strong> para <strong>{aluno.nome}</strong>
                {aluno.cursos?.nome ? <> ({aluno.cursos.nome})</> : null}? O nome e o curso são preenchidos automaticamente e a resposta fica registrada.
              </p>
            ) : (
              <p className="text-sm text-slate-300 mb-4">
                Enviar a <strong>pesquisa de 1ª aula</strong> para <strong>{conversa.nome_externo || conversa.telefone_externo || 'contato externo'}</strong>?
                <span className="block mt-1 text-xs text-amber-400">Contato externo — a resposta não será registrada no sistema.</span>
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setAutomacaoConfirmar(null)}
                disabled={disparandoAutomacao}
                className="px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-700/50 transition"
              >
                Cancelar
              </button>
              <button
                onClick={dispararAutomacao}
                disabled={disparandoAutomacao}
                className="px-3 py-2 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-500 transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
              >
                {disparandoAutomacao ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Enviar pesquisa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
