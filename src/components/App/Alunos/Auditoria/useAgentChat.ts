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
}

/**
 * Envia mensagem para o agente BI via edge function server-side.
 * API key segura no servidor — nunca exposta no frontend.
 */
export async function chatComIA(
    message: string,
    conversationId: string | null,
    agentCtx: AgentContext,
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
    const { data, error } = await supabase.functions.invoke('bi-agent-lamusic', {
        body: {
            message,
            conversation_id: conversationId,
            unidade_id_override: agentCtx.isAdmin ? agentCtx.unidadeId : undefined,
        },
    });

    if (error) {
        throw new Error(`Erro no agente BI: ${error.message}`);
    }

    if (data?.error) {
        throw new Error(data.error);
    }

    const msg = data?.message;
    return {
        content: msg?.content || 'Sem resposta.',
        conversationId: data?.conversation_id,
        sqlQuery: msg?.sql_query,
        sqlResult: msg?.sql_result,
        visualizationType: msg?.visualization_type,
        visualizationConfig: msg?.visualization_config,
        metadata: data?.metadata,
    };
}

/**
 * Carrega histórico de conversas do usuário.
 */
export async function loadConversations(): Promise<{ id: string; title: string; updated_at: string }[]> {
    const { data } = await supabase
        .from('bi_conversations_lamusic')
        .select('id, title, updated_at')
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
