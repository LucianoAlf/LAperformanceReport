-- Resolve uma lista de HMACs localmente. O digest volta apenas para a Edge
-- agrupar o resultado e nunca e' devolvido ao consumidor HTTP.
create or replace function public.resolver_emusys_cpf_hmac_lote(p_cpfs_hmac text[])
returns table (
  cpf_hmac text,
  papel_cpf text,
  unidade_id uuid,
  unidade_nome text,
  aluno_id integer,
  aluno_nome text,
  responsavel_nome text,
  emusys_aluno_id bigint,
  emusys_responsavel_id bigint,
  emusys_matricula_id bigint
)
language plpgsql
security definer
stable
set search_path = pg_catalog, public, private
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'EMUSYS_CPF_HMAC_FORBIDDEN: service_role obrigatoria'
      using errcode = '42501';
  end if;
  if p_cpfs_hmac is null
    or exists (
      select 1
      from unnest(p_cpfs_hmac) as entrada(cpf_hmac)
      where entrada.cpf_hmac is null
        or lower(trim(entrada.cpf_hmac)) !~ '^[0-9a-f]{64}$'
    ) then
    raise exception 'EMUSYS_CPF_HMAC_LOTE_INVALIDO'
      using errcode = '22023';
  end if;

  return query
  with solicitados as (
    select distinct lower(trim(entrada.cpf_hmac)) as cpf_hmac
    from unnest(p_cpfs_hmac) as entrada(cpf_hmac)
  )
  select
    vinculo.cpf_hmac,
    vinculo.papel as papel_cpf,
    vinculo.unidade_id,
    unidade.nome::text as unidade_nome,
    aluno.id as aluno_id,
    coalesce(
      aluno.nome::text,
      nullif(estado.payload_snapshot#>>'{aluno,nome}', ''),
      nullif(estado.payload_snapshot->>'nome_aluno', '')
    ) as aluno_nome,
    coalesce(
      aluno.responsavel_nome::text,
      nullif(estado.payload_snapshot#>>'{responsavel,nome}', ''),
      nullif(estado.payload_snapshot->>'nome_responsavel', '')
    ) as responsavel_nome,
    vinculo.emusys_aluno_id,
    case when vinculo.papel = 'responsavel' then vinculo.emusys_pessoa_id end,
    vinculo.emusys_matricula_id
  from solicitados
  join private.emusys_cpf_hmac_vinculos vinculo
    on vinculo.cpf_hmac = solicitados.cpf_hmac
  join public.unidades unidade on unidade.id = vinculo.unidade_id
  join public.emusys_matriculas_estado_atual estado
    on estado.unidade_id = vinculo.unidade_id
   and estado.emusys_matricula_id = vinculo.emusys_matricula_id
  left join lateral (
    select candidato.id, candidato.nome, candidato.responsavel_nome
    from public.alunos candidato
    where candidato.unidade_id = vinculo.unidade_id
      and (
        candidato.id = vinculo.aluno_id
        or candidato.emusys_matricula_id = vinculo.emusys_matricula_id::text
        or (
          vinculo.emusys_aluno_id is not null
          and candidato.emusys_student_id = vinculo.emusys_aluno_id::text
        )
      )
    order by
      (candidato.id = vinculo.aluno_id) desc,
      (candidato.emusys_matricula_id = vinculo.emusys_matricula_id::text) desc,
      candidato.id
    limit 1
  ) aluno on true
  order by
    vinculo.cpf_hmac,
    unidade.nome,
    coalesce(aluno.nome::text, estado.payload_snapshot#>>'{aluno,nome}') nulls last,
    vinculo.emusys_matricula_id,
    vinculo.papel;
end;
$function$;

revoke all on function public.resolver_emusys_cpf_hmac_lote(text[])
  from public, anon, authenticated;
grant execute on function public.resolver_emusys_cpf_hmac_lote(text[])
  to service_role;

notify pgrst, 'reload schema';
