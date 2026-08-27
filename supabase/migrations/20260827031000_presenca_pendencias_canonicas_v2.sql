-- Uma unica regra de pendencia para Agenda, Sol e relatorios.
-- A migration e aditiva: publica contratos v2 e deixa a assinatura antiga como
-- adaptador temporario. Ausencia de cobertura ou roster inseguro nunca vira
-- cobranca nominal nem mensagem de "Tudo fechado".

create or replace function public.fn_presenca_dados_frescos_interno_v1(
  p_unidade_id uuid,
  p_data_alvo date
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'unidade_id', c.unidade_id,
        'data_alvo', c.data_alvo,
        'run_id', c.run_id,
        'status', c.status,
        'publicavel',
          c.status = 'concluida'
          and c.snapshot_hash is not null
          and c.finalizada_em is not null
          and c.finalizada_em >= coalesce(
            (
              select max(ae.data_hora_fim)
              from public.aulas_emusys ae
              where ae.unidade_id = p_unidade_id
                and ae.data_aula = p_data_alvo
                and ae.data_hora_fim < now()
                and coalesce(ae.categoria, 'normal') = 'normal'
                and not coalesce(ae.cancelada, false)
                and ae.professor_id is not null
            ),
            p_data_alvo::timestamp at time zone 'America/Sao_Paulo'
          )
          and (
            p_data_alvo < (now() at time zone 'America/Sao_Paulo')::date
            or c.finalizada_em >= now() - interval '20 minutes'
          ),
        'snapshot_hash', c.snapshot_hash,
        'paginas_lidas', c.paginas_lidas,
        'aulas_lidas', c.aulas_lidas,
        'presencas_lidas', c.presencas_lidas,
        'heartbeat_em', c.heartbeat_em,
        'finalizada_em', c.finalizada_em
      )
      from public.presenca_sync_cobertura c
      where c.unidade_id = p_unidade_id
        and c.modo = 'presenca'
        and c.data_alvo = p_data_alvo
    ),
    jsonb_build_object(
      'unidade_id', p_unidade_id,
      'data_alvo', p_data_alvo,
      'status', 'sem_cobertura',
      'publicavel', false
    )
  );
$$;

