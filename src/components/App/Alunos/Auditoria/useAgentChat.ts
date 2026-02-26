import { getOpenAIConfig, type OpenAIConfig } from './useOpenAIAnalysis';
import { AGENT_TOOLS_SCHEMA, executeTool, type AgentContext } from './agentTools';

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
    id: string;
    role: Role;
    content: string;
    attachments?: File[];
    isAnalyzedData?: boolean;
}

/**
 * Número máximo de ciclos de tool_calls antes de forçar uma resposta final.
 * Isto evita loops infinitos caso a IA fique num ciclo.
 */
const MAX_TOOL_ROUNDS = 5;

export interface ToolCallProgress {
    toolName: string;
    status: 'calling' | 'done';
}

/**
 * Envia mensagens para a API da OpenAI com suporte a Tool Calling.
 * 
 * Fluxo:
 * 1. Envia as mensagens + tools schema para a OpenAI
 * 2. Se a resposta contiver tool_calls, executa cada ferramenta localmente
 * 3. Devolve os resultados como mensagens role="tool"
 * 4. Reenvia para a OpenAI até obter uma resposta final em texto
 * 
 * IMPORTANTE: Nenhuma tool altera a base de dados. Apenas leitura.
 */
export async function chatComIA(
    messages: { role: string; content: string; tool_call_id?: string }[],
    agentCtx: AgentContext,
    onToolProgress?: (progress: ToolCallProgress) => void,
): Promise<string> {
    const config = getOpenAIConfig();
    if (!config.apiKey) {
        throw new Error('Chave da API da OpenAI não configurada. Vá em Configurações > Inteligência Artificial.');
    }

    // Cópia mutável do histórico para acumular tool calls
    const conversationMessages: any[] = [...messages];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
                model: config.model || 'gpt-4o-mini',
                messages: conversationMessages,
                temperature: 0.3,
                tools: AGENT_TOOLS_SCHEMA,
                tool_choice: 'auto',
            }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`Erro na API OpenAI: ${err?.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];

        if (!choice) {
            throw new Error('Resposta inesperada da API OpenAI (sem choices).');
        }

        const assistantMessage = choice.message;

        // Adiciona a resposta do assistente ao histórico
        conversationMessages.push(assistantMessage);

        // Se não houver tool_calls, a resposta final é o content
        if (choice.finish_reason !== 'tool_calls' && !assistantMessage.tool_calls) {
            return assistantMessage.content || 'Sem resposta da IA.';
        }

        // Processar tool_calls
        const toolCalls = assistantMessage.tool_calls || [];

        for (const toolCall of toolCalls) {
            const toolName = toolCall.function.name;
            const toolArgs = toolCall.function.arguments;

            // Notificar progresso
            onToolProgress?.({ toolName, status: 'calling' });

            // Executar a ferramenta localmente (SOMENTE LEITURA, com contexto de permissão)
            const toolResult = await executeTool(toolName, toolArgs, agentCtx);

            onToolProgress?.({ toolName, status: 'done' });

            // Adicionar o resultado como mensagem role="tool"
            conversationMessages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: toolResult,
            });
        }

        // O loop continua: vamos enviar os resultados das tools de volta à OpenAI
    }

    // Se chegou aqui, atingiu o limite de rounds. Forçar resposta.
    return 'Desculpe, não consegui processar sua solicitação após várias tentativas. Tente reformular a pergunta.';
}
