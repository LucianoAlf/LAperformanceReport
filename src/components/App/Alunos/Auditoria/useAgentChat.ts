import { supabase } from '@/lib/supabase';

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
    id: string;
    role: Role;
    content: string;
    attachments?: File[];
    isAnalyzedData?: boolean;
    sqlQuery?: string;
    sqlResult?: any;
    visualizationType?: string;
    visualizationConfig?: any;
    metadata?: {
        used_template?: boolean;
        template_name?: string;
        from_cache?: boolean;
        tokens_used?: number;
        cost_usd?: number;
        tool_calls_count?: number;
    };
}

export interface ToolCallProgress {
    toolName: string;
    status: 'calling' | 'done';
}

export interface AgentContext {
    isAdmin: boolean;
    unidadeId: string | null;
    unidadeNome: string | null;
    colaboradorId?: number | null;
    colaboradorTipo?: string | null;
    fileData?: Record<string, string>[];
}

/**
 * Envia mensagem para Sol (VPS) via fila assíncrona na Supabase.
 * Frontend insere mensagem com status=pending, VPS processa e grava resposta,
 * frontend recebe via Realtime.
 */
export async function chatComIA(
    message: string,
    conversationId: string | null,
    agentCtx: AgentContext,
    title?: string,
    _onToolProgress?: (progress: ToolCallProgress) => void,
): Promise<{
    content: string;
    conversationId: string;
    sqlQuery?: string;
    sqlResult?: any;
    visualizationType?: string;
    visualizationConfig?: any;
    metadata?: any;
}> {
    // 1. Garantir conversa
    let convId = conversationId;
    if (!convId) {
        const { data, error } = await supabase
            .from('bi_conversations_lamusic')
            .insert({
                title: title || message.slice(0, 60),
                unidade_id: agentCtx.unidadeId || null,
                colaborador_id: agentCtx.colaboradorId || null,
                colaborador_tipo: agentCtx.colaboradorTipo || null,
            })
            .select('id')
            .single();
        if (error) throw new Error(`Erro ao criar conversa: ${error.message}`);
        convId = data!.id;
    }

    // 2. Inserir mensagem do usuário como pending
    const { data: userMsg, error: insertError } = await supabase
        .from('bi_messages_lamusic')
        .insert({
            conversation_id: convId,
            role: 'user',
            content: message,
            status: 'pending',
        })
        .select('id')
        .single();
    if (insertError) throw new Error(`Erro ao enviar mensagem: ${insertError.message}`);

    // 3. Aguardar resposta da Sol via Realtime
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            channel.unsubscribe();
            reject(new Error('Sol não respondeu em 5 minutos. Tente novamente.'));
        }, 300_000);

        const channel = supabase
            .channel(`sol-reply-${userMsg!.id}`)
            // Resposta da Sol (INSERT de mensagem assistant)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'bi_messages_lamusic',
                    filter: `conversation_id=eq.${convId}`,
                },
                (payload) => {
                    const msg = payload.new as any;
                    if (msg.role === 'assistant') {
                        clearTimeout(timeout);
                        channel.unsubscribe();
                        resolve({
                            content: msg.content || '',
                            conversationId: convId!,
                        });
                    }
                },
            )
            // Detecta erro imediato: status='error' na mensagem do usuário
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'bi_messages_lamusic',
                    filter: `id=eq.${userMsg!.id}`,
                },
                (payload) => {
                    const msg = payload.new as any;
                    if (msg.status === 'error') {
                        clearTimeout(timeout);
                        channel.unsubscribe();
                        reject(new Error(msg.error_message || 'Sol encontrou um erro ao processar a mensagem.'));
                    }
                },
            )
            .subscribe();
    });
}

/**
 * Carrega histórico de conversas do usuário.
 */
export async function loadConversations(): Promise<{ id: string; title: string; updated_at: string; total_tokens: number; total_cost_usd: number }[]> {
    const { data } = await supabase
        .from('bi_conversations_lamusic')
        .select('id, title, updated_at, total_tokens, total_cost_usd')
        .eq('is_archived', false)
        .order('updated_at', { ascending: false })
        .limit(20);
    return data || [];
}

/**
 * Carrega mensagens de uma conversa.
 */
export async function loadMessages(conversationId: string): Promise<ChatMessage[]> {
    const { data } = await supabase
        .from('bi_messages_lamusic')
        .select('id, role, content, sql_query, sql_result, visualization_type, visualization_config, prompt_tokens, completion_tokens, cost_usd, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

    return (data || []).map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content || '',
        sqlQuery: m.sql_query,
        sqlResult: m.sql_result,
        visualizationType: m.visualization_type,
        visualizationConfig: m.visualization_config,
        metadata: m.prompt_tokens ? { tokens_used: (m.prompt_tokens || 0) + (m.completion_tokens || 0), cost_usd: m.cost_usd } : undefined,
    }));
}

/**
 * Salva feedback (rating) em uma mensagem.
 */
export async function saveFeedback(messageId: string, rating: number): Promise<void> {
    await supabase.from('bi_messages_lamusic').update({ feedback_rating: rating }).eq('id', messageId);
}
