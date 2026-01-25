import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mapeamento de UUIDs para nomes de unidades (UUIDs reais do banco)
const UUID_NOME_MAP: Record<string, string> = {
  "2ec861f6-023f-4d7b-9927-3960ad8c2a92": "Campo Grande",
  "95553e96-971b-4590-a6eb-0201d013c14d": "Recreio",
  "368d47f5-2d88-4475-bc14-ba084a9a348e": "Barra",
};

// Mapeamento de Hunters por unidade
const HUNTERS_MAP: Record<string, { nome: string; apelido: string }> = {
  "2ec861f6-023f-4d7b-9927-3960ad8c2a92": { nome: "Vitória", apelido: "Vitórinha" },
  "95553e96-971b-4590-a6eb-0201d013c14d": { nome: "Clayton", apelido: "Cleitinho" },
  "368d47f5-2d88-4475-bc14-ba084a9a348e": { nome: "Kailane", apelido: "Kai" },
};

// Programa Matriculador+ LA - Metas por unidade
const MATRICULADOR_PLUS_METAS: Record<string, {
  matricula_plus: number;
  max_indicacao: number;
  la_music_family: number;
  ticket_acima_meta: number;
}> = {
  "2ec861f6-023f-4d7b-9927-3960ad8c2a92": { // Campo Grande - Vitória
    matricula_plus: 21,
    max_indicacao: 5,
    la_music_family: 3,
    ticket_acima_meta: 10,
  },
  "95553e96-971b-4590-a6eb-0201d013c14d": { // Recreio - Clayton
    matricula_plus: 17,
    max_indicacao: 4,
    la_music_family: 3,
    ticket_acima_meta: 10,
  },
  "368d47f5-2d88-4475-bc14-ba084a9a348e": { // Barra - Kailane
    matricula_plus: 14,
    max_indicacao: 3,
    la_music_family: 3,
    ticket_acima_meta: 10,
  },
};

