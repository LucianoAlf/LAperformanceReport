-- Saidas recebidas do Emusys precisam ser identificadas pela matricula e pela
-- unidade. O webhook pode ser reenviado quando a finalizacao e efetivada ou
-- editada; nome + mes, a chave antiga, mistura segundo curso/banda e deixa duas
-- competencias vigentes para a mesma saida.

begin;

alter table public.movimentacoes_admin
  add column if not exists origem_registro text not null default 'manual';

comment on column public.movimentacoes_admin.origem_registro is
  'Proveniencia da linha. webhook_emusys habilita reconciliacao automatica; manual nunca e revertida pelo sync.';

create index if not exists idx_movimentacoes_admin_saida_emusys_vigente
  on public.movimentacoes_admin (
    unidade_id,
    emusys_matricula_id,
    tipo,
    data desc,
    id desc
  )
  where anulado is false
    and origem_registro = 'webhook_emusys'
    and emusys_matricula_id is not null
    and tipo in ('evasao', 'nao_renovacao');

create or replace function public.registrar_saida_automatica_emusys_v1(
  p_unidade_id uuid,
  p_aluno_id integer,
  p_aluno_nome text,
  p_professor_id integer,
  p_curso_id integer,
  p_tipo text,
  p_data date,
  p_motivo text,
  p_motivo_saida_id integer,
  p_competencia_referencia date,
  p_emusys_matricula_id text,
  p_valor_parcela_evasao numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_anterior public.movimentacoes_admin%rowtype;
  v_nova_id integer;
  v_historicos_anulados integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_SAIDA_AUTOMATICA_EMUSYS';
  end if;

  if p_unidade_id is null
     or p_aluno_id is null
     or nullif(btrim(coalesce(p_aluno_nome, '')), '') is null
     or p_tipo not in ('evasao', 'nao_renovacao')
     or p_data is null
     or nullif(btrim(coalesce(p_emusys_matricula_id, '')), '') is null then
    raise exception 'PARAMETROS_INVALIDOS_SAIDA_AUTOMATICA_EMUSYS';
  end if;

  if not exists (
    select 1
    from public.alunos a
    where a.id = p_aluno_id
      and a.unidade_id = p_unidade_id
      and a.arquivado_em is null
      and btrim(coalesce(a.emusys_matricula_id, '')) = btrim(p_emusys_matricula_id)
  ) then
    raise exception 'IDENTIDADE_INVALIDA_SAIDA_AUTOMATICA_EMUSYS';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'registrar_saida_automatica_emusys_v1|'
        || p_unidade_id::text || '|' || btrim(p_emusys_matricula_id),
      0
    )
  );

  select m.*
    into v_anterior
  from public.movimentacoes_admin m
  where m.unidade_id = p_unidade_id
    and m.emusys_matricula_id = btrim(p_emusys_matricula_id)
    -- A origem pode reclassificar a mesma finalizacao entre evasao e
    -- nao_renovacao. A identidade canonica e a matricula, nao o rotulo.
    and m.tipo in ('evasao', 'nao_renovacao')
    and m.origem_registro = 'webhook_emusys'
    and m.anulado is false
    and m.data >= p_data - 60
  order by m.data desc, m.id desc
  limit 1
  for update;

  if v_anterior.id is not null and v_anterior.data > p_data then
    return jsonb_build_object(
      'ok', true,
      'evento_antigo_ignorado', true,
      'movimentacao_registrada', false,
      'movimentacao_vigente_id', v_anterior.id,
      'data_vigente', v_anterior.data
    );
  end if;

  if v_anterior.id is not null and v_anterior.data = p_data then
    return jsonb_build_object(
      'ok', true,
      'evento_antigo_ignorado', false,
      'movimentacao_registrada', false,
      'deduplicada', true,
      'movimentacao_vigente_id', v_anterior.id,
      'data_vigente', v_anterior.data
    );
  end if;

  if v_anterior.id is not null and p_data <= v_anterior.data + 60 then
    update public.movimentacoes_admin
       set anulado = true,
           anulado_motivo = format(
             'Finalizacao automatica substituida por evento posterior da matricula %s em %s',
             p_emusys_matricula_id,
             p_data
           ),
           anulado_em = now(),
           anulado_por = 'reconciliacao_saida_emusys',
           updated_at = now()
     where id = v_anterior.id
       and anulado is false;

    with anulados as (
      update public.alunos_historico h
         set anulado = true,
             motivo_anulacao = format(
               'Passagem substituida por evento posterior da matricula Emusys %s',
               p_emusys_matricula_id
             ),
             anulado_em = now(),
             anulado_por = 'reconciliacao_saida_emusys',
             updated_at = now()
       where h.unidade_id = p_unidade_id
         and h.anulado is false
         and h.data_saida = v_anterior.data
         and (h.aluno_id = p_aluno_id or p_aluno_id::bigint = any(h.aluno_ids))
         and h.created_at between v_anterior.created_at - interval '5 minutes'
                              and v_anterior.created_at + interval '5 minutes'
       returning h.id
    )
    select count(*)::integer into v_historicos_anulados from anulados;
  end if;

  insert into public.movimentacoes_admin (
    unidade_id,
    data,
    tipo,
    aluno_nome,
    aluno_id,
    professor_id,
    curso_id,
    motivo,
    motivo_saida_id,
    competencia_referencia,
    valor_parcela_evasao,
    emusys_matricula_id,
    origem_registro,
    created_at,
    updated_at
  ) values (
    p_unidade_id,
    p_data,
    p_tipo,
    p_aluno_nome,
    p_aluno_id,
    p_professor_id,
    p_curso_id,
    p_motivo,
    p_motivo_saida_id,
    coalesce(p_competencia_referencia, date_trunc('month', p_data)::date),
    p_valor_parcela_evasao,
    btrim(p_emusys_matricula_id),
    'webhook_emusys',
    now(),
    now()
  )
  returning id into v_nova_id;

  return jsonb_build_object(
    'ok', true,
    'evento_antigo_ignorado', false,
    'movimentacao_registrada', true,
    'movimentacao_vigente_id', v_nova_id,
    'evento_anterior_substituido', v_anterior.id,
    'historicos_anteriores_anulados', v_historicos_anulados
  );
