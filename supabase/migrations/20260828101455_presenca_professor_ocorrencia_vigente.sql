-- Fecha o contrato de ocorrencia da presenca do professor.
--
-- Uma aula local pode ser reutilizada pelo sync ao ser reagendada. A confirmacao
-- do professor pertence a data/horario em que foi respondida, nao ao id mutavel
-- da aula. Escritores passam a canonicalizar unidade/data; o reagendamento cria
-- uma fronteira auditavel mesmo sem chamada de aluno; e consumidores ignoram
-- qualquer confirmacao anterior a essa fronteira.

create index if not exists idx_automacao_log_limpeza_reagendamento_aula
  on public.automacao_log ((detalhes ->> 'aula_id'), created_at desc)
  where acao = 'presenca_limpa_por_reagendamento';

create or replace function public.fn_professor_ponto_canonicalizar_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_professor_id integer;
  v_unidade_id uuid;
  v_data_aula date;
begin
  select ae.professor_id, ae.unidade_id, ae.data_aula
    into v_professor_id, v_unidade_id, v_data_aula
  from public.aulas_emusys ae
  where ae.id = new.aula_emusys_id;

  if not found then
    raise exception 'aula_nao_encontrada' using errcode = '23503';
  end if;

  if new.professor_id is distinct from v_professor_id then
    raise exception 'professor_nao_corresponde_a_ocorrencia' using errcode = '23514';
  end if;

  new.unidade_id := v_unidade_id;
  new.data_aula := v_data_aula;
  return new;
end;
$function$;

drop trigger if exists trg_professor_ponto_canonicalizar_ocorrencia
  on public.professor_ponto_confirmacoes;
create trigger trg_professor_ponto_canonicalizar_ocorrencia
  before insert or update on public.professor_ponto_confirmacoes
  for each row execute function public.fn_professor_ponto_canonicalizar_ocorrencia();

revoke all on function public.fn_professor_ponto_canonicalizar_ocorrencia()
  from public, anon, authenticated, service_role;

comment on function public.fn_professor_ponto_canonicalizar_ocorrencia() is
  '[interna] Garante que confirmacao de ponto use professor, unidade e data da ocorrencia atual da aula.';

