-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- A leitura financeira mistura faturas de alunos com lancamentos genericos da
-- origem (ingressos, locacao, rateio, estoque e passaportes estornados).
-- Eles nao podem ser classificados como identidade quebrada de aluno.
-- Tambem mantemos faturas de matriculas evadidas no historico, mas fora da
-- contagem de vinculo operacional pendente.

alter function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) rename to get_faturas_alunos_financeiro_v1_contrato_20260817;

create function public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_mes integer default extract(month from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_modo_periodo text default 'janela_3',
  p_status text default 'todas',
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
  v_items jsonb;
  v_identidade_invalida integer;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_20260817(
    p_unidade_id,
    p_ano,
    p_mes,
    p_modo_periodo,
    p_status,
    p_as_of_date
  );

  if jsonb_typeof(v_payload #> '{totais,canceladas}') <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'contrato financeiro invalido: total de canceladas ausente';
  end if;

  -- A funcao anterior ja declara o campo; o set torna o contrato idempotente
  -- caso uma base legada ainda retorne apenas a quantidade.
  v_payload := jsonb_set(
    v_payload,
    '{totais,canceladas,valor}',
    to_jsonb(coalesce((v_payload #>> '{totais,canceladas,valor}')::numeric, 0::numeric)),
    true
  );

  v_items := coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb);

  select coalesce(jsonb_agg(
    case
      when classificacao.categoria is null then item_data.item
      else item_data.item
        || jsonb_build_object(
          'motivos', (
            select coalesce(jsonb_agg(motivo.motivo order by motivo.ordem), '[]'::jsonb)
              || jsonb_build_array(classificacao.categoria)
            from jsonb_array_elements_text(coalesce(item_data.item->'motivos', '[]'::jsonb))
              with ordinality as motivo(motivo, ordem)
            where motivo.motivo <> 'identidade_invalida'
          ),
          'aluno', coalesce(item_data.item->'aluno', '{}'::jsonb)
            || jsonb_build_object(
              'nome', case
                when classificacao.categoria = 'historico_ex_aluno'
                  and coalesce(item_data.item #>> '{aluno,nome}', '') = 'Aluno nao vinculado'
                  then 'Historico de ex-aluno'
                when classificacao.categoria = 'registro_nao_aluno'
                  and coalesce(item_data.item #>> '{aluno,nome}', '') = 'Aluno nao vinculado'
                  then 'Lancamento financeiro sem aluno'
                else item_data.item #>> '{aluno,nome}'
              end
            )
        )
    end
    order by item_data.ordem
  ), '[]'::jsonb)
  into v_items
  from jsonb_array_elements(v_items) with ordinality as item_data(item, ordem)
  cross join lateral (
    select case
      when lower(coalesce(item_data.item #>> '{aluno,estado_operacional}', '')) = 'evadido'
        then 'historico_ex_aluno'
      when item_data.item->>'emusys_matricula_id' is null
       and (
         coalesce(nullif(btrim(item_data.item->>'emusys_student_id'), ''), '1') in ('0', '1')
         or lower(coalesce(item_data.item->>'descricao', '')) like '%ingresso%'
         or lower(coalesce(item_data.item->>'descricao', '')) like '%locaÃ§Ã£o%'
         or lower(coalesce(item_data.item->>'descricao', '')) like '%locacao%'
         or lower(coalesce(item_data.item->>'descricao', '')) like '%bora gravar%'
         or lower(coalesce(item_data.item->>'descricao', '')) like '%emprÃ©stimo%'
         or lower(coalesce(item_data.item->>'descricao', '')) like '%emprestimo%'
         or lower(coalesce(item_data.item->>'descricao', '')) like '%rateio entre unidades%'
         or lower(coalesce(item_data.item->>'descricao', '')) like '%venda no controle de estoque%'
         or lower(coalesce(item_data.item->>'descricao', '')) like '%passaporte%estornado%'
       )
        then 'registro_nao_aluno'
      else null
    end as categoria
  ) as classificacao;

  v_payload := jsonb_set(
    v_payload,
    '{reconciliation,items}',
    v_items,
    true
  );

  select count(*)::integer
    into v_identidade_invalida
  from jsonb_array_elements(v_items) as item_data(item)
  where coalesce(item_data.item->'motivos', '[]'::jsonb) ? 'identidade_invalida';

  return jsonb_set(
    v_payload,
    '{reconciliation,identidade_invalida}',
    to_jsonb(v_identidade_invalida),
    true
  );
end;
$function$;

comment on function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) is
  'Leitura canonica de faturas com reconciliacao que separa aluno, ex-aluno historico e lancamento financeiro sem aluno.';

revoke all on function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) from public, anon;

grant execute on function public.get_faturas_alunos_financeiro_v1(
  uuid,
  integer,
  integer,
  text,
  text,
  date
) to authenticated, service_role;