-- Preserva a porta privada criada no checkpoint de cobertura. A regra passa a
-- morar no helper interno para que consumidores SECURITY DEFINER autorizados
-- nao precisem forjar a claim service_role.
create or replace function public.fn_presenca_dados_frescos_v1(
  p_unidade_id uuid,
  p_data_alvo date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and session_user::text not in ('postgres', 'service_role') then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  return public.fn_presenca_dados_frescos_interno_v1(p_unidade_id, p_data_alvo);
end;
$$;

revoke all on function public.fn_presenca_dados_frescos_interno_v1(uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function public.fn_presenca_dados_frescos_v1(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_presenca_dados_frescos_v1(uuid, date)
  to service_role;

create or replace function public.fn_presenca_pendencias_do_dia_v2(
  p_unidade_id uuid,
  p_data date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_frescor jsonb;
  v_status text;
  v_sincronizado_em timestamptz;
  v_pendencias jsonb := '[]'::jsonb;
  v_conflitos jsonb := '[]'::jsonb;
  v_revisoes jsonb := '[]'::jsonb;
  v_tem_revisao boolean := false;
  v_inicio_dia timestamptz := p_data::timestamp at time zone 'America/Sao_Paulo';
begin
  if p_unidade_id is null or p_data is null then
    raise exception 'UNIDADE_E_DATA_OBRIGATORIAS' using errcode = '22023';
  end if;

  if v_role <> 'service_role' and session_user::text not in (
    'postgres', 'service_role',
    'sol_acesso_restrito', 'lia_acesso_restrito', 'mila_acesso_restrito'
  ) then
    if v_role <> 'authenticated'
       or not (
         (select public.is_admin())
         or p_unidade_id in (select public.get_user_unidade_ids())
       ) then
      raise insufficient_privilege using message = 'UNIDADE_NAO_AUTORIZADA';
    end if;
  end if;

  if v_role = 'service_role' or session_user::text in ('postgres', 'service_role') then
    v_frescor := public.fn_presenca_dados_frescos_v1(p_unidade_id, p_data);
  else
    v_frescor := public.fn_presenca_dados_frescos_interno_v1(p_unidade_id, p_data);
  end if;

  v_sincronizado_em := nullif(v_frescor ->> 'finalizada_em', '')::timestamptz;

  select exists (
    select 1
    from public.aulas_emusys ae
    left join public.aula_roster_sync_estado re on re.aula_id = ae.id
    where ae.unidade_id = p_unidade_id
      and ae.data_aula = p_data
      and ae.data_hora_fim < now()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and not coalesce(ae.cancelada, false)
      and ae.professor_id is not null
      and (
        coalesce(re.estado, 'sem_fotografia') in ('incompleto', 'ambiguo', 'sem_fotografia')
        or re.sincronizado_em is null
        or re.sincronizado_em < v_inicio_dia
        or (v_sincronizado_em is not null and re.sincronizado_em > v_sincronizado_em)
      )
  ) into v_tem_revisao;

  if coalesce((v_frescor ->> 'publicavel')::boolean, false) is not true then
    v_status := 'dados_desatualizados';
  elsif v_tem_revisao then
    v_status := 'roster_em_revisao';
  else
    v_status := 'atualizados';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aula_emusys_id', x.aula_id,
    'estado', x.estado,
    'qtd_esperada', x.qtd_esperada,
    'qtd_recebida', x.qtd_recebida,
    'sincronizado_em', x.sincronizado_em
  ) order by x.aula_id), '[]'::jsonb)
  into v_revisoes
  from (
    select ae.id as aula_id,
           case
             when coalesce(re.estado, 'sem_fotografia') in ('incompleto', 'ambiguo', 'sem_fotografia')
               then coalesce(re.estado, 'sem_fotografia')
             else 'roster_desatualizado'
           end as estado,
           re.qtd_esperada,
           re.qtd_recebida,
           re.sincronizado_em
    from public.aulas_emusys ae
    left join public.aula_roster_sync_estado re on re.aula_id = ae.id
    where ae.unidade_id = p_unidade_id
      and ae.data_aula = p_data
      and ae.data_hora_fim < now()
      and coalesce(ae.categoria, 'normal') = 'normal'
      and not coalesce(ae.cancelada, false)
      and ae.professor_id is not null
      and (
        coalesce(re.estado, 'sem_fotografia') in ('incompleto', 'ambiguo', 'sem_fotografia')
        or re.sincronizado_em is null
        or re.sincronizado_em < v_inicio_dia
        or (v_sincronizado_em is not null and re.sincronizado_em > v_sincronizado_em)
      )
  ) x;

  if v_status = 'atualizados' then
    with candidatos as (
      select
        public.fn_presenca_slot_key_v2(
          r.aluno_id,
          ae.unidade_id,
          ae.professor_id,
          ae.data_hora_inicio,
          ae.data_hora_fim,
          ae.curso_nome
        ) as slot_key,
        r.aluno_id,
        ae.id as aula_emusys_id,
        ae.unidade_id,
        ae.professor_id,
        ae.data_hora_inicio,
        ae.data_hora_fim,
        ae.curso_nome,
        ae.turma_nome,
        row_number() over (
          partition by
            r.aluno_id, ae.unidade_id, ae.professor_id,
            ae.data_hora_inicio, ae.data_hora_fim,
            lower(btrim(coalesce(ae.curso_nome, '')))
          order by
            nullif(ae.matricula_disciplina_id, 0) nulls last,
            case when ae.tipo = 'turma' then 0 else 1 end,
            ae.id
        ) as posicao
      from public.vw_aula_roster_operacional_v1 r
      join public.aulas_emusys ae on ae.id = r.aula_emusys_id
      where ae.unidade_id = p_unidade_id
        and ae.data_aula = p_data
        and ae.data_hora_fim < now()
        and coalesce(ae.categoria, 'normal') = 'normal'
        and ae.professor_id is not null
        and public.fn_presenca_pendencia_elegivel(
          ae.unidade_id,
          r.aluno_id,
          ae.data_aula,
          ae.matricula_disciplina_id,
          ae.curso_nome
        )
        and not exists (
          select 1
          from public.aulas_emusys g
          where g.unidade_id = ae.unidade_id
            and g.professor_id = ae.professor_id
            and g.data_hora_inicio = ae.data_hora_inicio
            and g.data_hora_fim = ae.data_hora_fim
            and lower(btrim(coalesce(g.curso_nome, '')))
                = lower(btrim(coalesce(ae.curso_nome, '')))
            and (coalesce(g.cancelada, false) or coalesce(g.justificada, false))
        )
    ), pares as (
      select * from candidatos where posicao = 1
    ), enriquecidos as (
      select p.*,
             al.nome as aluno_nome,
             pr.nome as professor_nome,
             o.resultado_canonico,
             o.fecha_chamada,
             o.fonte_decisao,
             o.decidido_em,
             o.possui_conflito,
             o.regra_versao as ocorrencia_regra_versao
      from pares p
      join public.alunos al on al.id = p.aluno_id
      left join public.professores pr on pr.id = p.professor_id
      left join public.vw_presenca_ocorrencia_canonica_v2 o on o.slot_key = p.slot_key
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'slot_key', e.slot_key,
        'aula_emusys_id', e.aula_emusys_id,
        'aluno_id', e.aluno_id,
        'aluno_nome', e.aluno_nome,
        'professor_id', e.professor_id,
        'professor_nome', coalesce(e.professor_nome, '(sem professor)'),
        'curso_nome', coalesce(e.curso_nome, e.turma_nome, 'Aula'),
        'turma_nome', e.turma_nome,
        'hora', to_char(e.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'motivo', 'sem_resposta',
        'resultado_canonico', coalesce(e.resultado_canonico, 'indeterminado'),
        'fonte_decisao', coalesce(e.fonte_decisao, 'sem_registro')
      ) order by e.professor_nome, e.data_hora_inicio, e.aluno_nome)
        filter (where coalesce(e.fecha_chamada, false) = false and not coalesce(e.possui_conflito, false)),
        '[]'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object(
        'slot_key', e.slot_key,
        'aula_emusys_id', e.aula_emusys_id,
        'aluno_id', e.aluno_id,
        'aluno_nome', e.aluno_nome,
        'professor_id', e.professor_id,
        'professor_nome', coalesce(e.professor_nome, '(sem professor)'),
        'curso_nome', coalesce(e.curso_nome, e.turma_nome, 'Aula'),
        'turma_nome', e.turma_nome,
        'hora', to_char(e.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI'),
        'motivo', 'divergencia',
        'resultado_canonico', e.resultado_canonico,
        'fonte_decisao', e.fonte_decisao,
        'decidido_em', e.decidido_em,
        'detalhe', 'Decisoes de presenca conflitantes; revisar a ocorrencia canonica.'
      ) order by e.professor_nome, e.data_hora_inicio, e.aluno_nome)
        filter (where coalesce(e.possui_conflito, false)),
        '[]'::jsonb)
    into v_pendencias, v_conflitos
    from enriquecidos e;
  end if;

  return jsonb_build_object(
    'dados_status', v_status,
    'sincronizado_em', v_sincronizado_em,
    'regra_versao', 'presenca-v2',
    'pendencias', v_pendencias,
    'conflitos', v_conflitos,
    'revisoes_estruturais', v_revisoes
  );
