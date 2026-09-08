-- A tela de Alunos consultava get_inadimplencia_canonica duas vezes:
-- diretamente e, de novo, dentro de get_faturas_alunos_financeiro_v1.
-- Publicamos no envelope de faturas a leitura canonica que ele ja calculou.
-- A mudanca e aditiva; consumidores antigos ignoram a chave nova.

do $mig$
declare
  v_def text;
  v_new text;
  v_ancora text := '  return v_result;';
  v_ocorrencias integer;
begin
  select pg_get_functiondef(p.oid)
    into strict v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_faturas_alunos_financeiro_v1_canonica_20260817';

  if position('''inadimplencia_canonica'', v_canonical' in v_def) > 0 then
    raise notice 'inadimplencia canonica ja publicada no envelope de faturas';
    return;
  end if;

  v_ocorrencias := (
    length(v_def) - length(replace(v_def, v_ancora, ''))
  ) / length(v_ancora);

  if v_ocorrencias <> 1 then
    raise exception 'esperava exatamente um retorno v_result; encontrei %', v_ocorrencias;
  end if;

  v_new := replace(
    v_def,
    v_ancora,
    '  return v_result || jsonb_build_object(''inadimplencia_canonica'', v_canonical);'
  );

  execute v_new;
end;
$mig$;

comment on function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) is
  'Leitura canonica de faturas com classificacao set-based e a inadimplencia canonica ja calculada, para consumidores sem leitura duplicada.';
