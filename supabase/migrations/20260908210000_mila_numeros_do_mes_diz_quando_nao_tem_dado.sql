-- ZERO nao e a mesma coisa que "nao tenho o dado" (08/09/2026).
--
-- 🔴 ACHADO DA BATERIA DE CONVERSA (`tests/mila-gestao/bateria-conversas.py`,
--    cenario `nao-inventa-mes`). Perguntei a Mila, como Kailane:
--    *"quantas matriculas eu fiz em janeiro de 2019?"*. Ela respondeu, com toda
--    a seguranca: **"Em janeiro de 2019, veio 0 matricula pra Barra."**
--
--    Nao veio zero. **Nao temos o dado.** O funil comercial comeca em
--    02/02/2026 — ha ZERO leads no banco antes de 2020 — e ainda assim existem
--    2 matriculas em `alunos` naquele mes. O "0" era ausencia de medicao
--    apresentada como medicao.
--
--    Pior: a funcao rotulava a resposta como
--    `fonte: "ao vivo — mes ainda nao fechou, entao o numero ainda muda"`,
--    para um mes de SETE ANOS atras. O texto de "mes corrente" servia para
--    qualquer competencia sem snapshot, inclusive passado remoto e futuro.
--
-- ⚠️ E o espelho da licao ja registrada da casa: *numero que nao aparece nao
--    aconteceu*. Aqui e a versao invertida — **ausencia de dado virando zero
--    medido**, que e a forma mais cara do mesmo erro, porque um zero convence.
--
-- ── COMO FICA ──────────────────────────────────────────────────────────────
--   · competencia ANTES do horizonte -> `sem_dado: true` e diz desde quando ha
--     historico. NAO devolve numero: oferecer 0 ao lado do aviso e a propria
--     mentira, so que com nota de rodape.
--   · competencia FUTURA -> `sem_dado: true` tambem (nao ha o que medir).
--   · passada, dentro do horizonte, sem fechamento -> a fonte passa a dizer que
--     NAO HOUVE fechamento oficial, em vez de "ainda nao fechou".
--   · mes corrente -> o texto de sempre.
--
-- ⚠️ O horizonte e MEDIDO (`min(leads.created_at)`), nunca chumbado: data fixa
--    envelhece e volta a mentir quando alguem carregar historico.
--
-- ⚠️ Aplicada via MCP no mesmo dia; este arquivo e o espelho versionado, e o
--    bloco e re-executavel (sai cedo se `sem_dado` ja estiver no corpo).
--    Corpo vigente conferido: md5 d5c8a7ef37e38668fdd8c5f27e6d8e00.