end;
$$;

revoke all on function public.fn_presenca_pendencias_do_dia_v2(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_presenca_pendencias_do_dia_v2(uuid, date)
  to authenticated, service_role;

-- Compatibilidade: a assinatura anterior nao possui mais uma segunda regra.
create or replace function public.fn_presenca_pendencias_do_dia(
  p_unidade_id uuid,
  p_data date
)
returns table(
  motivo text,
  professor_nome text,
  curso_nome text,
  turma_nome text,
  hora text,
  aluno_nome text,
  detalhe text
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with envelope as (
    select public.fn_presenca_pendencias_do_dia_v2(p_unidade_id, p_data) as valor
  ), linhas as (
    select jsonb_array_elements(valor -> 'pendencias') as item from envelope
    union all
    select jsonb_array_elements(valor -> 'conflitos') as item from envelope
  )
  select
    item ->> 'motivo',
    item ->> 'professor_nome',
    item ->> 'curso_nome',
    item ->> 'turma_nome',
    item ->> 'hora',
    item ->> 'aluno_nome',
    item ->> 'detalhe'
  from linhas;
$$;

revoke all on function public.fn_presenca_pendencias_do_dia(uuid, date)
  from public, anon;
grant execute on function public.fn_presenca_pendencias_do_dia(uuid, date)
  to authenticated, service_role;

create or replace function public.get_agenda_dia_v2(
  p_data date,
  p_unidade_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_envelope jsonb;
  v_unidade record;
  v_item jsonb;
  v_status text := 'atualizados';
  v_sincronizado_em timestamptz;
  v_pendencias jsonb := '[]'::jsonb;
  v_conflitos jsonb := '[]'::jsonb;
  v_revisoes jsonb := '[]'::jsonb;
  v_aulas jsonb;
  v_ocorrencias jsonb := '[]'::jsonb;
  v_professores_ocorrencias jsonb := '[]'::jsonb;
begin
  if p_data is null then
    raise exception 'DATA_OBRIGATORIA' using errcode = '22023';
  end if;

  if p_unidade_id is not null then
    v_envelope := public.fn_presenca_pendencias_do_dia_v2(p_unidade_id, p_data);
  else
    if v_role <> 'service_role' and session_user::text not in ('postgres', 'service_role')
       and not (select public.is_admin()) then
      raise insufficient_privilege using message = 'CONSOLIDADO_REQUER_ADMIN';
    end if;

    for v_unidade in
      select distinct ae.unidade_id
      from public.aulas_emusys ae
      where ae.data_aula = p_data
        and ae.data_hora_fim < now()
        and coalesce(ae.categoria, 'normal') = 'normal'
        and not coalesce(ae.cancelada, false)
        and ae.professor_id is not null
    loop
      v_item := public.fn_presenca_pendencias_do_dia_v2(v_unidade.unidade_id, p_data);
      if v_item ->> 'dados_status' = 'dados_desatualizados' then
        v_status := 'dados_desatualizados';
      elsif v_item ->> 'dados_status' = 'roster_em_revisao' and v_status = 'atualizados' then
        v_status := 'roster_em_revisao';
      end if;
      if nullif(v_item ->> 'sincronizado_em', '') is not null then
        v_sincronizado_em := least(
          coalesce(v_sincronizado_em, (v_item ->> 'sincronizado_em')::timestamptz),
          (v_item ->> 'sincronizado_em')::timestamptz
        );
      end if;
      v_pendencias := v_pendencias || coalesce(v_item -> 'pendencias', '[]'::jsonb);
      v_conflitos := v_conflitos || coalesce(v_item -> 'conflitos', '[]'::jsonb);
      v_revisoes := v_revisoes || coalesce(v_item -> 'revisoes_estruturais', '[]'::jsonb);
    end loop;
    v_envelope := jsonb_build_object(
      'dados_status', v_status,
      'sincronizado_em', v_sincronizado_em,
      'regra_versao', 'presenca-v2',
      'pendencias', v_pendencias,
      'conflitos', v_conflitos,
      'revisoes_estruturais', v_revisoes
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
  into v_aulas
  from public.get_agenda_dia(p_data, p_unidade_id) g;

  -- Estado visual por ocorrência, sem nomes. O recibo só é associado quando o
  -- evento aplicado coincide em pessoa, aula, fonte, estado e instante; assim
  -- uma decisão antiga não recebe por engano o request_id de outro comando.
  if v_envelope ->> 'dados_status' = 'atualizados' then
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'slot_key', o.slot_key,
      'aluno_id', o.aluno_id,
      'ids_aulas_emusys', to_jsonb(o.ids_aulas_emusys),
      'resultado_canonico', o.resultado_canonico,
      'fonte_decisao', o.fonte_decisao,
      'decidido_em', o.decidido_em,
      'possui_conflito', o.possui_conflito,
      'request_id', recibo.request_id,
      'recibo_status', recibo.status
    )) order by o.data_hora_inicio, o.aluno_id, o.slot_key), '[]'::jsonb)
    into v_ocorrencias
    from public.vw_presenca_ocorrencia_canonica_v2 o
    left join lateral (
      select e.request_id, c.status
      from public.presenca_acao_eventos e
      join public.presenca_comandos c on c.request_id = e.request_id
      where e.tipo = 'item_aplicado'
        and e.aluno_id = o.aluno_id
        and e.aula_id = any(o.ids_aulas_emusys)
        and e.status_novo = o.resultado_canonico
        and e.fonte = o.fonte_decisao
        and o.decidido_em is not null
        and abs(extract(epoch from (e.criado_em - o.decidido_em))) <= 60
      order by abs(extract(epoch from (e.criado_em - o.decidido_em))), e.id desc
      limit 1
    ) recibo on true
    where o.data_aula = p_data
      and (p_unidade_id is null or o.unidade_id = p_unidade_id);

    -- O valor bruto `ausente` do professor tambem e default do Emusys. So vira
    -- estado operacional quando existe origem humana preservada na aula. O
    -- recibo e anexado pelo mesmo ledger append-only dos demais comandos.
    select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'aula_emusys_id', ae.id,
      'professor_id', ae.professor_id,
      'estado', case
        when lower(ae.professor_presenca) = 'presente' then 'presente'
        when lower(ae.professor_presenca) = 'ausente' then 'ausente'
        else 'indeterminado'
      end,
      'fonte', ae.professor_presenca_origem,
      'decidido_em', recibo.criado_em,
      'request_id', recibo.request_id,
      'recibo_status', recibo.status
    )) order by ae.data_hora_inicio, ae.id), '[]'::jsonb)
    into v_professores_ocorrencias
    from public.aulas_emusys ae
    left join lateral (
      select e.request_id, e.criado_em, c.status
      from public.presenca_acao_eventos e
      join public.presenca_comandos c on c.request_id = e.request_id
      where e.tipo = 'item_aplicado'
        and e.professor_id = ae.professor_id
        and e.status_novo = lower(ae.professor_presenca)
        and e.fonte = ae.professor_presenca_origem
        and (
          e.aula_id = ae.id
          or (
            e.aula_id is null
            and c.data_referencia = ae.data_aula
            and c.unidade_id = ae.unidade_id
          )
        )
      order by e.criado_em desc, e.id desc
      limit 1
    ) recibo on true
    where ae.data_aula = p_data
      and (p_unidade_id is null or ae.unidade_id = p_unidade_id)
      and ae.professor_id is not null
      and ae.professor_presenca_origem is not null;
  end if;

  return v_envelope || jsonb_build_object(
    'aulas', v_aulas,
    'ocorrencias', v_ocorrencias,
    'professores_ocorrencias', v_professores_ocorrencias
  );
