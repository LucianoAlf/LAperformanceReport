-- A leitura financeira consolidada pode trazer milhares de faturas. O
-- enriquecimento anterior executava a funcao por item, o que transformava uma
-- leitura em milhares de buscas de identidade, foto e forma de pagamento.
-- Esta versao preserva a mesma precedencia e o mesmo payload, mas resolve o
-- conjunto em uma unica consulta set-based.

create or replace function public.financeiro_enriquecer_faturas_itens_v1(p_items jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with entradas as materialized (
    select
      value as item,
      ord,
      nullif(value->>'unidade_id', '')::uuid as unidade_id,
      nullif(value->>'emusys_fatura_id', '')::bigint as fatura_id,
      nullif(value->>'emusys_matricula_id', '')::bigint as matricula_id,
      nullif(value->>'emusys_student_id', '')::bigint as student_id,
      case
        when nullif(btrim(value #>> '{aluno,id}'), '') ~ '^[0-9]+$'
          then (value #>> '{aluno,id}')::integer
        else null
      end as aluno_id,
      nullif(btrim(value #>> '{aluno,nome}'), '') as nome_inicial,
      nullif(btrim(value #>> '{forma_pagamento,nome}'), '') as forma_nome,
      coalesce(nullif(value #>> '{forma_pagamento,fonte}', ''), 'ausente') as forma_fonte,
      coalesce(nullif(value #>> '{forma_pagamento,rotulo}', ''), 'Forma nao informada') as forma_rotulo
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as linhas(value, ord)
  ),
  com_nome as materialized (
    select
      entradas.*,
      (
        nome_inicial is null
        or nome_inicial in (
          'Aluno nao vinculado',
          'Historico de ex-aluno',
          'Lancamento financeiro sem aluno'
        )
      ) as precisa_nome
    from entradas
  ),
  estado_candidatos as materialized (
    select
      i.ord,
      nullif(btrim(e.payload_snapshot #>> '{aluno,nome}'), '') as nome_estado,
      coalesce(
        nullif(btrim(e.payload_snapshot #>> '{contrato_atual,forma_pagamento}'), ''),
        nullif(btrim(e.payload_snapshot #>> '{cobranca_automatica,forma_pagamento}'), ''),
        nullif(btrim(e.payload_snapshot #>> '{forma_pagamento}'), '')
      ) as forma_estado,
      e.updated_at
    from com_nome i
    join public.emusys_matriculas_estado_atual e
      on e.unidade_id = i.unidade_id
     and e.emusys_matricula_id = i.matricula_id
     and (i.student_id is null or e.emusys_aluno_id = i.student_id)
    where i.matricula_id is not null

    union all

    select
      i.ord,
      nullif(btrim(e.payload_snapshot #>> '{aluno,nome}'), '') as nome_estado,
      coalesce(
        nullif(btrim(e.payload_snapshot #>> '{contrato_atual,forma_pagamento}'), ''),
        nullif(btrim(e.payload_snapshot #>> '{cobranca_automatica,forma_pagamento}'), ''),
        nullif(btrim(e.payload_snapshot #>> '{forma_pagamento}'), '')
      ) as forma_estado,
      e.updated_at
    from com_nome i
    join public.emusys_matriculas_estado_atual e
      on e.unidade_id = i.unidade_id
     and e.emusys_aluno_id = i.student_id
    where i.matricula_id is null
      and i.student_id is not null
  ),
  estado as materialized (
    select ord, nome_estado, forma_estado
    from (
      select
        estado_candidatos.*,
        row_number() over (
          partition by ord
          order by updated_at desc nulls last
        ) as rn
      from estado_candidatos
    ) escolhidos
    where rn = 1
  ),
  ativo_nome_candidatos as materialized (
    select i.ord, a.nome, 0 as prioridade, a.id
    from com_nome i
    join public.alunos a
      on a.unidade_id = i.unidade_id
     and a.arquivado_em is null
     and a.emusys_matricula_id = i.matricula_id::text
    where i.precisa_nome
      and i.matricula_id is not null

    union all

    select i.ord, a.nome, 1 as prioridade, a.id
    from com_nome i
    join public.alunos a
      on a.unidade_id = i.unidade_id
     and a.arquivado_em is null
     and a.emusys_student_id = i.student_id::text
    where i.precisa_nome
      and i.student_id is not null
  ),
  ativo_nome as materialized (
    select ord, nome
    from (
      select
        ativo_nome_candidatos.*,
        row_number() over (partition by ord order by prioridade, id) as rn
      from ativo_nome_candidatos
    ) escolhidos
    where rn = 1
  ),
  apos_ativo as materialized (
    select
      i.*,
      case when i.precisa_nome then an.nome else i.nome_inicial end as nome_apos_ativo
    from com_nome i
    left join ativo_nome an on an.ord = i.ord
  ),
  com_arquivado_nome as materialized (
    select
      apos_ativo.*,
      (
        nome_apos_ativo is null
        or nome_apos_ativo in (
          'Aluno nao vinculado',
          'Historico de ex-aluno',
          'Lancamento financeiro sem aluno'
        )
      ) as precisa_arquivado
    from apos_ativo
  ),
  arquivado_nome_candidatos as materialized (
    select i.ord, a.nome, 0 as prioridade, a.id
    from com_arquivado_nome i
    join public.alunos_arquivados a
      on a.unidade_id = i.unidade_id
     and a.emusys_matricula_id = i.matricula_id::text
    where i.precisa_arquivado
      and i.matricula_id is not null

    union all

    select i.ord, a.nome, 1 as prioridade, a.id
    from com_arquivado_nome i
    join public.alunos_arquivados a
      on a.unidade_id = i.unidade_id
     and a.emusys_student_id = i.student_id::text
    where i.precisa_arquivado
      and i.student_id is not null
  ),
  arquivado_nome as materialized (
    select ord, nome
    from (
      select
        arquivado_nome_candidatos.*,
        row_number() over (partition by ord order by prioridade, id) as rn
      from arquivado_nome_candidatos
    ) escolhidos
    where rn = 1
  ),
  apos_arquivado as materialized (
    select
      i.*,
      case when i.precisa_arquivado then an.nome else i.nome_apos_ativo end as nome_apos_arquivado
    from com_arquivado_nome i
    left join arquivado_nome an on an.ord = i.ord
  ),
  ativo_foto_candidatos as materialized (
    select i.ord, a.foto_url, a.photo_url, 0 as prioridade, a.id
    from entradas i
    join public.alunos a
      on a.unidade_id = i.unidade_id
     and a.arquivado_em is null
     and a.id = i.aluno_id
    where i.aluno_id is not null

    union all

    select i.ord, a.foto_url, a.photo_url, 1 as prioridade, a.id
    from entradas i
    join public.alunos a
      on a.unidade_id = i.unidade_id
     and a.arquivado_em is null
     and a.emusys_matricula_id = i.matricula_id::text
     and a.emusys_student_id = i.student_id::text
    where i.matricula_id is not null
      and i.student_id is not null
  ),
  ativo_foto as materialized (
    select ord, foto_url, photo_url
    from (
      select
        ativo_foto_candidatos.*,
        row_number() over (partition by ord order by prioridade, id) as rn
      from ativo_foto_candidatos
    ) escolhidos
    where rn = 1
  ),
  arquivado_foto_candidatos as materialized (
    select i.ord, a.foto_url, a.photo_url, 0 as prioridade, a.id
    from entradas i
    left join ativo_foto af on af.ord = i.ord
    join public.alunos_arquivados a
      on a.unidade_id = i.unidade_id
     and a.id = i.aluno_id
    where i.aluno_id is not null
      and af.foto_url is null
      and af.photo_url is null

    union all

    select i.ord, a.foto_url, a.photo_url, 1 as prioridade, a.id
    from entradas i
    left join ativo_foto af on af.ord = i.ord
    join public.alunos_arquivados a
      on a.unidade_id = i.unidade_id
     and a.emusys_matricula_id = i.matricula_id::text
     and a.emusys_student_id = i.student_id::text
    where i.matricula_id is not null
      and i.student_id is not null
      and af.foto_url is null
      and af.photo_url is null
  ),
  arquivado_foto as materialized (
    select ord, foto_url, photo_url
    from (
      select
        arquivado_foto_candidatos.*,
        row_number() over (partition by ord order by prioridade, id) as rn
      from arquivado_foto_candidatos
    ) escolhidos
    where rn = 1
  ),
  manual_forma_candidatos as materialized (
    select i.ord, fp.nome, d.decidido_em, d.id
    from entradas i
    join public.financeiro_fatura_reconciliacao_decisoes d
      on d.unidade_id = i.unidade_id
     and d.emusys_fatura_id = i.fatura_id
     and d.tipo_decisao = 'forma_pagamento_manual'
     and d.forma_pagamento_id is not null
    join public.formas_pagamento fp on fp.id = d.forma_pagamento_id
  ),
  manual_forma as materialized (
    select ord, nome
    from (
      select
        manual_forma_candidatos.*,
        row_number() over (
          partition by ord
          order by decidido_em desc, id desc
        ) as rn
      from manual_forma_candidatos
    ) escolhidos
    where rn = 1
  )
  select coalesce(
    jsonb_agg(
      i.item || jsonb_build_object(
        'aluno',
        coalesce(i.item->'aluno', '{}'::jsonb)
          || jsonb_build_object(
            'nome',
            coalesce(
              case
                when aa.nome_apos_arquivado is null
                  or aa.nome_apos_arquivado in (
                    'Aluno nao vinculado',
                    'Historico de ex-aluno',
                    'Lancamento financeiro sem aluno'
                  )
                  then e.nome_estado
                else aa.nome_apos_arquivado
              end,
              i.item #>> '{aluno,nome}',
              'Aluno nao vinculado'
            ),
            'foto_url',
            case
              when af.foto_url is null and af.photo_url is null then arf.foto_url
              else af.foto_url
            end,
            'photo_url',
            case
              when af.foto_url is null and af.photo_url is null then arf.photo_url
              else af.photo_url
            end
          ),
        'forma_pagamento',
        coalesce(i.item->'forma_pagamento', '{}'::jsonb)
          || jsonb_build_object(
            'nome',
            case
              when mf.nome is not null then mf.nome
              when i.forma_nome is null and e.forma_estado is not null then e.forma_estado
              else i.forma_nome
            end,
            'fonte',
            case
              when mf.nome is not null then 'manual'
              when i.forma_nome is null and e.forma_estado is not null then 'emusys_matricula'
              else i.forma_fonte
            end,
            'rotulo',
            case
              when mf.nome is not null then 'Forma informada'
              when i.forma_nome is null and e.forma_estado is not null then 'Forma prevista'
              else i.forma_rotulo
            end
          )
      )
      order by i.ord
    ),
    '[]'::jsonb
  )
  from entradas i
  join apos_arquivado aa on aa.ord = i.ord
  left join estado e on e.ord = i.ord
  left join ativo_foto af on af.ord = i.ord
  left join arquivado_foto arf on arf.ord = i.ord
  left join manual_forma mf on mf.ord = i.ord;
$function$;

revoke all on function public.financeiro_enriquecer_faturas_itens_v1(jsonb)
  from public, anon, authenticated;

create or replace function public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_mes integer default extract(month from (now() at time zone 'America/Sao_Paulo'))::integer,
  p_modo_periodo text default 'janela_3',
  p_status text default 'todas',
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
  v_item jsonb;
  v_enriched jsonb;
  v_motivos jsonb;
  v_filtrados jsonb;
  v_reconciliacao jsonb;
  v_main_items jsonb := '[]'::jsonb;
  v_reconciliation_items jsonb := '[]'::jsonb;
  v_unidade_id uuid;
  v_fatura_id bigint;
  v_decisoes text[];
  v_categoria text;
  v_fora_historico integer := 0;
  v_fora_avulso integer := 0;
  v_resolvidas integer := 0;
  v_source_missing integer := 0;
  v_identidade integer := 0;
  v_status integer := 0;
  v_validacoes integer := 0;
  v_forma integer := 0;
  v_contato integer := 0;
  v_total integer := 0;
  v_motivo text;
begin
  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_20260817(
    p_unidade_id, p_ano, p_mes, p_modo_periodo, p_status, p_as_of_date
  );

  v_main_items := public.financeiro_enriquecer_faturas_itens_v1(
    coalesce(v_payload->'items', '[]'::jsonb)
  );
  v_payload := jsonb_set(v_payload, '{items}', v_main_items, true);

  for v_item in
    select value
    from jsonb_array_elements(
      public.financeiro_enriquecer_faturas_itens_v1(
        coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb)
      )
    ) as rows(value)
  loop
    v_enriched := v_item;
    v_unidade_id := nullif(v_enriched->>'unidade_id', '')::uuid;
    v_fatura_id := nullif(v_enriched->>'emusys_fatura_id', '')::bigint;
    v_motivos := coalesce(v_enriched->'motivos', '[]'::jsonb);

    -- Se a forma foi encontrada no enriquecimento (Emusys atual ou decisão
    -- manual), não manter a pendência antiga originada no snapshot.
    if nullif(btrim(v_enriched #>> '{forma_pagamento,nome}'), '') is not null then
      select coalesce(jsonb_agg(motivo), '[]'::jsonb)
        into v_motivos
      from jsonb_array_elements_text(v_motivos) as motivos(motivo)
      where motivo <> 'forma_pagamento_ausente';
      v_enriched := jsonb_set(v_enriched, '{motivos}', v_motivos, true);
    end if;

    v_categoria := case
      when lower(coalesce(v_enriched #>> '{aluno,estado_operacional}', '')) in ('evadido', 'inativo', 'trancado', 'trancada')
        or v_motivos ? 'historico_ex_aluno' then 'historico_ex_aluno'
      when v_motivos ? 'registro_nao_aluno'
        or (
          v_enriched->>'emusys_matricula_id' is null
          and (
            coalesce(nullif(btrim(v_enriched->>'emusys_student_id'), ''), '1') in ('0', '1')
            or lower(coalesce(v_enriched->>'descricao', '')) like '%passaporte%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%estoque%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%caderno%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%clips%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%coach%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%palheta%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%rateio entre unidades%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%ingresso%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%locacao%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%locaÃƒÂ§ÃƒÂ£o%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%bora gravar%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%emprestimo%'
            or lower(coalesce(v_enriched->>'descricao', '')) like '%emprÃƒÂ©stimo%'
          )
        ) then 'registro_nao_aluno'
      else null
    end;

    if v_categoria = 'historico_ex_aluno' then
      v_fora_historico := v_fora_historico + 1;
      continue;
    elsif v_categoria = 'registro_nao_aluno' then
      v_fora_avulso := v_fora_avulso + 1;
      continue;
    end if;

    select coalesce(array_agg(distinct d.tipo_decisao), '{}'::text[])
      into v_decisoes
    from public.financeiro_fatura_reconciliacao_decisoes d
    where d.unidade_id = v_unidade_id
      and d.emusys_fatura_id = v_fatura_id;

    select coalesce(jsonb_agg(motivo), '[]'::jsonb)
      into v_filtrados
    from jsonb_array_elements_text(v_motivos) as motivos(motivo)
    where not (
      (motivo = 'source_missing' and (
        'pagamento_confirmado' = any(v_decisoes)
        or 'renovacao' = any(v_decisoes)
        or 'trancamento' = any(v_decisoes)
        or 'ultima_parcela_aviso_previo' = any(v_decisoes)
        or 'conferido_sem_cobranca' = any(v_decisoes)
        or 'parcela_remarcada' = any(v_decisoes)
        or 'outro' = any(v_decisoes)
      ))
      or (motivo = 'forma_pagamento_ausente' and 'forma_pagamento_manual' = any(v_decisoes))
      or ('conferido_sem_cobranca' = any(v_decisoes))
    );

    if jsonb_array_length(v_filtrados) = 0 then
      if cardinality(v_decisoes) > 0 then v_resolvidas := v_resolvidas + 1; end if;
      continue;
    end if;

    v_enriched := jsonb_set(v_enriched, '{motivos}', v_filtrados, true);
    v_reconciliation_items := v_reconciliation_items || jsonb_build_array(v_enriched);
    v_total := v_total + 1;

    for v_motivo in select value from jsonb_array_elements_text(v_filtrados) as motivos(value) loop
      if v_motivo = 'source_missing' then v_source_missing := v_source_missing + 1;
      elsif v_motivo = 'identidade_invalida' then v_identidade := v_identidade + 1;
      elsif v_motivo = 'status_desconhecido' then v_status := v_status + 1;
      elsif v_motivo = 'validacao_origem' then v_validacoes := v_validacoes + 1;
      elsif v_motivo = 'forma_pagamento_ausente' then v_forma := v_forma + 1;
      elsif v_motivo = 'contato_pendente' then v_contato := v_contato + 1;
      end if;
    end loop;
  end loop;

  v_reconciliacao := jsonb_build_object(
    'source_missing', v_source_missing,
    'identidade_invalida', v_identidade,
    'status_desconhecido', v_status,
    'validacoes_origem', v_validacoes,
    'forma_pagamento_ausente', v_forma,
    'contato_pendente', v_contato,
    'total', v_total,
    'resolvidas_manualmente', v_resolvidas,
    'fora_operacao', jsonb_build_object(
      'historico_ex_aluno', v_fora_historico,
      'registro_nao_aluno', v_fora_avulso,
      'total', v_fora_historico + v_fora_avulso
    ),
    'items', v_reconciliation_items
  );

  v_payload := jsonb_set(v_payload, '{reconciliation}', v_reconciliacao, true);
  v_payload := jsonb_set(
    v_payload,
    '{status}',
    to_jsonb(case
      when coalesce((v_payload #>> '{freshness,competencias_stale}')::integer, 0) > 0 then 'stale'
      when v_total > 0 then 'partial'
      else 'ok'
    end),
    true
  );
  return v_payload;
end;
$function$;
