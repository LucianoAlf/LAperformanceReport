-- Textos editáveis da pesquisa pós-1ª aula (2 variantes: aluno direto x responsável).
-- Ficam num contexto próprio (automacao_interna) para NÃO aparecerem como mensagem pronta
-- no inbox (o TemplateSelector filtra por contexto). A edge enviar-pesquisa-pos-primeira-aula
-- e a aba "Mensagens Automáticas" leem/gravam por slug.
-- Placeholders: {nome} (aluno), {responsavel}, {curso}. As 5 estrelas são estruturais (não editáveis).

INSERT INTO crm_templates_whatsapp (nome, slug, conteudo, tipo, ativo, contexto)
VALUES
(
  'Pesquisa 1ª aula — texto (aluno)',
  'pesquisa_1a_aula_direta',
  'Olá, {nome}! 😊

Sou a Fabi, da equipe de *Sucesso do Cliente da LA* 🤩

Passando para saber como têm sido suas aulas de {curso}. Esse é um momento muito especial, cheio de expectativas, e para nós é muito importante entender como você tem se sentido nesse comecinho da sua jornada musical.

*Como você avalia suas primeiras aulas?*',
  'texto',
  true,
  'automacao_interna'
),
(
  'Pesquisa 1ª aula — texto (responsável)',
  'pesquisa_1a_aula_responsavel',
  'Olá, {responsavel}! 😊

Sou a Fabi, da equipe de *Sucesso do Cliente da LA* 🤩

Passando para saber como têm sido as primeiras aulas de {nome} ({curso}). Esse é um momento muito especial, cheio de expectativas, e para nós é muito importante entender como vocês têm se sentido nesse comecinho da jornada musical.

*Como você avalia as primeiras aulas de {nome}?*',
  'texto',
  true,
  'automacao_interna'
)
ON CONFLICT (contexto, slug) DO UPDATE
  SET conteudo = EXCLUDED.conteudo,
      nome = EXCLUDED.nome,
      tipo = EXCLUDED.tipo,
      contexto = EXCLUDED.contexto,
      ativo = true;
