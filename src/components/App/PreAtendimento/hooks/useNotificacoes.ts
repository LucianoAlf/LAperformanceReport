import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface NotificacaoConfig {
  // ID da conversa atualmente aberta (para não notificar msgs da conversa visível)
  conversaAbertaId: string | null;
  // Total de não lidas (para badge no título)
  totalNaoLidas: number;
  // Callback quando chega msg nova de outra conversa
  onNovaMensagem?: (leadNome: string, preview: string, conversaId: string) => void;
}

// Som de notificação usando Web Audio API (tom curto e agradável)
function criarSomNotificacao(): () => void {
  return () => {
    try {
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(880, ctx.currentTime); // Lá5
      oscillator.frequency.setValueAtTime(1108, ctx.currentTime + 0.1); // Dó#6
      oscillator.type = 'sine';

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);

      // Limpar contexto após uso
      setTimeout(() => ctx.close(), 500);
    } catch (err) {
      console.warn('[useNotificacoes] Erro ao tocar som:', err);
    }
  };
}

export function useNotificacoes({ conversaAbertaId, totalNaoLidas, onNovaMensagem }: NotificacaoConfig) {
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const tocarSom = useRef(criarSomNotificacao());
  const tituloOriginal = useRef(document.title);

  // Atualizar título da página com badge de não lidas
  useEffect(() => {
    if (!tituloOriginal.current || tituloOriginal.current.startsWith('(')) {
      // Guardar título limpo na primeira vez
      tituloOriginal.current = document.title.replace(/^\(\d+\)\s*/, '');
    }

    if (totalNaoLidas > 0) {
      document.title = `(${totalNaoLidas}) ${tituloOriginal.current}`;
    } else {
      document.title = tituloOriginal.current;
    }

    return () => {
      document.title = tituloOriginal.current;
    };
  }, [totalNaoLidas]);

  // Escutar mensagens de entrada globalmente via Realtime
  useEffect(() => {
    // Limpar canal anterior
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel('notificacoes_mensagens_entrada')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crm_mensagens',
          filter: 'direcao=eq.entrada',
        },
        async (payload) => {
          const msg = payload.new as {
            id: string;
            conversa_id: string;
            lead_id: number;
            conteudo: string | null;
            tipo: string;
            remetente_nome: string | null;
            direcao: string;
          };

          // Não notificar se a conversa já está aberta
          if (msg.conversa_id === conversaAbertaId) return;

          // Tocar som
          tocarSom.current();

          // Preview do conteúdo
          const preview = msg.tipo !== 'texto'
            ? `[${msg.tipo}]`
            : (msg.conteudo?.substring(0, 60) || 'Nova mensagem');

          const leadNome = msg.remetente_nome || 'Lead';

          // Callback para o componente pai exibir toast
          onNovaMensagem?.(leadNome, preview, msg.conversa_id);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [conversaAbertaId, onNovaMensagem]);
}