end;
$function$;

revoke all on function public.registrar_saida_automatica_emusys_v1(
  uuid, integer, text, integer, integer, text, date, text, integer, date, text, numeric
) from public, anon, authenticated;
grant execute on function public.registrar_saida_automatica_emusys_v1(
  uuid, integer, text, integer, integer, text, date, text, integer, date, text, numeric
) to service_role;

create or replace function public.reconciliar_saida_automatica_cancelada_v1(
  p_unidade_id uuid,
  p_emusys_matricula_id text,
  p_status_emusys text,
  p_observado_em timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_aluno public.alunos%rowtype;
  v_mov public.movimentacoes_admin%rowtype;
  v_qtd_alunos integer;
  v_historicos_anulados integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'ACESSO_NEGADO_RECONCILIAR_SAIDA_EMUSYS';
  end if;

  if lower(btrim(coalesce(p_status_emusys, ''))) <> 'ativa' then
    return jsonb_build_object('ok', true, 'reconciliada', false, 'motivo', 'fonte_nao_ativa');
  end if;

  if p_unidade_id is null
     or nullif(btrim(coalesce(p_emusys_matricula_id, '')), '') is null then
    raise exception 'PARAMETROS_INVALIDOS_RECONCILIAR_SAIDA_EMUSYS';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'reconciliar_saida_automatica_cancelada_v1|'
        || p_unidade_id::text || '|' || btrim(p_emusys_matricula_id),
      0
    )
  );

  select count(*)::integer
    into v_qtd_alunos
  from public.alunos a
  where a.unidade_id = p_unidade_id
    and a.arquivado_em is null
    and btrim(coalesce(a.emusys_matricula_id, '')) = btrim(p_emusys_matricula_id);

  if v_qtd_alunos <> 1 then
    return jsonb_build_object(
      'ok', true,
      'reconciliada', false,
      'motivo', case when v_qtd_alunos = 0 then 'aluno_nao_encontrado' else 'identidade_ambigua' end,
      'linhas_locais', v_qtd_alunos
    );
  end if;

  select a.*
    into v_aluno
  from public.alunos a
  where a.unidade_id = p_unidade_id
    and a.arquivado_em is null
    and btrim(coalesce(a.emusys_matricula_id, '')) = btrim(p_emusys_matricula_id)
  for update;

  if v_aluno.status not in ('evadido', 'inativo') then
    return jsonb_build_object('ok', true, 'reconciliada', false, 'motivo', 'aluno_ja_operacional');
  end if;

  select m.*
    into v_mov
  from public.movimentacoes_admin m
  where m.unidade_id = p_unidade_id
    and m.aluno_id = v_aluno.id
    and m.emusys_matricula_id = btrim(p_emusys_matricula_id)
    and m.tipo in ('evasao', 'nao_renovacao')
    and m.origem_registro = 'webhook_emusys'
    and m.anulado is false
    and m.created_at >= coalesce(p_observado_em, now()) - interval '90 days'
  order by m.data desc, m.id desc
  limit 1
  for update;

  if v_mov.id is null or v_aluno.data_saida is distinct from v_mov.data then
    return jsonb_build_object(
      'ok', true,
      'reconciliada', false,
      'motivo', 'sem_saida_automatica_compativel'
    );
  end if;

  -- A igualdade abaixo e intencional e faz parte da guarda contra reativar uma
  -- saida manual posterior: a.data_saida = m.data precisa continuar verdadeira.
  if not exists (
    select 1
    from public.alunos a
    join public.movimentacoes_admin m on m.aluno_id = a.id
    where a.id = v_aluno.id
      and a.unidade_id = p_unidade_id
      and a.data_saida = m.data
      and m.id = v_mov.id
      and m.origem_registro = 'webhook_emusys'
  ) then
    return jsonb_build_object('ok', true, 'reconciliada', false, 'motivo', 'guarda_de_data_falhou');
  end if;

  update public.alunos
     set status = 'ativo',
         data_saida = null,
         updated_at = coalesce(p_observado_em, now())
   where id = v_aluno.id
     and unidade_id = p_unidade_id;

  update public.movimentacoes_admin
     set anulado = true,
         anulado_motivo = 'Matricula voltou a ativa no Emusys; saida automatica cancelada na fonte',
         anulado_em = coalesce(p_observado_em, now()),
         anulado_por = 'reconciliacao_saida_emusys',
         updated_at = coalesce(p_observado_em, now())
   where id = v_mov.id
     and anulado is false;

  with anulados as (
    update public.alunos_historico h
       set anulado = true,
           motivo_anulacao = 'Matricula voltou a ativa no Emusys; passagem automatica cancelada',
           anulado_em = coalesce(p_observado_em, now()),
           anulado_por = 'reconciliacao_saida_emusys',
           updated_at = coalesce(p_observado_em, now())
     where h.unidade_id = p_unidade_id
       and h.anulado is false
       and h.data_saida = v_mov.data
       and (h.aluno_id = v_aluno.id or v_aluno.id::bigint = any(h.aluno_ids))
       and h.created_at between v_mov.created_at - interval '5 minutes'
                            and v_mov.created_at + interval '5 minutes'
     returning h.id
  )
  select count(*)::integer into v_historicos_anulados from anulados;

  insert into public.automacao_log (
    evento,
    acao,
    aluno_id,
    aluno_nome,
    detalhes,
    workflow_id,
    execution_id,
    created_at
  ) values (
    'sync_matricula_reconciliacao',
    'saida_automatica_cancelada_na_fonte',
    v_aluno.id,
    v_aluno.nome,
    jsonb_build_object(
      'unidade_id', p_unidade_id,
      'emusys_matricula_id', p_emusys_matricula_id,
      'movimentacao_anulada_id', v_mov.id,
      'historicos_anulados', v_historicos_anulados,
      'status_emusys', p_status_emusys
    ),
    'reconciliar_saida_automatica_cancelada_v1',
    coalesce(p_observado_em, now())::text,
    coalesce(p_observado_em, now())
  );

  return jsonb_build_object(
    'ok', true,
    'reconciliada', true,
    'aluno_id', v_aluno.id,
    'movimentacao_anulada_id', v_mov.id,
    'historicos_anulados', v_historicos_anulados
  );
end;
$function$;

revoke all on function public.reconciliar_saida_automatica_cancelada_v1(
  uuid, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.reconciliar_saida_automatica_cancelada_v1(
  uuid, text, text, timestamptz
) to service_role;

comment on function public.registrar_saida_automatica_emusys_v1(
  uuid, integer, text, integer, integer, text, date, text, integer, date, text, numeric
) is 'Registra saida por unidade+matricula e substitui, por soft-delete, reprocessamento posterior em ate 60 dias.';

comment on function public.reconciliar_saida_automatica_cancelada_v1(
  uuid, text, text, timestamptz
) is 'Reativa somente quando a mesma matricula voltou a ativa e a saida vigente foi criada pelo webhook Emusys.';

commit;
