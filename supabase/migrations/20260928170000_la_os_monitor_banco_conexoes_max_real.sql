-- =====================================================================
-- Monitor de desempenho (LAPE-46): o teto de conexoes vem do banco.
--
-- O compute subiu de Micro para Small em 26/09 09h17 BRT e max_connections
-- foi de 60 para 90. O coletor nao acha o teto no endpoint Prometheus e caia
-- no fallback fixo de 60, entao alarmava "Conexoes observar (46)" com 46 de 90.
-- registrar_banco passa a devolver max_connections; o coletor guarda e usa
-- nos limiares (em % do teto), e grava o teto certo na proxima linha.
-- Custo: current_setting, zero leitura de tabela.
-- =====================================================================

do $$
declare v_def text; v_novo text;
begin
  v_def := pg_get_functiondef('monitoramento.registrar_banco(jsonb)'::regprocedure);
  v_novo := replace(v_def,
    'return jsonb_build_object(''ok'', true, ''inseriu'', v_inseriu, ''eventos'', v_eventos);',
    'return jsonb_build_object(''ok'', true, ''inseriu'', v_inseriu, ''eventos'', v_eventos,
                            ''max_connections'', current_setting(''max_connections'')::integer);');
  if v_novo = v_def then
    raise exception 'ancora de registrar_banco nao casou; nada aplicado';
  end if;
  execute v_novo;
end $$;

revoke execute on function monitoramento.registrar_banco(jsonb) from public, anon, authenticated, service_role;
