-- v3: "voce deve estar corrido" concordava com a PESSOA, e os destinatarios do
-- publico `responsavel` sao majoritariamente mulheres (4 de 5 no 1o lote:
-- Francyelle, Liliane, ...). Tirando o "voce", "deve estar corrido" passa a
-- concordar com a SITUACAO -- impessoal, serve para qualquer genero, e continua
-- soando natural no WhatsApp.
update public.pesquisa_evasao_templates set ativo = false
 where chave = 'evasao_repescagem' and ativo;

insert into public.pesquisa_evasao_templates (chave, versao, publico, corpo, ativo)
values
  (
    'evasao_repescagem', 3, 'direto',
    'Oi, {{aluno_primeiro_nome}}! Aqui é {{assinatura_com_artigo}} de novo, do Sucesso do Aluno da LA Music 🎵

Sei que te escrevi outro dia e que deve estar corrido aí, não quero incomodar 🥹. Sua opinião sobre a experiência aqui ajuda a gente de verdade a melhorar para os outros alunos.

Se puder, me responde em uma linha só o que você mudaria. Pode ser por áudio também, do jeito que for mais fácil 🙏',
    true
  ),
  (
    'evasao_repescagem', 3, 'responsavel',
    'Oi, {{responsavel_primeiro_nome}}! Aqui é {{assinatura_com_artigo}} de novo, do Sucesso do Aluno da LA Music 🎵

Sei que te escrevi outro dia sobre {{aluno_primeiro_nome}} e que deve estar corrido aí, não quero incomodar 🥹. Sua opinião sobre a experiência aqui ajuda a gente de verdade a melhorar para os outros alunos.

Se puder, me responde em uma linha só o que você mudaria. Pode ser por áudio também, do jeito que for mais fácil 🙏',
    true
  );

-- Repontar as linhas pendentes para a versao nova (o worker busca o template
-- por id, sem filtrar `ativo`, e sairiam com o texto anterior).
update public.pesquisa_evasao_envios_fila f
   set template_id = novo.id, template_versao = novo.versao
  from public.pesquisa_evasao_templates antigo,
       public.pesquisa_evasao_templates novo
 where f.template_id = antigo.id
   and antigo.chave = 'evasao_repescagem'
   and novo.chave = 'evasao_repescagem'
   and novo.publico = antigo.publico
   and novo.ativo
   and f.status = 'pendente';
