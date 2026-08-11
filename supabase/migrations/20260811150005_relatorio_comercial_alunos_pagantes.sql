-- relatorio_comercial_alunos_pagantes
-- O snapshot comercial fechado permanece imutavel. A fonte canonica de
-- pagantes e o fechamento gerencial da mesma unidade/competencia; a camada
-- append-only de retificacao torna o dado disponivel tambem para o comercial.

alter function public.montar_relatorio_comercial_mensal_payload_v1(uuid, integer, integer)
  rename to montar_relatorio_comercial_mensal_payload_sem_pagantes_v1;

revoke all on function public.montar_relatorio_comercial_mensal_payload_sem_pagantes_v1(
  uuid, integer, integer
) from public, anon, authenticated, service_role;

create or replace function public.montar_relatorio_comercial_mensal_payload_v1(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_payload jsonb;
  v_gerencial_snapshot_id uuid;
  v_gerencial_snapshot_id_text text;
  v_alunos_pagantes_text text;
  v_alunos_pagantes integer;
begin
  v_payload := public.montar_relatorio_comercial_mensal_payload_sem_pagantes_v1(
    p_unidade_id,
    p_ano,
    p_mes
  );

  v_gerencial_snapshot_id_text := nullif(
    v_payload #>> '{fontes,relatorio_gerencial,snapshot_id}',
    ''
  );

  if v_gerencial_snapshot_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_gerencial_snapshot_id := v_gerencial_snapshot_id_text::uuid;
  end if;

  select coalesce(
    s.payload #>> '{kpis_alunos_canonicos,totais,alunos_pagantes}',
    s.payload #>> '{kpis_gestao,0,alunos_pagantes}',
    s.payload #>> '{dados_mes_atual,0,alunos_pagantes}',
    s.payload #>> '{total_alunos_pagantes}'
  )
  into v_alunos_pagantes_text
  from public.fechamento_mensal_snapshots s
  where s.id = v_gerencial_snapshot_id
    and s.unidade_id = p_unidade_id
    and s.ano = p_ano
    and s.mes = p_mes
    and s.dominio = 'relatorio_gerencial'
    and s.status in ('fechado', 'retificado');

  if v_alunos_pagantes_text is null then
    select coalesce(
      s.payload #>> '{kpis_alunos_canonicos,totais,alunos_pagantes}',
      s.payload #>> '{kpis_gestao,0,alunos_pagantes}',
      s.payload #>> '{dados_mes_atual,0,alunos_pagantes}',
      s.payload #>> '{total_alunos_pagantes}'
    )
    into v_alunos_pagantes_text
    from public.fechamento_mensal_snapshots s
    where s.unidade_id = p_unidade_id
      and s.ano = p_ano
      and s.mes = p_mes
      and s.dominio = 'relatorio_gerencial'
      and s.status in ('fechado', 'retificado')
    order by s.versao desc
    limit 1;
  end if;

  if v_alunos_pagantes_text ~ '^[0-9]+$' then
    v_alunos_pagantes := v_alunos_pagantes_text::integer;
    v_payload := jsonb_set(
      v_payload,
      '{resumo,alunos_pagantes}',
      to_jsonb(v_alunos_pagantes),
      true
    );
  end if;

  return v_payload;
end;
$function$;

revoke all on function public.montar_relatorio_comercial_mensal_payload_v1(
  uuid, integer, integer
) from public, anon, authenticated, service_role;
grant execute on function public.montar_relatorio_comercial_mensal_payload_v1(
  uuid, integer, integer
) to service_role;

-- Retificacao auditada do fechamento que o usuario esta consultando.
do $retificar_comercial_pagantes_recreio_julho$
declare
  v_unidade_id uuid;
  v_payload_hash text;
begin
  select u.id
  into v_unidade_id
  from public.unidades u
  where lower(btrim(u.nome)) = 'recreio'
  order by u.id
  limit 1;

  if v_unidade_id is not null then
    select s.payload_hash
    into v_payload_hash
    from public.fechamento_mensal_snapshots s
    where s.unidade_id = v_unidade_id
      and s.ano = 2026
      and s.mes = 7
      and s.escopo = 'unidade'
      and s.dominio = 'relatorio_comercial_mensal'
      and s.status = 'fechado'
    order by s.versao desc
    limit 1;

    if v_payload_hash is not null then
      perform public.aplicar_retificacao_relatorio_comercial_mensal_v1(
        v_unidade_id,
        2026,
        7,
        v_payload_hash,
        'Inclui alunos pagantes do fechamento gerencial no comercial.',
        jsonb_build_object(
          'fonte', 'relatorio_gerencial',
          'campo', 'kpis_alunos_canonicos.totais.alunos_pagantes',
          'competencia', '2026-07',
          'unidade', 'Recreio'
        )
      );
    end if;
  end if;
end;
$retificar_comercial_pagantes_recreio_julho$;
