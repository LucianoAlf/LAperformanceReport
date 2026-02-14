import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token não informado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar cliente Supabase com service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar sessão pelo token
    const { data: sessao, error: sessaoError } = await supabase
      .from('aluno_feedback_sessoes')
      .select(`
        *,
        professor:professores(id, nome),
        unidade:unidades(id, nome)
      `)
      .eq('token', token)
      .single();

    if (sessaoError || !sessao) {
      return new Response(
        JSON.stringify({ error: 'Token inválido', valid: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se expirou (usando enviado_em + 7 dias como expiração)
    const enviadoEm = sessao.enviado_em ? new Date(sessao.enviado_em) : null;
    const expiraEm = enviadoEm ? new Date(enviadoEm.getTime() + 7 * 24 * 60 * 60 * 1000) : null;
    if (expiraEm && expiraEm < new Date()) {
      return new Response(
        JSON.stringify({ error: 'Token expirado', valid: false, expired: true }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verificar se já foi concluído
    if (sessao.status === 'concluido') {
      return new Response(
        JSON.stringify({ 
          error: 'Feedback já foi enviado', 
          valid: false, 
          completed: true,
          sessao: {
            id: sessao.id,
            professor_nome: sessao.professor?.apelido || sessao.professor?.nome,
            unidade_nome: sessao.unidade?.nome,
            competencia: sessao.competencia,
          }
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Atualizar status para 'acessado' se ainda estiver 'enviado'
    if (sessao.status === 'enviado') {
      await supabase
        .from('aluno_feedback_sessoes')
        .update({ status: 'acessado' })
        .eq('id', sessao.id);
    }

    // Buscar alunos do professor
    const { data: alunos, error: alunosError } = await supabase
      .from('alunos')
      .select(`
        id,
        nome,
        curso:cursos(nome),
        dia_aula,
        horario_aula
      `)
      .eq('professor_atual_id', sessao.professor_id)
      .eq('status', 'ativo')
      .order('nome');

    if (alunosError) {
      console.error('Erro ao buscar alunos:', alunosError);
    }

    // Buscar feedbacks já respondidos nesta sessão
    const { data: feedbacksExistentes } = await supabase
      .from('aluno_feedback_professor')
      .select('aluno_id, feedback, observacao')
      .eq('sessao_id', sessao.id);

    return new Response(
      JSON.stringify({
        valid: true,
        sessao: {
          id: sessao.id,
          professor_id: sessao.professor_id,
          professor_nome: sessao.professor?.nome,
          unidade_id: sessao.unidade_id,
          unidade_nome: sessao.unidade?.nome,
          competencia: sessao.competencia,
          status: sessao.status,
          enviado_em: sessao.enviado_em,
        },
        alunos: (alunos || []).map((a: any) => ({
          id: a.id,
          nome: a.nome,
          curso_nome: a.curso?.nome || null,
          dia_aula: a.dia_aula,
          horario_aula: a.horario_aula,
        })),
        feedbacks_existentes: feedbacksExistentes || [],
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na validação do token:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
