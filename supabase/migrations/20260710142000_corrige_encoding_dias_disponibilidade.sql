-- Mantem o SQL ASCII e reconhece as chaves reais com acento pelos bytes UTF-8.

create or replace function public.fn_disponibilidade_professor_valida(p_disponibilidade jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_dia record;
  v_inicio time;
  v_fim time;
begin
  if p_disponibilidade is null or jsonb_typeof(p_disponibilidade) <> 'object' then
    return false;
  end if;

  for v_dia in select key, value from jsonb_each(p_disponibilidade)
  loop
    if not (
         v_dia.key in (
           'Segunda', 'Segunda-feira',
           'Terca', 'Terca-feira',
           'Quarta', 'Quarta-feira',
           'Quinta', 'Quinta-feira',
           'Sexta', 'Sexta-feira',
           'Sabado', 'Sabado-feira',
           'Domingo'
         )
         or encode(convert_to(v_dia.key, 'UTF8'), 'hex') in (
           '546572c3a761',
           '546572c3a7612d6665697261',
           '53c3a16261646f',
           '53c3a16261646f2d6665697261'
         )
       )
       or jsonb_typeof(v_dia.value) <> 'object'
       or not (v_dia.value ? 'inicio')
       or not (v_dia.value ? 'fim')
       or (v_dia.value ->> 'inicio') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (v_dia.value ->> 'fim') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;

    v_inicio := (v_dia.value ->> 'inicio')::time;
    v_fim := (v_dia.value ->> 'fim')::time;
    if v_inicio >= v_fim then
      return false;
    end if;
  end loop;

  return true;
exception
  when others then
    return false;
end;
$$;

revoke all on function public.fn_disponibilidade_professor_valida(jsonb) from public, anon;
