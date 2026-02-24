// Edge Function: enviar-pesquisa-evasao
// Envia pesquisa de evasão via WhatsApp para aluno evadido

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { getUazapiCredentials } from '../_shared/uazapi.ts';

interface EnviarPesquisaRequest {
  evasao_id: number;
  operador?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const creds = await getUazapiCredentials(supabase, { funcao: 'sistema' });

    const body: EnviarPesquisaRequest = await req.json();
    const { evasao_id, operador = 'sistema' } = body;

    if (!evasao_id) {
      return new Response(
        JSON.stringify({ error: 'evasao_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar dados da movimentação (fonte principal)
    const { data: movimentacao, error: movError } = await supabase
      .from('movimentacoes_admin')
      .select(`
        id,
        aluno_id,
        unidade_id,
        aluno_nome,
        data,
        motivo_saida_id,
        tipo,
        professor_id,
        curso_id,
        tempo_permanencia_meses,
        motivos_saida (nome)
      `)
      .eq('id', evasao_id)
      .single();

    if (movError || !movimentacao) {
      return new Response(
        JSON.stringify({ error: 'Movimentação não encontrada', details: movError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar evasao_v2 correspondente para pegar telefone_snapshot
    let evasaoV2 = null;
    try {
      const result = await supabase
        .from('evasoes_v2')
        .select('id, telefone_snapshot')
        .eq('aluno_id', movimentacao.aluno_id)
        .eq('unidade_id', movimentacao.unidade_id)
        .eq('data_evasao', movimentacao.data)
        .maybeSingle();
      evasaoV2 = result.data;
    } catch (e) {
      console.log('evasaoV2 não encontrada, usando fallback');
    }

    // Criar objeto evasao compatível com o resto do código
    const evasao = {
      id: evasaoV2?.id || movimentacao.id,
      aluno_id: movimentacao.aluno_id,
      unidade_id: movimentacao.unidade_id,
      aluno_nome: movimentacao.aluno_nome,
      telefone_snapshot: evasaoV2?.telefone_snapshot,
      data_evasao: movimentacao.data,
      motivo_saida_id: movimentacao.motivo_saida_id,
      professor_id: movimentacao.professor_id,
      curso_id: movimentacao.curso_id,
      tempo_permanencia_meses: movimentacao.tempo_permanencia_meses,
      motivos_saida: movimentacao.motivos_saida
    };

    // Verificar se já existe pesquisa enviada
    const { data: pesquisaExistente } = await supabase
      .from('pesquisa_evasao')
      .select('id, status')
      .eq('evasao_id', evasao_id)
      .single();

    if (pesquisaExistente && pesquisaExistente.status !== 'pendente') {
      return new Response(
        JSON.stringify({ error: 'Pesquisa já foi enviada para este aluno', pesquisa_id: pesquisaExistente.id }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar período de carência (3 dias após evasão)
    const dataEvasao = new Date(evasao.data_evasao);
    const hoje = new Date();
    const diffTime = Math.abs(hoje.getTime() - dataEvasao.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 3) {
      const diasFaltando = 3 - diffDays;
      return new Response(
        JSON.stringify({ 
          error: `Período de carência: aguarde ${diasFaltando} dia(s) para enviar a pesquisa`,
          dias_faltando: diasFaltando,
          data_evasao: evasao.data_evasao
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar dados adicionais do aluno
    const { data: aluno } = await supabase
      .from('alunos')
      .select('nome, tempo_permanencia_meses, professor_atual_id, curso_id, data_nascimento, responsavel_nome')
      .eq('id', evasao.aluno_id)
      .single();
    
    // Nome do aluno: prioriza evasao.aluno_nome, fallback para aluno.nome
    const alunoNome = evasao.aluno_nome || aluno?.nome || 'Aluno';

    const professorId = evasao.professor_id || aluno?.professor_atual_id;
    const cursoId = evasao.curso_id || aluno?.curso_id;

    // Buscar nome do professor
    let professorNome = null;
    if (professorId) {
      const { data: prof } = await supabase
        .from('professores')
        .select('nome')
        .eq('id', professorId)
        .single();
      professorNome = prof?.nome;
    }

    // Buscar nome do curso
    let cursoNome = null;
    if (cursoId) {
      const { data: curso } = await supabase
        .from('cursos')
        .select('nome')
        .eq('id', cursoId)
        .single();
      cursoNome = curso?.nome;
    }

    // Formatar número de telefone
    let telefone = evasao.telefone_snapshot || '';
    telefone = telefone.replace(/\D/g, '');
    if (telefone.length === 11 && telefone.startsWith('9')) {
      telefone = '55' + telefone;
    }

    if (telefone.length < 12) {
      // Atualizar como sem WhatsApp
      await supabase.rpc('criar_pesquisa_evasao', {
        p_evasao_id: evasao_id,
        p_criado_por: operador
      });
      await supabase
        .from('pesquisa_evasao')
        .update({ status: 'sem_whatsapp', updated_at: new Date().toISOString() })
        .eq('evasao_id', evasao_id);

      return new Response(
        JSON.stringify({ error: 'Telefone inválido', telefone: evasao.telefone_snapshot }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar ou atualizar registro de pesquisa
    // IMPORTANTE: evasao_id deve ser o ID de evasoes_v2, não de movimentacoes_admin
    const evasaoIdParaPesquisa = evasaoV2?.id || evasao_id;
    
    const { data: pesquisa, error: pesquisaError } = await supabase
      .from('pesquisa_evasao')
      .upsert({
        evasao_id: evasaoIdParaPesquisa,
        aluno_id: evasao.aluno_id,
        unidade_id: evasao.unidade_id,
        aluno_nome: evasao.aluno_nome,
        aluno_telefone: telefone,
        aluno_curso: cursoNome,
        aluno_professor: professorNome,
        tempo_permanencia_meses: aluno?.tempo_permanencia_meses || 0,
        data_evasao: evasao.data_evasao,
        motivo_cadastrado: evasao.motivos_saida?.nome || null,
        status: 'enviado',
        enviado_em: new Date().toISOString(),
        enviado_por: operador
      }, { onConflict: 'evasao_id' })
      .select()
      .single();

    if (pesquisaError) {
      return new Response(
        JSON.stringify({ error: 'Erro ao criar pesquisa', details: pesquisaError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar estado de conversa no WhatsApp
    await supabase
      .from('conversa_estado_whatsapp')
      .upsert({
        whatsapp_numero: telefone,
        estado: 'aguardando_resposta_evasao',
        contexto: { pesquisa_id: pesquisa.id, evasao_id: evasao_id },
        expira_em: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 dias
      }, { onConflict: 'whatsapp_numero' });

    // Verificar se é menor de idade (< 18 anos)
    const isMenor = aluno?.data_nascimento 
      ? (new Date().getFullYear() - new Date(aluno.data_nascimento).getFullYear()) < 18
      : false;
    
    // Nome do responsável (se cadastrado) ou genérico
    const nomeResponsavel = aluno?.responsavel_nome?.split(" ")[0];
    const primeiroNomeAluno = alunoNome.split(" ")[0] || "seu filho(a)";
    
    // Preparar mensagem da pesquisa
    let mensagem: string;
    
    if (isMenor) {
      // Mensagem para responsável de menor de idade
      const saudacao = nomeResponsavel ? `Oi, *${nomeResponsavel}*!` : "Oi!";
      mensagem = [
        `${saudacao} Aqui é a *Jéssica*, do Sucesso do Aluno da LA Music. 🎵`,
        "",
        `Queria agradecer pelo tempo que *${primeiroNomeAluno}* passou com a gente. As portas estarão sempre abertas!`,
        "",
        "Posso te fazer uma *única pergunta*?",
        "",
        `*Se você pudesse mudar alguma coisa na experiência de ${primeiroNomeAluno} na LA Music, o que mudaria?*`,
        "",
        "Pode responder com texto ou áudio, fique à vontade. 🙏",
      ].join("\n");
    } else {
      // Mensagem para aluno adulto
      mensagem = [
        `Oi, *${primeiroNomeAluno}*! Aqui é a *Jéssica*, do Sucesso do Aluno da LA Music. 🎵`,
        "",
        "Queria agradecer pelo tempo que você passou com a gente. As portas estarão sempre abertas pra você!",
        "",
        "Posso te fazer uma *única pergunta*?",
        "",
        "*Se você pudesse mudar alguma coisa na LA Music, o que mudaria?*",
        "",
        "Pode responder com texto ou áudio, fique à vontade. 🙏",
      ].join("\n");
    }

    // Enviar mensagem via UAZAPI
    const uazapiResponse = await fetch(
      `${creds.baseUrl}/send/text`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': creds.token,
        },
        body: JSON.stringify({
          number: telefone,
          text: mensagem,
          delay: 2000,
          readchat: true
        })
      }
    );

    if (!uazapiResponse.ok) {
      const uazapiError = await uazapiResponse.text();
      
      // Marcar como falha
      await supabase
        .from('pesquisa_evasao')
        .update({ status: 'falha_envio', updated_at: new Date().toISOString() })
        .eq('id', pesquisa.id);

      return new Response(
        JSON.stringify({ error: 'Falha ao enviar mensagem UAZAPI', details: uazapiError }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const uazapiData = await uazapiResponse.json();

    // Atualizar com ID da mensagem UAZAPI
    await supabase
      .from('pesquisa_evasao')
      .update({ 
        mensagem_uazapi_id: uazapiData.id || uazapiData.messageId || null,
        updated_at: new Date().toISOString()
      })
      .eq('id', pesquisa.id);

    return new Response(
      JSON.stringify({
        success: true,
        pesquisa_id: pesquisa.id,
        mensagem_enviada: true,
        uazapi_message_id: uazapiData.id || uazapiData.messageId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
