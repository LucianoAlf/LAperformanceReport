-- Completa o vinculo local quando ele existe e preserva os nomes do snapshot
-- sanitizado para matriculas historicas sem linha correspondente em alunos.

with candidatos as (
  select distinct
    vinculo.unidade_id,
    vinculo.emusys_matricula_id,
    (
      select aluno.id
      from public.alunos aluno
      where aluno.unidade_id = vinculo.unidade_id
        and (
          aluno.emusys_matricula_id = vinculo.emusys_matricula_id::text
          or (
            vinculo.emusys_aluno_id is not null
            and aluno.emusys_student_id = vinculo.emusys_aluno_id::text
          )
        )
      order by
        (aluno.emusys_matricula_id = vinculo.emusys_matricula_id::text) desc,
        aluno.id
      limit 1
    ) as aluno_id
  from private.emusys_cpf_hmac_vinculos vinculo
  where vinculo.aluno_id is null
)
update private.emusys_cpf_hmac_vinculos vinculo
set
  aluno_id = candidato.aluno_id,
  atualizado_em = now()
from candidatos candidato
where candidato.aluno_id is not null
  and vinculo.unidade_id = candidato.unidade_id
  and vinculo.emusys_matricula_id = candidato.emusys_matricula_id
  and vinculo.aluno_id is null;

create or replace function public.resolver_emusys_cpf_hmac(p_cpf_hmac text)
returns table (
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
  if p_cpf_hmac is null or lower(trim(p_cpf_hmac)) !~ '^[0-9a-f]{64}$' then
    raise exception 'EMUSYS_CPF_HMAC_INVALIDO'
      using errcode = '22023';
  end if;

  return query
  select
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
  from private.emusys_cpf_hmac_vinculos vinculo
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
  where vinculo.cpf_hmac = lower(trim(p_cpf_hmac))
  order by
    unidade.nome,
    coalesce(aluno.nome::text, estado.payload_snapshot#>>'{aluno,nome}') nulls last,
    vinculo.emusys_matricula_id,
    vinculo.papel;
end;
$function$;

revoke all on function public.resolver_emusys_cpf_hmac(text)
  from public, anon, authenticated;
grant execute on function public.resolver_emusys_cpf_hmac(text)
  to service_role;

notify pgrst, 'reload schema';
