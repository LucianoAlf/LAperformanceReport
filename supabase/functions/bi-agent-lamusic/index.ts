// Edge Function: bi-agent-lamusic
// Agente BI com tool calling, Text-to-SQL, cache, auto-correção e isolamento por unidade
// API key segura server-side, nunca exposta no frontend

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { FULL_DATABASE_SCHEMA } from './schema.ts';
import { TOOLS_SCHEMA, executeTool, type AgentContext } from './tools.ts';
import { validateSQL, ensureLimit, normalizeSQL, extractTablesFromText } from './sql-validator.ts';
import { hashSQL, matchTemplate, buildVisualizationConfig, autoDetectVisualizationType } from './utils.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// API key carregada do banco (assistente_ia_config) — não depende de env secret
let OPENAI_API_KEY = '';

const MAX_TOOL_ROUNDS = 5;
const MAX_SQL_RETRIES = 3;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function buildSystemPrompt(ctx: AgentContext): string {
  const unidadeInfo = ctx.isAdmin
    ? 'Você tem acesso ADMIN — pode ver dados de TODAS as unidades. Se o usuário perguntar sem especificar unidade, mostre consolidado.'
    : `Você tem acesso restrito à unidade "${ctx.unidadeNome}". TODOS os dados que você retornar DEVEM ser desta unidade. Nunca mencione dados de outras unidades.`;

  return `Você é o assistente de BI da LA Music, uma rede de escolas de música com 3 unidades (Campo Grande, Recreio, Barra da Tijuca).

${unidadeInfo}

Responda sempre em português brasileiro. Seja direto e objetivo. Use dados reais das tools disponíveis.

Quando retornar dados tabulares, sugira o tipo de visualização mais adequado no final da resposta usando o formato:
[VIZ:tipo] onde tipo = bar, line, pie, kpi, table

Regras:
1. Use as tools especializadas primeiro (get_dados_mensais, search_aluno, etc.)
2. Use consultar_banco como ÚLTIMO recurso para queries que as tools não cobrem
3. Ao usar consultar_banco, SEMPRE use SELECT. Nunca INSERT/UPDATE/DELETE
4. Timezone: sempre BRT (UTC-3) para datas do negócio
5. Ticket médio: considerar apenas tipos_matricula com entra_ticket_medio = true
6. Alunos pagantes: considerar apenas tipos_matricula com conta_como_pagante = true

${FULL_DATABASE_SCHEMA}`;
}

async function callOpenAI(
  messages: any[],
  tools: any[],
  config: { model: string; temperature: number; max_tokens: number },
): Promise<{ response: any; promptTokens: number; completionTokens: number }> {
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: config.model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      temperature: config.temperature,
      max_tokens: config.max_tokens,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`OpenAI API error ${resp.status}: ${err}`);
  }
  const data = await resp.json();
  const choice = data.choices?.[0];
  return {
    response: choice,
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
  };
}

