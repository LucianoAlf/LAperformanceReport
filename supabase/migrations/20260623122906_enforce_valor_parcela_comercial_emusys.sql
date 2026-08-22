-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.fn_alunos_valor_parcela_comercial_emusys()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.valor_cheio is not null
     and not exists (
       select 1
       from public.matriculas_campos_fixados mcf
       where mcf.aluno_id = new.id
         and mcf.campo = 'valor_parcela'
     ) then
    new.valor_parcela := round((new.valor_cheio - coalesce(new.desconto_condicional, 0))::numeric, 2);
  end if;

  return new;
end;
$$;

comment on function public.fn_alunos_valor_parcela_comercial_emusys() is
  'Normaliza valor_parcela vindo do Emusys: valor_mensalidade - desconto_condicional. desconto_fixo fica auditado e nao reduz a parcela comercial.';

drop trigger if exists trg_alunos_valor_parcela_comercial_emusys on public.alunos;

create trigger trg_alunos_valor_parcela_comercial_emusys
before insert or update of valor_cheio, desconto_condicional on public.alunos
for each row
execute function public.fn_alunos_valor_parcela_comercial_emusys();
