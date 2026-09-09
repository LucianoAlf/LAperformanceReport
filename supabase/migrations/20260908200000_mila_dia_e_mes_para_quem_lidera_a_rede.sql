-- Quem lidera a REDE nao conseguia perguntar o basico (08/09/2026).
--
-- 🔴 ACHADO DA BATERIA DAS 34 TOOLS (`tests/mila-gestao/bateria-tools-mcp.mjs`).
--    Chamando o MCP como cada pessoa, tres das perguntas mais comuns RECUSAVAM
--    justamente a diretoria e a lideranca:
--
--      agenda_do_dia     -> {"ok":false,"motivo":"sem_unidade"}   (Krissya, Luciano)
--      fechamento_do_dia -> {"ok":false,"motivo":"sem_unidade"}
--      numeros_do_mes    -> {"ok":false,"motivo":"sem_unidade"}
--
--    Consultora (com unidade) funcionava. Ou seja: "quais as experimentais de
--    hoje?", "como fechou o dia?" e "quantas matriculas em agosto?" eram
--    impossiveis para as duas pessoas que mais precisam delas.
--
-- ⚠️ E A MESMA FAMILIA que ja mordeu duas vezes no MESMO DIA: o
--    `mila_recados.unidade_id NOT NULL` e o prompt do bridge dizendo
--    `Unidade: <inbox>`. **Quem lidera nao tem unidade** — e o codigo insiste em
--    ler unidade nula como falta de dado em vez de escopo de rede.
--
-- ── COMO FICA ──────────────────────────────────────────────────────────────
--   · pessoa COM unidade  -> a unidade dela, e `p_unidade_id` e IGNORADO.
--     🔴 Trava de escopo: sem isso bastaria convencer o modelo a mandar outro
--        uuid para a consultora ler a unidade da colega.
--   · pessoa de REDE + p_unidade_id -> aquela unidade ("e o Recreio?").
--   · pessoa de REDE sem p_unidade_id -> MODO REDE: recursao por unidade +
--     consolidado canonico.
--
-- ⚠️ O consolidado do mes NAO e soma de blocos: usa
--    `get_kpis_comercial_canonicos_v2(null, ...)`, que ja e a leitura
--    consolidada canonica (conferido: 66 = 24 CG + 23 Recreio + 19 Barra em
--    ago/2026). Somar a mao seria uma segunda fonte para o mesmo numero — a
--    causa-raiz das duplicatas de renovacao.
--
-- ⚠️ `matriculas_comerciais_v1(null, ...)` NAO e consolidado: devolve ZERO
--    linhas. Por isso o ticket da rede vem de `cross join lateral` por unidade.
--    Media de medias tambem estaria errada.
--
-- ⚠️ DROP da assinatura antiga no mesmo comando: parametro novo com DEFAULT
--    torna as duas candidatas e o Postgres recusa com "function is not unique"
--    (incidente do `upsert_lead`, 11/08 — 22 leads perdidos em 21h).
--    Consumidores conferidos: MCP da Mila e `mila-proativa.py`, ambos por chave
--    nomeada.
--
-- ⚠️ Corpo NAO transcrito a mao: `pg_get_functiondef` + `replace` com ancora
--    contada (regra da casa). Aplicada via MCP no mesmo dia; este arquivo e o
--    espelho versionado. Assinaturas vigentes conferidas:
--      mila_briefing_manha_v1 (text, date, uuid)
--      mila_fechamento_dia_v1 (text, date, uuid)
--      mila_numeros_do_mes_v1 (text, integer, integer, uuid)
--
-- ⚠️ Re-execucao e segura: funcao que ja tem `p_unidade_id` e PULADA. Sem isso
--    a ancora `sem_unidade` nao seria encontrada e a migration abortaria num
--    ambiente novo depois da primeira aplicacao.

do $mig$
declare
  r record;
  v_def text; v_n int; v_despacho text; v_args text;
  v_alvo constant text := '  v_un := q.unidade_id;' || chr(10) ||
    '  if v_un is null then return jsonb_build_object(''ok'', false, ''motivo'', ''sem_unidade'', ''solicitante'', q.nome); end if;';
  NL constant text := chr(10);
