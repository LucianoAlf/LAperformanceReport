-- supabase/migrations/20261001220000_churn_por_pessoa_que_saiu_da_escola.sql
--
-- Churn passa a contar a PESSOA que saiu da escola no mes (decisao do Hugo, 01/10/2026, a
-- partir da conferencia da Fernanda/Recreio e do Arthur/Barra de set/2026):
--   * quem encerra um curso e segue matriculado em outro NAO conta (antes isso dependia da
--     flag is_segundo_curso estar na matricula certa, ou de a equipe marcar tipo_evasao a mao:
--     Ana Luiza Marques Paiva/CG saiu do 1o curso e segue em Canto, e contava);
--   * quem sai de 2 cursos no mesmo mes conta UMA vez (Julia Silva Vilardo/Barra nao renovou
--     Canto e Violao e contava 2).
-- O MRR perdido NAO muda de regra: e todo o dinheiro que deixou de entrar, inclusive o curso
-- que a pessoa encerrou seguindo em outro (playbook: "2o curso entra no faturamento, e
-- dinheiro real"). Antes, marcar a saida como 2o curso tirava a parcela do MRR perdido.
-- Renovacoes previstas/taxa passam a excluir bolsista (regra de 27/08: bolsista e banda nao
-- contam em nada; a p21 so tirava banda).
--
-- Pecas:
--   1. classificar_saidas_churn_v1(unidade, ano, mes): FONTE UNICA da classificacao de cada
--      evasao/nao-renovacao do mes: conta | segue_na_escola | mesma_pessoa | banda | bolsista
--      | transferencia.
--   2. montar_relatorio_admin_mensal_payload_v1: grava classificacao_churn em cada item de
--      evasoes/nao_renovacoes e resumo.churn_saidas_pessoas (congelado no snapshot).
--   3. get_relatorio_admin_mensal_rico_base_v1: churn = churn_saidas_pessoas / pagantes quando
--      o snapshot traz o campo; snapshot antigo segue a formula antiga (nada retroage).
--   4. gerencial p17: churn_rate pela mesma classificacao; MRR perdido volta a incluir 2o curso.
--   5. gerencial p21: renovacoes sem bolsista (movimentacao_conta_nos_kpis_v1).
-- A edge relatorio-admin-whatsapp le classificacao_churn (deploy junto).

create or replace function public.classificar_saidas_churn_v1(p_unidade_id uuid, p_ano integer, p_mes integer)
returns table (movimentacao_id bigint, tipo text, chave_pessoa text, classificacao text, valor_perdido numeric)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  with params as (
    select make_date(p_ano, p_mes, 1) as inicio,
           (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date as fim
  ),
  base as (
    select
      m.id::bigint as movimentacao_id,
      m.tipo::text as tipo,
      m.data,
      m.aluno_id,
      m.unidade_id,
      coalesce(
        m.unidade_id::text || '|' || v.pessoa_chave,
        'nome:' || m.unidade_id::text || '|' || lower(trim(coalesce(m.aluno_nome, '')))
      ) as chave_pessoa,
      v.pessoa_chave,
      coalesce(m.valor_parcela_evasao, m.valor_parcela_anterior, m.valor_parcela_novo, a.valor_parcela, 0)::numeric as valor_perdido,
      case
        when coalesce(a.tipo_matricula_id, 0) = 5
          or public.is_atividade_extra_curso(coalesce(m.curso_id, a.curso_id)) then 'banda'
        when coalesce(a.tipo_matricula_id, 0) in (3, 4) then 'bolsista'
        when lower(unaccent(coalesce(m.tipo_evasao, ''))) like '%transfer%'
          or lower(unaccent(coalesce(m.motivo, ''))) like '%transfer%' then 'transferencia'
      end as fora_por_regra
    from public.movimentacoes_admin m
    left join public.alunos a on a.id = m.aluno_id
    left join public.vw_aluno_pessoa_chave v on v.aluno_id = m.aluno_id
    cross join params p
    where m.unidade_id = p_unidade_id
      and m.tipo in ('evasao', 'nao_renovacao')
      and m.data between p.inicio and p.fim
  ),
  com_vinculo as (
    select b.*,
      -- segue na escola = outra matricula REGULAR da mesma pessoa viva no ultimo dia do mes.
      -- Data manda; status so vale quando a data de saida esta vazia.
      exists (
        select 1
        from public.alunos o
        join public.vw_aluno_pessoa_chave ov on ov.aluno_id = o.id
        cross join params p
        where b.pessoa_chave is not null
          and ov.pessoa_chave = b.pessoa_chave
          and o.unidade_id = b.unidade_id
          and o.id <> coalesce(b.aluno_id, -1)
          and o.data_matricula <= p.fim
          and not public.is_atividade_extra_curso(o.curso_id)
          and coalesce(o.tipo_matricula_id, 0) <> 5
          and (o.data_saida > p.fim or (o.data_saida is null and o.status in ('ativo', 'trancado')))
      ) as segue_na_escola
    from base b
  ),
  ordenado as (
    select c.*,
      row_number() over (
        partition by c.chave_pessoa, (c.fora_por_regra is null and not c.segue_na_escola)
        order by c.data, c.movimentacao_id
      ) as ordem_pessoa
    from com_vinculo c
  )
  select
    o.movimentacao_id,
    o.tipo,
    o.chave_pessoa,
    case
      when o.fora_por_regra is not null then o.fora_por_regra
      when o.segue_na_escola then 'segue_na_escola'
      when o.ordem_pessoa > 1 then 'mesma_pessoa'
      else 'conta'
    end as classificacao,
    o.valor_perdido
  from ordenado o;
$function$;

revoke all on function public.classificar_saidas_churn_v1(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.classificar_saidas_churn_v1(uuid, integer, integer) to service_role;

comment on function public.classificar_saidas_churn_v1(uuid, integer, integer) is
  'Fonte unica: classifica cada evasao/nao-renovacao do mes para o churn por PESSOA que saiu da escola (conta | segue_na_escola | mesma_pessoa | banda | bolsista | transferencia). Churn = conta / pagantes. MRR perdido nao usa esta regra: soma tudo exceto banda/bolsista. Migration 20261001220000.';

-- (2) montador do payload mensal: congela a classificacao no snapshot
create or replace function public.montar_relatorio_admin_mensal_payload_v1(p_unidade_id uuid, p_ano integer, p_mes integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_payload jsonb;
  v_renovacoes jsonb;
  v_esperadas integer;
  v_evasoes jsonb;
  v_nao_renov jsonb;
  v_sem_classe integer;
  v_conta integer;
  v_mapa jsonb;
begin
  v_payload := public.montar_relatorio_admin_mensal_payload_base_v4(
    p_unidade_id,
    p_ano,
    p_mes
  );

  v_renovacoes := public.filtrar_renovacoes_admin_retencao_validas_v1(
    coalesce(v_payload->'renovacoes', '[]'::jsonb)
  );
  v_esperadas := nullif(v_payload#>>'{resumo,renovacoes_realizadas}', '')::integer;

  if v_esperadas is null or v_esperadas <> jsonb_array_length(v_renovacoes) then
    raise exception 'RENOVACOES_MENSAL_DIVERGENTE';
  end if;

  v_payload := jsonb_set(v_payload, '{renovacoes}', v_renovacoes, true);

  -- churn por pessoa (20261001220000): cada saida da lista recebe a classificacao da fonte unica
  select coalesce(jsonb_object_agg(c.movimentacao_id::text, c.classificacao), '{}'::jsonb)
    into v_mapa
  from public.classificar_saidas_churn_v1(p_unidade_id, p_ano, p_mes) c;

  select coalesce(jsonb_agg(case when k.classificacao is null then e.item
                                 else e.item || jsonb_build_object('classificacao_churn', k.classificacao) end
                            order by e.ord), '[]'::jsonb),
         count(*) filter (where k.classificacao is null)
    into v_evasoes, v_sem_classe
  from jsonb_array_elements(coalesce(v_payload->'evasoes', '[]'::jsonb)) with ordinality e(item, ord)
  left join lateral (select v_mapa->>(e.item->>'id') as classificacao) k on true;

  select coalesce(jsonb_agg(case when k.classificacao is null then e.item
                                 else e.item || jsonb_build_object('classificacao_churn', k.classificacao) end
                            order by e.ord), '[]'::jsonb),
         v_sem_classe + count(*) filter (where k.classificacao is null)
    into v_nao_renov, v_sem_classe
  from jsonb_array_elements(coalesce(v_payload->'nao_renovacoes', '[]'::jsonb)) with ordinality e(item, ord)
  left join lateral (select v_mapa->>(e.item->>'id') as classificacao) k on true;

  -- So publica a regra nova quando TODO item foi classificado: lista meio classificada faria a
  -- edge contar um numero e o churn outro (RELATORIO_ADMIN_MENSAL_DIVERGENTE:churn_pagantes).
  if v_sem_classe = 0 then
    select count(*) filter (where (x->>'classificacao_churn') = 'conta')::integer into v_conta
    from (select jsonb_array_elements(v_evasoes) x union all select jsonb_array_elements(v_nao_renov)) s;
    v_payload := jsonb_set(v_payload, '{evasoes}', v_evasoes, true);
    v_payload := jsonb_set(v_payload, '{nao_renovacoes}', v_nao_renov, true);
    v_payload := jsonb_set(v_payload, '{resumo,churn_saidas_pessoas}', to_jsonb(v_conta), true);
  else
    raise notice 'churn por pessoa: % saida(s) sem classificacao em %/% unidade %; mantida a regra antiga',
      v_sem_classe, p_mes, p_ano, p_unidade_id;
  end if;

  return v_payload;
end;
$function$;

-- (3) rico: churn pela pessoa quando o snapshot congelou a classificacao
do $$
declare
  d text;
  n int;
  v_ancora text;
begin
  d := pg_get_functiondef('public.get_relatorio_admin_mensal_rico_base_v1(uuid,integer,integer)'::regprocedure);
  v_ancora := '(v_evasoes_base + v_nao_renovacoes)::numeric / v_alunos_pagantes * 100,';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'rico: ancora do churn esperava 1 ocorrencia, achou %', n; end if;
  d := replace(d, v_ancora,
    'coalesce(nullif(v_resumo->>''churn_saidas_pessoas'', '''')::integer, v_evasoes_base + v_nao_renovacoes)::numeric / v_alunos_pagantes * 100,');
  execute d;
end $$;

-- (4) gerencial p17: churn pela classificacao unica; MRR perdido volta a somar o curso encerrado
do $$
declare
  d text;
  n int;
  v_ancora text;
begin
  d := pg_get_functiondef('public.get_dados_relatorio_gerencial_legacy_p17_20260707(uuid,integer,integer)'::regprocedure);

  v_ancora := 'OR tipo_evasao_calc IN (''interrompido'', ''transferencia'', ''interrompido_bolsista'')';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'p17: ancora do dedup esperava 1, achou %', n; end if;
  d := replace(d, v_ancora, 'OR tipo_evasao_calc IN (''interrompido'', ''transferencia'', ''interrompido_bolsista'', ''interrompido_2_curso'')');

  v_ancora := 'OR (tipo = ''evasao'' AND tipo_evasao_calc IN (''interrompido'', ''transferencia''))';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'p17: ancora do mrr esperava 1, achou %', n; end if;
  d := replace(d, v_ancora, 'OR (tipo = ''evasao'' AND tipo_evasao_calc IN (''interrompido'', ''transferencia'', ''interrompido_2_curso''))');

  v_ancora := 'round((greatest(r.evasoes_base_alunos + r.nao_renovacoes - r.transferencias, 0)::numeric / nullif(dm.alunos_pagantes, 0)) * 100, 2)';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'p17: ancora do churn esperava 1, achou %', n; end if;
  d := replace(d, v_ancora,
    'round(((select count(*) from public.classificar_saidas_churn_v1(r.unidade_id, p_ano, p_mes) cc where cc.classificacao = ''conta'')::numeric / nullif(dm.alunos_pagantes, 0)) * 100, 2)');

  v_ancora := 'greatest(r.evasoes_base_alunos + r.nao_renovacoes - r.transferencias, 0)::integer AS total_evasoes_churn';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'p17: ancora do total_evasoes_churn esperava 1, achou %', n; end if;
  d := replace(d, v_ancora,
    '(select count(*) from public.classificar_saidas_churn_v1(r.unidade_id, p_ano, p_mes) cc where cc.classificacao = ''conta'')::integer AS total_evasoes_churn');
  execute d;
end $$;

-- (5) gerencial p21: renovacoes sem bolsista e sem atividade extra (predicado canonico)
do $$
declare
  d text;
  n int;
  v_ancora text;
begin
  d := pg_get_functiondef('public.get_dados_relatorio_gerencial_legacy_p21_20260707(uuid,integer,integer)'::regprocedure);

  v_ancora := '      COALESCE(c.is_projeto_banda, false) AS is_projeto_banda,';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'p21: ancora da coluna esperava 1, achou %', n; end if;
  d := replace(d, v_ancora,
    '      public.movimentacao_conta_nos_kpis_v1(coalesce(m.curso_id, a.curso_id), a.tipo_matricula_id) AS conta_nos_kpis,' || chr(10) || v_ancora);

  v_ancora := '    LEFT JOIN public.cursos c ON c.id = m.curso_id' || chr(10) || '  ),';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'p21: ancora do join esperava 1, achou %', n; end if;
  d := replace(d, v_ancora,
    '    LEFT JOIN public.cursos c ON c.id = m.curso_id' || chr(10) || '    LEFT JOIN public.alunos a ON a.id = m.aluno_id' || chr(10) || '  ),');

  v_ancora := '    FROM mov_base' || chr(10) || '    WHERE NOT (';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'p21: ancora do filtro esperava 1, achou %', n; end if;
  d := replace(d, v_ancora, '    FROM mov_base' || chr(10) || '    WHERE conta_nos_kpis AND NOT (');
  execute d;
end $$;
