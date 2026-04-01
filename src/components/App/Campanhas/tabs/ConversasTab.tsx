import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Send, Bot, Image, FileText, Mic, Video, Music, Paperclip, RefreshCw, MessageSquare, Power, PowerOff, X, Play, Pause, Check, CheckCheck, Clock, AlertCircle, Loader2, Lock, Ban, PanelRightOpen, RotateCcw, Bug, Megaphone } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { useConversasCampanha, useMensagensCampanha, type MensagemCampanha } from '../hooks/useConversasCampanha'
import { useNumerosMeta } from '../hooks/useNumerosMeta'
import { ChatInfoPanel } from '../components/ChatInfoPanel'
import { ModalConfirmacao } from '@/components/ui/ModalConfirmacao'

// ─── ConversasTab ─────────────────────────────────────────────────────────────

export function ConversasTab({ unidadeId }: { unidadeId: string | null }) {
  const { conversas, loading } = useConversasCampanha(unidadeId ?? undefined)
  const { numeros } = useNumerosMeta()
  const [conversaAtiva, setConversaAtiva] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtroCaixa, setFiltroCaixa] = useState<string>('todos')

  const filtradas = conversas.filter(c => {
    if (busca && !c.telefone.includes(busca) && !c.nome_contato?.toLowerCase().includes(busca.toLowerCase())) return false
    if (filtroCaixa !== 'todos' && c.numero_meta_id !== filtroCaixa) return false
    return true
  })

  return (
    <div className="flex gap-4 h-[calc(100vh-320px)] min-h-[400px]">
      {/* Lista de contatos */}
      <div className="w-80 flex-shrink-0 bg-slate-800/50 border border-slate-700/50 rounded-xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-700/50 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar telefone ou nome..."
              className="w-full pl-9 pr-3 py-2 bg-slate-900/50 border border-slate-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          {numeros.length > 1 && (
            <div className="flex gap-1 overflow-x-auto">
              <button onClick={() => setFiltroCaixa('todos')} className={cn('px-2.5 py-1 rounded-lg text-[10px] font-medium border whitespace-nowrap transition-colors', filtroCaixa === 'todos' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-gray-500 border-slate-700 hover:text-white')}>
                Todas ({conversas.length})
              </button>
              {numeros.map(n => {
                const count = conversas.filter(c => c.numero_meta_id === n.id).length
                return (
                  <button key={n.id} onClick={() => setFiltroCaixa(n.id)} className={cn('px-2.5 py-1 rounded-lg text-[10px] font-medium border whitespace-nowrap transition-colors', filtroCaixa === n.id ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'text-gray-500 border-slate-700 hover:text-white')}>
                    {n.nome} ({count})
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center gap-2 text-gray-500 py-8 justify-center"><RefreshCw className="w-4 h-4 animate-spin" /></div>
          ) : filtradas.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">Nenhuma conversa</div>
          ) : (
            filtradas.map(c => (
              <button
                key={c.id}
                onClick={() => setConversaAtiva(c.id)}
                className={cn('w-full text-left px-4 py-3 border-b border-slate-700/30 transition-colors', conversaAtiva === c.id ? 'bg-amber-500/10' : 'hover:bg-slate-700/30')}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white text-sm font-medium truncate">{c.nome_contato || formatarTelefone(c.telefone)}</span>
                  {c.nao_lidas > 0 && (
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-black text-xs flex items-center justify-center font-bold flex-shrink-0">{c.nao_lidas}</span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-xs text-gray-500 truncate">{c.nome_contato ? formatarTelefone(c.telefone) : ''}</span>
                    {numeros.length > 1 && c.numero_meta_id && (
                      <span className="text-[9px] text-gray-600 bg-slate-800 px-1.5 py-0.5 rounded flex-shrink-0">
                        {numeros.find(n => n.id === c.numero_meta_id)?.nome?.split(' ')[0] ?? ''}
                      </span>
                    )}
                  </div>
                  {c.ultima_mensagem_em && <span className="text-xs text-gray-600 flex-shrink-0">{formatarHora(c.ultima_mensagem_em)}</span>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {conversaAtiva ? (
        <ChatPane conversaId={conversaAtiva} telefone={conversas.find(c => c.id === conversaAtiva)?.telefone} nomeContato={conversas.find(c => c.id === conversaAtiva)?.nome_contato} />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-slate-800/30 border border-slate-700/50 rounded-xl">
          <div className="text-center text-gray-500">
            <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Selecione uma conversa</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Audio Player ─────────────────────────────────────────────────────────────

function AudioPlayer({ src, isSaida }: { src: string; isSaida: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    const onLoaded = () => setDuration(audio.duration || 0)
    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onEnded = () => { setPlaying(false); setCurrentTime(0) }
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    return () => { audio.removeEventListener('loadedmetadata', onLoaded); audio.removeEventListener('timeupdate', onTimeUpdate); audio.removeEventListener('ended', onEnded) }
  }, [])

  const togglePlay = () => { const a = audioRef.current; if (!a) return; if (playing) a.pause(); else a.play(); setPlaying(!playing) }
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current; if (!a || !duration) return
    const pct = Math.max(0, Math.min(1, (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.getBoundingClientRect().width))
    a.currentTime = pct * duration; setCurrentTime(a.currentTime)
  }
  const fmt = (s: number) => (!s || !isFinite(s)) ? '0:00' : `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`
  const progress = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className="flex items-center gap-2.5 min-w-[200px] max-w-[260px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button onClick={togglePlay} className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition', isSaida ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400')}>
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className={cn('h-1.5 rounded-full cursor-pointer', isSaida ? 'bg-white/20' : 'bg-slate-600')} onClick={handleSeek}>
          <div className={cn('h-full rounded-full transition-all', isSaida ? 'bg-white/70' : 'bg-amber-400')} style={{ width: `${progress}%` }} />
        </div>
        <span className={cn('text-[10px] mt-1 block', isSaida ? 'text-amber-100/60' : 'text-slate-500')}>{fmt(playing ? currentTime : duration)}</span>
      </div>
    </div>
  )
}

// ─── Helpers visuais ──────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'pending': return <Clock className="w-3 h-3 text-slate-500" />
    case 'sent': return <Check className="w-3 h-3 text-slate-500" />
    case 'delivered': return <CheckCheck className="w-3 h-3 text-slate-500" />
    case 'read': return <CheckCheck className="w-3 h-3 text-blue-400" />
    case 'failed': return <AlertCircle className="w-3 h-3 text-red-400" />
    default: return null
  }
}

function HighlightText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight.trim() || !text) return <>{text}</>
  const parts = text.split(new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
  return <>{parts.map((p, i) => p.toLowerCase() === highlight.toLowerCase() ? <mark key={i} className="bg-amber-400/40 text-white rounded-sm px-0.5">{p}</mark> : p)}</>
}

// ─── Mídia Render ─────────────────────────────────────────────────────────────

function MidiaRender({ msg, isSaida, onImageClick }: { msg: MensagemCampanha; isSaida: boolean; onImageClick?: (url: string) => void }) {
  if (msg.tipo === 'sticker') return msg.media_url ? <img src={msg.media_url} alt="Sticker" className="w-32 h-32 object-contain" loading="lazy" /> : <span className="text-2xl">🏷️</span>
  if (!msg.media_url) return null
  if (msg.tipo === 'image') return <img src={msg.media_url} alt={msg.media_filename || 'Imagem'} className="w-full max-h-[300px] object-cover cursor-pointer block rounded-lg" onClick={() => onImageClick?.(msg.media_url!)} loading="lazy" />
  if (msg.tipo === 'audio') return <AudioPlayer src={msg.media_url} isSaida={isSaida} />
  if (msg.tipo === 'video') return <video controls src={msg.media_url} className="w-full max-h-[240px] object-cover block rounded-lg" />
  if (msg.tipo === 'document') return (
    <a href={msg.media_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition text-sm">
      <FileText className="w-4 h-4 text-amber-400 flex-shrink-0" /><span className="text-slate-200 truncate">{msg.media_filename || 'Documento'}</span>
    </a>
  )
  return null
}

// ─── Image Lightbox ──────────────────────────────────────────────────────────

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-black/40 rounded-full transition z-10">
        <X className="w-6 h-6" />
      </button>
      <img
        src={url}
        alt="Preview"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
    </div>
  )
}

// ─── Quick Reaction Picker ────────────────────────────────────────────────────

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

function ReactionPicker({ onReact }: { onReact: (emoji: string) => void }) {
  return (
    <div className="flex gap-0.5 bg-slate-800 border border-slate-700 rounded-full px-1.5 py-1 shadow-xl">
      {QUICK_EMOJIS.map(emoji => (
        <button key={emoji} onClick={() => onReact(emoji)} className="w-7 h-7 flex items-center justify-center text-sm rounded-full hover:bg-slate-700/60 hover:scale-125 transition-all">{emoji}</button>
      ))}
    </div>
  )
}

// ─── Quick Replies Dropdown ───────────────────────────────────────────────────

interface RespostaRapida { id: string; titulo: string; conteudo: string; categoria: string | null }

function QuickRepliesDropdown({ filtro, onSelecionar, onFechar }: { filtro: string; onSelecionar: (conteudo: string) => void; onFechar: () => void }) {
  const [respostas, setRespostas] = useState<RespostaRapida[]>([])
  const [loading, setLoading] = useState(true)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('respostas_rapidas_campanha').select('*').order('titulo').then(({ data }) => {
      setRespostas(data ?? [])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) onFechar() }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onFechar])

  const filtradas = respostas.filter(r => !filtro || r.titulo.toLowerCase().includes(filtro.toLowerCase()) || r.conteudo.toLowerCase().includes(filtro.toLowerCase()))

  return (
    <div ref={ref} className="absolute bottom-full left-0 mb-2 w-80 max-h-48 overflow-y-auto bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-20">
      {loading ? (
        <div className="p-3 text-center text-slate-500 text-xs"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>
      ) : filtradas.length === 0 ? (
        <div className="p-3 text-center text-slate-500 text-xs">Nenhuma resposta rápida{respostas.length === 0 ? ' — configure na aba Config' : ''}</div>
      ) : (
        filtradas.map(r => (
          <button key={r.id} onClick={() => { onSelecionar(r.conteudo); onFechar() }} className="w-full text-left px-3 py-2 hover:bg-slate-700/50 transition border-b border-slate-700/30 last:border-0">
            <div className="text-xs font-medium text-amber-400">{r.titulo}</div>
            <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{r.conteudo}</div>
          </button>
        ))
      )}
    </div>
  )
}

// ─── Bolha de Mensagem ────────────────────────────────────────────────────────

function BolhaMensagem({ msg, onReagir, searchTerm, onImageClick }: { msg: MensagemCampanha; onReagir: (msgId: string, emoji: string) => void; searchTerm: string; onImageClick: (url: string) => void }) {
  const isInbound = msg.direcao === 'inbound'
  const isPrivada = (msg as any).privada === true
  const isTemplate = msg.tipo === 'template'
  const [showReaction, setShowReaction] = useState(false)
  const hasMedia = msg.media_url && ['image', 'video'].includes(msg.tipo)

  if (isPrivada) {
    return (
      <div className="flex justify-center mb-2">
        <div className="max-w-[70%] bg-purple-500/10 border border-purple-500/20 rounded-xl px-3.5 py-2">
          <div className="flex items-center gap-1.5 text-[10px] text-purple-400 mb-0.5">
            <Lock className="w-3 h-3" /> Nota interna
          </div>
          {msg.texto && <p className="text-sm text-purple-200/80 whitespace-pre-wrap">{searchTerm ? <HighlightText text={msg.texto} highlight={searchTerm} /> : msg.texto}</p>}
          <span className="text-[10px] text-purple-400/40 mt-0.5 block">{formatarHora(msg.created_at)}</span>
        </div>
      </div>
    )
  }

  // Template message — visual distinto
  if (isTemplate && !isInbound) {
    return (
      <div
        className={cn('flex justify-end', msg.reaction_emoji ? 'mb-5' : 'mb-2')}
        onMouseEnter={() => setShowReaction(true)}
        onMouseLeave={() => setShowReaction(false)}
      >
        <div className="relative max-w-[70%]">
          <div className="min-w-[80px] rounded-2xl overflow-hidden bg-gradient-to-b from-emerald-700/80 to-emerald-800/80 text-white rounded-br-md border border-emerald-600/30">
            {/* Header badge */}
            <div className="flex items-center gap-1.5 text-[10px] text-emerald-200/70 px-3.5 pt-2 pb-0">
              <Megaphone className="w-3 h-3" /> Template de campanha
            </div>
            {/* Imagem do header */}
            {msg.media_url && (
              <div className="px-2 pt-2">
                <img src={msg.media_url} alt="Header" className="w-full max-h-[200px] object-cover rounded-lg cursor-pointer" onClick={() => onImageClick(msg.media_url!)} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              </div>
            )}
            {/* Corpo */}
            <div className="px-3.5 pb-1.5">
              {msg.texto && (
                <p className="text-sm whitespace-pre-wrap break-words mt-1.5">
                  {searchTerm ? <HighlightText text={msg.texto} highlight={searchTerm} /> : msg.texto}
                </p>
              )}
              <div className="flex items-center gap-1 mt-1 justify-end">
                <span className="text-[10px] text-emerald-200/50">{formatarHora(msg.created_at)}</span>
                {msg.status && <StatusIcon status={msg.status} />}
              </div>
            </div>
          </div>
          {msg.reaction_emoji && (
            <div className="absolute -bottom-3 z-10 right-2">
              <span className="text-sm bg-slate-800/90 border border-slate-700/50 rounded-full px-1.5 py-0.5 shadow-lg backdrop-blur-sm">{msg.reaction_emoji}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn('flex', isInbound ? 'justify-start' : 'justify-end', msg.reaction_emoji ? 'mb-5' : 'mb-2')}
      onMouseEnter={() => setShowReaction(true)}
      onMouseLeave={() => setShowReaction(false)}
    >
      <div className="relative max-w-[70%]">
        <div className={cn('min-w-[80px] rounded-2xl overflow-hidden', isInbound ? 'bg-slate-700/70 text-slate-200 rounded-bl-md' : 'bg-amber-600/80 text-white rounded-br-md')}>
          {!isInbound && msg.enviado_por_agente && (
            <div className="flex items-center gap-1 text-[10px] text-amber-200/60 px-3.5 pt-2 pb-0"><Bot className="w-3 h-3" /> Agente IA</div>
          )}
          {hasMedia ? <MidiaRender msg={msg} isSaida={!isInbound} onImageClick={onImageClick} /> : <div className="px-3.5 pt-2"><MidiaRender msg={msg} isSaida={!isInbound} onImageClick={onImageClick} /></div>}
          <div className="px-3.5 pb-1.5">
            {msg.texto && (
              <p className={cn('text-sm whitespace-pre-wrap break-words', hasMedia ? 'mt-1' : '')}>
                {searchTerm ? <HighlightText text={msg.texto} highlight={searchTerm} /> : msg.texto}
              </p>
            )}
            <div className={cn('flex items-center gap-1 mt-0.5', isInbound ? 'justify-start' : 'justify-end')}>
              <span className={cn('text-[10px]', isInbound ? 'text-slate-500' : 'text-amber-200/50')}>{formatarHora(msg.created_at)}</span>
              {!isInbound && msg.status && <StatusIcon status={msg.status} />}
            </div>
          </div>
        </div>
        {msg.reaction_emoji && (
          <div className={cn('absolute -bottom-3 z-10', isInbound ? 'left-2' : 'right-2')}>
            <span className="text-sm bg-slate-800/90 border border-slate-700/50 rounded-full px-1.5 py-0.5 shadow-lg backdrop-blur-sm">{msg.reaction_emoji}</span>
          </div>
        )}
        {showReaction && isInbound && msg.meta_message_id && (
          <div className={cn('absolute -top-9 z-20', 'left-0')}>
            <ReactionPicker onReact={(emoji) => { onReagir(msg.meta_message_id!, emoji); setShowReaction(false) }} />
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Chat Pane ────────────────────────────────────────────────────────────────

function ChatPane({ conversaId, telefone, nomeContato }: { conversaId: string; telefone?: string; nomeContato?: string | null }) {
  const { mensagens, loading, enviar, enviarMidia, reagir, resetarConversa } = useMensagensCampanha(conversaId, telefone)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [infoPanelAberto, setInfoPanelAberto] = useState(false)
  const [botAtivo, setBotAtivo] = useState<boolean | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Busca no chat
  const [buscaChat, setBuscaChat] = useState('')
  const [buscaAberta, setBuscaAberta] = useState(false)

  // Nota interna
  const [modoNota, setModoNota] = useState(false)

  // Reset
  const [resetando, setResetando] = useState(false)
  const [modalResetAberto, setModalResetAberto] = useState(false)

  // Debug mode
  const [modoDebug, setModoDebug] = useState(false)
  const [debugData, setDebugData] = useState<{ bot_ativo: boolean; status: string; total_mensagens: number; session_data: Record<string, any>; ultima_ia: string | null } | null>(null)

  // Quick replies
  const [quickRepliesAberto, setQuickRepliesAberto] = useState(false)
  const [quickFiltro, setQuickFiltro] = useState('')

  // Anexo
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false)
  const [tipoUpload, setTipoUpload] = useState<'image' | 'audio' | 'video' | 'document'>('image')

  // Preview de mídia
  const [midiaPreview, setMidiaPreview] = useState<{ arquivo: File; tipo: string; previewUrl: string | null } | null>(null)
  const [legendaMidia, setLegendaMidia] = useState('')
  const [enviandoMidia, setEnviandoMidia] = useState(false)

  // Gravação de áudio
  const [gravando, setGravando] = useState(false)
  const [tempoGravacao, setTempoGravacao] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight }, [mensagens.length])
  useEffect(() => { if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px' } }, [texto])
  useEffect(() => {
    const tel = telefone || mensagens[0]?.telefone
    if (!tel) return
    supabase.from('agente_conversas').select('bot_ativo').eq('telefone', tel).order('ultima_mensagem_em', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
      // null = sem registro (agente nunca interagiu) — tratamos como "sem bot", não mudar estado
      if (data) setBotAtivo(data.bot_ativo)
      else setBotAtivo(null) // null = sem agente_conversas
    })
  }, [conversaId, telefone])
  useEffect(() => { return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); if (timerRef.current) clearInterval(timerRef.current) } }, [])

  // Debug polling — buscar dados do agente_conversas a cada 5s
  useEffect(() => {
    if (!modoDebug) { setDebugData(null); return }
    const tel = telefone || mensagens[0]?.telefone
    if (!tel) return

    async function fetchDebug() {
      const { data } = await supabase.from('agente_conversas')
        .select('bot_ativo, status, total_mensagens, session_data, ultima_mensagem_em')
        .eq('telefone', tel!)
        .order('ultima_mensagem_em', { ascending: false })
        .limit(1).maybeSingle()
      if (data) {
        setDebugData({
          bot_ativo: data.bot_ativo,
          status: data.status,
          total_mensagens: data.total_mensagens,
          session_data: data.session_data ?? {},
          ultima_ia: data.ultima_mensagem_em,
        })
      }
    }
    fetchDebug()
    const interval = setInterval(fetchDebug, 5000)
    return () => clearInterval(interval)
  }, [modoDebug, telefone, mensagens.length])

  // ─── Reset conversa ──────────────────────────────────────────────────
  async function handleResetarConversa() {
    setResetando(true)
    const { error } = await resetarConversa()
    if (error) toast.error(error)
    else {
      toast.success('Conversa resetada — agente tratará como novo contato')
      setBotAtivo(true)
      setDebugData(null)
    }
    setResetando(false)
    setModalResetAberto(false)
  }

  // Keyboard shortcut: Ctrl+F para busca
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); setBuscaAberta(true) }
      if (e.key === 'Escape') { setBuscaAberta(false); setBuscaChat('') }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Quick replies: detectar "/" no início
  useEffect(() => {
    if (texto === '/') { setQuickRepliesAberto(true); setQuickFiltro('') }
    else if (texto.startsWith('/') && texto.length > 1) { setQuickFiltro(texto.slice(1)) }
    else { setQuickRepliesAberto(false) }
  }, [texto])

  // ─── Envio de texto / nota interna ──────────────────────────────────
  async function handleEnviar() {
    if (!texto.trim() || enviando) return
    setEnviando(true)
    const msg = texto.trim()
    setTexto('')

    if (modoNota) {
      // Salvar nota interna direto no banco (não envia WhatsApp)
      const { data: conv } = await supabase.from('conversas_campanha').select('id, telefone').eq('id', conversaId).single()
      if (conv) {
        await supabase.from('mensagens_campanha').insert({
          conversa_id: conversaId, telefone: conv.telefone, direcao: 'outbound',
          tipo: 'text', texto: msg, status: 'sent', privada: true,
        })
      }
      setModoNota(false)
    } else {
      const { error } = await enviar(msg)
      if (error) toast.error(error)
    }
    setEnviando(false)
  }

  // ─── Envio de mídia ─────────────────────────────────────────────────
  async function handleConfirmarEnvioMidia() {
    if (!midiaPreview) return
    setEnviandoMidia(true)
    const { error } = await enviarMidia(midiaPreview.arquivo, midiaPreview.tipo)
    if (error) toast.error(error)
    handleCancelarMidia()
    setEnviandoMidia(false)
  }

  function handleCancelarMidia() { if (midiaPreview?.previewUrl) URL.revokeObjectURL(midiaPreview.previewUrl); setMidiaPreview(null); setLegendaMidia('') }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    if (fileInputRef.current) fileInputRef.current.value = ''
    setMenuAnexoAberto(false)
    const isImg = file.type.startsWith('image/'); const isVid = file.type.startsWith('video/')
    setMidiaPreview({ arquivo: file, tipo: tipoUpload, previewUrl: (isImg || isVid) ? URL.createObjectURL(file) : null })
    setLegendaMidia('')
  }

  function abrirUpload(tipo: 'image' | 'audio' | 'video' | 'document') { setTipoUpload(tipo); setMenuAnexoAberto(false); setTimeout(() => fileInputRef.current?.click(), 50) }
  const acceptMap: Record<string, string> = { image: 'image/*', audio: 'audio/*', video: 'video/*', document: '.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv' }

  // ─── Gravação ───────────────────────────────────────────────────────
  const limparGravacao = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    mediaRecorderRef.current = null; chunksRef.current = []; setGravando(false); setTempoGravacao(0)
  }, [])

  async function iniciarGravacao() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : 'audio/webm'
      const rec = new MediaRecorder(stream, { mimeType: mime }); mediaRecorderRef.current = rec; chunksRef.current = []
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.start(); setGravando(true); setTempoGravacao(0)
      timerRef.current = setInterval(() => setTempoGravacao(p => p + 1), 1000)
    } catch { toast.error('Não foi possível acessar o microfone') }
  }

  function enviarGravacao() {
    const rec = mediaRecorderRef.current; if (!rec || rec.state === 'inactive') return
    rec.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType }); const ext = rec.mimeType.includes('ogg') ? 'ogg' : 'webm'
      const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: rec.mimeType })
      limparGravacao(); const { error } = await enviarMidia(file, 'audio'); if (error) toast.error(error)
    }; rec.stop()
  }

  function cancelarGravacao() { const rec = mediaRecorderRef.current; if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop() }; limparGravacao() }

  // ─── Reação + Bloqueio ──────────────────────────────────────────────
  async function handleReagir(metaMessageId: string, emoji: string) { const { error } = await reagir(metaMessageId, emoji); if (error) toast.error('Falha ao enviar reação') }

  async function handleBloquear() {
    if (!mensagens.length) return
    const telefone = mensagens[0]?.telefone
    if (!confirm(`Bloquear ${formatarTelefone(telefone)}? Este contato não receberá mais campanhas.`)) return
    const { error } = await supabase.from('contatos_bloqueados_campanha').upsert({ telefone, motivo: 'Bloqueado manualmente via chat' }, { onConflict: 'unidade_id,telefone' })
    if (error) toast.error(error.message)
    else toast.success('Contato bloqueado')
  }

  // ─── Toggle bot ─────────────────────────────────────────────────────
  async function toggleBot() {
    const tel = telefone || mensagens[0]?.telefone
    if (!tel) return
    const novo = botAtivo === null ? true : !botAtivo

    // Verificar se existe agente_conversas
    const { data: existing } = await supabase.from('agente_conversas').select('id').eq('telefone', tel).limit(1).maybeSingle()

    if (existing) {
      // Atualizar
      const { error } = await supabase.from('agente_conversas')
        .update({ bot_ativo: novo, ...(novo ? { retomado_em: new Date().toISOString() } : { pausado_em: new Date().toISOString() }) })
        .eq('telefone', tel)
      if (error) { toast.error('Erro ao alterar bot: ' + error.message); return }
    } else {
      // Criar — buscar agente vinculado ao número da conversa
      const { data: conv } = await supabase.from('conversas_campanha').select('numero_meta_id, unidade_id').eq('id', conversaId).single()
      if (!conv) { toast.error('Conversa não encontrada'); return }

      // Buscar agente pelo numero_meta_id
      const { data: agente } = await supabase.from('agentes')
        .select('id')
        .eq('numero_meta_id', conv.numero_meta_id)
        .eq('is_active', true)
        .limit(1).maybeSingle()

      if (!agente) { toast.error('Nenhum agente ativo para este número'); return }

      const { error } = await supabase.from('agente_conversas').insert({
        agente_id: agente.id, unidade_id: conv.unidade_id, telefone: tel,
        bot_ativo: novo, total_mensagens: 0, ultima_mensagem_em: new Date().toISOString(),
      })
      if (error) { toast.error('Erro ao criar conversa do agente: ' + error.message); return }
    }

    setBotAtivo(novo)
    toast.success(novo ? 'Bot reativado' : 'Bot pausado — você está no controle')
  }

  const fmtTempo = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <div className="flex-1 flex gap-3 min-w-0">
    <div className="flex-1 flex flex-col bg-slate-800/30 border border-slate-700/50 rounded-xl overflow-hidden min-w-0" style={{ background: 'linear-gradient(180deg, #0f172a 0%, #0d1424 100%)' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {nomeContato && <p className="text-sm text-white font-medium truncate">{nomeContato}</p>}
          <p className={cn('text-xs truncate', nomeContato ? 'text-gray-500' : 'text-gray-400 text-sm')}>{telefone ? formatarTelefone(telefone) : mensagens.length > 0 ? formatarTelefone(mensagens[0].telefone) : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { setBuscaAberta(!buscaAberta); if (buscaAberta) setBuscaChat('') }} className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-700/50 transition" title="Buscar (Ctrl+F)">
            <Search className="w-4 h-4" />
          </button>
          <button onClick={() => setModalResetAberto(true)} disabled={resetando} className="p-1.5 rounded-lg text-slate-400 hover:text-orange-400 hover:bg-slate-700/50 transition disabled:opacity-50" title="Resetar conversa (apaga mensagens e session_data)">
            {resetando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          </button>
          <button onClick={() => setModoDebug(v => !v)} className={cn('p-1.5 rounded-lg transition', modoDebug ? 'text-green-400 bg-green-500/10' : 'text-slate-400 hover:text-green-400 hover:bg-slate-700/50')} title="Modo debug">
            <Bug className="w-4 h-4" />
          </button>
          <button onClick={handleBloquear} className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700/50 transition" title="Bloquear contato">
            <Ban className="w-4 h-4" />
          </button>
          <button onClick={() => setInfoPanelAberto(v => !v)} className={cn('p-1.5 rounded-lg transition', infoPanelAberto ? 'text-amber-400 bg-amber-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-700/50')} title="Informações">
            <PanelRightOpen className="w-4 h-4" />
          </button>
          <button onClick={toggleBot} className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border', botAtivo === true ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' : botAtivo === null ? 'bg-slate-500/10 text-slate-400 border-slate-500/30 hover:bg-slate-500/20' : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20')}>
            {botAtivo === true ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
            {botAtivo === true ? 'Bot ativo' : botAtivo === null ? 'Ativar bot' : 'Bot pausado'}
          </button>
        </div>
      </div>

      {/* Barra de busca no chat */}
      {buscaAberta && (
        <div className="px-4 py-2 border-b border-slate-700/50 flex items-center gap-2 bg-slate-800/60">
          <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <input autoFocus value={buscaChat} onChange={e => setBuscaChat(e.target.value)} placeholder="Buscar nas mensagens..." className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none" />
          {buscaChat && <span className="text-xs text-slate-500">{mensagens.filter(m => m.texto?.toLowerCase().includes(buscaChat.toLowerCase())).length} resultados</span>}
          <button onClick={() => { setBuscaAberta(false); setBuscaChat('') }} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Debug Panel */}
      {modoDebug && debugData && (
        <div className="px-4 py-2 border-b border-green-500/20 bg-green-500/5 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-mono text-green-400 uppercase tracking-wider">Debug</span>
            <div className="flex items-center gap-1.5">
              <div className={cn('w-2 h-2 rounded-full', debugData.bot_ativo ? 'bg-emerald-400' : debugData.status === 'transferred' ? 'bg-red-400' : 'bg-yellow-400')} />
              <span className="text-[11px] text-slate-300 font-mono">bot={debugData.bot_ativo ? 'on' : 'off'}</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">status={debugData.status}</span>
            <span className="text-[11px] text-slate-400 font-mono">msgs={debugData.total_mensagens}</span>
            {debugData.ultima_ia && <span className="text-[11px] text-slate-500 font-mono">last_ia={new Date(debugData.ultima_ia).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
          </div>
          {Object.keys(debugData.session_data).length > 0 && (
            <div className="bg-slate-900/60 border border-green-500/10 rounded-lg px-3 py-2 max-h-32 overflow-y-auto">
              <p className="text-[10px] text-green-400/60 mb-1 font-mono">session_data</p>
              {Object.entries(debugData.session_data).filter(([k]) => k !== 'last_ai_response_at').map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[11px] font-mono">
                  <span className="text-amber-400/80">{k}:</span>
                  <span className="text-slate-300 truncate">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {modoDebug && !debugData && (
        <div className="px-4 py-2 border-b border-green-500/20 bg-green-500/5">
          <span className="text-[11px] text-slate-500 font-mono">Debug: sem dados de agente_conversas para este contato</span>
        </div>
      )}

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 text-slate-500 animate-spin" /></div>
        ) : mensagens.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">Nenhuma mensagem</div>
        ) : (
          mensagens.map(m => <BolhaMensagem key={m.id} msg={m} onReagir={handleReagir} searchTerm={buscaChat} onImageClick={setLightboxUrl} />)
        )}
      </div>

      {/* Preview de mídia */}
      {midiaPreview && (
        <div className="px-4 py-3 border-t border-slate-700/50 bg-slate-800/60">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              {midiaPreview.tipo === 'image' && midiaPreview.previewUrl ? <img src={midiaPreview.previewUrl} alt="Preview" className="w-20 h-20 rounded-lg object-cover" />
              : midiaPreview.tipo === 'video' && midiaPreview.previewUrl ? <video src={midiaPreview.previewUrl} className="w-20 h-20 rounded-lg object-cover" />
              : <div className="w-20 h-20 rounded-lg bg-slate-700/50 flex items-center justify-center">
                  {midiaPreview.tipo === 'audio' ? <Music className="w-8 h-8 text-cyan-400" /> : midiaPreview.tipo === 'document' ? <FileText className="w-8 h-8 text-orange-400" /> : <Image className="w-8 h-8 text-slate-500" />}
                </div>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 truncate mb-1.5">{midiaPreview.arquivo.name}</p>
              <p className="text-[10px] text-slate-600 mb-2">{(midiaPreview.arquivo.size / 1024).toFixed(0)} KB · {midiaPreview.tipo}</p>
              {midiaPreview.tipo !== 'audio' && (
                <input value={legendaMidia} onChange={e => setLegendaMidia(e.target.value)} placeholder="Adicionar legenda (opcional)..." className="w-full px-3 py-1.5 bg-slate-700/50 border border-slate-600/50 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/50" />
              )}
            </div>
            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button onClick={handleConfirmarEnvioMidia} disabled={enviandoMidia} className="p-2 rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition disabled:opacity-50">
                {enviandoMidia ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
              <button onClick={handleCancelarMidia} className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700/50 transition"><X className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-700/50">
        {/* Indicador nota interna */}
        {modoNota && (
          <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-lg">
            <Lock className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-purple-400 flex-1">Nota interna — não será enviada ao contato</span>
            <button onClick={() => setModoNota(false)} className="text-purple-400 hover:text-purple-300"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {gravando ? (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
            <button onClick={cancelarGravacao} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-red-400 transition"><X className="w-4 h-4" /> Cancelar</button>
            <div className="flex-1 flex items-center justify-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /><span className="text-sm font-mono text-red-400">{fmtTempo(tempoGravacao)}</span></div>
            <button onClick={enviarGravacao} className="p-2.5 rounded-xl bg-amber-600 text-white hover:bg-amber-500 transition"><Send className="w-5 h-5" /></button>
          </div>
        ) : (
          <div className="flex items-end gap-2 relative">
            {/* Quick replies dropdown */}
            {quickRepliesAberto && (
              <QuickRepliesDropdown filtro={quickFiltro} onSelecionar={(conteudo) => setTexto(conteudo)} onFechar={() => { setQuickRepliesAberto(false) }} />
            )}

            {/* Anexo */}
            <div className="relative">
              <button onClick={() => setMenuAnexoAberto(prev => !prev)} className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-700/50 transition"><Paperclip className="w-5 h-5" /></button>
              {menuAnexoAberto && (
                <div className="absolute bottom-12 left-0 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl py-1.5 min-w-[160px] z-10">
                  <button onClick={() => abrirUpload('image')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 transition"><Image className="w-4 h-4 text-emerald-400" /> Imagem</button>
                  <button onClick={() => abrirUpload('audio')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 transition"><Music className="w-4 h-4 text-cyan-400" /> Áudio</button>
                  <button onClick={() => abrirUpload('video')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 transition"><Video className="w-4 h-4 text-purple-400" /> Vídeo</button>
                  <button onClick={() => abrirUpload('document')} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700/50 transition"><FileText className="w-4 h-4 text-orange-400" /> Documento</button>
                </div>
              )}
              <input ref={fileInputRef} type="file" accept={acceptMap[tipoUpload]} onChange={handleFileChange} className="hidden" />
            </div>

            {/* Toggle nota interna */}
            <button onClick={() => setModoNota(!modoNota)} className={cn('p-2 rounded-lg transition', modoNota ? 'text-purple-400 bg-purple-500/20' : 'text-slate-400 hover:text-purple-400 hover:bg-slate-700/50')} title="Nota interna">
              <Lock className="w-5 h-5" />
            </button>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEnviar() } }}
              placeholder={modoNota ? 'Escrever nota interna...' : 'Digite uma mensagem ou / para atalhos...'}
              rows={1}
              className={cn('flex-1 bg-slate-800 border rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:border-transparent outline-none resize-none', modoNota ? 'border-purple-500/30 focus:ring-purple-500/50' : 'border-slate-700 focus:ring-amber-500/50')}
            />

            {texto.trim() ? (
              <button onClick={handleEnviar} disabled={enviando} className={cn('p-2.5 rounded-xl transition', modoNota ? 'bg-purple-600 text-white hover:bg-purple-500' : !enviando ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-slate-700 text-slate-500 cursor-not-allowed')}>
                {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : modoNota ? <Lock className="w-5 h-5" /> : <Send className="w-5 h-5" />}
              </button>
            ) : (
              <button onClick={iniciarGravacao} className="p-2.5 rounded-xl bg-amber-600 text-white hover:bg-amber-500 transition"><Mic className="w-5 h-5" /></button>
            )}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>

    {/* Info Panel */}
    {infoPanelAberto && telefone && (
      <ChatInfoPanel conversaId={conversaId} telefone={telefone} onClose={() => setInfoPanelAberto(false)} />
    )}

    {/* Modal Reset */}
    <ModalConfirmacao
      aberto={modalResetAberto}
      onClose={() => setModalResetAberto(false)}
      onConfirmar={handleResetarConversa}
      titulo="Resetar conversa"
      mensagem="Isso apaga TODAS as mensagens e dados coletados pelo agente para este contato. O agente tratará a próxima mensagem como um contato totalmente novo. Esta ação é irreversível."
      tipo="danger"
      textoConfirmar="Resetar"
      textoCancelar="Cancelar"
      carregando={resetando}
    />
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatarTelefone(tel: string): string {
  if (tel.length === 13) return `+${tel.slice(0, 2)} (${tel.slice(2, 4)}) ${tel.slice(4, 9)}-${tel.slice(9)}`
  if (tel.length === 12) return `+${tel.slice(0, 2)} (${tel.slice(2, 4)}) ${tel.slice(4, 8)}-${tel.slice(8)}`
  return tel
}

function formatarHora(iso: string): string {
  const d = new Date(iso); const agora = new Date()
  const diffDias = Math.floor((agora.getTime() - d.getTime()) / 86400000)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diffDias === 0) return hora; if (diffDias === 1) return `Ontem ${hora}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`
}