begin
  for r in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('mila_briefing_manha_v1','mila_fechamento_dia_v1','mila_numeros_do_mes_v1')
       -- ja migrada? pula (torna a migration re-executavel)
       and pg_get_function_identity_arguments(p.oid) not like '%uuid%'
  loop
    v_def := pg_get_functiondef(r.oid);
    v_args := case when r.proname = 'mila_numeros_do_mes_v1' then 'integer, integer' else 'date' end;

    -- 1) assinatura ganha o recorte opcional
    v_n := (select count(*) from regexp_matches(v_def, '\)' || NL || ' RETURNS jsonb', 'g'));
    if v_n <> 1 then
      raise exception 'ANCORA header em %: esperava 1, achei %', r.proname, v_n;
    end if;
    v_def := replace(v_def, ')' || NL || ' RETURNS jsonb',
                     ', p_unidade_id uuid DEFAULT NULL::uuid)' || NL || ' RETURNS jsonb');

    -- 2) a guarda vira despacho
    if r.proname = 'mila_numeros_do_mes_v1' then
      v_despacho :=
        '  -- quem lidera a REDE nao tem unidade: nao e falta de dado, e escopo.' || NL ||
        '  if q.unidade_id is not null then' || NL ||
        '    v_un := q.unidade_id;   -- p_unidade_id IGNORADO de proposito: trava de escopo' || NL ||
        '  elsif p_unidade_id is not null then' || NL ||
        '    v_un := p_unidade_id;   -- rede pedindo uma unidade especifica' || NL ||
        '  else' || NL ||
        '    return (' || NL ||
        '      with porun as (' || NL ||
        '        select u.nome un, public.mila_numeros_do_mes_v1(p_solicitante_telefone, p_ano, p_mes, u.id) j' || NL ||
        '          from unidades u where u.ativo' || NL ||
        '      ), consol as (' || NL ||
        '        select get_kpis_comercial_canonicos_v2(null, p_ano, p_mes) k' || NL ||
        '      ), tk as (' || NL ||
        '        select round(avg(nullif(m.valor_parcela,0)), 2) v' || NL ||
        '          from unidades u cross join lateral matriculas_comerciais_v1(u.id,' || NL ||
        '                 make_date(p_ano,p_mes,1), (make_date(p_ano,p_mes,1) + interval ''1 month'')::date) m' || NL ||
        '         where u.ativo and m.conta' || NL ||
        '      )' || NL ||
        '      select jsonb_build_object(' || NL ||
        '        ''ok'', true, ''solicitante'', q.nome,' || NL ||
        '        ''escopo'', ''a REDE - as 3 unidades juntas'',' || NL ||
        '        ''competencia'', to_char(make_date(p_ano, p_mes, 1), ''MM/YYYY''),' || NL ||
        '        ''fechado'', (select bool_and(coalesce((j->>''fechado'')::bool,false)) from porun),' || NL ||
        '        ''rede'', jsonb_build_object(' || NL ||
        '          ''leads'', (select k #> ''{kpis,leads_entrantes}'' from consol),' || NL ||
        '          ''experimentais_realizadas'', (select k #> ''{kpis,experimentais_realizadas_status_operacional}'' from consol),' || NL ||
        '          ''experimentais_agendadas'', (select k #> ''{kpis,experimentais_agendadas_periodo}'' from consol),' || NL ||
        '          ''faltas'', (select k #> ''{kpis,experimentais_no_show}'' from consol),' || NL ||
        '          ''canceladas'', (select k #> ''{kpis,experimentais_canceladas}'' from consol),' || NL ||
        '          ''visitas'', (select k #> ''{kpis,visitas}'' from consol),' || NL ||
        '          ''matriculas'', (select k #> ''{kpis,matriculas_comerciais_principais}'' from consol),' || NL ||
        '          ''passaportes_total'', (select k #> ''{kpis,passaportes_total}'' from consol),' || NL ||
        '          ''ticket_medio_parcela'', (select v from tk)),' || NL ||
        '        ''por_unidade'', (select jsonb_object_agg(un, j) from porun),' || NL ||
        '        ''fonte'', ''rede: consolidado canonico; por_unidade: a mesma leitura que cada consultora recebe''' || NL ||
        '      ));' || NL ||
        '  end if;';
    else
      v_despacho :=
        '  -- quem lidera a REDE nao tem unidade: nao e falta de dado, e escopo.' || NL ||
        '  if q.unidade_id is not null then' || NL ||
        '    v_un := q.unidade_id;   -- p_unidade_id IGNORADO de proposito: trava de escopo' || NL ||
        '  elsif p_unidade_id is not null then' || NL ||
        '    v_un := p_unidade_id;' || NL ||
        '  else' || NL ||
        '    return (' || NL ||
        '      with porun as (' || NL ||
        '        select u.nome un, public.' || r.proname || '(p_solicitante_telefone, p_data, u.id) j' || NL ||
        '          from unidades u where u.ativo' || NL ||
        '      )' || NL ||
        '      select jsonb_build_object(' || NL ||
        '        ''ok'', true, ''solicitante'', q.nome,' || NL ||
        '        ''escopo'', ''a REDE - as 3 unidades juntas'',' || NL ||
        '        ''data'', to_char(p_data, ''DD/MM/YYYY''),' || NL ||
        '        ''rede'', jsonb_build_object(' || NL ||
        '          ''n_experimentais'', (select sum(coalesce((j #>> ''{hoje,n_experimentais}'')::int,0)) from porun),' || NL ||
        '          ''n_visitas'', (select sum(coalesce((j #>> ''{hoje,n_visitas}'')::int,0)) from porun),' || NL ||
        '          ''n_pendencias_de_hoje'', (select sum(coalesce((j->>''n_pendencias_de_hoje'')::int,0)) from porun),' || NL ||
        '          ''unidades_sem_nada'', (select coalesce(jsonb_agg(un) filter (where coalesce((j->>''nada_para_hoje'')::bool,false)), ''[]''::jsonb) from porun)),' || NL ||
        '        ''por_unidade'', (select jsonb_object_agg(un, j) from porun),' || NL ||
        '        ''fonte'', ''uma leitura por unidade - a MESMA que a consultora daquela unidade recebe''' || NL ||
        '      ));' || NL ||
        '  end if;';
    end if;

    v_n := (select count(*) from regexp_matches(v_def, 'sem_unidade', 'g'));
    if v_n <> 1 then
      raise exception 'ANCORA guarda em %: esperava 1 sem_unidade, achei %', r.proname, v_n;
    end if;
    if position(v_alvo in v_def) = 0 then
      raise exception 'o bloco alvo nao foi encontrado em % (formato mudou)', r.proname;
    end if;
    v_def := replace(v_def, v_alvo, v_despacho);
    if position('sem_unidade' in v_def) > 0 then
      raise exception 'a guarda sem_unidade sobreviveu em %', r.proname;
    end if;

    execute format('drop function if exists public.%I(text, %s)', r.proname, v_args);
    execute v_def;
    execute format('revoke all on function public.%I(text, %s, uuid) from public, anon', r.proname, v_args);
    execute format('grant execute on function public.%I(text, %s, uuid) to authenticated, service_role', r.proname, v_args);
    raise notice 'recriada: %', r.proname;
  end loop;
