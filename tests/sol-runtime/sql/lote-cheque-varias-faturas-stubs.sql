create extension if not exists unaccent; create extension if not exists pg_trgm;
create table public.alunos(id int primary key, unidade_id uuid, nome text, nome_normalizado text, status text, emusys_student_id text, responsavel_nome text);
create function public.sol_caixa_aluno_pode_pagar_v1(s text, u uuid, e text) returns boolean language sql as $$ select s='ativo' $$;
create function public.sol_nome_mesma_pessoa_v1(a text, b text) returns boolean language sql as $$ select true $$;
create table public._env(j jsonb);
create function public.sol_faturas_alunos_v1(u uuid, y int, m int, j text, t text, d date) returns jsonb language sql as $$ select j from public._env limit 1 $$;
insert into public.alunos values (1,'00000000-0000-0000-0000-000000000001','Rafael Moura Braga','rafael moura braga','ativo','101','Silvia Braga'),
 (2,'00000000-0000-0000-0000-000000000001','Tiago Moura Braga','tiago moura braga','ativo','102','Silvia Braga'),
 (3,'00000000-0000-0000-0000-000000000001','Otavio Reis','otavio reis','ativo','103','Paula');
insert into public._env values ('{"status":"ok","items":[
 {"canonical_fatura_id":"f1","emusys_student_id":"101","status":"aberta","tipo_fatura":"parcela","competencia":"2026-10-01","descricao":"Parcela 10/2026","valores":{"valor_hoje":"400"}},
 {"canonical_fatura_id":"f2","emusys_student_id":"102","status":"aberta","tipo_fatura":"parcela","competencia":"2026-10-01","descricao":"Parcela 10/2026","valores":{"valor_hoje":"400"}},
 {"canonical_fatura_id":"f3","emusys_student_id":"103","status":"aberta","tipo_fatura":"parcela","competencia":"2026-10-01","descricao":"Parcela 10/2026","valores":{"valor_hoje":"390"}}]}');
