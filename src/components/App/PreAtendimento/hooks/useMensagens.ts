import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { MensagemCRM } from '../types';

const MENSAGENS_POR_PAGINA = 50;

interface UseMensagensParams {
  conversaId: string | null;
  leadId: number | null;
}

export function useMensagens({ conversaId, leadId }: UseMensagensParams) {
  const [mensagens, setMensagens] = useState<MensagemCRM[]>([]);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Buscar mensagens da conversa (paginação reversa)
  const fetchMensagens = useCallback(async (offset = 0) => {
    if (!conversaId) {
      setMensagens([]);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('crm_mensagens')
        .select('*')
        .eq('conversa_id', conversaId)
        .order('created_at', { ascending: false })
        .range(offset, offset + MENSAGENS_POR_PAGINA - 1);

      if (error) throw error;

      const msgs = (data || []).reverse() as MensagemCRM[];

      if (offset === 0) {
        setMensagens(msgs);
      } else {
        // Prepend mensagens mais antigas
        setMensagens(prev => [...msgs, ...prev]);
      }

      setTemMais((data || []).length === MENSAGENS_POR_PAGINA);
    } catch (err) {
      console.error('[useMensagens] Erro:', err);
    } finally {
      setLoading(false);
    }
  }, [conversaId]);

  // Carregar mais mensagens (scroll up)
  const carregarMais = useCallback(() => {
    if (loading || !temMais) return;
    fetchMensagens(mensagens.length);
  }, [loading, temMais, mensagens.length, fetchMensagens]);

  // Fetch inicial quando muda a conversa
  useEffect(() => {
    fetchMensagens(0);
  }, [fetchMensagens]);

  // Realtime: escutar novas mensagens desta conversa
  useEffect(() => {
    if (!conversaId) return;

    // Limpar canal anterior
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`crm_mensagens_${conversaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'crm_mensagens',
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const novaMensagem = payload.new as MensagemCRM;
          setMensagens(prev => {
            // Evitar duplicatas por ID
            if (prev.some(m => m.id === novaMensagem.id)) return prev;

            // Evitar duplicatas por whatsapp_message_id
            if (novaMensagem.whatsapp_message_id && prev.some(m => m.whatsapp_message_id === novaMensagem.whatsapp_message_id)) return prev;

            // Verificar se existe mensagem otimista correspondente (enviando/enviada, saída recente)
            // Isso cobre a race condition: Realtime chega antes da Edge Function atualizar o ID
            const idxOtimista = novaMensagem.direcao === 'saida' ? prev.findIndex(m =>
              m.direcao === 'saida' &&
              (m.status_entrega === 'enviando' || m.status_entrega === 'enviada') &&
              m.tipo === novaMensagem.tipo &&
              (m.conteudo === novaMensagem.conteudo || (m.midia_url && m.midia_url === novaMensagem.midia_url))
            ) : -1;

            if (idxOtimista !== -1) {
              // Substituir a otimista pela mensagem real do banco
              const updated = [...prev];
              updated[idxOtimista] = novaMensagem;
              return updated;
            }

            return [...prev, novaMensagem];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'crm_mensagens',
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const msgAtualizada = payload.new as MensagemCRM;
          setMensagens(prev =>
            prev.map(m => m.id === msgAtualizada.id ? msgAtualizada : m)
          );
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
  }, [conversaId]);

  // Enviar mensagem de texto via Edge Function
  const enviarMensagem = useCallback(async (conteudo: string, replyToId?: string) => {
    if (!conversaId || !leadId || !conteudo.trim()) return null;

    setEnviando(true);
    try {
      // Inserir mensagem otimisticamente no estado local
      const msgOtimista: MensagemCRM = {
        id: crypto.randomUUID(),
        conversa_id: conversaId,
        lead_id: leadId,
        direcao: 'saida',
        tipo: 'texto',
        conteudo: conteudo.trim(),
        midia_url: null,
        midia_mimetype: null,
        midia_nome: null,
        remetente: 'andreza',
        remetente_nome: 'Andreza',
        status_entrega: 'enviando',
        is_sistema: false,
        whatsapp_message_id: null,
        template_id: null,
        reply_to_id: replyToId || null,
        created_at: new Date().toISOString(),
      };

      setMensagens(prev => [...prev, msgOtimista]);

      // Chamar Edge Function para enviar via UAZAPI
      const { data, error } = await supabase.functions.invoke('enviar-mensagem-lead', {
        body: {
          conversa_id: conversaId,
          lead_id: leadId,
          conteudo: conteudo.trim(),
          tipo: 'texto',
          remetente: 'andreza',
          reply_to_id: replyToId || null,
        },
      });

      if (error) throw error;

      // Atualizar mensagem otimista com dados reais
      if (data?.mensagem_id) {
        setMensagens(prev =>
          prev.map(m =>
            m.id === msgOtimista.id
              ? { ...m, id: data.mensagem_id, status_entrega: 'enviada' as const, whatsapp_message_id: data.whatsapp_message_id }
              : m
          )
        );
      }

      return data;
    } catch (err) {
      console.error('[useMensagens] Erro ao enviar:', err);
      // Marcar mensagem otimista como erro
      setMensagens(prev =>
        prev.map(m =>
          m.status_entrega === 'enviando' ? { ...m, status_entrega: 'erro' as const } : m
        )
      );
      return null;
    } finally {
      setEnviando(false);
    }
  }, [conversaId, leadId]);

  // Enviar mídia (imagem, áudio, vídeo, documento) via Storage + Edge Function
  const enviarMidia = useCallback(async (
    arquivo: File,
    tipo: 'imagem' | 'audio' | 'video' | 'documento',
    caption?: string,
  ) => {
    if (!conversaId || !leadId || !arquivo) return null;

    setEnviando(true);
    try {
      // 1. Upload para Supabase Storage (bucket crm-midia)
      const extensao = arquivo.name.split('.').pop() || 'bin';
      const nomeArquivo = `${conversaId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${extensao}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('crm-midia')
        .upload(nomeArquivo, arquivo, {
          contentType: arquivo.type,
          cacheControl: '3600',
        });

      if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`);

      // 2. Gerar URL pública para a UAZAPI enviar
      const { data: urlData } = supabase.storage
        .from('crm-midia')
        .getPublicUrl(uploadData.path);

      const midiaUrl = urlData.publicUrl;

      // 3. Mensagem otimista
      const previewConteudo = caption || (tipo === 'imagem' ? '📷 Imagem' : tipo === 'audio' ? '🎵 Áudio' : tipo === 'video' ? '🎬 Vídeo' : `📄 ${arquivo.name}`);
      const msgOtimista: MensagemCRM = {
        id: crypto.randomUUID(),
        conversa_id: conversaId,
        lead_id: leadId,
        direcao: 'saida',
        tipo,
        conteudo: caption || null,
        midia_url: midiaUrl,
        midia_mimetype: arquivo.type,
        midia_nome: arquivo.name,
        remetente: 'andreza',
        remetente_nome: 'Andreza',
        status_entrega: 'enviando',
        is_sistema: false,
        whatsapp_message_id: null,
        template_id: null,
        reply_to_id: null,
        created_at: new Date().toISOString(),
      };

      setMensagens(prev => [...prev, msgOtimista]);

      // 4. Chamar Edge Function
      const { data, error } = await supabase.functions.invoke('enviar-mensagem-lead', {
        body: {
          conversa_id: conversaId,
          lead_id: leadId,
          conteudo: caption || null,
          tipo,
          remetente: 'andreza',
          midia_url: midiaUrl,
          midia_mimetype: arquivo.type,
          midia_nome: arquivo.name,
        },
      });

      if (error) throw error;

      // 5. Atualizar mensagem otimista
      if (data?.mensagem_id) {
        setMensagens(prev =>
          prev.map(m =>
            m.id === msgOtimista.id
              ? { ...m, id: data.mensagem_id, status_entrega: 'enviada' as const, whatsapp_message_id: data.whatsapp_message_id }
              : m
          )
        );
      }

      return data;
    } catch (err) {
      console.error('[useMensagens] Erro ao enviar mídia:', err);
      setMensagens(prev =>
        prev.map(m =>
          m.status_entrega === 'enviando' ? { ...m, status_entrega: 'erro' as const } : m
        )
      );
      return null;
    } finally {
      setEnviando(false);
    }
  }, [conversaId, leadId]);

  return {
    mensagens,
    loading,
    enviando,
    temMais,
    carregarMais,
    enviarMensagem,
    enviarMidia,
    refetch: () => fetchMensagens(0),
  };
}