// Auto-correção: se SQL falhou, busca schema real e tenta de novo
async function autoCorrectSQL(
  supabase: any, sql: string, error: string, ctx: AgentContext,
  config: { model: string; temperature: number; max_tokens: number },
): Promise<{ result: any; sql: string; attempts: number } | null> {
  let currentSQL = sql;
  let lastError = error;

  for (let attempt = 1; attempt <= MAX_SQL_RETRIES; attempt++) {
    const tables = extractTablesFromText(currentSQL + ' ' + lastError);
    if (tables.length === 0) return null;

    const { data: schemaData } = await supabase.rpc('introspect_schema_lamusic', { table_names: tables });

    const correctionMessages = [
      { role: 'system', content: `Você é um assistente SQL. Corrija a query que falhou. Responda APENAS com o SQL corrigido, sem explicação.\n\nSchema real das tabelas:\n${JSON.stringify(schemaData, null, 2)}` },
      { role: 'user', content: `Query que falhou:\n${currentSQL}\n\nErro:\n${lastError}\n\nCorreção:` },
    ];

    const { response } = await callOpenAI(correctionMessages, [], config);
    const content = response?.message?.content?.trim() || '';
    // Extrair SQL da resposta (pode vir em code block)
    const sqlMatch = content.match(/```sql\n?([\s\S]+?)```/) || content.match(/^(SELECT[\s\S]+)/i);
    currentSQL = sqlMatch ? sqlMatch[1].trim() : content;

    const validation = validateSQL(currentSQL);
    if (!validation.valid) continue;

    currentSQL = ensureLimit(currentSQL, 200);
    const { data: result } = await supabase.rpc('execute_bi_query_lamusic', {
      query_text: currentSQL,
      p_unidade_id: ctx.isAdmin ? null : ctx.unidadeId,
      max_rows: 200,
    });

    if (result && !result.error) {
      return { result, sql: currentSQL, attempts: attempt };
    }
    lastError = result?.error || 'Erro desconhecido';
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 0. Supabase client + carregar API key do banco
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!OPENAI_API_KEY) {
      const { data: aiConfig } = await supabase
        .from('assistente_ia_config')
        .select('openai_api_key')
        .limit(1)
        .single();
      OPENAI_API_KEY = aiConfig?.openai_api_key || Deno.env.get('OPENAI_API_KEY') || '';
      if (!OPENAI_API_KEY) throw new Error('OpenAI API key não configurada');
    }

    // 1. Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authorization header missing');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Usuário não autenticado');

    // 2. Resolver perfil e unidade (SEGURANÇA CRÍTICA)
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin, unidade_id, nome, unidades:unidade_id(nome, codigo)')
      .eq('id', user.id)
      .single();

    const body = await req.json();
    const { message, conversation_id, unidade_id_override } = body;

    if (!message) throw new Error('Mensagem é obrigatória');

    const isAdmin = profile?.is_admin || false;
    // Não-admin: SEMPRE usa unidade do perfil (ignora override)
    const unidadeId = isAdmin ? (unidade_id_override || null) : (profile?.unidade_id || null);
    let unidadeNome: string | null = null;
    if (!isAdmin) {
      unidadeNome = (profile?.unidades as any)?.nome || null;
    } else if (unidade_id_override) {
      // Admin com override: buscar nome da unidade selecionada
      const { data: unidadeData } = await supabase
        .from('unidades').select('nome').eq('id', unidade_id_override).single();
      unidadeNome = unidadeData?.nome || null;
    }

    const ctx: AgentContext = { isAdmin, unidadeId, unidadeNome };

    // 3. Config
    const { data: configRow } = await supabase
      .from('bi_agent_config_lamusic')
      .select('*')
      .eq('is_active', true)
      .limit(1)
      .single();

    const config = {
      model: configRow?.model || 'gpt-4o-mini',
      temperature: Number(configRow?.temperature) || 0.1,
      max_tokens: configRow?.max_tokens || 4096,
      maxResults: configRow?.max_results_per_query || 200,
      cacheEnabled: configRow?.cache_enabled ?? true,
      cacheTTL: configRow?.cache_ttl_minutes || 60,
    };

    // 4. Conversa
    let convId = conversation_id;
    if (!convId) {
      const { data: newConv } = await supabase
        .from('bi_conversations_lamusic')
        .insert({ user_id: user.id, title: message.substring(0, 100) })
        .select('id')
        .single();
      convId = newConv?.id;
    }

    // Salvar mensagem do usuário
    await supabase.from('bi_messages_lamusic').insert({
      conversation_id: convId, role: 'user', content: message,
    });

    // Carregar últimas 10 mensagens para contexto
    const { data: history } = await supabase
      .from('bi_messages_lamusic')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
      .limit(10);

    // 5. Template matching (bypass LLM)
    const { data: templates } = await supabase
      .from('bi_query_templates_lamusic')
      .select('id, name, question_pattern, sql_template, default_visualization')
      .eq('is_active', true);

    const templateMatch = matchTemplate(message, templates || []);
    if (templateMatch) {
      // Executar SQL do template direto
      const sql = ensureLimit(templateMatch.sql, config.maxResults);

      // Cache check
      const sqlHash = await hashSQL(normalizeSQL(sql));
      if (config.cacheEnabled) {
        const { data: cached } = await supabase
          .from('bi_query_cache_lamusic')
          .select('result, row_count')
          .eq('user_id', user.id)
          .eq('query_hash', sqlHash)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (cached) {
          await supabase.from('bi_query_cache_lamusic')
            .update({ hit_count: (cached as any).hit_count + 1 || 1 })
            .eq('user_id', user.id).eq('query_hash', sqlHash);

          const vizConfig = buildVisualizationConfig(templateMatch.visualization, cached.result || []);
          const msg = await supabase.from('bi_messages_lamusic').insert({
            conversation_id: convId, role: 'assistant',
            content: `Resultado de "${templateMatch.templateName}":`,
            sql_query: sql, sql_result: cached.result, sql_row_count: cached.row_count,
            visualization_type: templateMatch.visualization, visualization_config: vizConfig,
          }).select('id, content, sql_query, sql_result, sql_row_count, visualization_type, visualization_config, created_at').single();

          // Increment template usage
          await supabase.from('bi_query_templates_lamusic')
            .update({ usage_count: (templateMatch as any).usage_count + 1 || 1 })
            .eq('id', templateMatch.templateId);

          return new Response(JSON.stringify({
            conversation_id: convId, message: msg.data, suggested_questions: [],
            metadata: { used_template: true, template_name: templateMatch.templateName, from_cache: true },
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }

      // Execute SQL
      const { data: result } = await supabase.rpc('execute_bi_query_lamusic', {
        query_text: sql, p_unidade_id: ctx.isAdmin ? null : ctx.unidadeId, max_rows: config.maxResults,
      });

      const resultData = (result && !result.error) ? result : [];
      const rowCount = Array.isArray(resultData) ? resultData.length : 0;

      // Cache save
      if (config.cacheEnabled && rowCount > 0) {
        await supabase.from('bi_query_cache_lamusic').upsert({
          user_id: user.id, query_hash: sqlHash, original_sql: sql,
          result: resultData, row_count: rowCount,
          expires_at: new Date(Date.now() + config.cacheTTL * 60000).toISOString(),
        }, { onConflict: 'user_id,query_hash' });
      }

      const vizConfig = buildVisualizationConfig(templateMatch.visualization, resultData);
      const msg = await supabase.from('bi_messages_lamusic').insert({
        conversation_id: convId, role: 'assistant',
        content: `Resultado de "${templateMatch.templateName}":`,
        sql_query: sql, sql_result: resultData, sql_row_count: rowCount,
        visualization_type: templateMatch.visualization, visualization_config: vizConfig,
      }).select('id, content, sql_query, sql_result, sql_row_count, visualization_type, visualization_config, created_at').single();

      await supabase.from('bi_query_templates_lamusic')
        .update({ usage_count: (templateMatch as any).usage_count + 1 || 1 })
        .eq('id', templateMatch.templateId);

      return new Response(JSON.stringify({
        conversation_id: convId, message: msg.data, suggested_questions: [],
        metadata: { used_template: true, template_name: templateMatch.templateName, from_cache: false },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 6. LLM path com tool calling
    const conversationMessages: any[] = [
      { role: 'system', content: buildSystemPrompt(ctx) },
      ...(history || []).map((m: any) => ({ role: m.role, content: m.content })),
    ];

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let finalContent = '';
    let finalSQLQuery: string | null = null;
    let finalSQLResult: any = null;
    let finalVizType = 'none';
    let finalVizConfig: any = null;
    const allToolCalls: any[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const { response, promptTokens, completionTokens } = await callOpenAI(
        conversationMessages, TOOLS_SCHEMA, config
      );
      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;

      const msg = response?.message;
      if (!msg) break;

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        conversationMessages.push(msg);

        for (const tc of msg.tool_calls) {
          const toolName = tc.function.name;
          const toolArgs = tc.function.arguments;
          allToolCalls.push({ name: toolName, arguments: toolArgs });

          console.log(`[bi-agent] Tool: ${toolName}`);
          let toolResult: string;

          if (toolName === 'consultar_banco') {
            // SQL tool com auto-correção
            const args = JSON.parse(toolArgs);
            const sql = args.sql_query;
            const validation = validateSQL(sql);

            if (!validation.valid) {
              toolResult = JSON.stringify({ erro: validation.reason });
            } else {
              const limitedSQL = ensureLimit(sql, config.maxResults);

              // Cache check
              const sqlHash = await hashSQL(normalizeSQL(limitedSQL));
              let fromCache = false;
              if (config.cacheEnabled) {
                const { data: cached } = await supabase
                  .from('bi_query_cache_lamusic')
                  .select('result, row_count')
                  .eq('user_id', user.id).eq('query_hash', sqlHash)
                  .gt('expires_at', new Date().toISOString()).single();
                if (cached) {
                  toolResult = JSON.stringify({ resultado: cached.result, total: cached.row_count });
                  finalSQLQuery = limitedSQL;
                  finalSQLResult = cached.result;
                  fromCache = true;
                  await supabase.from('bi_query_cache_lamusic')
                    .update({ hit_count: (cached as any).hit_count + 1 || 1 })
                    .eq('user_id', user.id).eq('query_hash', sqlHash);
                }
              }

              if (!fromCache) {
                const { data: result } = await supabase.rpc('execute_bi_query_lamusic', {
                  query_text: limitedSQL, p_unidade_id: ctx.isAdmin ? null : ctx.unidadeId, max_rows: config.maxResults,
                });

                if (result?.error) {
                  // Auto-correção
                  const corrected = await autoCorrectSQL(supabase, limitedSQL, result.error, ctx, config);
                  if (corrected) {
                    toolResult = JSON.stringify({ resultado: corrected.result, total: Array.isArray(corrected.result) ? corrected.result.length : 0, auto_corrigido: true, tentativas: corrected.attempts });
                    finalSQLQuery = corrected.sql;
                    finalSQLResult = corrected.result;
                  } else {
                    toolResult = JSON.stringify({ erro: result.error, detalhe: result.detail });
                  }
                } else {
                  toolResult = JSON.stringify({ resultado: result, total: Array.isArray(result) ? result.length : 0 });
                  finalSQLQuery = limitedSQL;
                  finalSQLResult = result;

                  // Cache save
                  if (config.cacheEnabled && Array.isArray(result) && result.length > 0) {
                    await supabase.from('bi_query_cache_lamusic').upsert({
                      user_id: user.id, query_hash: sqlHash, original_sql: limitedSQL,
                      result, row_count: result.length,
                      expires_at: new Date(Date.now() + config.cacheTTL * 60000).toISOString(),
                    }, { onConflict: 'user_id,query_hash' });
                  }
                }
              }
            }
          } else {
            toolResult = await executeTool(supabase, toolName, toolArgs, ctx);
            // Capturar dados tabulares de qualquer tool para visualização
            try {
              const parsed = JSON.parse(toolResult);
              const dataArray = parsed.dados_mensais || parsed.alunos || parsed.leads || parsed.leads_hoje || parsed.resultado || parsed.unidades;
              if (Array.isArray(dataArray) && dataArray.length > 0 && !finalSQLResult) {
                finalSQLResult = dataArray;
              }
            } catch { /* não é JSON ou sem dados tabulares */ }
          }

          conversationMessages.push({
            role: 'tool', tool_call_id: tc.id, content: toolResult,
          });
        }
      } else {
        // Resposta final
        finalContent = msg.content || '';
        // Extrair hint de visualização da resposta (se o LLM incluiu)
        let vizHint: string | undefined;
        const vizMatch = finalContent.match(/\[VIZ:(\w+)\]/);
        if (vizMatch) {
          vizHint = vizMatch[1];
          finalContent = finalContent.replace(/\[VIZ:\w+\]/, '').trim();
        }
        // Auto-detectar tipo de visualização baseado nos dados + hint do LLM
        if (finalSQLResult && Array.isArray(finalSQLResult) && finalSQLResult.length > 0) {
          finalVizType = autoDetectVisualizationType(finalSQLResult, vizHint);
          if (finalVizType !== 'none' && finalVizType !== 'table') {
            finalVizConfig = buildVisualizationConfig(finalVizType, finalSQLResult);
          }
        }
        break;
      }
    }

    // Se não obteve resposta após max rounds, forçar
    if (!finalContent) {
      conversationMessages.push({ role: 'user', content: 'Resuma os dados obtidos e responda a pergunta original de forma direta.' });
      const { response, promptTokens, completionTokens } = await callOpenAI(conversationMessages, [], config);
      totalPromptTokens += promptTokens;
      totalCompletionTokens += completionTokens;
      finalContent = response?.message?.content || 'Não foi possível processar sua pergunta.';
    }

    // 7. Salvar e retornar
    const costUsd = (totalPromptTokens * 0.00015 + totalCompletionTokens * 0.0006) / 1000; // gpt-4o-mini pricing

    const { data: savedMsg } = await supabase.from('bi_messages_lamusic').insert({
      conversation_id: convId, role: 'assistant', content: finalContent,
      sql_query: finalSQLQuery, sql_result: finalSQLResult,
      sql_row_count: Array.isArray(finalSQLResult) ? finalSQLResult.length : null,
      visualization_type: finalVizType !== 'none' ? finalVizType : null,
      visualization_config: finalVizConfig,
      tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
      prompt_tokens: totalPromptTokens, completion_tokens: totalCompletionTokens,
      cost_usd: costUsd,
    }).select('id, content, sql_query, sql_result, sql_row_count, visualization_type, visualization_config, tool_calls, prompt_tokens, completion_tokens, cost_usd, created_at').single();

    // Update conversation totals
    await supabase.from('bi_conversations_lamusic')
      .update({
        total_tokens: (totalPromptTokens + totalCompletionTokens),
        total_cost_usd: costUsd,
        updated_at: new Date().toISOString(),
      })
      .eq('id', convId);

    return new Response(JSON.stringify({
      conversation_id: convId,
      message: savedMsg,
      suggested_questions: [],
      metadata: {
        used_template: false, from_cache: false,
        tokens_used: totalPromptTokens + totalCompletionTokens,
        cost_usd: costUsd,
        tool_calls_count: allToolCalls.length,
      },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[bi-agent] Erro:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
