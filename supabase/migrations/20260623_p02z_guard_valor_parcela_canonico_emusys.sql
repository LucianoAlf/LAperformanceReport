-- P02Z: guarda canonica para parcela comercial vinda do Emusys.
-- Regra validada: valor_parcela comercial = valor_cheio - desconto_condicional.
-- desconto_fixo fica auditado, mas nao entra no valor exibido nos relatorios comerciais.

create or replace function public.aplicar_valor_parcela_comercial_canonico()
returns trigger
language plpgsql
as $$
declare
  campo_fixado boolean := false;
begin
  if new.valor_cheio is null then
    return new;
  end if;

  if new.id is not null then
    select exists (
      select 1
      from public.matriculas_campos_fixados f
      where f.aluno_id = new.id
        and f.campo = 'valor_parcela'
    ) into campo_fixado;
  end if;

  if not campo_fixado then
    new.valor_parcela := round((new.valor_cheio - coalesce(new.desconto_condicional, 0))::numeric, 2);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_alunos_valor_parcela_comercial_canonico on public.alunos;

create trigger trg_alunos_valor_parcela_comercial_canonico
before insert or update of valor_cheio, desconto_condicional, desconto_fixo, valor_parcela
on public.alunos
for each row
execute function public.aplicar_valor_parcela_comercial_canonico();

-- Backfill controlado: somente registros ativos de junho/2026 com valor_cheio preenchido,
-- sem trava manual do campo valor_parcela.
update public.alunos a
set
  valor_parcela = round((a.valor_cheio - coalesce(a.desconto_condicional, 0))::numeric, 2),
  updated_at = now()
where a.status = 'ativo'
  and a.valor_cheio is not null
  and a.data_matricula >= date '2026-06-01'
  and a.data_matricula < date '2026-07-01'
  and not exists (
    select 1
    from public.matriculas_campos_fixados f
    where f.aluno_id = a.id
      and f.campo = 'valor_parcela'
  )
  and a.valor_parcela is distinct from round((a.valor_cheio - coalesce(a.desconto_condicional, 0))::numeric, 2);
