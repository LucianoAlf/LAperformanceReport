-- Coordenacao pedagogica (Juliana Baltazar e Quintela) no 360 de professores.
--
-- A lista "Registrado por" do 360 (useColaboradoresOcorrencia) le `colaboradores`,
-- e as duas so existiam em `usuarios` (perfil admin) -> nao conseguiam registrar
-- ocorrencia. Nunca estiveram na lista, nem na versao hardcoded anterior ao #167.
--
-- tipo = 'coordenador' (ja aceito pelo CHECK colaboradores_tipo_check).
-- usuario_id / email / whatsapp / unidade_id ficam NULL DE PROPOSITO:
--   - useColaboradorAtual (Painel Farmer) acha o logado por usuario_id e depois email;
--   - sol_caixa_quem_e reconhece a pessoa por whatsapp;
--   - fn_bi_conversation_autofill usa usuario_id;
--   - mila_registrar_consultor_v1 e a pagina Equipe filtram por unidade.
-- Preencher esses campos mudaria o que elas veem/como sao identificadas hoje.
-- Acesso ao report (usuarios + usuario_perfis) nao e tocado.
-- Custo: 2 linhas, sem gatilho alem de updated_at.

insert into public.colaboradores (nome, tipo, cargo, situacao, ativo)
select v.nome, 'coordenador', 'Coordenação', 'ativo', true
from (values ('Juliana Baltazar'), ('Quintela')) as v(nome)
where not exists (
  select 1 from public.colaboradores c
  where unaccent(lower(c.nome)) = unaccent(lower(v.nome)) and c.tipo = 'coordenador'
);