// Função para obter info dos outros Hunters (concorrentes)
function getOutrosHunters(unidadeId: string): Array<{ nome: string; apelido: string; unidade: string }> {
  const outros: Array<{ nome: string; apelido: string; unidade: string }> = [];
  for (const [uuid, hunter] of Object.entries(HUNTERS_MAP)) {
    if (uuid !== unidadeId) {
      outros.push({
        ...hunter,
        unidade: UUID_NOME_MAP[uuid] || "Outra unidade",
      });
    }
  }
  return outros;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { unidade_id, ano, mes } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar dados comerciais via função SQL
    const { data: dadosComercial, error: errorDados } = await supabase.rpc(
      "get_dados_comercial_ia",
      {
        p_unidade_id: unidade_id === "todos" ? null : unidade_id,
        p_ano: ano,
        p_mes: mes,
      }
    );

    if (errorDados) {
      console.error("Erro ao buscar dados comerciais:", errorDados);
      throw new Error(`Erro ao buscar dados: ${errorDados.message}`);
    }

    const dados = dadosComercial || {};

    // Determinar se é Super Admin ou Hunter específico
    const isSuperAdmin = unidade_id === "todos" || !unidade_id;
    const nomeUnidade = isSuperAdmin ? "Todas as Unidades" : (UUID_NOME_MAP[unidade_id] || "Unidade");
    const hunter = isSuperAdmin ? null : HUNTERS_MAP[unidade_id];
    const nomeHunter = hunter?.nome || "Administrador";
    const apelidoHunter = hunter?.apelido || "Administrador";
    const outrosHunters = isSuperAdmin ? [] : getOutrosHunters(unidade_id);
    const metasMatriculadorPlus = isSuperAdmin ? null : MATRICULADOR_PLUS_METAS[unidade_id];

    // Extrair KPIs
    const kpis = dados.kpis_atual || {};
    const metas = dados.metas || {};
    const kpisAnoPassado = dados.kpis_ano_passado || {};
    const leadsPorCanal = dados.leads_por_canal || [];
    const leadsPorCurso = dados.leads_por_curso || [];
    const professoresMatriculadores = dados.professores_matriculadores || [];
    const leadsPendentes = dados.leads_pendentes || [];
    const experimentaisAgendadas = dados.experimentais_agendadas || [];
    const motivosNaoMatricula = dados.motivos_nao_matricula || [];
    const lancamentosHoje = dados.lancamentos_hoje || {};
    const acumuladoMes = dados.acumulado_mes || {};

    // Calcular dias úteis restantes e ritmo necessário
    const hoje = new Date();
    const ultimoDiaMes = new Date(ano, mes, 0).getDate();
    const diasRestantes = Math.max(1, ultimoDiaMes - hoje.getDate());
    const diasUteisTotais = 22; // média de dias úteis
    const diasUteisRestantes = Math.max(1, Math.round(diasRestantes * 0.7));

    const matriculasAtuais = kpis.novas_matriculas || 0;
    const metaMatriculas = metas.matriculas_mensais || 20;
    const matriculasFaltam = Math.max(0, metaMatriculas - matriculasAtuais);
    const ritmoNecessario = matriculasFaltam / diasUteisRestantes;

    // Calcular progresso no programa Matriculador+ LA
    let progressoMatriculadorPlus = null;
    if (metasMatriculadorPlus && !isSuperAdmin) {
      const ticketMeta = metas.ticket_medio || 300;
      const ticketAtual = kpis.ticket_medio_novos || 0;
      
      progressoMatriculadorPlus = {
        matricula_plus: {
          atual: matriculasAtuais,
          meta: metasMatriculadorPlus.matricula_plus,
          conquistou: matriculasAtuais >= metasMatriculadorPlus.matricula_plus,
          faltam: Math.max(0, metasMatriculadorPlus.matricula_plus - matriculasAtuais),
        },
        max_indicacao: {
          meta: metasMatriculadorPlus.max_indicacao,
          // Nota: precisaria de dados de indicações no banco
        },
        la_music_family: {
          meta: metasMatriculadorPlus.la_music_family,
          // Nota: precisaria de dados de pacotes family no banco
        },
        ticket_premiado: {
          atual: ticketAtual,
          meta: ticketMeta,
          diferenca: ticketAtual - ticketMeta,
          conquistou: (ticketAtual - ticketMeta) >= metasMatriculadorPlus.ticket_acima_meta,
        },
        leads_abandonados: leadsPendentes.length,
      };
    }

    // Montar contexto dos concorrentes para provocações
    let contextoCompetitivo = "";
    if (!isSuperAdmin && outrosHunters.length > 0) {
      contextoCompetitivo = `
## SEUS CONCORRENTES NO MATRICULADOR+ LA:
${outrosHunters.map(h => `- ${h.nome} (${h.apelido}) - ${h.unidade}`).join("\n")}

Use os nomes/apelidos deles para criar provocações saudáveis e competitivas!
Exemplos de provocações:
- "Será que o ${outrosHunters[0]?.apelido} vai deixar você passar?"
- "A ${outrosHunters[1]?.apelido || outrosHunters[0]?.apelido} tá voando, hein!"
- "Quem vai levar o Matriculador+ LA esse mês?"
- "Imagina a experiência que você vai curtir quando bater a meta!"
`;
    }

    // System Prompt personalizado
    const systemPrompt = isSuperAdmin
      ? `Você é um gerente consultor de vendas especializado em escolas de música, analisando dados CONSOLIDADOS de todas as unidades.
Seu papel é fornecer uma visão gerencial comparativa entre as unidades.

CONTEXTO DO NEGÓCIO:
- LA Music é um grupo de de escolas de música contendo a LA Music School (EMLA) e a LA Music Kids (LAMK) com 3 unidades no Rio de Janeiro: Barra, Campo Grande e Recreio
- O TIME DE HUNTERS são os responsáveis pelo atendimento de leads, agendamento de aulas experimentais e fechamento de matrículas
- Eles são VENDEDORES - ganham comissão por matrícula fechada e estrelas no programa Matriculador + LA que geram experiencias culinárias, culturais, artisticas e viagens.
- Uma dor deles é preencher relatórios diários e o Sistema Emusys - ajude-os a otimizar tempo para conseguir ganhar a estrela Matriculador Emusys.

IMPORTANTE:
- Você está falando com o ADMINISTRADOR (visão geral)
- Compare o desempenho entre as unidades
- Identifique qual unidade está performando melhor
- Sugira ações para equilibrar os resultados

Tom: Profissional, analítico, estratégico.`
      : `Você é um coach de vendas ENERGÉTICO e PROVOCADOR para Hunters de uma escola de música!
Você está falando diretamente com ${nomeHunter} (pode chamar de ${apelidoHunter}), Hunter da unidade ${nomeUnidade}.

PERSONALIDADE:
- Chame pelo NOME diretamente: "${apelidoHunter}, e aí?!" (NUNCA "Hunter ${nomeHunter}")
- Seja DESAFIADOR e COMPETITIVO - vendedores precisam ser estimulados!
- Use provocações saudáveis mencionando os outros Hunters
- Fale sobre as EXPERIÊNCIAS e PRÊMIOS do Matriculador+ LA
- Seja direto, energético, use emojis com moderação
- Crie URGÊNCIA mas com bom humor

${contextoCompetitivo}

FUNIL COMERCIAL (o que você deve analisar):
1. **Leads**: Quantidade de contatos recebidos
2. **Experimentais Agendadas**: Aulas experimentais marcadas
3. **Experimentais Realizadas**: Aulas que aconteceram (show-up)
4. **Matrículas**: Conversões efetivas
5. **Taxa Lead→Exp**: % de leads que agendam experimental
6. **Taxa Exp→Mat**: % de experimentais que viram matrícula
7. **Taxa Geral**: % de leads que viram matrícula (funil completo)
8. **Ticket Médio Parcelas**: Valor médio das Parcelas das novas matrículas

CANAIS DE ORIGEM:
- Instagram, Facebook, Google, Site, Ligação, Indicação, Visita/Placa, Ex-aluno, Convênios, Family
- Analise quais canais têm melhor conversão e sugira foco

SAZONALIDADE:
- Meses QUENTES (alta demanda): Janeiro, Fevereiro, Março, Junho, Agosto, Outubro e Novembro
- Meses FRIOS (baixa demanda): Abril, Maio, Julho, Dezembro
- Compare com mesmo período do ano anterior para contextualizar

## PROGRAMA MATRICULADOR+ LA (5 ESTRELAS):
${metasMatriculadorPlus ? `
Para ${nomeHunter} ganhar as estrelas este mês:
⭐ Matrícula Plus: ${metasMatriculadorPlus.matricula_plus}+ matrículas (a partir da ${metasMatriculadorPlus.matricula_plus}ª)
⭐ Max Indicação: ${metasMatriculadorPlus.max_indicacao} matrículas de indicações
⭐ LA Music Family: ${metasMatriculadorPlus.la_music_family} Pacotes Family ou 2º curso
⭐ Ticket Médio Premiado: R$${metasMatriculadorPlus.ticket_acima_meta}+ acima da meta de ticket
⭐ Matriculador Emusys: Zero leads abandonados, tarefas em dia, anamnese completa

PRÊMIOS: Troféu, viagem, experiências mensais! Provoque: "Qual experiência você vai curtir esse mês?"
` : ""}

REGRAS DE OURO:
1. SEMPRE chame pelo nome/apelido no início
2. Mencione os concorrentes para criar competitividade
3. Fale do Matriculador+ LA e das experiências/prêmios
4. Seja provocador mas respeitoso
5. Crie senso de urgência com os dias restantes
6. Celebre conquistas mas sempre desafie para mais`;

    // User Prompt com dados
    const userPrompt = `
# DADOS COMERCIAIS - ${nomeUnidade.toUpperCase()} - ${mes.toString().padStart(2, "0")}/${ano}
${!isSuperAdmin ? `## HUNTER: ${nomeHunter} (${apelidoHunter})` : "## VISÃO CONSOLIDADA (ADMINISTRADOR)"}

## KPIs DO MÊS ATUAL:
- Total de Leads: ${kpis.total_leads || 0}
- Experimentais Agendadas: ${kpis.experimentais_agendadas || 0}
- Experimentais Realizadas: ${kpis.experimentais_realizadas || 0}
- Matrículas: ${matriculasAtuais}
- Taxa Lead→Experimental: ${(kpis.taxa_conversao_lead_exp || 0).toFixed(1)}%
- Taxa Experimental→Matrícula: ${(kpis.taxa_conversao_exp_mat || 0).toFixed(1)}%
- Taxa Geral (Lead→Matrícula): ${(kpis.taxa_conversao_geral || 0).toFixed(1)}%
- Ticket Médio Parcela: R$ ${(kpis.ticket_medio_novos || 0).toFixed(2)}

## METAS DO MÊS:
- Meta de Leads: ${metas.leads_mensais || 0}
- Meta de Experimentais: ${metas.experimentais_mensais || 0}
- Meta de Matrículas: ${metaMatriculas}
- Meta Ticket Médio: R$ ${(metas.ticket_medio || 0).toFixed(2)}

## RITMO E PROJEÇÃO:
- Dia atual: ${hoje.getDate()}/${ultimoDiaMes}
- Dias restantes: ${diasRestantes}
- Matrículas faltando para meta: ${matriculasFaltam}
- Ritmo necessário: ${ritmoNecessario.toFixed(1)} matrículas/dia útil

${progressoMatriculadorPlus ? `
## PROGRESSO MATRICULADOR+ LA:
⭐ Matrícula Plus: ${progressoMatriculadorPlus.matricula_plus.atual}/${progressoMatriculadorPlus.matricula_plus.meta} ${progressoMatriculadorPlus.matricula_plus.conquistou ? "✅ CONQUISTOU!" : `(faltam ${progressoMatriculadorPlus.matricula_plus.faltam})`}
⭐ Ticket Premiado: R$ ${progressoMatriculadorPlus.ticket_premiado.diferenca.toFixed(2)} ${progressoMatriculadorPlus.ticket_premiado.conquistou ? "acima da meta ✅" : "em relação à meta"}
⭐ Leads Abandonados: ${progressoMatriculadorPlus.leads_abandonados} ${progressoMatriculadorPlus.leads_abandonados === 0 ? "✅ ZERO!" : "⚠️ ATENÇÃO!"}
` : ""}

## COMPARATIVO COM ANO PASSADO (mesmo mês):
- Leads ${ano - 1}: ${kpisAnoPassado.total_leads || 0}
- Matrículas ${ano - 1}: ${kpisAnoPassado.novas_matriculas || 0}

## TOP CANAIS DE LEADS:
${leadsPorCanal.slice(0, 5).map((c: any, i: number) => `${i + 1}. ${c.canal}: ${c.leads} leads, ${c.matriculas || 0} matrículas`).join("\n") || "Sem dados"}

## TOP CURSOS PROCURADOS:
${leadsPorCurso.slice(0, 5).map((c: any, i: number) => `${i + 1}. ${c.curso}: ${c.quantidade} leads`).join("\n") || "Sem dados"}

## PROFESSORES QUE MAIS MATRICULAM:
${professoresMatriculadores.slice(0, 3).map((p: any, i: number) => `${i + 1}. ${p.professor}: ${p.matriculas} matrículas`).join("\n") || "Sem dados"}

## LEADS PENDENTES (sem contato há 3+ dias):
${leadsPendentes.length > 0 ? leadsPendentes.slice(0, 5).map((l: any) => `- ${l.nome} (${l.dias_sem_contato} dias)`).join("\n") : "Nenhum lead abandonado! 🎉"}

## EXPERIMENTAIS AGENDADAS (próximos 7 dias):
${experimentaisAgendadas.length > 0 ? experimentaisAgendadas.slice(0, 5).map((e: any) => `- ${e.data}: ${e.aluno} - ${e.curso}`).join("\n") : "Nenhuma experimental agendada"}

## MOTIVOS DE NÃO MATRÍCULA:
${motivosNaoMatricula.slice(0, 5).map((m: any) => `- ${m.motivo}: ${m.quantidade}`).join("\n") || "Sem dados"}

## LANÇAMENTOS DE HOJE:
- Leads hoje: ${lancamentosHoje.leads || 0}
- Experimentais hoje: ${lancamentosHoje.experimentais || 0}
- Matrículas hoje: ${lancamentosHoje.matriculas || 0}

---

Gere uma análise em JSON com a estrutura:
{
  "saudacao": "Saudação personalizada e energética chamando pelo nome/apelido",
  "saude_comercial": "on_fire|quente|morna|fria|critica",
  "conquistas": ["Lista de conquistas e pontos positivos"],
  "alertas_urgentes": ["Alertas que precisam de ação imediata"],
  "analise_funil": {
    "gargalo_principal": "Onde está o maior problema do funil",
    "oportunidade": "Maior oportunidade identificada",
    "acao_imediata": "O que fazer AGORA"
  },
  "ritmo": {
    "atual": "X matrículas até agora",
    "necessario": "Y matrículas/dia para bater meta",
    "projecao": "Vai bater ou não? Provocação!"
  },
  "competitividade": {
    "provocacao": "Provocação mencionando os outros Hunters",
    "desafio": "Desafio direto para o Hunter"
  },
  "matriculador_plus": {
    "estrelas_provaveis": X,
    "proxima_estrela": "Qual estrela está mais perto de conquistar",
    "dica_experiencia": "Provocação sobre a experiência/prêmio"
  },
  "canais_destaque": ["Top 2 canais com dica de ação"],
  "professores_destaque": ["Top 2 professores matriculadores"],
  "plano_acao_semanal": [
    {"dia": "Segunda", "acao": "Ação específica", "meta_dia": "X leads/experimentais"},
    {"dia": "Terça", "acao": "...", "meta_dia": "..."}
  ],
  "sugestoes_campanha": [
    {"titulo": "Nome da campanha", "descricao": "Descrição curta", "canal_foco": "Instagram/WhatsApp/etc"}
  ],
  "dica_do_dia": "Uma dica prática e direta",
  "mensagem_final": "Mensagem motivacional/provocadora final chamando pelo nome"
}`;

    // Chamar Gemini API
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
          ],
          generationConfig: {
            temperature: 0.8,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 4096,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Erro Gemini:", errorText);
      throw new Error(`Erro na API Gemini: ${geminiResponse.status}`);
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Extrair JSON da resposta
    let insights;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        insights = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("JSON não encontrado na resposta");
      }
    } catch (parseError) {
      console.error("Erro ao parsear JSON:", parseError);
      // Fallback com dados básicos
      insights = {
        saudacao: isSuperAdmin 
          ? "Olá, Administrador! Vamos analisar os números das unidades."
          : `E aí, ${apelidoHunter}! 🔥 Bora ver como estão os números?`,
        saude_comercial: matriculasAtuais >= metaMatriculas * 0.8 ? "quente" : "morna",
        conquistas: matriculasAtuais > 0 ? [`${matriculasAtuais} matrículas no mês!`] : [],
        alertas_urgentes: leadsPendentes.length > 0 ? [`${leadsPendentes.length} leads precisam de follow-up!`] : [],
        analise_funil: {
          gargalo_principal: "Análise em processamento",
          oportunidade: "Verifique os dados detalhados",
          acao_imediata: "Faça follow-up nos leads pendentes",
        },
        ritmo: {
          atual: `${matriculasAtuais} matrículas`,
          necessario: `${ritmoNecessario.toFixed(1)} por dia`,
          projecao: "Continue focado!",
        },
        competitividade: isSuperAdmin ? null : {
          provocacao: `Será que ${outrosHunters[0]?.apelido || "a concorrência"} vai te passar?`,
          desafio: "Mostre quem manda!",
        },
        matriculador_plus: progressoMatriculadorPlus ? {
          estrelas_provaveis: progressoMatriculadorPlus.matricula_plus.conquistou ? 1 : 0,
          proxima_estrela: "Matrícula Plus",
          dica_experiencia: "Qual experiência você vai curtir esse mês?",
        } : null,
        canais_destaque: leadsPorCanal.slice(0, 2).map((c: any) => c.canal),
        professores_destaque: professoresMatriculadores.slice(0, 2).map((p: any) => p.professor),
        plano_acao_semanal: [],
        sugestoes_campanha: [],
        dica_do_dia: "Foco no follow-up! Cada lead conta.",
        mensagem_final: isSuperAdmin 
          ? "Acompanhe os números e apoie as equipes!"
          : `Vambora, ${apelidoHunter}! 🚀 O Matriculador+ LA te espera!`,
      };
    }

    // Adicionar metadados
    insights.metadata = {
      unidade: nomeUnidade,
      hunter: isSuperAdmin ? "Administrador" : nomeHunter,
      apelido: isSuperAdmin ? null : apelidoHunter,
      is_super_admin: isSuperAdmin,
      competencia: `${mes.toString().padStart(2, "0")}/${ano}`,
      gerado_em: new Date().toISOString(),
    };

    return new Response(JSON.stringify(insights), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro na função:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
