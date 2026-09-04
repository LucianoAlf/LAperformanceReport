-- O fechamento de 18:30 passa a carregar a regua do MES junto com o dia — e o
-- que o relatorio comercial ja faz ("MES ATE AGORA" logo abaixo do "RESUMO DO
-- DIA"). Sem isso a consultora fecha o dia sem saber se esta no ritmo.
-- Reusa mila_numeros_do_mes_v1, que prefere o snapshot oficial quando o mes
-- fechou; no fim do dia o mes corrente nunca esta fechado, entao vem ao vivo.
do $do$
declare v_def text; n int;
  a1 text := $a$  v_pend jsonb; v_n_pend int; v_u jsonb;$a$;
  b1 text := $b$  v_pend jsonb; v_n_pend int; v_u jsonb; v_mes jsonb;$b$;
  a2 text := $c$  v_u := coalesce(get_estrelas_matriculador_v1(p_solicitante_telefone,
                    extract(year from p_data)::int, extract(month from p_data)::int)->'unidades'->0, '{}'::jsonb);

  return jsonb_build_object(
    'ok', true, 'tipo', 'fim_do_dia',$c$;
  b2 text := $d$  v_u := coalesce(get_estrelas_matriculador_v1(p_solicitante_telefone,
                    extract(year from p_data)::int, extract(month from p_data)::int)->'unidades'->0, '{}'::jsonb);
  v_mes := mila_numeros_do_mes_v1(p_solicitante_telefone,
             extract(year from p_data)::int, extract(month from p_data)::int);

  return jsonb_build_object(
    'ok', true, 'tipo', 'fim_do_dia',
    'mes_ate_agora', case when coalesce((v_mes->>'ok')::boolean, false)
                          then jsonb_build_object('numeros', v_mes->'mes', 'funil', v_mes->'funil',
                                                  'fechado', v_mes->'fechado', 'fonte', v_mes->'fonte') end,$d$;
begin
  select pg_get_functiondef('public.mila_fechamento_dia_v1(text, date)'::regprocedure) into v_def;
  n := (length(v_def) - length(replace(v_def, a1, ''))) / length(a1);
  if n <> 1 then raise exception 'ancora declare: %', n; end if;
  v_def := replace(v_def, a1, b1);
  n := (length(v_def) - length(replace(v_def, a2, ''))) / length(a2);
  if n <> 1 then raise exception 'ancora retorno: %', n; end if;
  execute replace(v_def, a2, b2);
end $do$;
