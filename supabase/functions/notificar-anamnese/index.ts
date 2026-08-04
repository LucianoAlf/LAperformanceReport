// supabase/functions/notificar-anamnese/index.ts
// Edge Function: dispara WhatsApp para o professor com resumo + briefing pedagogico (Gemini).
// Envia via WAHA (Sol-Atendimento, session 5_198_552139554415).
//
// Body esperado: { anamnese_id: number }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
const WAHA_URL = "https://waha.agenticflowio.com.br";
const WAHA_SESSION = "5_198_552139554415";
const WAHA_API_KEY = "ae0cb39c666143f90da21cf34d986d48f5bfd698cfb831ad28df84b39246681f";
const PUBLIC_BASE_URL = "https://anamnese-la-music.vercel.app";
// Normaliza telefone BR para o formato do WhatsApp (DDI 55 + DDD + numero).
// Retorna null se o numero for invalido (ex.: cadastro truncado) — nesse caso NAO envia.
function normalizePhone(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;
  const withDdi = digits.startsWith("55") ? digits : `55${digits}`;
  // 55 + DDD(2) + numero(8 ou 9) => 12 ou 13 digitos
  if (withDdi.length < 12 || withDdi.length > 13) return null;
  return withDdi;
}
// Chave do Gemini lida exclusivamente do secret do Supabase (NUNCA hardcoded no codigo).
// Configurar com: supabase secrets set GEMINI_API_KEY=AIza... --project-ref ouqwbbermlzqqvtqwlul
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-3.6-flash";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const SEPARADOR = "━━━━━━━━━━━━━━━━━━━━━";
function buildEstrutura(a) {
  const isLamk = a.tipo_formulario === "LAMK";
  const isEmla = a.tipo_formulario === "EMLA";
  const tipoLabel = isLamk ? "LA Music Kids" : "LA Music School";
  const diagnosticos = Array.isArray(a.diagnosticos) ? a.diagnosticos : [];
  const hasDiag = diagnosticos.length > 0 && !(diagnosticos.length === 1 && [
    "NÃO",
    "NAO"
  ].includes(diagnosticos[0]));
  const necessidade = (a.necessidade_apoio || "").toString().trim();
  const apoioVazio = !necessidade || [
    "nao",
    "não"
  ].includes(necessidade.toLowerCase());
  let perfilLine;
  if (a.perfil_baby) {
    perfilLine = "Sem perfil ainda — bebê (até 24 meses)";
  } else if (a.temperamento_codinome) {
    perfilLine = `${a.temperamento_codinome} (${a.temperamento_primario} + ${a.temperamento_secundario})`;
  } else {
    perfilLine = "Pendente";
  }
  const arr = (v)=>Array.isArray(v) ? v.filter(Boolean).map(String) : [];
  const possuiLabel = {
    sim: "Sim",
    nao: "Não",
    planejando: "Planejando comprar"
  };
  const out = [
    "📋 *NOVO ALUNO — PERFIL PREENCHIDO*",
    SEPARADOR,
    "",
    `👤 *Aluno:* ${a.nome_aluno || "—"}`,
    `🎸 *Curso:* ${a.cursos_escolhidos || "—"}`,
    `📍 *Unidade:* ${a.unidade?.nome || "—"}`,
    `📝 *Tipo:* ${tipoLabel}`,
    "",
    `🧠 *Temperamento:* ${perfilLine}`
  ];
  if (isEmla) {
    const objs = arr(a.objetivos);
    if (objs.length > 0) {
      out.push("", `🎯 *Objetivos:* ${objs.slice(0, 5).join(", ")}`);
    }
  } else if (isLamk) {
    const motivo = arr(a.motivo_procura_pais);
    if (motivo.length > 0) {
      out.push("", `💡 *Motivo dos pais:* ${motivo.slice(0, 5).join(", ")}`);
    }
    const metas = arr(a.metas_pais);
    if (metas.length > 0) {
      out.push(`🎯 *Metas dos pais:* ${metas.slice(0, 5).join(", ")}`);
    }
  }
  if (a.tempo_disponivel_estudo) {
    out.push(`⏰ *Tempo de estudo:* ${a.tempo_disponivel_estudo}`);
  }
  if (a.possui_instrumento) {
    const k = String(a.possui_instrumento).toLowerCase();
    out.push(`🏠 *Instrumento em casa:* ${possuiLabel[k] || a.possui_instrumento}`);
  }
  if (isEmla) {
    if (a.nivel_conhecimento_musical) {
      out.push("", `🎵 *Nível musical:* ${a.nivel_conhecimento_musical}`);
    }
    if (a.nivel_habilidade_instrumento) {
      out.push(`🎸 *Nível instrumento:* ${a.nivel_habilidade_instrumento}`);
    }
    const generos = arr(a.generos_musicais);
    if (generos.length > 0) {
      out.push(`🎧 *Gêneros:* ${generos.slice(0, 5).join(", ")}`);
    }
  }
  if (isLamk && a.comunicacao_crianca) {
    out.push("", `💬 *Comunicação:* ${a.comunicacao_crianca}`);
  }
  if (hasDiag) {
    out.push("", `⚠️ *Diagnóstico:* ${diagnosticos.join(", ")}`);
  }
  if (!apoioVazio) {
    out.push(`🔔 *Apoio necessário:* ${necessidade}`);
  }
  out.push("", `📝 *Obs:* ${a.observacoes_entrevistador || "Nenhuma"}`);
  return out.join("\n");
}
function calcAgeYears(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || now.getMonth() === d.getMonth() && now.getDate() < d.getDate()) {
    years--;
  }
  return Math.max(0, years);
}
function sanitizeForAI(a, respostas, idadeAnos) {
  // Remove campos sensiveis antes de enviar pra IA
  const { filiacao: _f, situacao_responsaveis: _s, aluno: _aluno, ...rest } = a;
  return {
    aluno: {
      nome: a.nome_aluno,
      idade_anos: idadeAnos,
      curso: a.cursos_escolhidos,
      unidade: a.unidade?.nome,
      tipo_formulario: a.tipo_formulario
    },
    temperamento: {
      codinome: a.temperamento_codinome,
      primario: a.temperamento_primario,
      secundario: a.temperamento_secundario,
      baby: a.perfil_baby
    },
    musical: {
      possui_instrumento: a.possui_instrumento,
      tempo_disponivel_estudo: a.tempo_disponivel_estudo,
      nivel_conhecimento_musical: a.nivel_conhecimento_musical,
      nivel_habilidade_instrumento: a.nivel_habilidade_instrumento,
      generos_musicais: a.generos_musicais,
      instrumentos_toca: a.instrumentos_toca,
      experiencia_anterior: a.experiencia_anterior,
      interesse_bandas: a.interesse_bandas
    },
    objetivos: {
      objetivos: a.objetivos,
      motivo_procura_pais: a.motivo_procura_pais,
      metas_pais: a.metas_pais,
      tempo_para_metas: a.tempo_para_metas
    },
    ambiente_lamk: a.tipo_formulario === "LAMK" ? {
      comunicacao_crianca: a.comunicacao_crianca,
      sono_crianca: a.sono_crianca,
      exposicao_telas: a.exposicao_telas,
      estereotipias: a.estereotipias,
      musicos_na_familia: a.musicos_na_familia,
      interesse_instrumento_cantar: a.interesse_instrumento_cantar,
      fonte_exposicao_musical: a.fonte_exposicao_musical
    } : undefined,
    saude: {
      diagnosticos: a.diagnosticos,
      cuidado_medico: a.cuidado_medico,
      medicacao_continua: a.medicacao_continua,
      necessidade_apoio: a.necessidade_apoio
    },
    observacoes_entrevistador: a.observacoes_entrevistador,
    respostas_comportamentais: respostas
  };
}
async function gerarBriefing(a, respostas, idadeAnos) {
  if (!GEMINI_API_KEY) return "";
  const isLamk = a.tipo_formulario === "LAMK";
  const dadosLimpos = sanitizeForAI(a, respostas, idadeAnos);
  const prompt = `Você é o assistente pedagógico da LA Music, uma rede de escolas de música no Rio de Janeiro.

Com base nos dados da anamnese abaixo, gere um BRIEFING PEDAGÓGICO curto para o professor que vai dar aula pra esse aluno.

O briefing deve:
- Português brasileiro, tom profissional mas acessível
- Formatado para WhatsApp (use *negrito* com asteriscos, NUNCA use markdown # ou **)
- Máximo 10-12 linhas
- Focado em AÇÕES PRÁTICAS pro professor
- Interpretar o temperamento em linguagem simples (o professor não sabe o que é "colérico" — explique como a pessoa SE COMPORTA)
- Dar 2-3 dicas concretas de como conduzir as primeiras aulas

Referência dos temperamentos:
- CAZUZA (Colérico): Determinado, líder, impaciente. Gosta de desafios e resolver sozinho. Pode ser teimoso. Dica: metas claras e desafios progressivos.
- SLASH (Sanguíneo): Extrovertido, empolgado, disperso. Aprende na prática, perde foco. Dica: aulas dinâmicas, variedade, elogie o entusiasmo.
- FRANK (Fleumático): Tranquilo, reservado, observador. Precisa de tempo. Dica: ambiente seguro, sem pressa, respeite o ritmo.
- AMY (Melancólico): Sensível, detalhista, perfeccionista. Se cobra muito. Dica: valorize o processo, feedback gentil.

${isLamk ? "IMPORTANTE: é uma criança (LA Music Kids). Considere comunicação, telas, sono e estereotipias. Sugira adaptações concretas se houver diagnóstico." : "IMPORTANTE: é adolescente/adulto (LA Music School). Considere autonomia, gostos musicais e nivelamento."}

ESTRUTURA SUGERIDA (use exatamente esse formato, com emojis e *negrito*):
🧠 *Nome, idade — Curso*

*Como ela/ele aprende:* (2-3 linhas, perfil em linguagem prática)

${isLamk ? "⚠️ *Atenção:* (se houver diagnóstico ou necessidade — senão omita)\n\n" : ""}🎯 *O que esperam:* (resumo do que os pais/aluno querem)

💡 *Primeiras aulas:*
- (dica 1 acionável)
- (dica 2 acionável)
- (dica 3 acionável)

🎵 (frase motivacional curta de 1 linha)

REGRAS:
- NÃO mencionar filiação (adotivo/biológico) nem situação conjugal dos pais
- Foque em ADAPTAÇÃO, não em rótulos de diagnóstico
- Se "Diagnóstico" for "NÃO" ou vazio, NÃO incluir o bloco ⚠️ Atenção
- Termine com uma frase motivacional curta pro professor

DADOS DO ALUNO (JSON, ignore campos null):
${JSON.stringify(dadosLimpos)}

RESPOSTAS COMPORTAMENTAIS (pergunta_numero, resposta_posicao). Posição: 1=Colérico, 2=Sanguíneo, 3=Fleumático, 4=Melancólico.
${JSON.stringify(respostas)}

Responda APENAS com o briefing formatado, sem introdução ou comentários.`;
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: 800,
          temperature: 0.7
        }
      })
    });
    if (!r.ok) {
      const t = await r.text();
      console.error(`[gemini] HTTP ${r.status}: ${t.slice(0, 300)}`);
      return "";
    }
    const j = await r.json();
    const parts = j?.candidates?.[0]?.content?.parts ?? [];
    // Concat all text-bearing parts (Gemini 3 pode incluir thoughtSignature siblings)
    return parts.map((p)=>typeof p?.text === "string" ? p.text : "").join("\n").trim();
  } catch (e) {
    console.error("[gemini] exception:", e);
    return "";
  }
}
function montarMensagemFinal(estrutura, briefing, token) {
  let msg = estrutura;
  if (briefing) {
    msg += `\n\n${SEPARADOR}\n💡 *INSIGHTS PEDAGÓGICOS*\n${SEPARADOR}\n\n${briefing}\n\n${SEPARADOR}`;
  }
  if (token) {
    msg += `\n\n🔗 *Ver anamnese completa:*\n${PUBLIC_BASE_URL}/perfil/${token}`;
  }
  msg += "\n\n_Informações confidenciais — uso exclusivo do time pedagógico LA Music._";
  return msg;
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: cors
  });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: "method not allowed"
    }), {
      status: 405,
      headers: {
        ...cors,
        "Content-Type": "application/json"
      }
    });
  }
  try {
    const { anamnese_id } = await req.json();
    if (!anamnese_id) {
      return new Response(JSON.stringify({
        error: "anamnese_id obrigatorio"
      }), {
        status: 400,
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: anamnese, error: anaErr } = await supabase.from("anamneses").select(`
          id,
          aluno_id,
          tipo_formulario,
          nome_aluno,
          cursos_escolhidos,
          diagnosticos,
          necessidade_apoio,
          cuidado_medico,
          medicacao_continua,
          comunicacao_crianca,
          sono_crianca,
          exposicao_telas,
          estereotipias,
          musicos_na_familia,
          interesse_instrumento_cantar,
          fonte_exposicao_musical,
          observacoes_entrevistador,
          perfil_baby,
          temperamento_primario,
          temperamento_secundario,
          temperamento_codinome,
          nivel_conhecimento_musical,
          nivel_habilidade_instrumento,
          generos_musicais,
          instrumentos_toca,
          experiencia_anterior,
          interesse_bandas,
          objetivos,
          motivo_procura_pais,
          metas_pais,
          tempo_disponivel_estudo,
          tempo_para_metas,
          possui_instrumento,
          share_token,
          unidade:unidades(id, nome),
          aluno:alunos!aluno_id(
            id,
            nome,
            data_nascimento,
            professor_atual_id,
            professor:professores!professor_atual_id(id, nome, telefone_whatsapp)
          )
        `).eq("id", anamnese_id).single();
    if (anaErr || !anamnese) {
      return new Response(JSON.stringify({
        error: "anamnese nao encontrada",
        details: anaErr?.message
      }), {
        status: 404,
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });
    }
    if (!anamnese.aluno_id) {
      return new Response(JSON.stringify({
        skipped: "pre-matricula sem aluno vinculado"
      }), {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });
    }
    const professor = anamnese.aluno?.professor;
    if (!professor) {
      return new Response(JSON.stringify({
        skipped: "aluno sem professor atual"
      }), {
        status: 200,
        headers: {
          ...cors,
          "Content-Type": "application/json"
        }
      });
    }
    // respostas do perfil comportamental (para o prompt da IA)
    const { data: respostas } = await supabase.from("anamnese_respostas_perfil").select("pergunta_numero, resposta_posicao").eq("anamnese_id", anamnese.id).order("pergunta_numero");
    const idadeAnos = calcAgeYears(anamnese.aluno?.data_nascimento);
    const estrutura = buildEstrutura(anamnese);
    const briefing = await gerarBriefing(anamnese, respostas || [], idadeAnos);
    const message = montarMensagemFinal(estrutura, briefing, anamnese.share_token ?? null);
    let status = "enviado";
    let erroMsg = null;
    let upstream = null;
    const telefone = normalizePhone(professor.telefone_whatsapp);
    if (!telefone) {
      status = "sem_whatsapp";
      erroMsg = professor.telefone_whatsapp ? `telefone invalido: ${professor.telefone_whatsapp}` : null;
    } else {
      try {
        const chatId = `${telefone}@c.us`;
        const r = await fetch(`${WAHA_URL}/api/sendText`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": WAHA_API_KEY
          },
          body: JSON.stringify({
            session: WAHA_SESSION,
            chatId,
            text: message
          })
        });
        const bodyText = await r.text();
        upstream = {
          ok: r.ok,
          status: r.status,
          body: bodyText.slice(0, 500)
        };
        if (!r.ok) {
          status = "erro";
          erroMsg = `HTTP ${r.status}: ${bodyText.slice(0, 300)}`;
        }
      } catch (e) {
        status = "erro";
        erroMsg = String(e);
      }
    }
    await supabase.from("notificacao_log").insert({
      tipo: "anamnese_professor",
      destinatario_tipo: "professor",
      destinatario_id: professor.id,
      canal: "whatsapp",
      mensagem: message,
      status,
      erro_mensagem: erroMsg,
      enviado_at: status === "enviado" ? new Date().toISOString() : null
    });
    return new Response(JSON.stringify({
      status,
      professor_id: professor.id,
      professor_telefone: professor.telefone_whatsapp,
      sent_to: telefone,
      briefing_ok: Boolean(briefing),
      briefing_chars: briefing.length,
      upstream
    }), {
      headers: {
        ...cors,
        "Content-Type": "application/json"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: String(e)
    }), {
      status: 500,
      headers: {
        ...cors,
        "Content-Type": "application/json"
      }
    });
  }
});