end;
$$;

revoke all on function public.get_agenda_dia_v2(date, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_agenda_dia_v2(date, uuid)
  to authenticated, service_role;

create or replace function public.get_agenda_semana_v2(
  p_data_inicio date,
  p_unidade_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_resultado jsonb := '{}'::jsonb;
  v_data date;
  v_indice integer;
begin
  if p_data_inicio is null then
    raise exception 'DATA_INICIO_OBRIGATORIA' using errcode = '22023';
  end if;

  for v_indice in 0..5 loop
    v_data := p_data_inicio + v_indice;
    v_resultado := v_resultado || jsonb_build_object(
      v_data::text,
      public.get_agenda_dia_v2(v_data, p_unidade_id)
    );
  end loop;
  return v_resultado;
end;
$$;

revoke all on function public.get_agenda_semana_v2(date, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_agenda_semana_v2(date, uuid)
  to authenticated, service_role;

create or replace function public.fn_texto_relatorio_presenca(
  p_unidade_id uuid,
  p_data date
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unidade text;
  v_envelope jsonb;
  v_status text;
  v_txt text;
  v_item jsonb;
  v_qtd_pendencias integer;
  v_qtd_conflitos integer;
  v_sync timestamptz;
begin
  select nome into v_unidade from public.unidades where id = p_unidade_id;
  v_envelope := public.fn_presenca_pendencias_do_dia_v2(p_unidade_id, p_data);
  v_status := v_envelope ->> 'dados_status';
  v_sync := nullif(v_envelope ->> 'sincronizado_em', '')::timestamptz;

  v_txt := 'PRESENCA - PENDENCIAS' || E'\n'
    || upper(coalesce(v_unidade, '?')) || E'\n'
    || to_char(p_data, 'DD/MM/YYYY') || E'\n';

  if v_status = 'dados_desatualizados' then
    return v_txt || E'\n'
      || 'DADOS DE PRESENCA AINDA NAO PUBLICAVEIS.' || E'\n'
      || 'A sincronizacao do Emusys nao concluiu para este dia.' || E'\n'
      || 'Nenhuma pendencia nominal foi atribuida a equipe.' || E'\n';
  elsif v_status = 'roster_em_revisao' then
    return v_txt || E'\n'
      || 'ROSTER EM REVISAO ESTRUTURAL.' || E'\n'
      || 'A fotografia de alunos esta incompleta ou ambigua.' || E'\n'
      || 'Nenhuma pendencia nominal foi atribuida a equipe.' || E'\n';
  end if;

  v_txt := v_txt || 'Dados sincronizados às '
    || coalesce(to_char(v_sync at time zone 'America/Sao_Paulo', 'HH24:MI'), '--:--')
    || E'\n';
  v_qtd_pendencias := jsonb_array_length(v_envelope -> 'pendencias');
  v_qtd_conflitos := jsonb_array_length(v_envelope -> 'conflitos');

  if v_qtd_pendencias = 0 and v_qtd_conflitos = 0 then
    return v_txt || E'\n' || 'Tudo fechado. Nenhuma pendencia de presenca.' || E'\n';
  end if;

  if v_qtd_pendencias > 0 then
    v_txt := v_txt || E'\n' || 'SEM PRESENCA E SEM FALTA (' || v_qtd_pendencias || ')' || E'\n'
      || 'ninguem fechou a chamada - nao e falta do aluno' || E'\n';
    for v_item in select value from jsonb_array_elements(v_envelope -> 'pendencias')
    loop
      v_txt := v_txt || '- ' || (v_item ->> 'hora') || ' - '
        || (v_item ->> 'aluno_nome') || ' (' || (v_item ->> 'curso_nome') || ')' || E'\n';
    end loop;
  end if;

  if v_qtd_conflitos > 0 then
    v_txt := v_txt || E'\n' || 'RESPOSTAS QUE NAO BATEM (' || v_qtd_conflitos || ')' || E'\n';
    for v_item in select value from jsonb_array_elements(v_envelope -> 'conflitos')
    loop
      v_txt := v_txt || '- ' || (v_item ->> 'hora') || ' - '
        || (v_item ->> 'aluno_nome') || ' (' || (v_item ->> 'curso_nome') || ')' || E'\n';
    end loop;
  end if;

  return v_txt || E'\n' || 'Corrijam no app ou na agenda. O que ficar sem resposta continua aparecendo amanha.' || E'\n';
end;
$$;

revoke all on function public.fn_texto_relatorio_presenca(uuid, date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_texto_relatorio_presenca(uuid, date)
  to authenticated, service_role;

create or replace function public.fn_texto_relatorio_presenca_consolidado(p_data date)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_u record;
  v_corpo text := '';
  v_texto text;
  v_alguma_unidade boolean := false;
begin
  for v_u in
    select u.id as unidade_id, u.nome as unidade_nome
    from public.unidades u
    where exists (
      select 1 from public.aulas_emusys ae
      where ae.unidade_id = u.id
        and ae.data_aula = p_data
        and ae.data_hora_fim < now()
        and coalesce(ae.categoria, 'normal') = 'normal'
        and not coalesce(ae.cancelada, false)
        and ae.professor_id is not null
    )
    order by u.nome
  loop
    if not exists (
      select 1 from public.aulas_emusys ae
      where ae.unidade_id = v_u.unidade_id
        and ae.data_aula = p_data
        and ae.data_hora_fim < now()
        and coalesce(ae.categoria, 'normal') = 'normal'
        and not coalesce(ae.cancelada, false)
        and ae.professor_id is not null
    ) then
      continue;
    end if;
    v_alguma_unidade := true;
    v_texto := public.fn_texto_relatorio_presenca(v_u.unidade_id, p_data);
    v_corpo := v_corpo || E'\n' || v_texto;
  end loop;

  if not v_alguma_unidade then
    return null;
  end if;
  return 'PRESENCA - PENDENCIAS CONSOLIDADO' || E'\n'
    || to_char(p_data, 'DD/MM/YYYY') || E'\n' || v_corpo;
end;
$$;

revoke all on function public.fn_texto_relatorio_presenca_consolidado(date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_texto_relatorio_presenca_consolidado(date)
  to service_role;

-- O enfileirador continua sendo a unica porta de escrita e passa a registrar a
-- versao canonica no metadata. O corpo vem exclusivamente das funcoes acima.
create or replace function public.fn_enfileirar_relatorio_presenca(
  p_data date default (current_date - 1),
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_u record;
  v_d record;
  v_txt text;
  v_out jsonb := '[]'::jsonb;
  v_id bigint;
  v_teve_aula boolean;
begin
  for v_u in
    select distinct on (f.unidade_id)
           f.unidade_id, f.unidade_nome, f.grupo_nome, f.jid
    from public.fila_relatorios_sol_hermes f
    where f.grupo_nome ilike 'RELAT%DI%RIOS%'
      and f.status = 'enviada'
      and f.jid is not null
      and f.unidade_id is not null
    order by f.unidade_id, f.enviada_em desc
  loop
    select exists (
      select 1 from public.aulas_emusys ae
      where ae.unidade_id = v_u.unidade_id
        and ae.data_aula = p_data
        and ae.data_hora_fim < now()
        and coalesce(ae.categoria, 'normal') = 'normal'
        and not coalesce(ae.cancelada, false)
        and ae.professor_id is not null
    ) into v_teve_aula;
    if not v_teve_aula then
      v_out := v_out || jsonb_build_object(
        'unidade', v_u.unidade_nome, 'pulado', 'nenhuma aula neste dia');
      continue;
    end if;

    v_txt := public.fn_texto_relatorio_presenca(v_u.unidade_id, p_data);
    if p_dry_run then
      v_out := v_out || jsonb_build_object(
        'unidade', v_u.unidade_nome, 'grupo', v_u.grupo_nome,
        'jid', v_u.jid, 'texto', v_txt,
        'regra_versao', 'presenca-v2');
      continue;
    end if;
    if exists (
      select 1 from public.fila_relatorios_sol_hermes
      where tipo_relatorio = 'presenca_pendencias'
        and unidade_id = v_u.unidade_id
        and data_dia = p_data
        and status <> 'erro'
    ) then
      v_out := v_out || jsonb_build_object(
        'unidade', v_u.unidade_nome, 'pulado', 'ja enfileirado para este dia');
      continue;
    end if;
    insert into public.fila_relatorios_sol_hermes
      (tipo_relatorio, origem, unidade_id, unidade_nome, jid, grupo_nome,
       texto, status, agendada_para, data_dia, tentativas, metadata)
    values
      ('presenca_pendencias', 'auto_cron', v_u.unidade_id, v_u.unidade_nome,
       v_u.jid, v_u.grupo_nome, v_txt, 'sol_pendente', now(), p_data, 0,
       jsonb_build_object(
         'rota', 'sol_hermes_native',
         'fonte', 'fn_presenca_pendencias_do_dia_v2',
         'regra_versao', 'presenca-v2'))
    returning id into v_id;
    v_out := v_out || jsonb_build_object(
      'unidade', v_u.unidade_nome, 'grupo', v_u.grupo_nome, 'fila_id', v_id);
  end loop;

  v_txt := public.fn_texto_relatorio_presenca_consolidado(p_data);
  if v_txt is not null then
    for v_d in
      select d.nome, d.jid, d.caixa_id
      from public.whatsapp_destinatarios_relatorio d
      where d.tipo = 'presenca_pendencias_consolidado'
        and d.ativo
      order by d.id
    loop
      if p_dry_run then
        v_out := v_out || jsonb_build_object(
          'consolidado', v_d.nome, 'jid', v_d.jid,
          'caixa_id', v_d.caixa_id, 'texto', v_txt,
          'regra_versao', 'presenca-v2');
        continue;
      end if;
      if exists (
        select 1 from public.fila_relatorios_sol_hermes
        where tipo_relatorio = 'presenca_pendencias_consolidado'
          and jid = v_d.jid
          and data_dia = p_data
          and status <> 'erro'
      ) then
        v_out := v_out || jsonb_build_object(
          'consolidado', v_d.nome, 'pulado', 'ja enfileirado para este dia');
        continue;
      end if;
      insert into public.fila_relatorios_sol_hermes
        (tipo_relatorio, origem, unidade_id, unidade_nome, jid, grupo_nome,
         texto, status, agendada_para, data_dia, tentativas, metadata)
      values
        ('presenca_pendencias_consolidado', 'auto_cron', null, 'Consolidado',
         v_d.jid, v_d.nome, v_txt, 'sol_pendente', now(), p_data, 0,
         jsonb_build_object(
           'rota', case when v_d.caixa_id is null then 'sol_hermes_native' else 'uazapi_caixa' end,
           'caixa_id', v_d.caixa_id,
           'fonte', 'fn_presenca_pendencias_do_dia_v2',
           'regra_versao', 'presenca-v2'))
      returning id into v_id;
      v_out := v_out || jsonb_build_object(
        'consolidado', v_d.nome, 'fila_id', v_id, 'caixa_id', v_d.caixa_id);
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true, 'data', p_data, 'dry_run', p_dry_run,
    'regra_versao', 'presenca-v2', 'unidades', v_out);
end;
$$;

revoke all on function public.fn_enfileirar_relatorio_presenca(date, boolean)
  from public, anon, authenticated;
grant execute on function public.fn_enfileirar_relatorio_presenca(date, boolean)
  to service_role;

-- O wrapper antigo bloqueava TODAS as unidades quando uma cobertura falhava e,
-- por isso, impedia justamente a mensagem estrutural de atraso. O enfileirador
-- v2 decide unidade a unidade e nunca inclui nomes quando o dado nao e seguro.
create or replace function public.fn_enfileirar_relatorio_presenca_se_coberto_v1(
  p_data date default (current_date - 1)
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_data is null or p_data > current_date then
    raise exception using errcode = '22023', message = 'data de relatorio invalida';
  end if;
  return public.fn_enfileirar_relatorio_presenca(p_data, false);
end;
$$;

revoke all on function public.fn_enfileirar_relatorio_presenca_se_coberto_v1(date)
  from public, anon, authenticated, service_role;
grant execute on function public.fn_enfileirar_relatorio_presenca_se_coberto_v1(date)
  to service_role;

comment on function public.fn_presenca_pendencias_do_dia_v2(uuid, date) is
  'Envelope unico Agenda/Sol: pendencias e conflitos somente com cobertura concluida e roster seguro; revisoes estruturais nunca carregam nomes.';
comment on function public.get_agenda_dia_v2(date, uuid) is
  'Read model da Agenda acrescido do mesmo envelope de pendencias usado pela Sol; nao recalcula fechamento.';
