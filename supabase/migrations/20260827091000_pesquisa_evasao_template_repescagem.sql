-- supabase/migrations/20260827091000_pesquisa_evasao_template_repescagem.sql
-- Texto do 2o toque, aprovado pelo Hugo em 26/08/2026.
-- Reconhece que ja houve uma mensagem e pede menos: a pesquisa original pede um
-- relato, a repescagem aceita uma frase.

insert into public.pesquisa_evasao_templates (chave, versao, publico, corpo, ativo)
values
  (
    'evasao_repescagem', 1, 'direto',
    'Oi, {{aluno_primeiro_nome}}! Aqui é {{assinatura_com_artigo}} de novo, do Sucesso do Aluno da LA Music 🎵

Sei que te escrevi outro dia e você deve estar corrido e não quero incomodar 🥹. Sua opinião sobre a experiência aqui ajuda a gente de verdade a melhorar para os outros alunos.

Se puder, me responde em uma linha só o que você mudaria. Pode ser por áudio também, do jeito que for mais fácil 🙏',
    true
  ),
  (
    'evasao_repescagem', 1, 'responsavel',
    'Oi, {{responsavel_primeiro_nome}}! Aqui é {{assinatura_com_artigo}} de novo, do Sucesso do Aluno da LA Music 🎵

Sei que te escrevi outro dia e você deve estar corrido e não quero incomodar 🥹. Sua opinião sobre a experiência aqui ajuda a gente de verdade a melhorar para os outros alunos.

Se puder, me responde em uma linha só o que você mudaria. Pode ser por áudio também, do jeito que for mais fácil 🙏',
    true
  );
