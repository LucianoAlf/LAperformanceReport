-- Perf: o telefone normalizado era recalculado A CADA LEITURA da
-- vw_aluno_comunidade_wa_v1. Medido: 350 ms contra 7 ms sem a chamada -- a funcao e
-- IMMUTABLE e PARALLEL SAFE, mas o corpo tem CTEs, entao o planner NAO a inlineia e ela
-- roda uma vez por linha (o plano chegava a montar um Memoize so para segura-la).
-- O outro lado do join ja era materializado: comunidade_wa_participantes.telefone_key.
-- Aqui so se fecha a simetria. Mesmo padrao de motivos_saida.nome_normalizado.
set local lock_timeout = '5s';

alter table public.alunos
  add column telefone_key text
    generated always as (public.fn_normalizar_telefone_br_key(telefone::text)) stored,
  add column whatsapp_key text
    generated always as (public.fn_normalizar_telefone_br_key(whatsapp::text)) stored,
  add column responsavel_telefone_key text
    generated always as (public.fn_normalizar_telefone_br_key(responsavel_telefone::text)) stored;

alter table public.aluno_contatos
  add column telefone_key text
    generated always as (public.fn_normalizar_telefone_br_key(telefone::text)) stored;

comment on column public.alunos.telefone_key is
  'Normalizado por fn_normalizar_telefone_br_key. Materializado porque a funcao nao e inlineavel (CTEs) e era reavaliada a cada leitura da vw_aluno_comunidade_wa_v1. Comparar telefones SEMPRE por esta chave, nunca pelo campo cru. ATENCAO: nao exibir este valor - ele descarta o 9o digito do celular.';
comment on column public.aluno_contatos.telefone_key is
  'Idem alunos.telefone_key. Nao exibir: descarta o 9o digito.';

-- ROLLBACK (nada mais depende destas colunas se a view voltar a versao anterior):
--   alter table public.alunos drop column telefone_key, drop column whatsapp_key,
--     drop column responsavel_telefone_key;
--   alter table public.aluno_contatos drop column telefone_key;
