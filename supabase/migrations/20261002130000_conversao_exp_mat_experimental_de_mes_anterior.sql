-- supabase/migrations/20261002130000_conversao_exp_mat_experimental_de_mes_anterior.sql
--
-- Conversao experimental -> matricula: quem matriculou no mes e fez experimental EM QUALQUER MES
-- ANTERIOR conta como conversao do mes da matricula (decisao do Hugo, 02/10/2026: "nao importa se
-- fez a experimental em janeiro e matriculou em setembro; se o relatorio e de setembro, entra").
--
-- Antes: a conta so olhava as experimentais do proprio mes, entao Lara (exp 28/08, mat 08/09) e
-- Clara (exp 15/08, mat 16/09), da Barra, nao contavam em mes nenhum.
--
-- Regra aplicada:
--   * a experimental precisa ter PRESENCA (quem faltou ou cancelou segue como matricula direta);
--   * mesma unidade da matricula (eventos ja sao por unidade);
--   * a matricula precisa ser comercial (mesmos criterios de sempre: nao 2o curso, nao bolsista,
--     nao banda/coral, com passaporte);
--   * o DENOMINADOR nao muda: continua sendo as experimentais com presenca do mes.
--   Consequencia declarada: a taxa pode passar de 100% num mes fraco de experimental.
--
-- Mecanica: o CTE `eventos` passa a trazer tambem as experimentais anteriores ao periodo cujo aluno
-- resolvido matriculou dentro do periodo (flag no_periodo = false). `classificados` continua sendo
-- SO o periodo (lista, fila, denominador e contadores intactos); apenas o numerador da conversao le
-- `classificados_todos`. Funcoes: get_conciliacao_experimentais_snapshot_v1 (caminho vivo) e
-- get_conciliacao_experimentais_v2_legacy_p21_20260707 (relatorio gerencial legacy).
-- Nao regrava mes fechado.

do $$
declare
  v_fn text;
  v_def text;
  v_n int;
  v_trocas text[][] := array[
    array[
      '    ) as sinal_conversao
  from public.lead_experimentais le',
      '    ) as sinal_conversao,
    (le.data_experimental >= pr.inicio::date) as no_periodo
  from public.lead_experimentais le'
    ],
    array[
      '  where le.data_experimental >= pr.inicio::date
    and le.data_experimental < pr.fim_exclusivo::date
),
classificados as (',
      '  where (le.data_experimental >= pr.inicio::date
    and le.data_experimental < pr.fim_exclusivo::date)
    -- Experimental de mes anterior de quem matriculou no periodo: so entra no numerador.
    or (le.data_experimental < pr.inicio::date
      and al_taxa.data_matricula >= pr.inicio::date
      and al_taxa.data_matricula < pr.fim_exclusivo::date)
),
classificados_todos as ('
    ],
    array[
      '    end as contar_taxa_exp_mat
  from eventos e
),
raw_por_unidade as (',
      '    end as contar_taxa_exp_mat
  from eventos e
),
classificados as (
  select * from classificados_todos where no_periodo
),
raw_por_unidade as ('
    ],
    array[
      'then count(distinct c.aluno_taxa_id) filter (where c.incluir_taxa_exp_mat and c.contar_taxa_exp_mat)',
      'then (select count(distinct ct.aluno_taxa_id) from classificados_todos ct where ct.unidade_id = ua.unidade_id and ct.incluir_taxa_exp_mat and ct.contar_taxa_exp_mat)'
    ]
  ];
  i int;
begin
  foreach v_fn in array array['get_conciliacao_experimentais_snapshot_v1',
                              'get_conciliacao_experimentais_v2_legacy_p21_20260707'] loop
    select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname = v_fn;
    if v_def is null then raise exception '% nao encontrada', v_fn; end if;
    if position('classificados_todos' in v_def) > 0 then raise exception '% ja alterada', v_fn; end if;

    for i in 1 .. array_length(v_trocas, 1) loop
      v_n := (length(v_def) - length(replace(v_def, v_trocas[i][1], ''))) / length(v_trocas[i][1]);
      if v_n <> 1 then raise exception '%: trecho % esperado 1 vez, achou %', v_fn, i, v_n; end if;
      v_def := replace(v_def, v_trocas[i][1], v_trocas[i][2]);
    end loop;

    execute v_def;
  end loop;
end $$;

-- O cache da conciliacao e por versao dos DADOS: mudar o codigo nao o invalida.
delete from public.conciliacao_experimentais_v2_cache;

do $$
declare
  v_r jsonb := public.conciliacao_experimentais_v2_sem_cache_20260923(
    '368d47f5-2d88-4475-bc14-ba084a9a348e', 2026, 9, 'mensal', null)->'resumo';
begin
  if (v_r->>'conversoes_exp_mat_canonicas')::int <> 16
     or (v_r->>'denominador_taxa_exp_mat')::int <> 33 then
    raise exception 'Barra set/26 fora do esperado (16 de 33): %', v_r;
  end if;
end $$;
