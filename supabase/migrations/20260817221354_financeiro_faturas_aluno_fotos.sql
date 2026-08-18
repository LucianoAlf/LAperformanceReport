-- Exibe na pagina de Faturas o mesmo avatar canonico usado em Alunos.
--
-- A leitura financeira continua vindo do snapshot/contrato canonico. Este
-- enriquecimento apenas anexa a foto do aluno local, cruzando por unidade e
-- IDs, nunca por nome. A funcao publica de leitura ja chama
-- financeiro_enriquecer_fatura_item para os itens principais e para a fila de
-- reconciliacao.

create or replace function public.financeiro_enriquecer_fatura_item(p_item jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_unidade_id uuid := nullif(p_item->>'unidade_id', '')::uuid;
  v_fatura_id bigint := nullif(p_item->>'emusys_fatura_id', '')::bigint;
  v_matricula_id bigint := nullif(p_item->>'emusys_matricula_id', '')::bigint;
  v_student_id bigint := nullif(p_item->>'emusys_student_id', '')::bigint;
  v_aluno_id integer := case
    when nullif(btrim(p_item #>> '{aluno,id}'), '') ~ '^[0-9]+$'
      then (p_item #>> '{aluno,id}')::integer
    else null
  end;
  v_nome text := nullif(btrim(p_item #>> '{aluno,nome}'), '');
  v_nome_estado text;
  v_forma_estado text;
  v_forma_manual text;
  v_foto_url text;
  v_photo_url text;
  v_forma_nome text := nullif(btrim(p_item #>> '{forma_pagamento,nome}'), '');
  v_forma_fonte text := coalesce(nullif(p_item #>> '{forma_pagamento,fonte}', ''), 'ausente');
  v_forma_rotulo text := coalesce(nullif(p_item #>> '{forma_pagamento,rotulo}', ''), 'Forma nao informada');
begin
  select
    nullif(btrim(e.payload_snapshot #>> '{aluno,nome}'), ''),
    coalesce(
      nullif(btrim(e.payload_snapshot #>> '{contrato_atual,forma_pagamento}'), ''),
      nullif(btrim(e.payload_snapshot #>> '{cobranca_automatica,forma_pagamento}'), ''),
      nullif(btrim(e.payload_snapshot #>> '{forma_pagamento}'), '')
    )
    into v_nome_estado, v_forma_estado
  from public.emusys_matriculas_estado_atual e
  where e.unidade_id = v_unidade_id
    and (v_matricula_id is not null or v_student_id is not null)
    and (v_matricula_id is null or e.emusys_matricula_id = v_matricula_id)
    and (v_student_id is null or e.emusys_aluno_id = v_student_id)
  order by e.updated_at desc nulls last
  limit 1;

  if v_nome is null or v_nome in ('Aluno nao vinculado', 'Historico de ex-aluno', 'Lancamento financeiro sem aluno') then
    select a.nome
      into v_nome
    from public.alunos a
    where a.unidade_id = v_unidade_id
      and a.arquivado_em is null
      and (
        (v_matricula_id is not null and a.emusys_matricula_id = v_matricula_id::text)
        or (v_student_id is not null and a.emusys_student_id = v_student_id::text)
      )
    order by case when v_matricula_id is not null and a.emusys_matricula_id = v_matricula_id::text then 0 else 1 end, a.id
    limit 1;
  end if;

  if v_nome is null or v_nome in ('Aluno nao vinculado', 'Historico de ex-aluno', 'Lancamento financeiro sem aluno') then
    select a.nome
      into v_nome
    from public.alunos_arquivados a
    where a.unidade_id = v_unidade_id
      and (
        (v_matricula_id is not null and a.emusys_matricula_id = v_matricula_id::text)
        or (v_student_id is not null and a.emusys_student_id = v_student_id::text)
      )
    order by case when v_matricula_id is not null and a.emusys_matricula_id = v_matricula_id::text then 0 else 1 end, a.id
    limit 1;
  end if;

  if v_nome is null or v_nome in ('Aluno nao vinculado', 'Historico de ex-aluno', 'Lancamento financeiro sem aluno') then
    v_nome := v_nome_estado;
  end if;

  -- O avatar segue a mesma origem da pagina de Alunos: foto_url primeiro,
  -- photo_url apenas como fallback legado. O par unidade + ID evita colisao
  -- entre alunos homonimos ou matriculas de unidades diferentes.
  select a.foto_url, a.photo_url
    into v_foto_url, v_photo_url
  from public.alunos a
  where a.unidade_id = v_unidade_id
    and a.arquivado_em is null
    and (
      (v_aluno_id is not null and a.id = v_aluno_id)
      or (
        v_matricula_id is not null
        and v_student_id is not null
        and a.emusys_matricula_id = v_matricula_id::text
        and a.emusys_student_id = v_student_id::text
      )
    )
  order by case when v_aluno_id is not null and a.id = v_aluno_id then 0 else 1 end, a.id
  limit 1;

  if v_foto_url is null and v_photo_url is null then
    select a.foto_url, a.photo_url
      into v_foto_url, v_photo_url
    from public.alunos_arquivados a
    where a.unidade_id = v_unidade_id
      and (
        (v_aluno_id is not null and a.id = v_aluno_id)
        or (
          v_matricula_id is not null
          and v_student_id is not null
          and a.emusys_matricula_id = v_matricula_id::text
          and a.emusys_student_id = v_student_id::text
        )
      )
    order by case when v_aluno_id is not null and a.id = v_aluno_id then 0 else 1 end, a.id
    limit 1;
  end if;

  select fp.nome
    into v_forma_manual
  from public.financeiro_fatura_reconciliacao_decisoes d
  join public.formas_pagamento fp on fp.id = d.forma_pagamento_id
  where d.unidade_id = v_unidade_id
    and d.emusys_fatura_id = v_fatura_id
    and d.tipo_decisao = 'forma_pagamento_manual'
    and d.forma_pagamento_id is not null
  order by d.decidido_em desc, d.id desc
  limit 1;

  if v_forma_manual is not null then
    v_forma_nome := v_forma_manual;
    v_forma_fonte := 'manual';
    v_forma_rotulo := 'Forma informada';
  elsif v_forma_nome is null and v_forma_estado is not null then
    v_forma_nome := v_forma_estado;
    v_forma_fonte := 'emusys_matricula';
    v_forma_rotulo := 'Forma prevista';
  end if;

  return p_item
    || jsonb_build_object(
      'aluno', coalesce(p_item->'aluno', '{}'::jsonb)
        || jsonb_build_object(
          'nome', coalesce(v_nome, p_item #>> '{aluno,nome}', 'Aluno nao vinculado'),
          'foto_url', v_foto_url,
          'photo_url', v_photo_url
        ),
      'forma_pagamento', coalesce(p_item->'forma_pagamento', '{}'::jsonb)
        || jsonb_build_object(
          'nome', v_forma_nome,
          'fonte', v_forma_fonte,
          'rotulo', v_forma_rotulo
        )
    );
end;
$function$;
