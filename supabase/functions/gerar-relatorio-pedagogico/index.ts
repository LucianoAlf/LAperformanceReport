// Edge Function: gerar-relatorio-pedagogico
// Gera, com IA (Gemini 3 Flash), um relatório pedagógico do aluno a partir do conteúdo
// real das aulas (campo `anotacoes` do Emusys), na voz da equipe pedagógica.
// Fonte de dados = RPC get_relatorio_pedagogico_aluno (mesma do frontend e do futuro Fábio).
// Persiste um rascunho editável em relatorios_pedagogicos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODELO_IA = 'gemini-3-flash-preview';

interface RequestBody {
  aluno_id: number;
  periodo_tipo: 'mensal' | 'semestral' | 'anual' | 'custom';
  data_inicio?: string | null;
  data_fim?: string | null;
}

interface AulaPedagogica {
  data_aula: string;
  horario_aula: string | null;
  status: string | null;
  curso_nome: string | null;
  professor_nome: string | null;
  tipo: string | null;
  turma_nome: string | null;
  anotacoes: string;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

// Chama o Gemini com retry/backoff para 429/503 (padrão dos demais relatórios do projeto).
async function chamarGemini(apiKey: string, prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_IA}:generateContent?key=${apiKey}`;
  const body = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.6, topK: 40, topP: 0.95, maxOutputTokens: 2048 },
  });

  let ultimaResposta: Response | null = null;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (resp.ok) {
      const data = await resp.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }
    ultimaResposta = resp;
    if (resp.status === 429 || resp.status === 503) {
      await new Promise((r) => setTimeout(r, 800 * (tentativa + 1)));
      continue;
    }
    break;
  }
  throw new Error(`Erro na API Gemini: ${ultimaResposta?.status ?? 'desconhecido'}`);
}

function construirPrompt(rep: any, aulas: AulaPedagogica[]): string {
  const nome = rep?.aluno?.nome ?? 'o aluno';
  const primeiroNome = String(nome).split(' ')[0];

  // Agrupa as aulas por curso/instrumento para a IA organizar por seção.
  const porCurso: Record<string, AulaPedagogica[]> = {};
  for (const a of aulas) {
    const curso = a.curso_nome || 'Sem curso';
    (porCurso[curso] ||= []).push(a);
  }
  const instrumentos = Object.keys(porCurso);

  return `Você é a equipe pedagógica de uma escola de música e vai escrever um relatório pedagógico
sobre o(a) aluno(a) ${nome}, destinado ao responsável/familiar.

O relatório se baseia EXCLUSIVAMENTE no conteúdo real das aulas registrado pelos professores
(campo de anotações abaixo). Escreva na voz da equipe pedagógica, com tom acolhedor, profissional
e específico, referindo-se ao(à) aluno(a) como "${primeiroNome}".

REGRAS OBRIGATÓRIAS:
1. Baseie-se APENAS nas anotações fornecidas. NÃO invente fatos, notas, músicas ou evolução que
   não estejam nas anotações. Se houver poucas ou nenhuma anotação em algum instrumento, diga
   isso com naturalidade em vez de inventar.
2. As anotações de aulas em grupo podem mencionar OUTROS alunos. Foque exclusivamente em
   ${primeiroNome} e NUNCA cite nomes de outros alunos.
3. Fale sobre o PROCESSO e a evolução: o que foi trabalhado, repertório, objetivos, avanços e
   dificuldades observadas, de forma clara para um leigo (o responsável).
4. Português do Brasil, sem emojis.

Responda EXATAMENTE neste formato JSON (sem texto fora do JSON):
{
  "instrumentos": [
    { "curso": "nome do instrumento/curso", "professor": "nome do professor", "evolucao": "2 a 4 parágrafos sobre a evolução no período" }
  ],
  "visao_geral": "1 parágrafo consolidando o momento do aluno no período",
  "pontos_atencao": "pontos de atenção observados (ou frase indicando que não há pontos críticos)",
  "proximos_passos": "sugestões de próximos passos pedagógicos"
}

Gere uma entrada em "instrumentos" para cada um destes cursos: ${instrumentos.join(', ') || 'nenhum'}.

DADOS DAS AULAS (JSON):
${JSON.stringify(porCurso, null, 2)}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada');

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Identifica quem gerou (se houver token). Não bloqueia se ausente — a função é
    // chamada por usuário autenticado do sistema, mas mantemos tolerância.
    let geradoPor: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user } } = await supabase.auth.getUser(token);
      geradoPor = user?.id ?? null;
    }

    const { aluno_id, periodo_tipo, data_inicio, data_fim }: RequestBody = await req.json();
    if (!aluno_id || !periodo_tipo) {
      return jsonResponse({ success: false, error: 'aluno_id e periodo_tipo são obrigatórios' }, 400);
    }

    // 1. Busca os dados consolidados (fonte única de verdade)
    const { data: rep, error: rpcError } = await supabase.rpc('get_relatorio_pedagogico_aluno', {
      p_aluno_id: aluno_id,
      p_data_inicio: data_inicio ?? null,
      p_data_fim: data_fim ?? null,
    });
    if (rpcError) throw new Error(`Erro ao buscar dados do aluno: ${rpcError.message}`);
    if (!rep) return jsonResponse({ success: false, error: 'Aluno não encontrado' }, 404);

    const aulas: AulaPedagogica[] = rep.aulas ?? [];

    // 2. Descobre a unidade do aluno para a tabela (RLS por unidade)
    const { data: alunoRow } = await supabase
      .from('alunos')
      .select('unidade_id, nome')
      .eq('id', aluno_id)
      .single();

    // 3. Gera o texto com IA. Sem aulas no período, ainda registramos um rascunho honesto.
    let conteudoJson: any;
    if (aulas.length === 0) {
      conteudoJson = {
        instrumentos: [],
        visao_geral: 'Não há registros de aula com conteúdo pedagógico para o período selecionado.',
        pontos_atencao: 'Sem dados suficientes no período para avaliação.',
        proximos_passos: 'Selecione um período com aulas registradas para gerar a análise pedagógica.',
        sem_dados: true,
      };
    } else {
      const prompt = construirPrompt(rep, aulas);
      const texto = await chamarGemini(GEMINI_API_KEY, prompt);
      try {
        const jsonText = texto.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        conteudoJson = JSON.parse(jsonText);
      } catch {
        // Fallback: guarda o texto solto para o coordenador editar.
        conteudoJson = {
          instrumentos: [],
          visao_geral: texto || 'Não foi possível estruturar a resposta da IA.',
          pontos_atencao: '',
          proximos_passos: '',
          _raw: texto,
        };
      }
    }

    // 4. Persiste o rascunho
    const { data: inserido, error: insError } = await supabase
      .from('relatorios_pedagogicos')
      .insert({
        aluno_id,
        pessoa_nome: rep?.aluno?.nome ?? alunoRow?.nome ?? '',
        unidade_id: alunoRow?.unidade_id ?? null,
        periodo_tipo,
        data_inicio: data_inicio ?? null,
        data_fim: data_fim ?? null,
        conteudo_json: conteudoJson,
        modelo_ia: MODELO_IA,
        status: 'rascunho',
        gerado_por: geradoPor,
      })
      .select('id')
      .single();

    if (insError) throw new Error(`Erro ao salvar relatório: ${insError.message}`);

    return jsonResponse({
      success: true,
      relatorio_id: inserido?.id,
      conteudo_json: conteudoJson,
      total_aulas: aulas.length,
    });
  } catch (error) {
    console.error('[gerar-relatorio-pedagogico]', error);
    return jsonResponse({ success: false, error: (error as Error).message, origem: 'interno' }, 500);
  }
});
