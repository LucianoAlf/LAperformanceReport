-- Agradecimento automatico apos a resposta da pesquisa de evasao.
--
-- Decisao do Hugo (02/09/2026): ir direto a producao em vez do estagio "Crawl"
-- (humano aprova cada envio) recomendado pelo AI Engineering, porque o volume e
-- de 6-12 respostas/mes e o minimo de ~300 exemplos de eval do livro levaria
-- anos. Contrapartida: log em tempo real no topico Logs do Lia Core + kill
-- switch + teto diario + janela de frescor.

-- 1. Kill switch. Nasce DESLIGADO: o primeiro envio real so acontece com OK
-- explicito, porque mensagem a ex-aluno nao tem desfazer.
insert into public.automacoes_config (slug, ativo)
values ('auto_agradecimento_evasao', false)
on conflict (slug) do nothing;

-- 2. Textos, aprovados pelo Hugo em 02/09/2026.
--
-- Sem prometer acao ("vamos trocar o sofa" viraria divida) e sem dizer que a
-- equipe vai ler -- a fila de triagem hoje nao tem dono, entao a promessa
-- poderia virar mentira (pedido do Hugo).
--
-- Sem repetir a apresentacao ("aqui e a Jessica"): e a mesma conversa do 1o
-- toque, a pessoa acabou de responder.
insert into public.pesquisa_evasao_templates (chave, versao, publico, corpo, ativo)
values
  (
    'evasao_agradecimento', 1, 'direto',
    '{{aluno_primeiro_nome}}, muito obrigada mesmo! 🙏✨' || chr(10) || chr(10) ||
    'Que bom receber seu retorno — é isso que faz a gente melhorar de verdade!' || chr(10) || chr(10) ||
    'As portas da LA seguem abertas para você, viu? 🎵',
    true
  ),
  (
    'evasao_agradecimento', 1, 'responsavel',
    '{{responsavel_primeiro_nome}}, muito obrigada mesmo! 🙏✨' || chr(10) || chr(10) ||
    'Que bom receber seu retorno — é isso que faz a gente melhorar de verdade!' || chr(10) || chr(10) ||
    'As portas da LA seguem abertas para {{aluno_primeiro_nome}}, viu? 🎵',
    true
  )
on conflict (chave, versao, publico) do nothing;