create or replace function public.app_registrar_presenca_professor_dia(
  p_professor_id integer,
  p_data date,
  p_unidade_id uuid,
  p_hora_chegada time without time zone default null::time without time zone,
  p_hora_saida time without time zone default null::time without time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_usuario_id integer;
  v_aulas_atualizadas integer := 0;
  v_aula record;
begin
  select u.id into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid() and coalesce(u.ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;
  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', p_unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  perform set_config('app.escrita_humana_aula', 'on', true);

  for v_aula in
    select ae.id
    from public.aulas_emusys ae
    where ae.professor_id = p_professor_id
      and ae.data_aula = p_data
      and ae.unidade_id = p_unidade_id
      and ae.cancelada = false
      and ae.categoria = 'normal'
  loop
    update public.aulas_emusys
       set professor_presenca = 'presente',
           professor_presenca_origem = 'agenda_secretaria'
     where id = v_aula.id;

    v_aulas_atualizadas := v_aulas_atualizadas + 1;

    insert into public.professor_ponto_confirmacoes (
      professor_id, aula_emusys_id, unidade_id, data_aula,
      estava_presente, origem, respondido_em
    ) values (
      p_professor_id, v_aula.id, p_unidade_id, p_data,
      true, 'chamada_secretaria', now()
    )
    on conflict (aula_emusys_id, professor_id) do update
       set unidade_id = excluded.unidade_id,
           data_aula = excluded.data_aula,
           estava_presente = true,
           origem = 'chamada_secretaria',
           respondido_em = now();
  end loop;

  return jsonb_build_object(
    'registrado', true,
    'professor_id', p_professor_id,
    'data', p_data,
    'aulas_atualizadas', v_aulas_atualizadas
  );
end;
$function$;

create or replace function public.app_marcar_presenca_professor_aula(
  p_aula_emusys_id integer,
  p_presente boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_usuario_id integer;
  v_aula public.aulas_emusys%rowtype;
begin
  select u.id into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid() and coalesce(u.ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  select * into v_aula
  from public.aulas_emusys ae
  where ae.id = p_aula_emusys_id;

  if not found then
    raise exception 'aula_nao_encontrada';
  end if;
  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_aula.unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;
  if coalesce(v_aula.cancelada, false) then
    raise exception 'aula_cancelada';
  end if;

  perform set_config('app.escrita_humana_aula', 'on', true);

  update public.aulas_emusys
     set professor_presenca = case when p_presente then 'presente' else 'ausente' end,
         professor_presenca_origem = 'agenda_secretaria'
   where id = v_aula.id;

  insert into public.professor_ponto_confirmacoes (
    professor_id, aula_emusys_id, unidade_id, data_aula,
    estava_presente, origem, respondido_em
  ) values (
    v_aula.professor_id, v_aula.id, v_aula.unidade_id, v_aula.data_aula,
    p_presente, 'chamada_secretaria', now()
  )
  on conflict (aula_emusys_id, professor_id) do update
     set unidade_id = excluded.unidade_id,
         data_aula = excluded.data_aula,
         estava_presente = excluded.estava_presente,
         origem = 'chamada_secretaria',
         respondido_em = now();

  return jsonb_build_object(
    'registrado', true,
    'aula_emusys_id', v_aula.id,
    'professor_presenca', case when p_presente then 'presente' else 'ausente' end
  );
end;
$function$;

create or replace function public.app_remover_presenca_professor_dia(
  p_professor_id integer,
  p_data date,
  p_unidade_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_usuario_id integer;
  v_aulas_afetadas integer := 0;
begin
  select u.id into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid() and coalesce(u.ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;
  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', p_unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  perform set_config('app.escrita_humana_aula', 'on', true);

  delete from public.professor_ponto_confirmacoes ppc
  using public.aulas_emusys ae
  where ppc.aula_emusys_id = ae.id
    and ppc.professor_id = p_professor_id
    and ppc.origem = 'chamada_secretaria'
    and ae.professor_id = p_professor_id
    and ae.data_aula = p_data
    and ae.unidade_id = p_unidade_id
    and ae.cancelada = false
    and ae.categoria = 'normal';

  update public.aulas_emusys
     set professor_presenca = 'ausente',
         professor_presenca_origem = 'agenda_secretaria'
   where professor_id = p_professor_id
     and data_aula = p_data
     and unidade_id = p_unidade_id
     and cancelada = false
     and categoria = 'normal';
  get diagnostics v_aulas_afetadas = row_count;

  return jsonb_build_object(
    'removido', true,
    'professor_id', p_professor_id,
    'data', p_data,
    'aulas_afetadas', v_aulas_afetadas
  );
end;
$function$;

revoke all on function public.app_registrar_presenca_professor_dia(
  integer, date, uuid, time without time zone, time without time zone)
  from public, anon;
revoke all on function public.app_marcar_presenca_professor_aula(integer, boolean)
  from public, anon;
revoke all on function public.app_remover_presenca_professor_dia(integer, date, uuid)
  from public, anon;
grant execute on function public.app_registrar_presenca_professor_dia(
  integer, date, uuid, time without time zone, time without time zone)
  to authenticated, service_role;
grant execute on function public.app_marcar_presenca_professor_aula(integer, boolean)
  to authenticated, service_role;
grant execute on function public.app_remover_presenca_professor_dia(integer, date, uuid)
  to authenticated, service_role;

create or replace function public.app_responder_confirmacao_ponto(
  p_aula_emusys_id integer,
  p_estava_presente boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_professor_id integer := public.fn_professor_do_usuario();
  v_aula public.aulas_emusys%rowtype;
  v_ultima_limpeza timestamptz;
  v_gravados integer;
begin
  if v_professor_id is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;

  select * into v_aula
  from public.aulas_emusys ae
  where ae.id = p_aula_emusys_id
    and ae.professor_id = v_professor_id
    and ae.cancelada = false;

  if not found then
    raise exception 'aula_nao_pertence_ao_professor' using errcode = '42501';
  end if;
  if v_aula.data_hora_inicio > now() then
    raise exception 'aula_ainda_nao_ocorreu';
  end if;

  select max(l.created_at) into v_ultima_limpeza
  from public.automacao_log l
  where l.acao = 'presenca_limpa_por_reagendamento'
    and l.detalhes ->> 'aula_id' = v_aula.id::text;

  insert into public.professor_ponto_confirmacoes (
    professor_id, aula_emusys_id, unidade_id, data_aula,
    estava_presente, origem, respondido_em
  ) values (
    v_professor_id, v_aula.id, v_aula.unidade_id, v_aula.data_aula,
    p_estava_presente, 'fabio', now()
  )
  on conflict (professor_id, aula_emusys_id) do update
     set unidade_id = excluded.unidade_id,
         data_aula = excluded.data_aula,
         estava_presente = excluded.estava_presente,
         origem = 'fabio',
         respondido_em = now()
   where public.professor_ponto_confirmacoes.unidade_id
           is distinct from excluded.unidade_id
      or public.professor_ponto_confirmacoes.data_aula
           is distinct from excluded.data_aula
      or (
        v_ultima_limpeza is not null
        and public.professor_ponto_confirmacoes.respondido_em <= v_ultima_limpeza
      );

  get diagnostics v_gravados = row_count;
  return jsonb_build_object(
    'registrado', v_gravados = 1,
    'first_write_wins', v_gravados = 0
  );
end;
$function$;

revoke all on function public.app_responder_confirmacao_ponto(integer, boolean)
  from public, anon;
grant execute on function public.app_responder_confirmacao_ponto(integer, boolean)
  to authenticated;

create or replace function public.fn_reagendamento_limpa_chamada_alunos()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_qtd integer := 0;
  v_confirmacoes_professor integer := 0;
begin
  if new.data_hora_inicio is not distinct from old.data_hora_inicio then
    return new;
  end if;

  update public.aluno_presenca ap
     set status = 'ausente',
         status_presenca = null,
         respondido_por = 'emusys',
         respondido_em = null,
         espelhado_de_presenca_id = null,
         emusys_presenca_bruta = null,
         emusys_presenca_bruta_anterior = ap.emusys_presenca_bruta,
         emusys_presenca_alterada_em = now(),
         data_aula = new.data_aula,
         horario_aula = (new.data_hora_inicio at time zone 'America/Sao_Paulo')::time
   where ap.aula_emusys_id = new.id
     and (
       public.fn_presenca_e_forte(ap.respondido_por)
       or ap.status_presenca is not null
       or ap.emusys_presenca_bruta is not null
     );
  get diagnostics v_qtd = row_count;

  select count(*)::integer into v_confirmacoes_professor
  from public.professor_ponto_confirmacoes ppc
  where ppc.aula_emusys_id = new.id
    and ppc.respondido_em is not null;

  if v_qtd > 0
     or v_confirmacoes_professor > 0
     or old.professor_presenca_origem is not null
  then
    begin
      insert into public.automacao_log(
        aluno_nome, evento, acao, status, detalhes
      ) values (
        '(aula ' || new.id || ')',
        'presenca',
        'presenca_limpa_por_reagendamento',
        'warn',
        jsonb_build_object(
          'aula_id', new.id,
          'emusys_id', new.emusys_id,
          'de', old.data_hora_inicio,
          'para', new.data_hora_inicio,
          'linhas_alunos', v_qtd,
          'confirmacoes_professor', v_confirmacoes_professor
        )
      );
    exception when others then
      null;
    end;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_reagendamento_limpa_chamada_alunos
  on public.aulas_emusys;
create trigger trg_reagendamento_limpa_chamada_alunos
  after update of data_hora_inicio on public.aulas_emusys
  for each row execute function public.fn_reagendamento_limpa_chamada_alunos();

revoke all on function public.fn_reagendamento_limpa_chamada_alunos()
  from public, anon, authenticated, service_role;

create or replace view public.vw_ponto_professor_aulas as
with limpezas_reagendamento as materialized (
  select
    l.detalhes ->> 'aula_id' as aula_id_texto,
    max(l.created_at) as ultima_limpeza
  from public.automacao_log l
  where l.acao = 'presenca_limpa_por_reagendamento'
    and l.detalhes ->> 'aula_id' is not null
  group by l.detalhes ->> 'aula_id'
), presenca_por_aula as (
  select
    ap.aula_emusys_id,
    bool_or(coalesce(
      ap.status_presenca,
      case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end
    ) = 'presente') as tem_presenca,
    bool_or(coalesce(
      ap.status_presenca,
      case ap.status when 'presente' then 'presente' when 'ausente' then 'falta' end
    ) = 'falta') as tem_falta
  from public.aluno_presenca ap
  where ap.aula_emusys_id is not null
  group by ap.aula_emusys_id
), aulas_base as (
  select
    ae.id as aula_emusys_id,
    ae.professor_id,
    ae.unidade_id,
    ae.data_aula,
    ae.data_hora_inicio,
    ae.data_hora_fim,
    greatest(
      1,
      coalesce(
        ae.duracao_minutos,
        round(extract(epoch from (ae.data_hora_fim - ae.data_hora_inicio)) / 60.0)::integer
      )
    ) as duracao_minutos,
    coalesce(pa.tem_presenca, false) as tem_presenca,
    coalesce(pa.tem_falta, false) as tem_falta,
    coalesce(pc.estava_presente, false) as ponta_confirmada,
    coalesce(pa.tem_presenca, false) or coalesce(pc.estava_presente, false) as evidencia_presenca
  from public.aulas_emusys ae
  left join presenca_por_aula pa
    on pa.aula_emusys_id = ae.id
  left join limpezas_reagendamento lr
    on lr.aula_id_texto = ae.id::text
  left join public.professor_ponto_confirmacoes pc
    on pc.aula_emusys_id = ae.id
   and pc.professor_id = ae.professor_id
   and pc.unidade_id = ae.unidade_id
   and pc.data_aula = ae.data_aula
   and (
     lr.ultima_limpeza is null
     or pc.respondido_em > lr.ultima_limpeza
   )
  where ae.cancelada = false
    and ae.professor_id is not null
), ancoras as (
  select
    professor_id,
    data_aula,
    min(data_hora_inicio) filter (where evidencia_presenca) as primeira_evidencia_inicio,
    max(data_hora_inicio) filter (where evidencia_presenca) as ultima_evidencia_inicio
  from aulas_base
  group by professor_id, data_aula
)
select
  ab.aula_emusys_id,
  ab.professor_id,
  ab.unidade_id,
  ab.data_aula,
  ab.data_hora_inicio,
  ab.data_hora_fim,
  ab.duracao_minutos,
  ab.tem_presenca,
  ab.tem_falta,
  ab.ponta_confirmada,
  ab.evidencia_presenca,
  an.primeira_evidencia_inicio,
  an.ultima_evidencia_inicio,
  an.primeira_evidencia_inicio is not null
    and ab.data_hora_inicio >= an.primeira_evidencia_inicio
    and ab.data_hora_inicio <= an.ultima_evidencia_inicio as aula_creditada
from aulas_base ab
join ancoras an using (professor_id, data_aula);

alter view public.vw_ponto_professor_aulas
  set (security_invoker = true);

comment on view public.vw_ponto_professor_aulas is
  'Ponto do professor por ocorrencia vigente. Confirmacoes anteriores ao ultimo reagendamento nao creditam a nova ocorrencia.';

create or replace view public.vw_saude_presenca_professor as
with limpezas_reagendamento as materialized (
  select
    l.detalhes ->> 'aula_id' as aula_id_texto,
    max(l.created_at) as ultima_limpeza
  from public.automacao_log l
  where l.acao = 'presenca_limpa_por_reagendamento'
    and l.detalhes ->> 'aula_id' is not null
  group by l.detalhes ->> 'aula_id'
), janela as (
  select
    ae.id,
    ae.unidade_id,
    ae.professor_presenca,
    ae.professor_presenca_origem,
    ae.cancelada,
    ae.cancelada_origem,
    ppc.estava_presente,
    ppc.respondido_em
  from public.aulas_emusys ae
  left join limpezas_reagendamento lr
    on lr.aula_id_texto = ae.id::text
  left join public.professor_ponto_confirmacoes ppc
    on ppc.aula_emusys_id = ae.id
   and ppc.professor_id = ae.professor_id
   and ppc.unidade_id = ae.unidade_id
   and ppc.data_aula = ae.data_aula
   and ppc.origem = 'chamada_secretaria'
   and (
     lr.ultima_limpeza is null
     or ppc.respondido_em > lr.ultima_limpeza
   )
  where ae.data_aula between
    (now() at time zone 'America/Sao_Paulo')::date - 7
    and (now() at time zone 'America/Sao_Paulo')::date
)
select
  u.id as unidade_id,
  u.nome as unidade_nome,
  count(*) filter (
    where j.professor_presenca_origem is not null
  )::integer as marcacoes_humanas,
  count(*) filter (
    where j.estava_presente is not null
      and not coalesce(j.cancelada, false)
      and (
        (j.estava_presente and j.professor_presenca is distinct from 'presente')
        or
        (not j.estava_presente and j.professor_presenca is distinct from 'ausente')
      )
  )::integer as revertidas,
  count(*) filter (
    where j.cancelada_origem = 'agenda_secretaria'
      and not coalesce(j.cancelada, false)
  )::integer as cancelamentos_humanos_desfeitos,
  count(*) filter (
    where j.estava_presente is not null
      and j.professor_presenca_origem is null
  )::integer as sem_procedencia_na_ficha,
  max(j.respondido_em) as ultima_marcacao
from public.unidades u
left join janela j on j.unidade_id = u.id
where u.ativo = true
group by u.id, u.nome;

alter view public.vw_saude_presenca_professor
  set (security_invoker = true);

comment on view public.vw_saude_presenca_professor is
  'Saude service-only da protecao humana na ocorrencia vigente. Revertidas e cancelamentos_humanos_desfeitos devem permanecer 0.';

-- Views internas nao sao portas de agente. LA Teacher e agentes chegam por RPCs
-- security-definer com finalidade e escopo; somente service_role le o kernel.
do $acl$
declare
  v_view text;
  v_role text;
begin
  foreach v_view in array array[
    'vw_saude_presenca_professor',
    'vw_ponto_professor_aulas',
    'vw_ponto_professor_diario'
  ]
  loop
    if to_regclass('public.' || v_view) is null then
      continue;
    end if;

    execute format(
      'revoke all on public.%I from public, anon, authenticated',
      v_view
    );
    execute format('grant select on public.%I to service_role', v_view);

    for v_role in
      select rolname
      from pg_roles
      where rolname = any (array[
        'sol_acesso_restrito',
        'lia_acesso_restrito',
        'mila_acesso_restrito',
        'fabio_agent'
      ])
    loop
      execute format('revoke all on public.%I from %I', v_view, v_role);
    end loop;
  end loop;

  for v_role in
    select rolname
    from pg_roles
    where rolname = any (array[
      'sol_acesso_restrito',
      'lia_acesso_restrito',
      'mila_acesso_restrito',
      'fabio_agent'
    ])
  loop
    execute format(
      'revoke all on function public.fn_professor_ponto_canonicalizar_ocorrencia() from %I',
      v_role
    );
    execute format(
      'revoke all on function public.fn_reagendamento_limpa_chamada_alunos() from %I',
      v_role
    );
    execute format(
      'revoke all on function public.app_registrar_presenca_professor_dia(integer,date,uuid,time without time zone,time without time zone) from %I',
      v_role
    );
    execute format(
      'revoke all on function public.app_marcar_presenca_professor_aula(integer,boolean) from %I',
      v_role
    );
    execute format(
      'revoke all on function public.app_remover_presenca_professor_dia(integer,date,uuid) from %I',
      v_role
    );
    execute format(
      'revoke all on function public.app_responder_confirmacao_ponto(integer,boolean) from %I',
      v_role
    );
  end loop;
end
$acl$;
