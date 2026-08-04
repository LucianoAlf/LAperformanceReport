-- get_kpis_alunos_admin_operacional custa ~3.900 ms / 1.310.073 buffers e era
-- executada DUAS vezes por chamada de get_kpis_alunos_canonicos: uma dentro de
-- base_v131 e outra no wrapper de topo, com os mesmos parametros.
-- (1.346.358 + 1.310.073 = 2.656.431 ~= os 2.653.236 buffers medidos no topo.)
--
-- A funcao e STABLE: duas chamadas com os mesmos argumentos retornam o mesmo JSON.
-- Passamos o valor ja calculado em vez de recalcular. O merge final (||) continua
-- operando exatamente sobre o mesmo dado, entao o JSON de saida e identico.
--
-- MEDIDO: get_kpis_alunos_canonicos(null,2026,8)
--   antes:  7.495 ms / 2.653.236 buffers
--   depois: 3.966 ms / 1.347.085 buffers
-- EQUIVALENCIA: md5 do jsonb comparado em 8 cenarios (consolidado + Barra + CG +
-- Recreio, x mes aberto (ago/2026) e mes fechado (jul/2026)) - todos IDENTICOS.
--
-- NAO foi tocada get_kpis_alunos_admin_operacional em si, que tambem e usada por
-- gravar_snapshot_fechamento_mensal e preview_fechamento_mensal.
--
-- As alteracoes sao feitas por substituicao textual sobre pg_get_functiondef()
-- para nao reescrever ~12 mil caracteres de logica a mao. Cada troca tem guarda:
-- se o trecho esperado nao for encontrado, a migration aborta.

do $mig$
declare
  v_def text;
  v_novo text;
begin
  ---------------------------------------------------------------------------
  -- 1) base_v131 ganha p_admin jsonb: usa o admin recebido em vez de calcular
  ---------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_kpis_alunos_canonicos_base_v131'
    and p.pronargs = 3;

  if v_def is null then
    raise exception 'base_v131 com 3 parametros nao encontrada';
  end if;

  -- 1a) acrescenta o parametro na assinatura
  v_novo := replace(
    v_def,
    '::integer)' || chr(10) || ' RETURNS jsonb',
    '::integer, p_admin jsonb DEFAULT NULL::jsonb)' || chr(10) || ' RETURNS jsonb'
  );
  if v_novo = v_def then
    raise exception 'nao consegui acrescentar p_admin na assinatura da base_v131';
  end if;
  v_def := v_novo;

  -- 1b) usa o admin recebido quando houver
  v_novo := replace(
    v_def,
    'v_admin_result := public.get_kpis_alunos_admin_operacional(p_unidade_id, p_ano, p_mes);',
    'IF p_admin IS NULL THEN'
      || chr(10) || '    v_admin_result := public.get_kpis_alunos_admin_operacional(p_unidade_id, p_ano, p_mes);'
      || chr(10) || '  ELSE'
      || chr(10) || '    v_admin_result := p_admin;'
      || chr(10) || '  END IF;'
  );
  if v_novo = v_def then
    raise exception 'nao encontrei a chamada de admin_operacional dentro da base_v131';
  end if;

  execute v_novo;

  ---------------------------------------------------------------------------
  -- 2) topo: calcula o admin UMA vez e repassa para a base
  ---------------------------------------------------------------------------
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_kpis_alunos_canonicos';

  if v_def is null then
    raise exception 'get_kpis_alunos_canonicos nao encontrada';
  end if;

  v_novo := replace(
    v_def,
    '  v_result := public.get_kpis_alunos_canonicos_base_v131('
      || chr(10) || '    p_unidade_id,' || chr(10) || '    p_ano,' || chr(10) || '    p_mes'
      || chr(10) || '  );' || chr(10)
      || '  v_admin := public.get_kpis_alunos_admin_operacional('
      || chr(10) || '    p_unidade_id,' || chr(10) || '    p_ano,' || chr(10) || '    p_mes'
      || chr(10) || '  );',
    '  v_admin := public.get_kpis_alunos_admin_operacional('
      || chr(10) || '    p_unidade_id,' || chr(10) || '    p_ano,' || chr(10) || '    p_mes'
      || chr(10) || '  );' || chr(10)
      || '  v_result := public.get_kpis_alunos_canonicos_base_v131('
      || chr(10) || '    p_unidade_id,' || chr(10) || '    p_ano,' || chr(10) || '    p_mes,'
      || chr(10) || '    v_admin' || chr(10) || '  );'
  );
  if v_novo = v_def then
    raise exception 'nao encontrei o par de chamadas no topo para reordenar';
  end if;

  execute v_novo;

  ---------------------------------------------------------------------------
  -- 3) remove a base antiga de 3 parametros: com a nova tendo DEFAULT, chamar
  --    com 3 argumentos seria ambiguo. Ninguem mais a chama (verificado em
  --    pg_proc.prosrc: so o topo, que agora passa 4).
  ---------------------------------------------------------------------------
  drop function public.get_kpis_alunos_canonicos_base_v131(uuid, integer, integer);
end
$mig$;
