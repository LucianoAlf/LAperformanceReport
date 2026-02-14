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
    const { professor_id, unidade_id, competencia, enviar_whatsapp } = await req.json();

    if (!professor_id || !unidade_id || !competencia) {
      return new Response(
        JSON.stringify({ error: 'Dados obrigatórios não informados' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar cliente Supabase com service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Gerar token único
    const token = crypto.randomUUID();

    // Data de expiração (7 dias)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Contar alunos do professor
    const { count: totalAlunos } = await supabase
      .from('alunos')
      .select('id', { count: 'exact', head: true })
      .eq('professor_atual_id', professor_id)
      .eq('status', 'ativo');

    // Criar sessão
    const { data: sessao, error: sessaoError } = await supabase
      .from('aluno_feedback_sessoes')
      .insert({
        professor_id,
        unidade_id,
        competencia,
        token,
        status: 'enviado',
        expires_at: expiresAt.toISOString(),
        total_alunos: totalAlunos || 0,
        total_respondidos: 0,
      })
      .select()
      .single();

    if (sessaoError) {
      console.error('Erro ao criar sessão:', sessaoError);
      return new Response(
        JSON.stringify({ error: 'Erro ao criar sessão', details: sessaoError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Montar URL do link
    const baseUrl = Deno.env.get('SITE_URL') || 'https://lareport.vercel.app';
    const linkFeedback = `${baseUrl}/feedback/${token}`;

    // Se solicitado, enviar via WhatsApp
    if (enviar_whatsapp) {
      // Buscar dados do professor
      const { data: professor } = await supabase
        .from('professores')
        .select('nome, apelido, telefone')
        .eq('id', professor_id)
        .single();

      if (professor?.telefone) {
        // Chamar Edge Function de envio de mensagem
        const uazapiUrl = Deno.env.get('UAZAPI_BASE_URL');
        const uazapiToken = Deno.env.get('UAZAPI_TOKEN');

        if (uazapiUrl && uazapiToken) {
          const mensagem = `Olá ${professor.apelido || professor.nome}! 🎵\n\nPrecisamos do seu feedback sobre seus alunos.\n\nAcesse o link abaixo para responder (leva menos de 2 minutos):\n\n${linkFeedback}\n\n⏰ O link expira em 7 dias.\n\nObrigado! 💜`;

          try {
            await fetch(`${uazapiUrl}/send/text`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${uazapiToken}`,
              },
              body: JSON.stringify({
                number: professor.telefone,
                text: mensagem,
                delay: 2000,
              }),
            });
          } catch (whatsappError) {
            console.error('Erro ao enviar WhatsApp:', whatsappError);
            // Não falha a operação, apenas loga
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sessao: {
          id: sessao.id,
          token: sessao.token,
          link: linkFeedback,
          expires_at: sessao.expires_at,
          total_alunos: sessao.total_alunos,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro ao criar sessão de feedback:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
