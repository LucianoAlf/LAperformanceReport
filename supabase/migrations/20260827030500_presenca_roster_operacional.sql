-- Separa o fato historico do vinculo de sua validade operacional atual.
-- Nenhuma reconciliacao deste contrato apaga aula_alunos_emusys ou
-- aluno_presenca: fotografia segura inativa/reativa, fotografia insegura so
-- abre revisao estrutural.

alter table public.aula_alunos_emusys
  add column if not exists ativo_operacional boolean not null default true,
  add column if not exists ultimo_run_visto uuid,
  add column if not exists inativado_em timestamptz,
  add column if not exists inativado_motivo text;

-- O default true acima preserva o legado no instante da migration. Novos
-- vinculos nascem fechados e so entram no roster nominal depois que uma
-- fotografia completa os reativa na mesma execucao.
alter table public.aula_alunos_emusys
  alter column ativo_operacional set default false;

alter table public.aula_alunos_emusys
  drop constraint if exists aula_alunos_emusys_inativado_motivo_check;
alter table public.aula_alunos_emusys
  add constraint aula_alunos_emusys_inativado_motivo_check check (
    inativado_motivo is null
    or inativado_motivo in ('ausente_snapshot_completo', 'roster_vazio_confirmado')
  );

create index if not exists idx_aula_alunos_emusys_operacional
  on public.aula_alunos_emusys(aula_emusys_id, aluno_id)
  where ativo_operacional;

create table public.aula_roster_sync_estado (
  aula_id integer primary key references public.aulas_emusys(id) on delete cascade,
  unidade_id uuid not null references public.unidades(id),
  run_id uuid not null,
  estado text not null check (estado in ('completo', 'vazio_confirmado', 'incompleto', 'ambiguo')),
  qtd_esperada integer not null check (qtd_esperada >= 0),
  qtd_recebida integer not null check (qtd_recebida >= 0),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{32}$'),
  sincronizado_em timestamptz not null default clock_timestamp(),
  atualizado_em timestamptz not null default clock_timestamp()
);

create index aula_roster_sync_estado_fila_idx
  on public.aula_roster_sync_estado(unidade_id, estado, sincronizado_em desc);

alter table public.aula_roster_sync_estado enable row level security;
revoke all on table public.aula_roster_sync_estado
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.aula_roster_sync_estado to service_role;

create or replace view public.vw_aula_roster_operacional_v1
with (security_invoker = true)
as
select
  aa.id as vinculo_id,
  aa.aula_emusys_id,
  aa.unidade_id,
  aa.aluno_id,
  aa.aluno_emusys_id,
  aa.aluno_chave,
  aa.aluno_nome,
  aa.sincronizado_em as vinculo_sincronizado_em,
  e.run_id,
  e.estado as roster_estado,
  e.qtd_esperada,
  e.qtd_recebida,
  e.snapshot_hash,
  e.sincronizado_em as roster_sincronizado_em
from public.aula_alunos_emusys aa
join public.aula_roster_sync_estado e on e.aula_id = aa.aula_emusys_id
where aa.ativo_operacional
  and e.estado = 'completo';

revoke all on table public.vw_aula_roster_operacional_v1
  from public, anon, authenticated, service_role;
grant select on table public.vw_aula_roster_operacional_v1 to service_role;

