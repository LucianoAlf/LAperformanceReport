-- A fronteira de reagendamento passou a governar o ponto do professor. Portanto
-- seu log nao e mais telemetria opcional: se ele nao puder ser persistido, o
-- reagendamento precisa falhar e reaparecer no retry do sync, nunca publicar a
-- ocorrencia nova com confirmacao antiga. A resposta do LA Teacher tambem trava
-- a aula durante a decisao para nao disputar essa fronteira com o sync.

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
    and ae.cancelada = false
  for share;

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
  end if;

  return new;
end;
$function$;

revoke all on function public.fn_reagendamento_limpa_chamada_alunos()
  from public, anon, authenticated, service_role;

do $acl$
declare
  v_role text;
begin
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
      'revoke all on function public.app_responder_confirmacao_ponto(integer,boolean) from %I',
      v_role
    );
    execute format(
      'revoke all on function public.fn_reagendamento_limpa_chamada_alunos() from %I',
      v_role
    );
  end loop;
end
$acl$;

comment on function public.app_responder_confirmacao_ponto(integer, boolean) is
  'Confirma ponto no LA Teacher com first-write-wins por ocorrencia; serializa contra reagendamento e reabre somente depois da fronteira auditada.';
comment on function public.fn_reagendamento_limpa_chamada_alunos() is
  '[interna] Invalida chamada de alunos e cria, de forma fail-closed, a fronteira de ocorrencia para o ponto do professor.';
