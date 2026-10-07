-- supabase/migrations/20261002170000_gerencial_inadimplencia_regra_inadimplentes_sobre_pagantes.sql
--
-- Relatorio gerencial/mensal: a "inadimplencia" era o PERCENTUAL DE BOLSISTAS.
--
-- get_dados_relatorio_gerencial_legacy_p20_20260707 sobrescrevia kpis_gestao, dados_mes_atual
-- e os totais com `alunos_nao_pagantes / alunos_ativos` - e nao pagantes sao bolsistas. Recreio
-- set/26: 11 bolsistas / 353 ativos = 3,12% publicado como inadimplencia, com 0 inadimplentes de
-- fato (Fernanda/Recreio, 02/10/2026). Mesmo erro nas 3 unidades em jul e set (ago foi retificado):
-- CG set 6,78% (regra 1,35%), Barra set 1,48% (regra 3,75%).
--
-- Regra (REGRAS-DE-NEGOCIO §4.6): inadimplencia % = inadimplentes / alunos_pagantes x 100, por
-- pessoa. Os dois campos ja chegam por unidade da camada de baixo (KPI canonico); aqui so a
-- conta muda. Sem `inadimplentes` na linha, mantem o percentual que veio de baixo (nao inventa 0).
--
-- NAO regrava nenhuma competencia: snapshots fechados seguem como estao ate retificacao decidida.
-- Pendente (fora daqui): a CONTAGEM de inadimplentes do KPI vivo ainda le alunos.status_pagamento
-- (marcacao de cadastro); a regra manda get_inadimplencia_canonica (faturas).

do $$
declare
  v_def text;
  v_trocas text[][] := array[
    array[
'      COALESCE(NULLIF(elem->>''alunos_nao_pagantes'', '''')::numeric, 0) AS alunos_nao_pagantes,
      CASE
        WHEN COALESCE(NULLIF(elem->>''alunos_ativos'', '''')::numeric, 0) > 0 THEN
          ROUND(
            COALESCE(NULLIF(elem->>''alunos_nao_pagantes'', '''')::numeric, 0)
            / COALESCE(NULLIF(elem->>''alunos_ativos'', '''')::numeric, 0)
            * 100,
            2
          )
        ELSE 0
      END AS inadimplencia_pct',
'      COALESCE(NULLIF(elem->>''alunos_nao_pagantes'', '''')::numeric, 0) AS alunos_nao_pagantes,
      NULLIF(elem->>''inadimplentes'', '''')::numeric AS inadimplentes,
      COALESCE(NULLIF(elem->>''alunos_pagantes'', '''')::numeric, 0) AS alunos_pagantes,
      -- Regra §4.6: inadimplentes / pagantes (por pessoa). Ate 02/10/2026 era
      -- nao_pagantes / ativos, ou seja, o percentual de BOLSISTAS (20261002170000).
      CASE
        WHEN NULLIF(elem->>''inadimplentes'', '''') IS NULL THEN
          NULLIF(COALESCE(elem->>''inadimplencia_pct'', elem->>''inadimplencia''), '''')::numeric
        WHEN COALESCE(NULLIF(elem->>''alunos_pagantes'', '''')::numeric, 0) > 0 THEN
          ROUND(
            NULLIF(elem->>''inadimplentes'', '''')::numeric
            / NULLIF(elem->>''alunos_pagantes'', '''')::numeric
            * 100,
            2
          )
        ELSE 0
      END AS inadimplencia_pct'
    ],
    array[
'      ''inadimplencia'', CASE
        WHEN COALESCE(SUM(alunos_ativos), 0) > 0 THEN ROUND(SUM(alunos_nao_pagantes) / SUM(alunos_ativos) * 100, 2)
        ELSE 0
      END,
      ''inadimplencia_pct'', CASE
        WHEN COALESCE(SUM(alunos_ativos), 0) > 0 THEN ROUND(SUM(alunos_nao_pagantes) / SUM(alunos_ativos) * 100, 2)
        ELSE 0
      END',
'      -- total = media das unidades ponderada pelos pagantes = inadimplentes / pagantes da rede
      ''inadimplencia'', CASE
        WHEN COALESCE(SUM(alunos_pagantes) FILTER (WHERE inadimplencia_pct IS NOT NULL), 0) > 0 THEN
          ROUND(SUM(inadimplencia_pct * alunos_pagantes) / SUM(alunos_pagantes) FILTER (WHERE inadimplencia_pct IS NOT NULL), 2)
        ELSE 0
      END,
      ''inadimplencia_pct'', CASE
        WHEN COALESCE(SUM(alunos_pagantes) FILTER (WHERE inadimplencia_pct IS NOT NULL), 0) > 0 THEN
          ROUND(SUM(inadimplencia_pct * alunos_pagantes) / SUM(alunos_pagantes) FILTER (WHERE inadimplencia_pct IS NOT NULL), 2)
        ELSE 0
      END'
    ],
    array[
      'to_jsonb(''p19_alunos_nao_pagantes_sobre_ativos_admin''::text)',
      'to_jsonb(''inadimplentes_sobre_pagantes_regra_4_6''::text)'
    ]
  ];
  i int; v_n int;
begin
  select pg_get_functiondef('public.get_dados_relatorio_gerencial_legacy_p20_20260707(uuid,integer,integer)'::regprocedure)
    into v_def;
  for i in 1 .. array_length(v_trocas, 1) loop
    v_n := (length(v_def) - length(replace(v_def, v_trocas[i][1], ''))) / length(v_trocas[i][1]);
    if v_n <> 1 then raise exception 'p20: trecho % esperado 1 vez, achou %', i, v_n; end if;
    v_def := replace(v_def, v_trocas[i][1], v_trocas[i][2]);
  end loop;
  execute v_def;
end $$;
