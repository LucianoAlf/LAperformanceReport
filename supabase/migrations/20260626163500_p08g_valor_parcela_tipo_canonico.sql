create or replace function public.aplicar_valor_parcela_comercial_canonico()
returns trigger
language plpgsql
as $$
declare
  v_valor_cheio numeric;
  v_desconto_condicional numeric;
  v_tipo_codigo text;
begin
  if public.campo_fixado(new.id, 'valor_parcela') then
    return new;
  end if;

  select codigo
    into v_tipo_codigo
  from public.tipos_matricula
  where id = new.tipo_matricula_id;

  if v_tipo_codigo in ('BOLSISTA_INT', 'BANDA') then
    new.valor_parcela := 0;
    return new;
  end if;

  v_valor_cheio := coalesce(new.valor_cheio, 0);
  v_desconto_condicional := coalesce(new.desconto_condicional, 0);

  if v_valor_cheio > 0 then
    new.valor_parcela := round((v_valor_cheio - v_desconto_condicional)::numeric, 2);
  end if;

  return new;
end;
$$;

create or replace function public.fn_alunos_valor_parcela_comercial_emusys()
returns trigger
language plpgsql
as $$
declare
  v_tipo_codigo text;
begin
  if public.campo_fixado(new.id, 'valor_parcela') then
    return new;
  end if;

  select codigo
    into v_tipo_codigo
  from public.tipos_matricula
  where id = new.tipo_matricula_id;

  if v_tipo_codigo in ('BOLSISTA_INT', 'BANDA') then
    new.valor_parcela := 0;
  elsif coalesce(new.valor_cheio, 0) > 0 then
    new.valor_parcela := round(
      (coalesce(new.valor_cheio, 0) - coalesce(new.desconto_condicional, 0))::numeric,
      2
    );
  end if;

  return new;
end;
$$;
