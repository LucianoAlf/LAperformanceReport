-- Stubs mínimos para provar 20261007150000 num Postgres DESCARTÁVEL.
-- Nomes e IDs fictícios.
create extension if not exists unaccent; create extension if not exists pg_trgm;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'sol_acesso_restrito') then create role sol_acesso_restrito; end if;
end $$;
create table public.alunos(id int primary key, unidade_id uuid, nome text, nome_normalizado text, status text, emusys_student_id text, responsavel_nome text);
create function public.sol_caixa_aluno_pode_pagar_v1(s text, u uuid, e text) returns boolean language sql as $$ select s='ativo' $$;
create function public.sol_nome_mesma_pessoa_v1(a text, b text) returns boolean language sql as $$ select true $$;
create table public._env(j jsonb);
create function public.sol_faturas_alunos_v1(u uuid, y int, m int, j text, t text, d date) returns jsonb language sql as $$ select j from public._env limit 1 $$;
-- o resolver de pagamento inteiro é a fonte do itens_v1: aqui devolve o que o teste mandar
create table public._pag(j jsonb);
create function public.sol_caixa_resolver_pagamento_v1(u uuid, i jsonb, t numeric, c date default null) returns jsonb language sql as $$ select j from public._pag limit 1 $$;
create function public.sol_caixa_responsavel_aluno(u uuid, n text) returns jsonb language sql as $$ select '{"ok":false,"motivo":"nao_encontrado"}'::jsonb $$;
insert into public.alunos values
 (1,'00000000-0000-0000-0000-000000000001','Lara Quintela Prado','lara quintela prado','ativo','201','Responsavel Prado'),
 (2,'00000000-0000-0000-0000-000000000001','Caio Quintela Prado','caio quintela prado','ativo','202','Responsavel Prado'),
 (3,'00000000-0000-0000-0000-000000000001','Otavio Reis','otavio reis','ativo','203','Paula');
-- outubro: as duas abertas e vencidas (hoje R$ 489,92; com desconto R$ 431,44)
insert into public._env values ('{"status":"ok","items":[
 {"canonical_fatura_id":"aaaaaaaa-0000-4000-8000-000000000001","emusys_student_id":"201","status":"aberta","tipo_fatura":"parcela","competencia":"2026-10-01","data_vencimento":"2026-10-05","descricao":"Parcela 10/2026","valores":{"valor_hoje":"489.92","valor_com_desconto":"431.44"}},
 {"canonical_fatura_id":"aaaaaaaa-0000-4000-8000-000000000002","emusys_student_id":"202","status":"aberta","tipo_fatura":"parcela","competencia":"2026-10-01","data_vencimento":"2026-10-05","descricao":"Parcela 10/2026","valores":{"valor_hoje":"489.92","valor_com_desconto":"431.44"}},
 {"canonical_fatura_id":"aaaaaaaa-0000-4000-8000-000000000003","emusys_student_id":"203","status":"aberta","tipo_fatura":"parcela","competencia":"2026-10-01","data_vencimento":"2026-10-10","descricao":"Parcela 10/2026","valores":{"valor_hoje":"390","valor_com_desconto":"390"}}]}');
