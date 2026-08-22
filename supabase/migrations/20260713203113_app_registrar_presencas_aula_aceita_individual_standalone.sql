-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- BUG (pego pelo Claude Code, 13/07): a chamada so aceitava tipo='turma'. Aula individual
-- STANDALONE (sem turma no mesmo slot) ficava sem porta — o professor nao conseguia dar presenca.
--
-- POR QUE ISSO E GRANDE: o payload do Emusys (Codex, hoje) mostrou que TODA AULA REAGENDADA
-- vira individual SEM turma (a da Amanda: reagendada=true, turma_nome=null). Ou seja: nao era
-- um caso isolado — NENHUMA aula remarcada da escola aceitava chamada.
--
-- REGRA NOVA (a ancora deixa de ser "tipo=turma" e passa a ser "quem manda no slot"):
--   turma                                  -> aceita (a ancora do slot)
--   individual COM turma irma no slot      -> RECUSA (a chamada e da turma; senao duplica presenca)
--   individual SEM turma irma (standalone) -> ACEITA (ela e a propria ancora)
create or replace function public.app_registrar_presencas_aula(
  p_aula_emusys_id integer,
  p_alunos_ausentes integer[] default '{}'::integer[]
)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_professor_id  integer := public.fn_professor_do_usuario();
  v_aula          public.aulas_emusys%rowtype;
  v_turma_irma    integer;
  v_roster_total  integer;
  v_ja_existentes integer;
  v_inseridos     integer;
begin
  if v_professor_id is null then
    raise exception 'sem_professor_vinculado' using errcode = '42501';
  end if;

  select * into v_aula from public.aulas_emusys where id = p_aula_emusys_id;
  if not found or v_aula.professor_id is distinct from v_professor_id then
    raise exception 'aula_nao_pertence_ao_professor' using errcode = '42501';
  end if;
  if coalesce(v_aula.cancelada, false) then raise exception 'aula_cancelada'; end if;

  -- QUEM E A ANCORA DESTE SLOT?
  if coalesce(v_aula.tipo,'') <> 'turma' then
    select t.id into v_turma_irma
    from public.aulas_emusys t
    where t.tipo = 'turma'
      and t.unidade_id = v_aula.unidade_id
      and t.data_hora_inicio = v_aula.data_hora_inicio
      and t.professor_id is not distinct from v_aula.professor_id
      and coalesce(t.cancelada,false) = false
    limit 1;

    if v_turma_irma is not null then
      -- tem turma no slot: a chamada e LA (senao duplica presenca do mesmo aluno)
      raise exception 'chamada_somente_na_aula_ancora (use a aula % deste horario)', v_turma_irma;
    end if;
    -- sem turma irma: esta individual E a ancora. Segue.
  end if;

  if v_aula.data_hora_inicio > now() + interval '15 minutes' then
    raise exception 'chamada_ainda_nao_disponivel';
  end if;
  if coalesce(v_aula.data_hora_fim, v_aula.data_hora_inicio) < now() - interval '24 hours' then
    raise exception 'janela_de_chamada_encerrada';
  end if;

  select count(*), count(*) filter (where aluno_id is null)
    into v_roster_total, v_ja_existentes
  from public.aula_alunos_emusys where aula_emusys_id = v_aula.id;

  if v_roster_total = 0 then raise exception 'roster_nao_sincronizado'; end if;
  if v_ja_existentes > 0 then raise exception 'roster_incompleto'; end if;

  if exists (
    select 1 from unnest(coalesce(p_alunos_ausentes,'{}'::integer[])) ausente(aluno_id)
    where not exists (select 1 from public.aula_alunos_emusys r
                       where r.aula_emusys_id = v_aula.id and r.aluno_id = ausente.aluno_id)
  ) then
    raise exception 'aluno_ausente_fora_do_roster';
  end if;

  select count(*) into v_ja_existentes
  from public.aluno_presenca ap where ap.aula_emusys_id = v_aula.id;

  if exists (select 1 from public.aluno_presenca ap
              where ap.aula_emusys_id = v_aula.id
                and ap.respondido_por = 'professor_la_teacher') then
    return jsonb_build_object('aula_id', v_aula.id, 'total_roster', v_roster_total,
      'inseridos', 0, 'ignorados_first_write_wins', v_roster_total,
      'ja_havia_registros', true, 'chamada_ja_enviada', true);
  end if;

  insert into public.aluno_presenca (
    aluno_id, aula_emusys_id, professor_id, unidade_id, data_aula, horario_aula,
    status, status_presenca, curso_nome, turma_nome, sala_nome, respondido_por, respondido_em)
  select distinct r.aluno_id, v_aula.id, v_professor_id, v_aula.unidade_id, v_aula.data_aula,
    (v_aula.data_hora_inicio at time zone 'America/Sao_Paulo')::time,
    case when r.aluno_id = any(coalesce(p_alunos_ausentes,'{}'::integer[])) then 'ausente' else 'presente' end,
    case when r.aluno_id = any(coalesce(p_alunos_ausentes,'{}'::integer[])) then 'falta' else 'presente' end,
    v_aula.curso_nome, v_aula.turma_nome, v_aula.sala_nome, 'professor_la_teacher', now()
  from public.aula_alunos_emusys r
  where r.aula_emusys_id = v_aula.id and r.aluno_id is not null
  on conflict (aluno_id, aula_emusys_id) do nothing;

  get diagnostics v_inseridos = row_count;

  return jsonb_build_object('aula_id', v_aula.id, 'total_roster', v_roster_total,
    'inseridos', v_inseridos, 'ignorados_first_write_wins', v_roster_total - v_inseridos,
    'ja_havia_registros', v_ja_existentes > 0, 'chamada_ja_enviada', false,
    'ancora', case when v_aula.tipo='turma' then 'turma' else 'individual_standalone' end);
end;
$function$;

revoke all on function public.app_registrar_presencas_aula(integer, integer[]) from public, anon;
grant execute on function public.app_registrar_presencas_aula(integer, integer[]) to authenticated;