end $mig$;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare
  KRI constant text := '5521966875271';  -- lider comercial, unidade NULL
  LUC constant text := '5521981278047';  -- diretoria, unidade NULL
  KAI constant text := '5521984690143';  -- consultora Barra
  REC constant uuid := '95553e96-971b-4590-a6eb-0201d013c14d';
  BAR constant uuid := '368d47f5-2d88-4475-bc14-ba084a9a348e';
  j jsonb; v_rede int; v_soma int; v_una text;
begin
  -- 1. a rede passa a responder as tres
  for j in select unnest(array[
      mila_briefing_manha_v1(KRI, current_date),
      mila_fechamento_dia_v1(KRI, current_date - 1),
      mila_numeros_do_mes_v1(KRI, 2026, 8),
      mila_briefing_manha_v1(LUC, current_date),
      mila_numeros_do_mes_v1(LUC, 2026, 8)])
  loop
    if not coalesce((j->>'ok')::bool, false) then
      raise exception 'rede ainda recusada: %', j->>'motivo';
    end if;
    if j->'por_unidade' is null then
      raise exception 'modo rede sem por_unidade: %', left(j::text, 200);
    end if;
  end loop;

  -- 2. o consolidado bate com a soma das unidades (nao pode divergir)
  j := mila_numeros_do_mes_v1(KRI, 2026, 8);
  v_rede := (j #>> '{rede,matriculas}')::int;
  select sum((v #>> '{mes,matriculas}')::int) into v_soma
    from jsonb_each(j->'por_unidade') as e(k, v);
  if v_rede is distinct from v_soma then
    raise exception 'consolidado (%) diverge da soma das unidades (%)', v_rede, v_soma;
  end if;

  -- 3. 🔴 a consultora continua presa a unidade dela — p_unidade_id NAO a solta
  j := mila_numeros_do_mes_v1(KAI, 2026, 8, REC);
  v_una := j->>'unidade';
  if v_una is distinct from 'Barra' then
    raise exception 'FURO DE ESCOPO: consultora da Barra leu "%"', v_una;
  end if;
  if j->'por_unidade' is not null then
    raise exception 'FURO DE ESCOPO: consultora recebeu a rede inteira';
  end if;

  -- 4. quem e de rede consegue pedir UMA unidade
  j := mila_numeros_do_mes_v1(LUC, 2026, 8, BAR);
  if j->>'unidade' is distinct from 'Barra' then
    raise exception 'recorte por unidade nao funcionou para a rede: %', j->>'unidade';
  end if;

  -- 5. quem nao esta na governanca continua fora
  j := mila_numeros_do_mes_v1('5521000000000', 2026, 8);
  if coalesce((j->>'ok')::bool, false) then
    raise exception 'desconhecido passou';
  end if;

  raise notice 'prova ok: rede responde, consolidado=% bate com a soma, consultora segue presa', v_rede;
end $prova$;
