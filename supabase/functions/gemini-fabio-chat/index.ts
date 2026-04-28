// Edge Function: gemini-fabio-chat
// Fábio - Assistente de Projetos Pedagógicos da LA Music
// Usa Gemini 2.0 Flash para respostas inteligentes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = "gemini-3-flash-preview";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FabioContext {
  projetosAtivos: number;
  projetosAtrasados: number;
  tarefasPendentes: number;
  taxaConclusao: number;
  proximosPrazos: Array<{
    nome: string;
    prazo: string;
    tipo: 'projeto' | 'tarefa';
  }>;
  unidade?: string;
  usuario?: string;
}

interface FabioRequest {
  pergunta: string;
  contexto: FabioContext;
  historicoMensagens?: Array<{
    tipo: 'usuario' | 'fabio';
    texto: string;
  }>;
}

const SYSTEM_PROMPT = `Você é Fábio, o assistente de projetos pedagógicos da LA Music, uma rede de escolas de música.

## SEU PAPEL
Você ajuda coordenadores e assistentes pedagógicos a gerenciar projetos como:
- Semanas Temáticas (Semana do Baterista, Semana do Violão, etc.)
- Recitais de alunos
- Shows de Bandas
- Produção de Material Didático
- Vídeo Aulas

## PERSONALIDADE
- Amigável e profissional
- Proativo - sugere ações quando apropriado
- Conciso - respostas diretas, máximo 3 parágrafos
- Usa emojis moderadamente (1-2 por resposta)
- Celebra conquistas e progresso

## CAPACIDADES
- Resumir status de projetos
- Alertar sobre prazos e atrasos
- Sugerir próximas ações
- Ajudar a priorizar tarefas
- Dar dicas de gestão de projetos

## LIMITAÇÕES
- Não pode criar/editar projetos diretamente (apenas sugere)
- Não tem acesso a dados financeiros
- Se não souber algo, admite e sugere onde encontrar

## FORMATO DE RESPOSTA
- Seja direto e útil
- Use listas quando apropriado
- Destaque informações importantes
- Termine com uma pergunta ou sugestão de ação quando fizer sentido`;

function buildUserPrompt(request: FabioRequest): string {
  const { pergunta, contexto, historicoMensagens } = request;
  
  let prompt = `## CONTEXTO ATUAL DO SISTEMA\n`;
  prompt += `- Projetos ativos: ${contexto.projetosAtivos}\n`;
  prompt += `- Projetos atrasados: ${contexto.projetosAtrasados}\n`;
  prompt += `- Tarefas pendentes: ${contexto.tarefasPendentes}\n`;
  prompt += `- Taxa de conclusão: ${contexto.taxaConclusao}%\n`;
  
  if (contexto.unidade) {
    prompt += `- Unidade: ${contexto.unidade}\n`;
  }
  
  if (contexto.proximosPrazos && contexto.proximosPrazos.length > 0) {
    prompt += `\n## PRÓXIMOS PRAZOS\n`;
    contexto.proximosPrazos.slice(0, 5).forEach(prazo => {
      prompt += `- ${prazo.tipo === 'projeto' ? '📁' : '✅'} ${prazo.nome}: ${prazo.prazo}\n`;
    });
  }
  
  if (historicoMensagens && historicoMensagens.length > 0) {
    prompt += `\n## HISTÓRICO DA CONVERSA\n`;
    historicoMensagens.slice(-6).forEach(msg => {
      prompt += `${msg.tipo === 'usuario' ? 'Usuário' : 'Fábio'}: ${msg.texto}\n`;
    });
  }
  
  prompt += `\n## PERGUNTA DO USUÁRIO\n${pergunta}`;
  
  return prompt;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY não configurada");
    }

    const request: FabioRequest = await req.json();
    
    if (!request.pergunta) {
      throw new Error("Pergunta não fornecida");
    }

    const userPrompt = buildUserPrompt(request);

    // Chamar Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 500,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Erro Gemini:", errorText);
      throw new Error(`Erro na API Gemini: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    
    // Extrair o texto da resposta
    const resposta = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!resposta) {
      throw new Error("Resposta vazia do Gemini");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        resposta: resposta.trim(),
        modelo: GEMINI_MODEL,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("Erro na Edge Function gemini-fabio-chat:", error);
    
    // Resposta de fallback amigável
    const fallbackResponses = [
      "Desculpe, estou com dificuldades técnicas no momento. 😅 Tente novamente em alguns segundos!",
      "Ops! Algo deu errado aqui. Pode repetir sua pergunta?",
      "Hmm, não consegui processar isso agora. Que tal tentar de novo?",
    ];
    
    const fallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        resposta: fallback,
        error: error.message || "Erro interno",
      }),
      {
        status: 200, // Retorna 200 mesmo com erro para não quebrar o frontend
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