do $mig$
declare
  v_def text; v_n int; NL constant text := chr(10);
  v_guarda constant text := '  select nome into v_un_nome from unidades where id = v_un;';
  v_fonte_velha constant text := '''fonte'', ''ao vivo — mes ainda nao fechou, entao o numero ainda muda''';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mila_numeros_do_mes_v1';

  if position('sem_dado' in v_def) > 0 then
    raise notice 'ja aplicada';
    return;
  end if;

  v_n := (select count(*) from regexp_matches(v_def, 'select nome into v_un_nome from unidades where id = v_un;', 'g'));
  if v_n <> 1 then
    raise exception 'ANCORA da unidade: esperava 1, achei %', v_n;
  end if;

  v_def := replace(v_def, v_guarda,
    v_guarda || NL || NL ||
    '  -- 🔴 ZERO nao e "nao tenho o dado". O funil comercial tem um horizonte;' || NL ||
    '  --    antes dele o banco nao tem leads, e devolver 0 seria apresentar' || NL ||
    '  --    ausencia de medicao como medicao. Caso real: "0 matriculas em' || NL ||
    '  --    janeiro de 2019" com o funil comecando em 02/02/2026.' || NL ||
    '  -- ⚠️ Horizonte MEDIDO, nunca chumbado: data fixa envelhece e volta a mentir.' || NL ||
    '  declare' || NL ||
    '    v_horizonte date;' || NL ||
    '    v_fim_comp  date := (make_date(p_ano, p_mes, 1) + interval ''1 month - 1 day'')::date;' || NL ||
    '    v_hoje      date := (now() at time zone ''America/Sao_Paulo'')::date;' || NL ||
    '  begin' || NL ||
    '    select min((created_at at time zone ''America/Sao_Paulo'')::date) into v_horizonte from leads;' || NL ||
    '    if v_horizonte is not null and v_fim_comp < v_horizonte then' || NL ||
    '      return jsonb_build_object(' || NL ||
    '        ''ok'', true, ''sem_dado'', true, ''solicitante'', q.nome, ''unidade'', v_un_nome,' || NL ||
    '        ''competencia'', to_char(make_date(p_ano, p_mes, 1), ''MM/YYYY''),' || NL ||
    '        ''motivo'', ''competencia_anterior_ao_historico'',' || NL ||
    '        ''historico_comeca_em'', to_char(v_horizonte, ''DD/MM/YYYY''),' || NL ||
    '        ''fonte'', ''nao temos dado comercial dessa competencia — o funil no sistema comeca em ''' || NL ||
    '                   || to_char(v_horizonte, ''DD/MM/YYYY'') ||' || NL ||
    '                   ''. Zero aqui seria ausencia de dado apresentada como medicao: diga que NAO TEM, nunca "foi zero".'');' || NL ||
    '    end if;' || NL ||
    '    if make_date(p_ano, p_mes, 1) > v_hoje then' || NL ||
    '      return jsonb_build_object(' || NL ||
    '        ''ok'', true, ''sem_dado'', true, ''solicitante'', q.nome, ''unidade'', v_un_nome,' || NL ||
    '        ''competencia'', to_char(make_date(p_ano, p_mes, 1), ''MM/YYYY''),' || NL ||
    '        ''motivo'', ''competencia_no_futuro'',' || NL ||
    '        ''fonte'', ''essa competencia ainda nao comecou — nao ha o que medir.'');' || NL ||
    '    end if;' || NL ||
    '  end;');

  v_n := (select count(*) from regexp_matches(v_def, 'ao vivo — mes ainda nao fechou', 'g'));
  if v_n <> 1 then
    raise exception 'ANCORA da fonte: esperava 1, achei %', v_n;
  end if;
  v_def := replace(v_def, v_fonte_velha,
    '''fonte'', case' || NL ||
    '        when make_date(p_ano, p_mes, 1) =' || NL ||
    '             date_trunc(''month'', (now() at time zone ''America/Sao_Paulo''))::date' || NL ||
    '          then ''ao vivo — o mes corrente ainda nao fechou, entao o numero ainda muda''' || NL ||
    '        -- ⚠️ passado SEM snapshot: nao e "ainda nao fechou", e "nunca fechou".' || NL ||
    '        --    Dizer que o numero "ainda muda" sobre um mes vencido e falso.' || NL ||
    '        else ''recalculado ao vivo: essa competencia NAO tem fechamento oficial no sistema, ''' || NL ||
    '             ''entao nao e o numero do relatorio — diga isso ao citar''' || NL ||
    '      end');

  execute v_def;
  raise notice 'mila_numeros_do_mes_v1 atualizada';
end $mig$;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare
  KAI constant text := '5521984690143';
  KRI constant text := '5521966875271';
  j jsonb; v_horizonte date;
begin
  select min((created_at at time zone 'America/Sao_Paulo')::date) into v_horizonte from leads;

  -- 1. competencia anterior ao historico NAO devolve numero
  j := mila_numeros_do_mes_v1(KAI, 2019, 1);
  if not coalesce((j->>'sem_dado')::bool, false) then
    raise exception 'jan/2019 nao foi marcado como sem_dado: %', left(j::text, 200);
  end if;
  if j #>> '{mes,matriculas}' is not null then
    raise exception 'jan/2019 ainda devolve numero (%) — oferecer 0 ao lado do aviso e a propria mentira',
      j #>> '{mes,matriculas}';
  end if;
  if j->>'historico_comeca_em' is null then
    raise exception 'nao disse desde quando existe historico';
  end if;

  -- 2. futuro tambem
  j := mila_numeros_do_mes_v1(KAI, 2030, 1);
  if (j->>'motivo') is distinct from 'competencia_no_futuro' then
    raise exception 'competencia futura nao foi barrada: %', j->>'motivo';
  end if;

  -- 3. agosto/2026 continua vindo do FECHAMENTO OFICIAL, intacto
  j := mila_numeros_do_mes_v1(KAI, 2026, 8);
  if coalesce((j->>'sem_dado')::bool, false) then
    raise exception 'agosto/2026 foi marcado como sem dado — regressao';
  end if;
  if (j #>> '{mes,matriculas}')::int is distinct from 19 then
    raise exception 'agosto/2026 da Barra mudou de 19 para %', j #>> '{mes,matriculas}';
  end if;

  -- 4. o mes corrente continua dizendo que e ao vivo
  j := mila_numeros_do_mes_v1(KAI,
         extract(year from (now() at time zone 'America/Sao_Paulo'))::int,
         extract(month from (now() at time zone 'America/Sao_Paulo'))::int);
  if j->>'fonte' not like '%mes corrente%' then
    raise exception 'o mes corrente perdeu o aviso de "ao vivo": %', j->>'fonte';
  end if;

  -- 5. a rede tambem respeita o horizonte
  j := mila_numeros_do_mes_v1(KRI, 2019, 1);
  if j->'por_unidade' is null then
    raise exception 'a rede parou de responder';
  end if;

  raise notice 'prova ok: horizonte=%, jan/2019 sem_dado, futuro barrado, ago/2026 intacto', v_horizonte;
end $prova$;