create or replace function public.reconciliar_grade_snapshot_emusys_v1(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date,
  p_snapshot jsonb,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_run_id uuid := gen_random_uuid();
  v_item jsonb;
  v_aula record;
  v_estado text;
  v_qtd_esperada integer;
  v_qtd_recebida integer;
  v_chaves text[];
  v_linhas integer;
  v_inativados integer := 0;
  v_reativados integer := 0;
  v_aulas_canceladas integer := 0;
  v_estados_gravados integer := 0;
  v_detalhe jsonb := '[]'::jsonb;
begin
  if p_unidade_id is null or p_data_inicio is null or p_data_fim is null
     or p_data_fim < p_data_inicio then
    return jsonb_build_object('status', 'abortado', 'motivo', 'janela_ou_unidade_invalida', 'alteracoes_aplicadas', 0);
  end if;
  if p_data_inicio < v_hoje - 120 or p_data_fim > v_hoje + 60 then
    return jsonb_build_object('status', 'abortado', 'motivo', 'janela_fora_do_limite_operacional', 'alteracoes_aplicadas', 0);
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array'
     or jsonb_array_length(p_snapshot) = 0 then
    return jsonb_build_object('status', 'abortado', 'motivo', 'fotografia_vazia_ou_invalida', 'alteracoes_aplicadas', 0);
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_snapshot) item(valor)
     where jsonb_typeof(item.valor) <> 'object'
        or coalesce(item.valor ->> 'emusys_id', '') !~ '^[1-9][0-9]*$'
        or coalesce(item.valor ->> 'estado', '') not in ('completo', 'vazio_confirmado', 'incompleto', 'ambiguo')
        or coalesce(item.valor ->> 'qtd_esperada', '') !~ '^[0-9]+$'
        or coalesce(item.valor ->> 'qtd_recebida', '') !~ '^[0-9]+$'
        or jsonb_typeof(item.valor -> 'aluno_chaves') <> 'array'
        or exists (
          select 1 from jsonb_array_elements(item.valor -> 'aluno_chaves') chave(valor)
           where jsonb_typeof(chave.valor) <> 'string' or btrim(chave.valor #>> '{}') = ''
        )
  ) or exists (
    select 1 from jsonb_array_elements(p_snapshot) item(valor)
    group by (item.valor ->> 'emusys_id')
    having count(*) > 1
  ) then
    return jsonb_build_object('status', 'abortado', 'motivo', 'fotografia_com_estrutura_invalida', 'alteracoes_aplicadas', 0);
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_snapshot) item(valor)
     where (
       item.valor ->> 'estado' = 'completo'
       and (
         (item.valor ->> 'qtd_esperada')::integer <= 0
         or (item.valor ->> 'qtd_esperada')::integer <> (item.valor ->> 'qtd_recebida')::integer
         or jsonb_array_length(item.valor -> 'aluno_chaves') <> (item.valor ->> 'qtd_recebida')::integer
         or exists (
           select 1 from jsonb_array_elements_text(item.valor -> 'aluno_chaves') chave(valor)
            where chave.valor !~ '^emusys:[1-9][0-9]*$'
         )
       )
     ) or (
       item.valor ->> 'estado' = 'vazio_confirmado'
       and (
         (item.valor ->> 'qtd_esperada')::integer <> 0
         or (item.valor ->> 'qtd_recebida')::integer <> 0
         or jsonb_array_length(item.valor -> 'aluno_chaves') <> 0
       )
     )
  ) then
    return jsonb_build_object('status', 'abortado', 'motivo', 'fotografia_estado_incoerente', 'alteracoes_aplicadas', 0);
  end if;

  for v_item in select valor from jsonb_array_elements(p_snapshot) item(valor)
  loop
    v_estado := v_item ->> 'estado';
    v_qtd_esperada := (v_item ->> 'qtd_esperada')::integer;
    v_qtd_recebida := (v_item ->> 'qtd_recebida')::integer;
    select coalesce(array_agg(chave order by chave), array[]::text[])
      into v_chaves
      from jsonb_array_elements_text(v_item -> 'aluno_chaves') chave;

    select a.* into v_aula
      from public.aulas_emusys a
     where a.unidade_id = p_unidade_id
       and a.emusys_id = (v_item ->> 'emusys_id')::integer
       and a.data_aula between p_data_inicio and p_data_fim
     for update;

    if not found then
      v_detalhe := v_detalhe || jsonb_build_object(
        'emusys_aula_id', (v_item ->> 'emusys_id')::integer,
        'estado', v_estado,
        'acao', 'aula_local_ausente'
      );
      continue;
    end if;

    v_detalhe := v_detalhe || jsonb_build_object(
      'aula_local_id', v_aula.id,
      'emusys_aula_id', v_aula.emusys_id,
      'estado', v_estado,
      'acao', case
        when v_estado in ('incompleto', 'ambiguo') then 'revisao_estrutural'
        when v_estado = 'vazio_confirmado' then 'inativar_roster_vazio'
        else 'conciliar_roster_completo'
      end
    );

    if not p_dry_run then
      insert into public.aula_roster_sync_estado(
        aula_id, unidade_id, run_id, estado, qtd_esperada, qtd_recebida,
        snapshot_hash, sincronizado_em, atualizado_em
      ) values (
        v_aula.id, p_unidade_id, v_run_id, v_estado, v_qtd_esperada, v_qtd_recebida,
        md5(v_item::text), clock_timestamp(), clock_timestamp()
      ) on conflict (aula_id) do update set
        unidade_id = excluded.unidade_id,
        run_id = excluded.run_id,
        estado = excluded.estado,
        qtd_esperada = excluded.qtd_esperada,
        qtd_recebida = excluded.qtd_recebida,
        snapshot_hash = excluded.snapshot_hash,
        sincronizado_em = excluded.sincronizado_em,
        atualizado_em = excluded.atualizado_em;
      v_estados_gravados := v_estados_gravados + 1;
    end if;

    if v_estado = 'completo' then
      if p_dry_run then
        select count(*) into v_linhas
          from public.aula_alunos_emusys aa
         where aa.aula_emusys_id = v_aula.id and not aa.ativo_operacional
           and aa.aluno_chave = any(v_chaves);
        v_reativados := v_reativados + v_linhas;
        select count(*) into v_linhas
          from public.aula_alunos_emusys aa
         where aa.aula_emusys_id = v_aula.id and aa.ativo_operacional
           and not (aa.aluno_chave = any(v_chaves));
        v_inativados := v_inativados + v_linhas;
      else
        update public.aula_alunos_emusys aa set
          ativo_operacional = true,
          ultimo_run_visto = v_run_id,
          inativado_em = null,
          inativado_motivo = null,
          updated_at = clock_timestamp()
        where aa.aula_emusys_id = v_aula.id
          and not aa.ativo_operacional
          and aa.aluno_chave = any(v_chaves);
        get diagnostics v_linhas = row_count;
        v_reativados := v_reativados + v_linhas;

        update public.aula_alunos_emusys aa set ultimo_run_visto = v_run_id
        where aa.aula_emusys_id = v_aula.id
          and aa.ativo_operacional
          and aa.aluno_chave = any(v_chaves);

        update public.aula_alunos_emusys aa set
          ativo_operacional = false,
          inativado_em = clock_timestamp(),
          inativado_motivo = 'ausente_snapshot_completo',
          updated_at = clock_timestamp()
        where aa.aula_emusys_id = v_aula.id
          and aa.ativo_operacional
          and not (aa.aluno_chave = any(v_chaves));
        get diagnostics v_linhas = row_count;
        v_inativados := v_inativados + v_linhas;
      end if;
    elsif v_estado = 'vazio_confirmado' then
      if p_dry_run then
        select count(*) into v_linhas from public.aula_alunos_emusys aa
         where aa.aula_emusys_id = v_aula.id and aa.ativo_operacional;
        v_inativados := v_inativados + v_linhas;
      else
        update public.aula_alunos_emusys aa set
          ativo_operacional = false,
          inativado_em = clock_timestamp(),
          inativado_motivo = 'roster_vazio_confirmado',
          updated_at = clock_timestamp()
        where aa.aula_emusys_id = v_aula.id and aa.ativo_operacional;
        get diagnostics v_linhas = row_count;
        v_inativados := v_inativados + v_linhas;
      end if;
    end if;
  end loop;

  -- Preserva o comportamento de cancelar logicamente aula normal que sumiu da
  -- fotografia atual/futura. Historico passado nunca e recancelado aqui.
  if p_data_inicio >= v_hoje then
    if p_dry_run then
      select count(*) into v_aulas_canceladas
        from public.aulas_emusys a
       where a.unidade_id = p_unidade_id
         and a.categoria = 'normal'
         and not coalesce(a.cancelada, false)
         and a.data_aula between p_data_inicio and p_data_fim
         and not exists (
           select 1 from jsonb_array_elements(p_snapshot) item(valor)
            where (item.valor ->> 'emusys_id')::integer = a.emusys_id
         );
    else
      update public.aulas_emusys a set
        cancelada = true,
        cancelada_origem = 'sync_ausente_emusys',
        cancelada_motivo = 'Aula ausente no Emusys; presenca humana preservada',
        cancelada_em = clock_timestamp()
      where a.unidade_id = p_unidade_id
        and a.categoria = 'normal'
        and not coalesce(a.cancelada, false)
        and a.data_aula between p_data_inicio and p_data_fim
        and not exists (
          select 1 from jsonb_array_elements(p_snapshot) item(valor)
           where (item.valor ->> 'emusys_id')::integer = a.emusys_id
        );
      get diagnostics v_aulas_canceladas = row_count;
    end if;
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'dry_run', p_dry_run,
    'run_id', v_run_id,
    'unidade_id', p_unidade_id,
    'estados_gravados', v_estados_gravados,
    'vinculos_reativados', v_reativados,
    'vinculos_inativados', v_inativados,
    'vinculos_removidos', 0,
    'vinculos_removidos_aplicados', 0,
    'aulas_canceladas', v_aulas_canceladas,
    'aulas_canceladas_aplicadas', case when p_dry_run then 0 else v_aulas_canceladas end,
    'alteracoes_aplicadas', case when p_dry_run then 0 else v_reativados + v_inativados + v_aulas_canceladas end,
    'detalhe', v_detalhe
  );
