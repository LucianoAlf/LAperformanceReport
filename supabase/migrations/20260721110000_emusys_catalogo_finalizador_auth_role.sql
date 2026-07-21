begin;

create or replace function public.finalizar_sync_professor_disciplinas_emusys_v1(
  p_execucao_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_execucao public.emusys_professor_disciplinas_sync_execucoes%rowtype;
  v_catalogo_inativados integer := 0;
  v_atribuicoes_inativadas integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user <> 'postgres' then
    raise exception 'acesso_negado'
      using errcode = '42501';
  end if;

  select execucao.*
    into v_execucao
  from public.emusys_professor_disciplinas_sync_execucoes execucao
  where execucao.id = p_execucao_id
  for update;

  if not found then
    raise exception 'execucao_nao_encontrada'
      using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'sync_professor_disciplinas_emusys:' || v_execucao.unidade_id::text,
      0
    )
  );

  if v_execucao.status <> 'em_andamento' then
    raise exception 'execucao_nao_esta_em_andamento';
  end if;

  if v_execucao.disciplinas_processadas
       is distinct from v_execucao.disciplinas_esperadas then
    raise exception 'execucao_incompleta';
  end if;

  if jsonb_typeof(v_execucao.falhas) <> 'array'
     or jsonb_array_length(v_execucao.falhas) > 0 then
    raise exception 'execucao_possui_falhas';
  end if;

  update public.emusys_professor_disciplinas atribuicao
     set ativo_origem = false,
         sincronizado_em = now(),
         updated_at = now()
   where atribuicao.unidade_id = v_execucao.unidade_id
     and atribuicao.ativo_origem
     and atribuicao.ultima_execucao_id is distinct from p_execucao_id;
  get diagnostics v_atribuicoes_inativadas = row_count;

  update public.emusys_disciplinas_catalogo disciplina
     set ativo_origem = false,
         sincronizado_em = now(),
         updated_at = now()
   where disciplina.unidade_id = v_execucao.unidade_id
     and disciplina.ativo_origem
     and disciplina.ultima_execucao_id is distinct from p_execucao_id;
  get diagnostics v_catalogo_inativados = row_count;

  update public.emusys_professor_disciplinas_sync_execucoes execucao
     set status = 'completa',
         finalizado_em = now(),
         estatisticas = coalesce(execucao.estatisticas, '{}'::jsonb)
           || jsonb_build_object(
             'catalogo_inativados', v_catalogo_inativados,
             'atribuicoes_inativadas', v_atribuicoes_inativadas
           ),
         updated_at = now()
   where execucao.id = p_execucao_id;

  return jsonb_build_object(
    'execucao_id', p_execucao_id,
    'unidade_id', v_execucao.unidade_id,
    'status', 'completa',
    'disciplinas_esperadas', v_execucao.disciplinas_esperadas,
    'disciplinas_processadas', v_execucao.disciplinas_processadas,
    'requisicoes', v_execucao.requisicoes,
    'catalogo_inativados', v_catalogo_inativados,
    'atribuicoes_inativadas', v_atribuicoes_inativadas
  );
end;
$function$;

revoke all on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid)
  to service_role;

comment on function public.finalizar_sync_professor_disciplinas_emusys_v1(uuid)
  is 'Finaliza apenas sync Emusys completo por unidade; usa auth.role() do PostgREST e nunca materializa a V2.';

commit;
