// Edge Function: mila-processar-mensagem
// Cérebro da Mila — processa mensagens de leads e responde via OpenAI GPT-4o
// Chamada pelo webhook-whatsapp-inbox após inserir mensagem de entrada
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ============================================================================
// TOOLS DEFINITIONS (OpenAI Function Calling)
// ============================================================================

const TOOLS_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'pensar',
      description: 'Use para raciocinar internamente em casos complexos (mais de uma pessoa, mais de um instrumento, objeções insistentes, reagendamentos). O resultado NÃO é enviado ao lead.',
      parameters: {
        type: 'object',
        properties: {
          raciocinio: { type: 'string', description: 'Seu raciocínio interno sobre a situação' },
        },
        required: ['raciocinio'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bd_conhecimento',
      description: 'Busca informações sobre a LA Music: diferenciais, benefícios, cursos, metodologia, FAQ. Use sempre que precisar explicar algo sobre a escola ou quebrar objeções.',
      parameters: {
        type: 'object',
        properties: {
          consulta: { type: 'string', description: 'O que você quer saber (ex: "diferenciais", "cursos disponíveis", "como funciona")' },
        },
        required: ['consulta'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'atualizar_lead',
      description: 'Atualiza dados do lead no CRM e sincroniza com Emusys. Use após etapas 2 e 3 quando souber: nome, para quem é a aula, instrumento de interesse e motivação.',
      parameters: {
        type: 'object',
        properties: {
          nome: { type: 'string', description: 'Nome do lead ou de quem vai fazer a aula' },
          instrumento: { type: 'string', description: 'Instrumento de interesse' },
          para_quem: { type: 'string', description: 'Para quem é a aula: "proprio", "filho", "crianca", "bebe"' },
          idade: { type: 'number', description: 'Idade de quem vai fazer a aula (se informada)' },
          motivacao: { type: 'string', description: 'O que motivou a busca pelas aulas' },
          canal_origem: { type: 'string', description: 'Como conheceu a LA Music: "facebook", "instagram", "google", "indicacao", "passou_na_frente", "outro"' },
          faixa_etaria: { type: 'string', enum: ['LAMK', 'EMLA'], description: 'LAMK = kids (até 11 anos), EMLA = adolescentes/adultos (12+)' },
        },
        required: ['nome'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'verificar_horarios',
      description: 'Consulta horários disponíveis para aula experimental. Use quando o lead informar o dia e período de preferência.',
      parameters: {
        type: 'object',
        properties: {
          dia_semana: { type: 'string', description: 'Dia da semana: "segunda", "terca", "quarta", "quinta", "sexta", "sabado"' },
          periodo: { type: 'string', enum: ['manha', 'tarde', 'noite'], description: 'Período preferido' },
        },
        required: ['dia_semana'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'agendar_experimental',
      description: 'Agenda uma aula experimental após o lead confirmar todos os dados. Só use quando tiver: nome, data, horário, instrumento e como conheceu.',
      parameters: {
        type: 'object',
        properties: {
          nome_aluno: { type: 'string', description: 'Nome de quem vai fazer a aula' },
          data: { type: 'string', description: 'Data da aula experimental (formato: YYYY-MM-DD)' },
          horario: { type: 'string', description: 'Horário da aula (formato: HH:MM)' },
          instrumento: { type: 'string', description: 'Instrumento escolhido' },
          como_conheceu: { type: 'string', description: 'Como conheceu a LA Music' },
          data_nascimento: { type: 'string', description: 'Data de nascimento (formato: YYYY-MM-DD)' },
        },
        required: ['nome_aluno', 'data', 'horario', 'instrumento'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preparar_aula',
      description: 'Salva as preferências musicais do lead para preparar a aula experimental. OBRIGATÓRIO após o lead responder a pergunta de preparação (banda/cantor favorito).',
      parameters: {
        type: 'object',
        properties: {
          banda_cantor_favorito: { type: 'string', description: 'Banda ou cantor favorito do lead' },
          observacoes: { type: 'string', description: 'Outras observações relevantes para a aula' },
        },
        required: ['banda_cantor_favorito'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transferir',
      description: 'Transfere o atendimento para um consultor humano. Use quando: lead insiste em preço, quer falar com humano, demonstra desinteresse, não tem o instrumento, quer outra unidade, ou situação que você não consegue resolver.',
      parameters: {
        type: 'object',
        properties: {
          motivo: { type: 'string', description: 'Motivo da transferência' },
        },
        required: ['motivo'],
      },
    },
  },
];

// ============================================================================
// TOOL HANDLERS
// ============================================================================

async function handleToolCall(
  toolName: string,
  args: any,
  context: { supabase: any; leadId: number; conversaId: string; config: any }
): Promise<string> {
  const { supabase, leadId, conversaId, config } = context;

  switch (toolName) {
    case 'pensar': {
      return `[Raciocínio interno]: ${args.raciocinio}`;
    }

    case 'bd_conhecimento': {
      return config.base_conhecimento || 'Base de conhecimento não configurada.';
    }

    case 'atualizar_lead': {
      const updateData: any = {};
      if (args.nome) updateData.nome = args.nome;
      if (args.faixa_etaria) updateData.faixa_etaria = args.faixa_etaria;
      if (args.idade) updateData.idade = args.idade;

      // Mapear instrumento para curso_interesse_id
      if (args.instrumento) {
        const { data: curso } = await supabase
          .from('cursos')
          .select('id')
          .ilike('nome', `%${args.instrumento}%`)
          .limit(1)
          .maybeSingle();
        if (curso) updateData.curso_interesse_id = curso.id;
      }

      // Mapear canal_origem
      if (args.canal_origem) {
        const { data: canal } = await supabase
          .from('canais_origem')
          .select('id')
          .ilike('nome', `%${args.canal_origem}%`)
          .limit(1)
          .maybeSingle();
        if (canal) updateData.canal_origem_id = canal.id;
      }

      // Salvar motivação nas observações
      if (args.motivacao) {
        updateData.observacoes = args.motivacao;
      }

      if (Object.keys(updateData).length > 0) {
        updateData.updated_at = new Date().toISOString();
        await supabase.from('leads').update(updateData).eq('id', leadId);
      }

      // Sync com Emusys
      if (config.emusys_token && args.nome) {
        try {
          await fetch(config.emusys_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: config.emusys_token,
              nome: args.nome,
              instrumento: args.instrumento || '',
              observacao: args.motivacao || '',
            }),
          });
        } catch (e) {
          console.error('[mila] Erro ao sync Emusys:', e);
        }
      }

      return `Lead atualizado: ${JSON.stringify(args)}`;
    }

    case 'verificar_horarios': {
      const horarios = config.horarios_disponiveis || {};
      const dia = args.dia_semana?.toLowerCase();
      const horariosdia = horarios[dia] || [];

      if (horariosdia.length === 0) {
        return `Não há horários disponíveis para ${dia}. Dias disponíveis: ${Object.keys(horarios).join(', ')}`;
      }

      let filtrados = horariosdia;
      if (args.periodo === 'manha') {
        filtrados = horariosdia.filter((h: string) => parseInt(h) < 12);
      } else if (args.periodo === 'tarde') {
        filtrados = horariosdia.filter((h: string) => parseInt(h) >= 12 && parseInt(h) < 18);
      } else if (args.periodo === 'noite') {
        filtrados = horariosdia.filter((h: string) => parseInt(h) >= 18);
      }

      if (filtrados.length === 0) {
        return `Não há horários no período ${args.periodo} para ${dia}. Horários disponíveis: ${horariosdia.join(', ')}`;
      }

      return `Horários disponíveis para ${dia} (${args.periodo || 'todos'}): ${filtrados.join(', ')}`;
    }

    case 'agendar_experimental': {
      const updateAgenda: any = {
        experimental_agendada: true,
        data_experimental: args.data,
        horario_experimental: args.horario,
        etapa_pipeline_id: null, // será atualizado abaixo
        updated_at: new Date().toISOString(),
      };

      // Buscar etapa "Experimental Agendada" no pipeline
      const { data: etapa } = await supabase
        .from('crm_pipeline_etapas')
        .select('id')
        .eq('slug', 'experimental_agendada')
        .maybeSingle();
      if (etapa) updateAgenda.etapa_pipeline_id = etapa.id;

      await supabase.from('leads').update(updateAgenda).eq('id', leadId);

      // Registrar no histórico
      await supabase.from('crm_lead_historico').insert({
        lead_id: leadId,
        tipo: 'agendamento',
        descricao: `Aula experimental agendada pela Mila para ${args.data} às ${args.horario} - ${args.instrumento}`,
        dados: args,
      });

      // Sync com Emusys
      if (config.emusys_token) {
        try {
          await fetch(config.emusys_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: config.emusys_token,
              nome: args.nome_aluno,
              instrumento: args.instrumento || '',
              data_experimental: args.data,
              horario_experimental: args.horario,
              como_conheceu: args.como_conheceu || '',
              data_nascimento: args.data_nascimento || '',
            }),
          });
        } catch (e) {
          console.error('[mila] Erro ao sync Emusys agendamento:', e);
        }
      }

      return `Aula experimental agendada com sucesso para ${args.nome_aluno} em ${args.data} às ${args.horario} (${args.instrumento})`;
    }

    case 'preparar_aula': {
      const obs = [
        `Banda/cantor favorito: ${args.banda_cantor_favorito}`,
        args.observacoes ? `Obs: ${args.observacoes}` : '',
      ].filter(Boolean).join(' | ');

      await supabase
        .from('leads')
        .update({
          observacoes_professor: obs,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      return `Preparação da aula salva: ${obs}`;
    }

    case 'transferir': {
      // Pausar Mila na conversa
      await supabase
        .from('crm_conversas')
        .update({
          mila_pausada: true,
          mila_pausada_em: new Date().toISOString(),
          mila_pausada_por: 'mila_auto',
          atribuido_a: 'andreza',
        })
        .eq('id', conversaId);

      // Inserir mensagem de sistema
      await supabase.from('crm_mensagens').insert({
        conversa_id: conversaId,
        lead_id: leadId,
        direcao: 'saida',
        tipo: 'sistema',
        conteudo: `🔄 Mila transferiu o atendimento. Motivo: ${args.motivo}`,
        remetente: 'sistema',
        remetente_nome: 'Sistema',
        status_entrega: 'entregue',
        is_sistema: true,
      });

      // Atualizar lead
      await supabase
        .from('leads')
        .update({
          data_passagem_mila: new Date().toISOString(),
          motivo_passagem_mila: args.motivo,
        })
        .eq('id', leadId);

      return `Atendimento transferido para consultor humano. Motivo: ${args.motivo}`;
    }

    default:
      return `Tool "${toolName}" não reconhecida.`;
  }
}

// ============================================================================
// DEBOUNCE LOGIC
// ============================================================================

async function debounce(
  supabase: any,
  conversaId: string,
  leadId: number,
  conteudo: string,
  tipo: string,
  debounceSegundos: number
): Promise<{ shouldProcess: boolean; mensagensAcumuladas: string }> {
  // Inserir no buffer
  await supabase.from('mila_message_buffer').insert({
    conversa_id: conversaId,
    lead_id: leadId,
    conteudo,
    tipo,
  });

  // Aguardar o tempo de debounce
  await new Promise(resolve => setTimeout(resolve, debounceSegundos * 1000));

  // Buscar mensagens não processadas desta conversa
  const { data: pendentes } = await supabase
    .from('mila_message_buffer')
    .select('id, conteudo, tipo, created_at')
    .eq('conversa_id', conversaId)
    .eq('processado', false)
    .order('created_at', { ascending: true });

  if (!pendentes || pendentes.length === 0) {
    return { shouldProcess: false, mensagensAcumuladas: '' };
  }

  // Verificar se a última mensagem no buffer é a que acabamos de inserir
  // Se não for, significa que outra mensagem chegou depois — essa instância não processa
  const { data: ultimaPendente } = await supabase
    .from('mila_message_buffer')
    .select('conteudo')
    .eq('conversa_id', conversaId)
    .eq('processado', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (ultimaPendente?.conteudo !== conteudo) {
    // Outra mensagem chegou depois, essa instância não processa
    return { shouldProcess: false, mensagensAcumuladas: '' };
  }

  // Esta é a última — marcar todas como processadas e juntar
  const ids = pendentes.map((p: any) => p.id);
  await supabase
    .from('mila_message_buffer')
    .update({ processado: true, processado_at: new Date().toISOString() })
    .in('id', ids);

  const mensagensAcumuladas = pendentes
    .map((p: any) => p.conteudo)
    .join('\n');

  return { shouldProcess: true, mensagensAcumuladas };
}

// ============================================================================
// MAIN: PROCESSAR MENSAGEM
// ============================================================================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { conversa_id, lead_id, mensagem_conteudo, mensagem_tipo } = await req.json();

    if (!conversa_id || !lead_id) {
      return new Response(
        JSON.stringify({ error: 'conversa_id e lead_id são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Verificar se Mila está ativa na conversa
    const { data: conversa } = await supabase
      .from('crm_conversas')
      .select('id, mila_pausada, unidade_id, lead_id')
      .eq('id', conversa_id)
      .single();

    if (!conversa || conversa.mila_pausada) {
      console.log('[mila] Mila pausada ou conversa não encontrada, ignorando.');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'mila_pausada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Buscar config da Mila para a unidade
    const { data: config } = await supabase
      .from('mila_config')
      .select('*')
      .eq('unidade_id', conversa.unidade_id)
      .eq('ativo', true)
      .maybeSingle();

    if (!config) {
      console.log('[mila] Config não encontrada para unidade:', conversa.unidade_id);
      return new Response(
        JSON.stringify({ skipped: true, reason: 'config_not_found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Debounce
    const { shouldProcess, mensagensAcumuladas } = await debounce(
      supabase,
      conversa_id,
      lead_id,
      mensagem_conteudo || '',
      mensagem_tipo || 'texto',
      config.debounce_segundos
    );

    if (!shouldProcess) {
      console.log('[mila] Debounce: outra mensagem chegou depois, esta instância não processa.');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'debounce' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[mila] Processando mensagens acumuladas: "${mensagensAcumuladas.substring(0, 100)}..."`);

    // 4. Buscar contexto: últimas N mensagens da conversa
    const { data: mensagensHistorico } = await supabase
      .from('crm_mensagens')
      .select('direcao, conteudo, remetente, created_at')
      .eq('conversa_id', conversa_id)
      .neq('tipo', 'sistema')
      .order('created_at', { ascending: false })
      .limit(config.max_mensagens_contexto);

    const historico = (mensagensHistorico || []).reverse();

    // 5. Buscar dados do lead
    const { data: lead } = await supabase
      .from('leads')
      .select(`
        id, nome, telefone, whatsapp, idade, unidade_id,
        curso_interesse_id, canal_origem_id, status,
        faixa_etaria, temperatura, etapa_pipeline_id,
        experimental_agendada, data_experimental, horario_experimental,
        observacoes, observacoes_professor, qtd_mensagens_mila,
        cursos:curso_interesse_id(nome),
        canais_origem:canal_origem_id(nome),
        crm_pipeline_etapas:etapa_pipeline_id(nome, slug)
      `)
      .eq('id', lead_id)
      .single();

    // 6. Montar mensagens para OpenAI
    const now = new Date();
    const dataHora = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'medium' });

    const systemPrompt = config.prompt_sistema
      .replace(
        /Hoje é:.*Horário Padrão de Brasília/,
        `Hoje é: ${dataHora} Horário Padrão de Brasília`
      );

    // Contexto do lead para o system prompt
    const leadContext = lead ? `
# Dados do lead atual:
- Nome: ${lead.nome || 'Não informado'}
- Telefone: ${lead.telefone || lead.whatsapp || 'Não informado'}
- Idade: ${lead.idade || 'Não informada'}
- Curso de interesse: ${lead.cursos?.nome || 'Não informado'}
- Canal de origem: ${lead.canais_origem?.nome || 'Não informado'}
- Faixa etária: ${lead.faixa_etaria || 'Não classificado'}
- Etapa: ${lead.crm_pipeline_etapas?.nome || 'Novo'}
- Experimental agendada: ${lead.experimental_agendada ? `Sim (${lead.data_experimental} ${lead.horario_experimental})` : 'Não'}
- Mensagens com Mila: ${lead.qtd_mensagens_mila || 0}
` : '';

    const messages: any[] = [
      { role: 'system', content: systemPrompt + '\n' + leadContext },
    ];

    // Adicionar histórico de conversa
    for (const msg of historico) {
      if (msg.direcao === 'entrada') {
        messages.push({ role: 'user', content: msg.conteudo || '' });
      } else if (msg.remetente === 'mila') {
        messages.push({ role: 'assistant', content: msg.conteudo || '' });
      }
    }

    // Adicionar mensagem atual (acumulada pelo debounce)
    if (mensagensAcumuladas && !historico.some((m: any) => m.conteudo === mensagensAcumuladas)) {
      messages.push({ role: 'user', content: mensagensAcumuladas });
    }

    // 7. Chamar OpenAI com function calling (loop para tool calls)
    let assistantResponse = '';
    let toolCallsCount = 0;
    const MAX_TOOL_CALLS = 5;

    while (toolCallsCount < MAX_TOOL_CALLS) {
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: config.modelo_openai,
          messages,
          tools: TOOLS_DEFINITIONS,
          tool_choice: 'auto',
          temperature: parseFloat(config.temperatura_modelo),
          max_tokens: config.max_tokens,
        }),
      });

      if (!openaiResponse.ok) {
        const errBody = await openaiResponse.text();
        console.error('[mila] Erro OpenAI:', openaiResponse.status, errBody);
        throw new Error(`OpenAI API error: ${openaiResponse.status}`);
      }

      const completion = await openaiResponse.json();
      const choice = completion.choices?.[0];

      if (!choice) {
        console.error('[mila] Sem choices na resposta OpenAI');
        break;
      }

      const message = choice.message;

      // Se tem tool calls, executar
      if (message.tool_calls && message.tool_calls.length > 0) {
        messages.push(message); // Adicionar a mensagem do assistant com tool_calls

        for (const toolCall of message.tool_calls) {
          const fnName = toolCall.function.name;
          const fnArgs = JSON.parse(toolCall.function.arguments || '{}');

          console.log(`[mila] Tool call: ${fnName}(${JSON.stringify(fnArgs).substring(0, 200)})`);

          const result = await handleToolCall(fnName, fnArgs, {
            supabase,
            leadId: lead_id,
            conversaId: conversa_id,
            config,
          });

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }

        toolCallsCount++;
        continue; // Loop para próxima chamada OpenAI
      }

      // Se tem conteúdo de texto, é a resposta final
      if (message.content) {
        assistantResponse = message.content;
      }

      break; // Sair do loop
    }

    if (!assistantResponse) {
      console.log('[mila] Sem resposta do assistant (apenas tool calls)');
      return new Response(
        JSON.stringify({ success: true, tool_calls_only: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Enviar resposta via enviar-mensagem-lead
    console.log(`[mila] Resposta: "${assistantResponse.substring(0, 100)}..."`);

    // Dividir resposta longa em mensagens menores (máx 500 chars por msg)
    const partes = dividirMensagem(assistantResponse, 500);

    for (const parte of partes) {
      const { error: envioError } = await supabase.functions.invoke('enviar-mensagem-lead', {
        body: {
          conversa_id,
          lead_id,
          conteudo: parte,
          tipo: 'texto',
          remetente: 'mila',
        },
      });

      if (envioError) {
        console.error('[mila] Erro ao enviar mensagem:', envioError);
      }

      // Delay entre mensagens múltiplas
      if (partes.length > 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 9. Incrementar qtd_mensagens_mila
    if (lead) {
      await supabase
        .from('leads')
        .update({
          qtd_mensagens_mila: (lead.qtd_mensagens_mila || 0) + 1,
          data_ultimo_contato: new Date().toISOString(),
        })
        .eq('id', lead_id);
    }

    return new Response(
      JSON.stringify({ success: true, response_length: assistantResponse.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[mila] Erro geral:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// UTILS
// ============================================================================

function dividirMensagem(texto: string, maxChars: number): string[] {
  if (texto.length <= maxChars) return [texto];

  const partes: string[] = [];
  let restante = texto;

  while (restante.length > 0) {
    if (restante.length <= maxChars) {
      partes.push(restante);
      break;
    }

    // Tentar quebrar em \n\n, \n, ou espaço
    let corte = restante.lastIndexOf('\n\n', maxChars);
    if (corte <= 0) corte = restante.lastIndexOf('\n', maxChars);
    if (corte <= 0) corte = restante.lastIndexOf(' ', maxChars);
    if (corte <= 0) corte = maxChars;

    partes.push(restante.substring(0, corte).trim());
    restante = restante.substring(corte).trim();
  }

  return partes.filter(p => p.length > 0);
}