end;
$$;

revoke all on function public.reconciliar_grade_snapshot_emusys_v1(uuid, date, date, jsonb, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.reconciliar_grade_snapshot_emusys_v1(uuid, date, date, jsonb, boolean)
  to service_role;

create or replace function public.get_conciliacao_roster_operacional_v1(
  p_unidade_id uuid default null,
  p_data_inicio date default (current_date - 30),
  p_data_fim date default current_date,
  p_estado text default 'todos',
  p_limite integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_usuario_id integer;
  v_resultado jsonb;
begin
  if p_data_fim < p_data_inicio or p_data_inicio < current_date - 120
     or p_data_fim > current_date + 60 then
    raise exception using errcode = '22023', message = 'periodo_invalido';
  end if;
  if p_estado not in ('todos', 'vazio_confirmado', 'incompleto', 'ambiguo')
     or p_limite not between 1 and 200 or p_offset < 0 then
    raise exception using errcode = '22023', message = 'filtro_invalido';
  end if;

  select id into v_usuario_id from public.usuarios
   where auth_user_id = auth.uid() and coalesce(ativo, true) limit 1;
  if v_usuario_id is null then
    raise insufficient_privilege using message = 'usuario_nao_autorizado';
  end if;

  with elegiveis as (
    select
      e.aula_id,
      e.unidade_id,
      u.nome as unidade_nome,
      a.emusys_id,
      a.data_aula,
      a.data_hora_inicio,
      a.curso_nome,
      a.turma_nome,
      e.estado,
      e.qtd_esperada,
      e.qtd_recebida,
      e.sincronizado_em
    from public.aula_roster_sync_estado e
    join public.aulas_emusys a on a.id = e.aula_id
    join public.unidades u on u.id = e.unidade_id
    where e.estado in ('vazio_confirmado', 'incompleto', 'ambiguo')
      and a.data_aula between p_data_inicio and p_data_fim
      and (p_unidade_id is null or e.unidade_id = p_unidade_id)
      and (p_estado = 'todos' or e.estado = p_estado)
      and public.usuario_tem_permissao(v_usuario_id, 'professores.editar', e.unidade_id)
  ), pagina as (
    select * from elegiveis order by data_aula desc, data_hora_inicio desc, aula_id
    limit p_limite offset p_offset
  )
  select jsonb_build_object(
    'resumo', jsonb_build_object(
      'total', (select count(*) from elegiveis),
      'vazios_confirmados', (select count(*) from elegiveis where estado = 'vazio_confirmado'),
      'incompletos', (select count(*) from elegiveis where estado = 'incompleto'),
      'ambiguos', (select count(*) from elegiveis where estado = 'ambiguo')
    ),
    'revisoes', coalesce((select jsonb_agg(jsonb_build_object(
      'aula_id', p.aula_id,
      'unidade_id', p.unidade_id,
      'unidade_nome', p.unidade_nome,
      'emusys_id', p.emusys_id,
      'data_aula', p.data_aula,
      'data_hora_inicio', p.data_hora_inicio,
      'curso_nome', p.curso_nome,
      'turma_nome', p.turma_nome,
      'estado', p.estado,
      'qtd_esperada', p.qtd_esperada,
      'qtd_recebida', p.qtd_recebida,
      'sincronizado_em', p.sincronizado_em
    ) order by p.data_aula desc, p.data_hora_inicio desc, p.aula_id) from pagina p), '[]'::jsonb)
  ) into v_resultado;
  return v_resultado;
end;
$$;

revoke all on function public.get_conciliacao_roster_operacional_v1(uuid, date, date, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_conciliacao_roster_operacional_v1(uuid, date, date, text, integer, integer)
  to authenticated, service_role;

comment on view public.vw_aula_roster_operacional_v1 is
  'Roster nominal somente quando a ultima fotografia e completa; estados inseguros nao expoem nomes.';
comment on function public.reconciliar_grade_snapshot_emusys_v1(uuid, date, date, jsonb, boolean) is
  'Concilia roster por snapshot classificado, com soft-inativacao e preservacao integral de aluno_presenca.';
