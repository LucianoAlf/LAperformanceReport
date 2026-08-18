begin;

-- A migration anterior encerrou o passivo historico corretamente, mas gravou
-- uma frase generica em analise_sol. Recuperamos a trilha estruturada sem
-- apagar nem sobrescrever o texto que ja existe.
insert into public.matriculas_divergencias_decisoes (
  divergencia_id,
  aluno_id,
  decisao,
  valor_escolhido,
  motivo,
  decidido_por,
  decidido_em,
  metadata
)
select
  d.id,
  d.aluno_id,
  'fora_escopo_operacional',
  jsonb_build_object('resolvido', true),
  'Encerrada automaticamente porque o aluno esta fora do escopo operacional.',
  'migration:20260818161341',
  now(),
  jsonb_build_object(
    'origem', '20260818151433_conciliacao_emusys_fora_escopo_operacional',
    'regra', 'aluno_inativo_evadido_ou_ex_aluno'
  )
from public.matriculas_divergencias d
where d.analise_sol = 'Resolvida automaticamente: aluno fora do escopo operacional.'
on conflict (divergencia_id) do nothing;

-- Para as proximas rodadas, fechar a pendencia historica com decisao
-- estruturada e conservar integralmente qualquer analise humana anterior.
create or replace function public.resolver_pendencias_conciliacao_fora_escopo_operacional(
  p_unidade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_atributos integer := 0;
  v_matriculas integer := 0;
begin
  update public.alunos_emusys_atributos_divergencias d
  set resolvido = true,
      decisao = 'fora_escopo_operacional',
      decidido_por = 'sync_escopo_operacional',
      decidido_em = now(),
      updated_at = now()
  from public.alunos a
  where d.aluno_id = a.id
    and d.unidade_id = p_unidade_id
    and d.resolvido is false
    and (
      a.status in ('inativo', 'evadido')
      or coalesce(a.is_ex_aluno, false) = true
    );
  get diagnostics v_atributos = row_count;

  with pendencias_historicas as (
    select d.id, d.aluno_id
    from public.matriculas_divergencias d
    join public.alunos a on a.id = d.aluno_id
    where d.unidade_id = p_unidade_id
      and d.resolvido is false
      and (
        a.status in ('inativo', 'evadido')
        or coalesce(a.is_ex_aluno, false) = true
      )
  ), decisoes_registradas as (
    insert into public.matriculas_divergencias_decisoes (
      divergencia_id,
      aluno_id,
      decisao,
      valor_escolhido,
      motivo,
      decidido_por,
      decidido_em,
      metadata
    )
    select
      p.id,
      p.aluno_id,
      'fora_escopo_operacional',
      jsonb_build_object('resolvido', true),
      'Encerrada automaticamente porque o aluno esta fora do escopo operacional.',
      'sync_escopo_operacional',
      now(),
      jsonb_build_object('regra', 'aluno_inativo_evadido_ou_ex_aluno')
    from pendencias_historicas p
    on conflict (divergencia_id) do nothing
  )
  update public.matriculas_divergencias d
  set resolvido = true,
      updated_at = now()
  from pendencias_historicas p
  where d.id = p.id;
  get diagnostics v_matriculas = row_count;

  return jsonb_build_object(
    'atributos', v_atributos,
    'matriculas', v_matriculas
  );
end;
$function$;

revoke all on function public.resolver_pendencias_conciliacao_fora_escopo_operacional(uuid)
  from public, anon, authenticated;
grant execute on function public.resolver_pendencias_conciliacao_fora_escopo_operacional(uuid)
  to service_role;

-- Atualiza somente o cadastro que o GET /matriculas afirma ser atual. A
-- verificacao de campos fixados acontece dentro da mesma operacao que escreve
-- em alunos: uma decisao humana concorrente vence o sync e nunca e perdida.
create or replace function public.aplicar_cadastro_emusys_canonico(
  p_unidade_id uuid,
  p_aluno_id integer,
  p_patch jsonb
)
returns table (
  aluno_id integer,
  campos_aplicados text[]
)
language plpgsql
security invoker
set search_path = public
as $function$
declare
  v_aluno_id integer;
  v_campos_aplicados text[] := array[]::text[];
begin
  if coalesce(jsonb_typeof(p_patch), '') <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'PATCH_CADASTRO_EMUSYS_INVALIDO';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch) as chave(campo)
    where chave.campo not in (
      'telefone',
      'email',
      'responsavel_nome',
      'responsavel_telefone'
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'PATCH_CADASTRO_EMUSYS_COM_CAMPO_NAO_PERMITIDO';
  end if;

  -- FOR UPDATE tambem serializa a inclusao de um campo fixado que referencia
  -- este aluno; depois do lock, a leitura abaixo ve a decisao mais recente.
  select a.id
    into v_aluno_id
  from public.alunos a
  where a.id = p_aluno_id
    and a.unidade_id = p_unidade_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'ALUNO_NAO_ENCONTRADO_PARA_PATCH_EMUSYS';
  end if;

  select coalesce(array_agg(chave.campo order by chave.campo), array[]::text[])
    into v_campos_aplicados
  from jsonb_object_keys(p_patch) as chave(campo)
  where chave.campo in (
      'telefone',
      'email',
      'responsavel_nome',
      'responsavel_telefone'
    )
    and nullif(btrim(p_patch ->> chave.campo), '') is not null
    and not exists (
      select 1
      from public.matriculas_campos_fixados f
      where f.aluno_id = v_aluno_id
        and f.campo = chave.campo
    );

  if cardinality(v_campos_aplicados) = 0 then
    return query select v_aluno_id, v_campos_aplicados;
    return;
  end if;

  update public.alunos a
  set telefone = case when 'telefone' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'telefone'), '') else a.telefone end,
      email = case when 'email' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'email'), '') else a.email end,
      responsavel_nome = case when 'responsavel_nome' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'responsavel_nome'), '') else a.responsavel_nome end,
      responsavel_telefone = case when 'responsavel_telefone' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'responsavel_telefone'), '') else a.responsavel_telefone end,
      updated_at = now(),
      updated_by = 'sync-matriculas-emusys'
  where a.id = v_aluno_id
    and a.unidade_id = p_unidade_id;

  return query select v_aluno_id, v_campos_aplicados;
end;
$function$;

revoke all on function public.aplicar_cadastro_emusys_canonico(uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.aplicar_cadastro_emusys_canonico(uuid, integer, jsonb)
  to service_role;

-- Aplica a trilha corrigida ao passivo ainda aberto, sem excluir evidencia.
select public.resolver_pendencias_conciliacao_fora_escopo_operacional(u.id)
from public.unidades u;

commit;
