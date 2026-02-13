import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Phone, Pause, Play, Send, FileText, Loader2, ChevronUp, ChevronDown,
  Paperclip, ImageIcon, Mic, File as FileIcon, X, Search, Square, Trash2, Settings, MessageSquare, Smile,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/Tooltip';
import { supabase } from '@/lib/supabase';
import { ChatBubble } from './ChatBubble';
import { TemplateSelector } from './TemplateSelector';
import { ModalGerenciarTemplates } from './ModalGerenciarTemplates';
import { EmojiPicker } from './EmojiPicker';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { ConversaCRM, MensagemCRM, LeadCRM } from '../../types';

interface ChatPanelProps {
  conversa: ConversaCRM;
  lead: LeadCRM;
  mensagens: MensagemCRM[];
  loading: boolean;
  enviando: boolean;
  temMais: boolean;
  onCarregarMais: () => void;
  onEnviarMensagem: (conteudo: string, replyToId?: string) => Promise<any>;
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
  const [templateDropdownAberto, setTemplateDropdownAberto] = useState(false);
  const [templateFiltroInicial, setTemplateFiltroInicial] = useState('');
  const [modalTemplatesAberto, setModalTemplatesAberto] = useState(false);
  const [milaPausada, setMilaPausada] = useState(conversa.mila_pausada);
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false);
  const [arquivoPreview, setArquivoPreview] = useState<{ file: File; tipo: 'imagem' | 'audio' | 'video' | 'documento'; previewUrl?: string } | null>(null);
  const [captionMidia, setCaptionMidia] = useState('');
  const [mensagemRespondendo, setMensagemRespondendo] = useState<MensagemCRM | null>(null);
  const [editandoMensagemId, setEditandoMensagemId] = useState<string | null>(null);
  const [textoEdicao, setTextoEdicao] = useState('');
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [mensagemDeletar, setMensagemDeletar] = useState<MensagemCRM | null>(null);
  const [deletando, setDeletando] = useState(false);
  const [transcrevendoId, setTranscrevendoId] = useState<string | null>(null);
  const [scrollNoFundo, setScrollNoFundo] = useState(true);
  const [novasMensagensAbaixo, setNovasMensagensAbaixo] = useState(0);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [emojiPickerAberto, setEmojiPickerAberto] = useState(false);
  const [termoBusca, setTermoBusca] = useState('');
  const [indiceBuscaAtual, setIndiceBuscaAtual] = useState(0);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const buscaInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevMensagensLength = useRef(0);
  const inputImagemRef = useRef<HTMLInputElement>(null);
  const inputDocumentoRef = useRef<HTMLInputElement>(null);
  const inputAudioRef = useRef<HTMLInputElement>(null);

  // --- Gravação de áudio ---
  const [gravando, setGravando] = useState(false);
  const [tempoGravacao, setTempoGravacao] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Detectar posição do scroll
  const handleScroll = useCallback(() => {
    const el = chatAreaRef.current;
    if (!el) return;
    const distanciaDoFundo = el.scrollHeight - el.scrollTop - el.clientHeight;
    setScrollNoFundo(distanciaDoFundo < 80);
    if (distanciaDoFundo < 80) {
      setNovasMensagensAbaixo(0);
    }
  }, []);

  // Scroll para o final quando novas mensagens chegam
  useEffect(() => {
    if (mensagens.length > prevMensagensLength.current) {
      if (scrollNoFundo) {
        const el = chatAreaRef.current;
        if (el) {
          requestAnimationFrame(() => {
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
          });
        }
      } else {
        const diff = mensagens.length - prevMensagensLength.current;
        setNovasMensagensAbaixo(prev => prev + diff);
      }
    }
    prevMensagensLength.current = mensagens.length;
  }, [mensagens.length, scrollNoFundo]);

  // Scroll inicial
  useEffect(() => {
    const el = chatAreaRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    setScrollNoFundo(true);
    setNovasMensagensAbaixo(0);
  }, [conversa.id]);

  // Função para scrollar até o fundo
  const scrollParaFundo = useCallback(() => {
    const el = chatAreaRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
    setNovasMensagensAbaixo(0);
  }, []);

  // Sync mila_pausada com conversa
  useEffect(() => {
    setMilaPausada(conversa.mila_pausada);
  }, [conversa.mila_pausada]);

  // Buscar foto de perfil se não tiver cacheada
  useEffect(() => {
    if (conversa.foto_perfil_url || !conversa.whatsapp_jid) return;

    supabase.functions.invoke('buscar-foto-perfil', {
      body: {
        conversa_id: conversa.id,
        whatsapp_jid: conversa.whatsapp_jid,
      },
    }).then(({ data }) => {
      if (data?.foto_perfil_url) {
        console.log('[ChatPanel] Foto de perfil cacheada:', data.foto_perfil_url);
      }
    }).catch((err) => {
      console.warn('[ChatPanel] Erro ao buscar foto de perfil:', err);
    });
  }, [conversa.id, conversa.foto_perfil_url, conversa.whatsapp_jid]);

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

    const replyId = mensagemRespondendo?.id || undefined;
    setTexto('');
    setMensagemRespondendo(null);
    setEmojiPickerAberto(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    await onEnviarMensagem(msg, replyId);
  }, [texto, enviando, onEnviarMensagem, mensagemRespondendo]);

  // Inserir emoji no texto na posição do cursor
  const handleInserirEmoji = useCallback((emoji: string) => {
    const el = textareaRef.current;
    if (el) {
      const inicio = el.selectionStart ?? texto.length;
      const fim = el.selectionEnd ?? texto.length;
      const novoTexto = texto.slice(0, inicio) + emoji + texto.slice(fim);
      setTexto(novoTexto);
      // Reposicionar cursor após o emoji
      requestAnimationFrame(() => {
        el.focus();
        const novaPosicao = inicio + emoji.length;
        el.setSelectionRange(novaPosicao, novaPosicao);
        // Auto-resize
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 128) + 'px';
      });
    } else {
      setTexto(prev => prev + emoji);
    }
  }, [texto]);

  // Callback para responder mensagem
  const handleResponder = useCallback((msg: MensagemCRM) => {
    setMensagemRespondendo(msg);
    textareaRef.current?.focus();
  }, []);

  // Mapa de mensagens para lookup rápido de quotes
  const mensagensMap = React.useMemo(() => {
    const map = new Map<string, MensagemCRM>();
    for (const m of mensagens) {
      map.set(m.id, m);
    }
    return map;
  }, [mensagens]);

  // Resultados da busca de mensagens
  const resultadosBusca = React.useMemo(() => {
    if (!termoBusca.trim()) return [];
    const termo = termoBusca.toLowerCase();
    return mensagens
      .map((m, idx) => ({ mensagem: m, indice: idx }))
      .filter(({ mensagem }) => mensagem.conteudo?.toLowerCase().includes(termo));
  }, [mensagens, termoBusca]);

  // Navegar entre resultados de busca
  const navegarBusca = useCallback((direcao: 'anterior' | 'proximo') => {
    if (resultadosBusca.length === 0) return;
    let novoIndice = indiceBuscaAtual;
    if (direcao === 'proximo') {
      novoIndice = (indiceBuscaAtual + 1) % resultadosBusca.length;
    } else {
      novoIndice = (indiceBuscaAtual - 1 + resultadosBusca.length) % resultadosBusca.length;
    }
    setIndiceBuscaAtual(novoIndice);

    // Scroll até a mensagem encontrada
    const msgId = resultadosBusca[novoIndice]?.mensagem.id;
    if (msgId) {
      const el = document.getElementById(`msg-${msgId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [resultadosBusca, indiceBuscaAtual]);

  // Abrir/fechar busca
  const toggleBusca = useCallback(() => {
    setBuscaAberta(prev => {
      if (!prev) {
        setTimeout(() => buscaInputRef.current?.focus(), 100);
      } else {
        setTermoBusca('');
        setIndiceBuscaAtual(0);
      }
      return !prev;
    });
  }, []);

  // Detectar / no início do texto para abrir dropdown de templates
  const handleTextoChange = useCallback((novoTexto: string) => {
    setTexto(novoTexto);

    // Se o texto começa com / e tem no máximo ~30 chars, abrir dropdown
    if (novoTexto.startsWith('/') && novoTexto.length <= 30) {
      const filtro = novoTexto.slice(1); // remover a /
      setTemplateFiltroInicial(filtro);
      setTemplateDropdownAberto(true);
    } else if (templateDropdownAberto && !novoTexto.startsWith('/')) {
      // Fechar dropdown se o texto não começa mais com /
      setTemplateDropdownAberto(false);
    } else if (templateDropdownAberto && novoTexto.startsWith('/')) {
      // Atualizar filtro enquanto digita após /
      setTemplateFiltroInicial(novoTexto.slice(1));
    }
  }, [templateDropdownAberto]);

  // Usar template do dropdown (limpa o texto / antes de inserir)
  const handleUsarTemplateDropdown = useCallback((conteudo: string) => {
    // Substituir placeholders com dados do lead
    const textoFinal = conteudo
      .replace(/\{nome\}/g, lead.nome || 'Lead')
      .replace(/\{curso\}/g, lead.cursos?.nome || 'música')
      .replace(/\{unidade\}/g, lead.unidades?.nome || 'LA Music')
      .replace(/\{data\}/g, lead.data_experimental || '__/__')
      .replace(/\{hora\}/g, lead.horario_experimental || '__:__')
      .replace(/\{horario\}/g, lead.horario_experimental || '__:__');

    setTexto(textoFinal);
    setTemplateDropdownAberto(false);
    setTemplateAberto(false);
    textareaRef.current?.focus();
    requestAnimationFrame(handleTextareaInput);
  }, [lead, handleTextareaInput]);

  // Enter para enviar, Shift+Enter para nova linha
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Se dropdown de templates está aberto, deixar ele capturar as teclas
    if (templateDropdownAberto) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setTemplateDropdownAberto(false);
        setTexto('');
      }
      // Não processar Enter aqui — o dropdown captura
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleEnviar();
    }
  }, [handleEnviar, templateDropdownAberto]);

  // Editar mensagem
  const handleEditarMensagem = useCallback((msg: MensagemCRM) => {
    setEditandoMensagemId(msg.id);
    setTextoEdicao(msg.conteudo || '');
  }, []);

  const handleSalvarEdicao = useCallback(async () => {
    if (!editandoMensagemId || !textoEdicao.trim() || salvandoEdicao) return;

    setSalvandoEdicao(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://ouqwbbermlzqqvtqwlul.supabase.co'}/functions/v1/editar-mensagem-lead`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            mensagem_id: editandoMensagemId,
            novo_conteudo: textoEdicao.trim(),
          }),
        }
      );

      const data = await res.json();
      if (!data.success) {
        console.error('[ChatPanel] Erro ao editar:', data.error);
      }
    } catch (err) {
      console.error('[ChatPanel] Erro ao editar mensagem:', err);
    } finally {
      setSalvandoEdicao(false);
      setEditandoMensagemId(null);
      setTextoEdicao('');
    }
  }, [editandoMensagemId, textoEdicao, salvandoEdicao]);

  const handleCancelarEdicao = useCallback(() => {
    setEditandoMensagemId(null);
    setTextoEdicao('');
  }, []);

  // Deletar mensagem
  const handleDeletarMensagem = useCallback((msg: MensagemCRM) => {
    setMensagemDeletar(msg);
  }, []);

  const handleConfirmarDeletar = useCallback(async () => {
    if (!mensagemDeletar || deletando) return;

    setDeletando(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://ouqwbbermlzqqvtqwlul.supabase.co'}/functions/v1/deletar-mensagem-lead`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ mensagem_id: mensagemDeletar.id }),
        }
      );

      const data = await res.json();
      if (!data.success) {
        console.error('[ChatPanel] Erro ao deletar:', data.error);
      }
    } catch (err) {
      console.error('[ChatPanel] Erro ao deletar mensagem:', err);
    } finally {
      setDeletando(false);
      setMensagemDeletar(null);
    }
  }, [mensagemDeletar, deletando]);

  // Reagir a mensagem
  const handleReagir = useCallback(async (msg: MensagemCRM, emoji: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://ouqwbbermlzqqvtqwlul.supabase.co'}/functions/v1/reagir-mensagem`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ mensagem_id: msg.id, emoji }),
        }
      );
      const data = await res.json();
      if (!data.success) {
        console.error('[ChatPanel] Erro ao reagir:', data.error);
      }
    } catch (err) {
      console.error('[ChatPanel] Erro ao reagir:', err);
    }
  }, []);

  // Transcrever áudio
  const handleTranscreverAudio = useCallback(async (msg: MensagemCRM) => {
    if (transcrevendoId) return;
    setTranscrevendoId(msg.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://ouqwbbermlzqqvtqwlul.supabase.co'}/functions/v1/transcrever-audio`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ mensagem_id: msg.id }),
        }
      );
      const data = await res.json();
      if (!data.success && !data.transcricao) {
        console.error('[ChatPanel] Erro ao transcrever:', data.error);
      }
    } catch (err) {
      console.error('[ChatPanel] Erro ao transcrever áudio:', err);
    } finally {
      setTranscrevendoId(null);
    }
  }, [transcrevendoId]);

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

  // Limpar gravação ao desmontar ou trocar de conversa
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [conversa.id]);

  // Ref para resolver a Promise de parada do recorder
  const stopResolveRef = useRef<(() => void) | null>(null);

  // Iniciar gravação de áudio
  const iniciarGravacao = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      audioChunksRef.current = [];

      // Preferir OGG/Opus (WhatsApp PTT), fallback para WebM/Opus
      const mimeType = MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        // Resolver a Promise de parada se existir
        if (stopResolveRef.current) {
          stopResolveRef.current();
          stopResolveRef.current = null;
        }
      };

      recorder.onerror = (e) => {
        console.error('[ChatPanel] MediaRecorder erro:', e);
        // Resolver a Promise de parada mesmo em caso de erro
        if (stopResolveRef.current) {
          stopResolveRef.current();
          stopResolveRef.current = null;
        }
      };

      recorder.start(250); // chunks a cada 250ms
      setGravando(true);
      setTempoGravacao(0);

      // Timer visual
      timerRef.current = setInterval(() => {
        setTempoGravacao(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('[ChatPanel] Erro ao acessar microfone:', err);
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  }, []);

  // Parar gravação e limpar recursos (sem enviar)
  const pararGravacaoSilencioso = useCallback(() => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    } catch { /* ignorar */ }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    audioChunksRef.current = [];
    setGravando(false);
    setTempoGravacao(0);
  }, []);

  // Cancelar gravação
  const cancelarGravacao = useCallback(() => {
    pararGravacaoSilencioso();
  }, [pararGravacaoSilencioso]);

  // Enviar gravação
  const enviarGravacao = useCallback(async () => {
    if (!mediaRecorderRef.current || enviando) return;

    const recorder = mediaRecorderRef.current;
    const mimeType = recorder.mimeType || 'audio/webm';

    try {
      // Parar e esperar o último chunk via onstop handler
      if (recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          stopResolveRef.current = resolve;
          recorder.stop();
          // Timeout de segurança: resolver após 1s se onstop não disparar
          setTimeout(() => {
            if (stopResolveRef.current) {
              stopResolveRef.current();
              stopResolveRef.current = null;
            }
          }, 1000);
        });
      }

      // Parar stream e timer
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      const chunks = [...audioChunksRef.current];
      audioChunksRef.current = [];
      setGravando(false);
      setTempoGravacao(0);

      if (chunks.length === 0) {
        console.warn('[ChatPanel] Nenhum chunk de áudio gravado');
        return;
      }

      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(chunks, { type: mimeType });
      const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: mimeType });

      console.log('[ChatPanel] Enviando áudio:', file.name, (file.size / 1024).toFixed(1) + 'KB', mimeType);

      await onEnviarMidia(file, 'audio');
    } catch (err) {
      console.error('[ChatPanel] Erro ao enviar áudio:', err);
      // Garantir limpeza em caso de erro
      setGravando(false);
      setTempoGravacao(0);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [enviando, onEnviarMidia]);

  // Formatar tempo de gravação (mm:ss)
  const formatarTempoGravacao = (segundos: number): string => {
    const min = Math.floor(segundos / 60).toString().padStart(2, '0');
    const sec = (segundos % 60).toString().padStart(2, '0');
    return `${min}:${sec}`;
  };

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

  const isMila = conversa.atribuido_a === 'mila';
  const etapaNome = lead.crm_pipeline_etapas?.nome || lead.status || '';

  // Agrupar mensagens por data
  const mensagensComSeparadores = agruparPorData(mensagens);

  return (
    <div className="flex-1 flex flex-col bg-slate-900 min-w-0">
      {/* Header do Chat */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between flex-shrink-0 bg-slate-800/50">
        <div className="flex items-center gap-3">
          {conversa.foto_perfil_url ? (
            <img
              src={conversa.foto_perfil_url}
              alt={lead.nome || 'Lead'}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-bold text-sm">
              {getIniciais(lead.nome)}
            </div>
          )}
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
          {/* Botão Buscar */}
          <Tooltip content="Buscar nas mensagens" side="bottom">
            <button
              onClick={toggleBusca}
              className={cn(
                'p-2 rounded-lg transition',
                buscaAberta ? 'text-violet-400 bg-violet-500/10' : 'text-slate-400 hover:text-white hover:bg-slate-700'
              )}
            >
              <Search className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Barra de busca de mensagens */}
      {buscaAberta && (
        <div className="px-4 py-2 border-b border-slate-700/50 bg-slate-800/30 flex items-center gap-2 flex-shrink-0 animate-in slide-in-from-top-2 duration-150">
          <Search className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <input
            ref={buscaInputRef}
            type="text"
            value={termoBusca}
            onChange={(e) => { setTermoBusca(e.target.value); setIndiceBuscaAtual(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navegarBusca('proximo');
              if (e.key === 'Escape') toggleBusca();
            }}
            placeholder="Buscar nas mensagens..."
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 outline-none"
          />
          {termoBusca && (
            <span className="text-[10px] text-slate-500 flex-shrink-0">
              {resultadosBusca.length > 0
                ? `${indiceBuscaAtual + 1}/${resultadosBusca.length}`
                : 'Nenhum resultado'}
            </span>
          )}
          {resultadosBusca.length > 0 && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button onClick={() => navegarBusca('anterior')} className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => navegarBusca('proximo')} className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <button onClick={toggleBusca} className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition flex-shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Área de mensagens */}
      <div
        ref={chatAreaRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scroll-smooth"
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
          <div className="space-y-4 py-4">
            {/* Skeleton bolhas de chat */}
            <div className="flex justify-start">
              <div className="max-w-[60%] animate-pulse">
                <div className="bg-slate-800/60 rounded-2xl rounded-tl-md px-4 py-3 space-y-2">
                  <div className="h-3 bg-slate-700/60 rounded w-48" />
                  <div className="h-3 bg-slate-700/40 rounded w-36" />
                </div>
                <div className="h-2.5 bg-slate-700/30 rounded w-16 mt-1.5 ml-1" />
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[60%] animate-pulse">
                <div className="bg-violet-600/10 rounded-2xl rounded-tr-md px-4 py-3 space-y-2">
                  <div className="h-3 bg-violet-500/20 rounded w-52" />
                  <div className="h-3 bg-violet-500/15 rounded w-32" />
                </div>
                <div className="h-2.5 bg-slate-700/30 rounded w-20 mt-1.5 ml-auto mr-1" />
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[60%] animate-pulse">
                <div className="bg-slate-800/60 rounded-2xl rounded-tl-md px-4 py-3 space-y-2">
                  <div className="h-3 bg-slate-700/60 rounded w-56" />
                  <div className="h-3 bg-slate-700/40 rounded w-40" />
                  <div className="h-3 bg-slate-700/30 rounded w-24" />
                </div>
                <div className="h-2.5 bg-slate-700/30 rounded w-16 mt-1.5 ml-1" />
              </div>
            </div>
            <div className="flex justify-end">
              <div className="max-w-[60%] animate-pulse">
                <div className="bg-violet-600/10 rounded-2xl rounded-tr-md px-4 py-3 space-y-2">
                  <div className="h-3 bg-violet-500/20 rounded w-44" />
                </div>
                <div className="h-2.5 bg-slate-700/30 rounded w-20 mt-1.5 ml-auto mr-1" />
              </div>
            </div>
            <div className="flex justify-start">
              <div className="max-w-[60%] animate-pulse">
                <div className="bg-slate-800/60 rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="h-10 bg-slate-700/40 rounded w-56" />
                </div>
                <div className="h-2.5 bg-slate-700/30 rounded w-16 mt-1.5 ml-1" />
              </div>
            </div>
          </div>
        )}

        {/* Estado vazio — sem mensagens */}
        {!loading && mensagens.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8 gap-4 animate-in fade-in duration-500">
            <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-violet-400/60" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Nenhuma mensagem ainda</p>
              <p className="text-xs text-slate-500 mt-1.5 max-w-[240px]">
                Envie a primeira mensagem para iniciar a conversa com este lead
              </p>
            </div>
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
          const isDestaque = termoBusca && resultadosBusca.length > 0 && resultadosBusca[indiceBuscaAtual]?.mensagem.id === item.mensagem.id;
          return (
            <div key={item.mensagem.id} id={`msg-${item.mensagem.id}`} className={cn(isDestaque && 'ring-2 ring-violet-500 ring-offset-2 ring-offset-slate-900 rounded-2xl transition-all duration-300')}>
              <ChatBubble
                mensagem={item.mensagem}
                mensagemOriginal={item.mensagem.reply_to_id ? mensagensMap.get(item.mensagem.reply_to_id) || null : null}
                onResponder={handleResponder}
                onEditar={handleEditarMensagem}
                onDeletar={handleDeletarMensagem}
                onTranscrever={handleTranscreverAudio}
                onReagir={handleReagir}
                transcrevendoId={transcrevendoId}
                editandoId={editandoMensagemId}
                textoEdicao={textoEdicao}
                onTextoEdicaoChange={setTextoEdicao}
                onSalvarEdicao={handleSalvarEdicao}
                onCancelarEdicao={handleCancelarEdicao}
                salvandoEdicao={salvandoEdicao}
              />
            </div>
          );
        })}

        {/* Indicador "digitando..." durante envio */}
        {enviando && (
          <div className="flex items-end gap-2 px-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="bg-slate-800 border border-slate-700/50 rounded-2xl rounded-bl-md px-4 py-2.5 shadow-sm">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '600ms' }} />
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '600ms' }} />
                <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '600ms' }} />
              </div>
            </div>
            <span className="text-[10px] text-slate-500 mb-1">enviando...</span>
          </div>
        )}
      </div>

      {/* Botão flutuante: scroll para o fundo */}
      {!scrollNoFundo && (
        <div className="relative">
          <button
            onClick={scrollParaFundo}
            className="absolute -top-12 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/90 border border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700 shadow-lg backdrop-blur-sm transition-all animate-in fade-in slide-in-from-bottom-2 duration-200"
          >
            <ChevronDown className="w-4 h-4" />
            {novasMensagensAbaixo > 0 && (
              <span className="bg-violet-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {novasMensagensAbaixo}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Barra de templates */}
      {templateAberto && (
        <TemplateSelector
          onSelecionar={handleUsarTemplateDropdown}
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
                   <FileIcon className="w-6 h-6 text-violet-400" />}
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
            >
              {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      )}

      {/* Barra "Respondendo a..." */}
      {mensagemRespondendo && !arquivoPreview && (
        <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/40 flex items-center gap-3 flex-shrink-0 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex-1 min-w-0 border-l-2 border-violet-500 pl-3">
            <p className="text-[10px] font-medium text-violet-400">
              {mensagemRespondendo.remetente_nome || (mensagemRespondendo.direcao === 'saida' ? 'Você' : 'Lead')}
            </p>
            <p className="text-[11px] text-slate-400 truncate">
              {mensagemRespondendo.tipo !== 'texto' ? `[${mensagemRespondendo.tipo}] ` : ''}
              {mensagemRespondendo.conteudo || ''}
            </p>
          </div>
          <button
            onClick={() => setMensagemRespondendo(null)}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-white transition flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input de mensagem */}
      {!arquivoPreview && (
        <div className={cn("px-4 py-3 border-t border-slate-700 flex-shrink-0 bg-slate-800/30", mensagemRespondendo && "border-t-0")}>
          <div className="flex items-end gap-2">
            {/* Botão anexar */}
            <div className="relative pb-1">
              <Tooltip content="Anexar arquivo" side="top">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuAnexoAberto(!menuAnexoAberto); }}
                  className="p-2 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700 transition"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
              </Tooltip>
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
                    <FileIcon className="w-4 h-4 text-blue-400" />
                    Documento
                  </button>
                </div>
              )}
            </div>
            {/* Campo de texto OU barra de gravação */}
            {gravando ? (
              /* Barra de gravação de áudio */
              <div className="flex-1 flex items-center gap-3 bg-slate-800 border border-red-500/50 rounded-xl px-4 py-2.5">
                {/* Indicador pulsante */}
                <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
                <span className="text-sm text-red-400 font-mono font-medium flex-shrink-0">
                  {formatarTempoGravacao(tempoGravacao)}
                </span>
                <span className="text-xs text-slate-400">Gravando áudio...</span>
                <div className="flex-1" />
                {/* Cancelar */}
                <Tooltip content="Cancelar gravação" side="top">
                  <button
                    onClick={cancelarGravacao}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </Tooltip>
              </div>
            ) : (
              <div className="flex-1 relative">
                {/* Dropdown de templates (ativado por /) */}
                {templateDropdownAberto && (
                  <TemplateSelector
                    modo="dropdown"
                    filtroInicial={templateFiltroInicial}
                    onSelecionar={handleUsarTemplateDropdown}
                    onFechar={() => { setTemplateDropdownAberto(false); setTexto(''); textareaRef.current?.focus(); }}
                  />
                )}
                {/* Emoji Picker popup */}
                {emojiPickerAberto && (
                  <EmojiPicker
                    onSelecionar={handleInserirEmoji}
                    onFechar={() => setEmojiPickerAberto(false)}
                  />
                )}
                <textarea
                  ref={textareaRef}
                  rows={1}
                  value={texto}
                  onChange={(e) => { handleTextoChange(e.target.value); handleTextareaInput(); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Digite sua mensagem... (/ para templates)"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-200 placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none resize-none max-h-32"
                />
                {/* Botão emoji dentro do textarea */}
                <Tooltip content="Inserir emoji" side="top">
                  <button
                    onClick={() => setEmojiPickerAberto(!emojiPickerAberto)}
                    className={cn(
                      "absolute right-2 bottom-2 p-1 rounded-lg transition",
                      emojiPickerAberto
                        ? "text-yellow-400 bg-slate-700"
                        : "text-slate-500 hover:text-yellow-400 hover:bg-slate-700/50"
                    )}
                  >
                    <Smile className="w-[18px] h-[18px]" />
                  </button>
                </Tooltip>
              </div>
            )}
            {/* Botões */}
            <div className="flex items-center gap-1 pb-1">
              {!gravando && (
                <>
                  <Tooltip content="Templates rápidos" side="top">
                    <button
                      onClick={() => setTemplateAberto(!templateAberto)}
                      className="p-2 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-slate-700 transition"
                    >
                      <FileText className="w-5 h-5" />
                    </button>
                  </Tooltip>
                  <Tooltip content="Gerenciar templates" side="top">
                    <button
                      onClick={() => setModalTemplatesAberto(true)}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </Tooltip>
                </>
              )}
              {/* Botão Microfone / Enviar áudio / Enviar texto */}
              {gravando ? (
                <button
                  onClick={enviarGravacao}
                  disabled={enviando}
                  className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition"
                >
                  {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              ) : texto.trim() ? (
                <button
                  onClick={handleEnviar}
                  disabled={enviando}
                  className="p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition"
                >
                  {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              ) : (
                <Tooltip content="Gravar áudio" side="top">
                  <button
                    onClick={iniciarGravacao}
                    className="p-2.5 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                </Tooltip>
              )}
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

      {/* Modal Gerenciar Templates */}
      <ModalGerenciarTemplates
        aberto={modalTemplatesAberto}
        onFechar={() => setModalTemplatesAberto(false)}
      />

      {/* AlertDialog Confirmar Exclusão */}
      <AlertDialog open={!!mensagemDeletar} onOpenChange={(open) => !open && setMensagemDeletar(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">Apagar mensagem?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              A mensagem será apagada para todos no WhatsApp. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mensagemDeletar && (
            <div className="px-4 py-2 rounded-lg bg-slate-800/60 border border-slate-700/50 text-sm text-slate-300 line-clamp-3">
              {mensagemDeletar.conteudo || `[${mensagemDeletar.tipo}]`}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarDeletar}
              disabled={deletando}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {deletando ? 'Apagando...' : 'Apagar para todos'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
