import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { AdminMensagem } from '../types';

const MENSAGENS_POR_PAGINA = 50;

interface UseAdminMensagensParams {
  conversaId: string | null;
  alunoId: number | null;
  remetenteNome?: string; // nome do usuario logado
}

export function useAdminMensagens({ conversaId, alunoId, remetenteNome = 'Admin' }: UseAdminMensagensParams) {
  const [mensagens, setMensagens] = useState<AdminMensagem[]>([]);
  const [loading, setLoading] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Buscar mensagens (paginação reversa)
  const fetchMensagens = useCallback(async (offset = 0) => {
    if (!conversaId) {
      setMensagens([]);
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('admin_mensagens')
        .select('*')
        .eq('conversa_id', conversaId)
        .order('created_at', { ascending: false })
        .range(offset, offset + MENSAGENS_POR_PAGINA - 1);

      if (error) throw error;

      const msgs = (data || []).reverse() as AdminMensagem[];

      if (offset === 0) {
        setMensagens(msgs);
      } else {
        setMensagens(prev => [...msgs, ...prev]);
      }

      setTemMais((data || []).length === MENSAGENS_POR_PAGINA);
    } catch (err) {
      console.error('[useAdminMensagens] Erro:', err);
    } finally {
      setLoading(false);
    }
  }, [conversaId]);

  const carregarMais = useCallback(() => {
    if (loading || !temMais) return;
    fetchMensagens(mensagens.length);
  }, [loading, temMais, mensagens.length, fetchMensagens]);

  useEffect(() => {
    fetchMensagens(0);
  }, [fetchMensagens]);

  // Realtime
  useEffect(() => {
    if (!conversaId) return;

    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`admin_mensagens_${conversaId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_mensagens',
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const novaMensagem = payload.new as AdminMensagem;
          setMensagens(prev => {
            if (prev.some(m => m.id === novaMensagem.id)) return prev;
            if (novaMensagem.whatsapp_message_id && prev.some(m => m.whatsapp_message_id === novaMensagem.whatsapp_message_id)) return prev;

            // Substituir mensagem otimista
            const idxOtimista = novaMensagem.direcao === 'saida' ? prev.findIndex(m =>
              m.direcao === 'saida' &&
              (m.status_entrega === 'enviando' || m.status_entrega === 'enviada') &&
              m.tipo === novaMensagem.tipo &&
              (m.conteudo === novaMensagem.conteudo || (m.midia_url && m.midia_url === novaMensagem.midia_url))
            ) : -1;

            if (idxOtimista !== -1) {
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
          table: 'admin_mensagens',
          filter: `conversa_id=eq.${conversaId}`,
        },
        (payload) => {
          const msgAtualizada = payload.new as AdminMensagem;
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

  // Enviar mensagem de texto (fire-and-forget: nao bloqueia UI)
  const enviarMensagem = useCallback(async (conteudo: string) => {
    if (!conversaId || !conteudo.trim()) return null;

    const msgOtimista: AdminMensagem = {
      id: crypto.randomUUID(),
      conversa_id: conversaId,
      aluno_id: alunoId ?? null,
      direcao: 'saida',
      tipo: 'texto',
      conteudo: conteudo.trim(),
      midia_url: null,
      midia_mimetype: null,
      midia_nome: null,
      remetente: 'admin',
      remetente_nome: remetenteNome,
      status_entrega: 'enviando',
      whatsapp_message_id: null,
      created_at: new Date().toISOString(),
    };

    setMensagens(prev => [...prev, msgOtimista]);

    // Fire-and-forget: edge function responde rapido (early return),
    // e o realtime subscription cuida de atualizar o status
    supabase.functions.invoke('enviar-mensagem-admin', {
      body: {
        conversa_id: conversaId,
        aluno_id: alunoId ?? null,
        conteudo: conteudo.trim(),
        tipo: 'texto',
        remetente_nome: remetenteNome,
      },
    }).then(({ data, error }) => {
      if (error) {
        console.error('[useAdminMensagens] Erro ao enviar:', error);
        setMensagens(prev =>
          prev.map(m => m.id === msgOtimista.id ? { ...m, status_entrega: 'erro' as const } : m)
        );
        return;
      }
      // Substituir ID otimista pelo real do banco (realtime cuida do status)
      if (data?.mensagem_id) {
        setMensagens(prev =>
          prev.map(m => m.id === msgOtimista.id ? { ...m, id: data.mensagem_id } : m)
        );
      }
    }).catch(() => {
      setMensagens(prev =>
        prev.map(m => m.id === msgOtimista.id ? { ...m, status_entrega: 'erro' as const } : m)
      );
    });

    return { mensagem_id: msgOtimista.id };
  }, [conversaId, alunoId, remetenteNome]);

  // Enviar mídia (upload sincrono, envio UAZAPI fire-and-forget)
  const enviarMidia = useCallback(async (
    arquivo: File,
    tipo: 'imagem' | 'audio' | 'video' | 'documento',
    caption?: string,
  ) => {
    if (!conversaId || !arquivo) return null;

    setEnviando(true);
    try {
      // Upload precisa ser sincrono (precisa da URL para a edge function)
      const extensao = arquivo.name.split('.').pop() || 'bin';
      const nomeArquivo = `admin/${conversaId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${extensao}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('crm-midia')
        .upload(nomeArquivo, arquivo, {
          contentType: arquivo.type,
          cacheControl: '3600',
        });

      if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`);

      const { data: urlData } = supabase.storage
        .from('crm-midia')
        .getPublicUrl(uploadData.path);

      const midiaUrl = urlData.publicUrl;

      const msgOtimista: AdminMensagem = {
        id: crypto.randomUUID(),
        conversa_id: conversaId,
        aluno_id: alunoId ?? null,
        direcao: 'saida',
        tipo,
        conteudo: caption || null,
        midia_url: midiaUrl,
        midia_mimetype: arquivo.type,
        midia_nome: arquivo.name,
        remetente: 'admin',
        remetente_nome: remetenteNome,
        status_entrega: 'enviando',
        whatsapp_message_id: null,
        created_at: new Date().toISOString(),
      };

      setMensagens(prev => [...prev, msgOtimista]);

      // Fire-and-forget apos upload
      supabase.functions.invoke('enviar-mensagem-admin', {
        body: {
          conversa_id: conversaId,
          aluno_id: alunoId ?? null,
          conteudo: caption || null,
          tipo,
          remetente_nome: remetenteNome,
          midia_url: midiaUrl,
          midia_mimetype: arquivo.type,
          midia_nome: arquivo.name,
        },
      }).then(({ data, error }) => {
        if (error) {
          console.error('[useAdminMensagens] Erro ao enviar mídia:', error);
          setMensagens(prev =>
            prev.map(m => m.id === msgOtimista.id ? { ...m, status_entrega: 'erro' as const } : m)
          );
          return;
        }
        if (data?.mensagem_id) {
          setMensagens(prev =>
            prev.map(m => m.id === msgOtimista.id ? { ...m, id: data.mensagem_id } : m)
          );
        }
      }).catch(() => {
        setMensagens(prev =>
          prev.map(m => m.id === msgOtimista.id ? { ...m, status_entrega: 'erro' as const } : m)
        );
      });

      return { mensagem_id: msgOtimista.id };
    } catch (err) {
      console.error('[useAdminMensagens] Erro ao enviar mídia:', err);
      setMensagens(prev =>
        prev.map(m =>
          m.status_entrega === 'enviando' ? { ...m, status_entrega: 'erro' as const } : m
        )
      );
      return null;
    } finally {
      setEnviando(false);
    }
  }, [conversaId, alunoId, remetenteNome]);

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
