-- Grão de banda: unidade + matrícula, não a linha projetada em alunos.
-- A projeção pode representar duas bandas legítimas da mesma pessoa.
-- Só muda a agregação de bandas; pessoas, financeiro, cursos adicionais,
-- ACL do wrapper e snapshots históricos permanecem intactos.
do $migration$
declare
  v_function text;
  v_old text := $old$    count(ac.id) filter (
      where ac.entra_base_ativa = true and ac.is_banda_operacional = true
    )::integer as matriculas_banda,$old$;
  v_new text := $new$    (
      select count(*)::integer
      from matriculas_banda_ativas mb
      where mb.unidade_id = ub.unidade_id
    ) as matriculas_banda,$new$;
  v_ctes text := $ctes$matriculas_banda_ativas as (
  -- O estado resolvido de cada matrícula é independente do estado da linha
  -- local escolhida pela projeção. Renovar disciplinas não duplica matrícula.
  select ac.unidade_id,
         'emusys:' || estado.emusys_matricula_id::text as matricula_key
  from alunos_classificados ac
  join public.emusys_matriculas_estado_atual estado
    on estado.unidade_id = ac.unidade_id
   and (
     estado.aluno_id = ac.id
     or estado.emusys_matricula_id = case
       when btrim(coalesce(ac.emusys_matricula_id, '')) ~ '^[0-9]+$'
         then btrim(ac.emusys_matricula_id)::bigint
       else null
     end
   )
  where ac.is_banda_operacional = true
    and estado.status_local_resolvido = 'ativo'

  union

  -- Preserva matrículas locais ainda sem sincronização, sem inventar um
  -- segundo vínculo nem ressuscitar matrícula com estado conhecido inativo.
  select ac.unidade_id,
         case
           when btrim(coalesce(ac.emusys_matricula_id, '')) ~ '^[0-9]+$'
             then 'emusys:' || btrim(ac.emusys_matricula_id)::bigint::text
           else 'local:' || ac.id::text
         end as matricula_key
  from alunos_classificados ac
  where ac.is_banda_operacional = true
    and ac.entra_base_ativa = true
    and not exists (
      select 1
      from public.emusys_matriculas_estado_atual estado
      where estado.unidade_id = ac.unidade_id
        and (
          estado.aluno_id = ac.id
          or estado.emusys_matricula_id = case
            when btrim(coalesce(ac.emusys_matricula_id, '')) ~ '^[0-9]+$'
              then btrim(ac.emusys_matricula_id)::bigint
            else null
          end
        )
    )
),
$ctes$;
begin
  select pg_get_functiondef(
    'public.get_kpis_alunos_admin_operacional_impl_v2(uuid,integer,integer)'::regprocedure
  ) into v_function;
  -- A mesma migration pode ser executada de checkout Windows (CRLF).
  v_function := replace(v_function, chr(13), '');
  v_old := replace(v_old, chr(13), '');
  v_new := replace(v_new, chr(13), '');
  v_ctes := replace(v_ctes, chr(13), '');

  if position('matriculas_banda_ativas as (' in v_function) > 0 then
    return;
  end if;
  if position(v_old in v_function) = 0
     or position(E'\npessoas as (' in v_function) = 0 then
    raise exception 'KPI_ADMIN_BANDAS_FORMATO_INESPERADO';
  end if;

  -- CREATE OR REPLACE preserva owner e grants; não cria nova RPC pública.
  v_function := replace(v_function, E'\npessoas as (', E'\n' || v_ctes || 'pessoas as (');
  v_function := replace(v_function, v_old, v_new);
  execute v_function;
end;
$migration$;
