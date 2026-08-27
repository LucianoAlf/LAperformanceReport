-- Comparacao read-only entre o comportamento legado e a ocorrencia canonica.
-- A migration nao ativa consumidores, nao reescreve evidencias e nao executa
-- reparos. Os identificadores expostos nas amostras sao hashes redigidos.

create or replace function public.get_presenca_shadow_comparacao_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns table (
  unidade_id uuid,
  data_alvo date,
  contagem_v1 bigint,
  contagem_v2 bigint,
  delta bigint,
  duplicidade_emusys bigint,
  colisao_curso bigint,
  roster_fantasma bigint,
  precedencia_humana bigint,
  politica_temporal bigint,
  sync_incompleto bigint,
  sem_explicacao bigint,
  hash_v1 text,
  hash_v2 text,
  amostras_redigidas jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_unidade_id is null or p_data_inicio is null or p_data_fim is null
     or p_data_fim < p_data_inicio or p_data_fim - p_data_inicio > 120 then
    raise exception using errcode = '22023', message = 'janela shadow invalida';
  end if;

  return query
  with datas as (
    select d::date as data_alvo
      from generate_series(p_data_inicio, p_data_fim, interval '1 day') d
  ), raw_base as (
    select
      ap.id,
      ap.aluno_id,
      ap.unidade_id,
      coalesce(ap.professor_id, ae.professor_id) as professor_id,
      coalesce(ae.data_aula, ap.data_aula) as data_aula,
      coalesce(
        ae.data_hora_inicio,
        case when ap.horario_aula is not null then
          (ap.data_aula::timestamp + ap.horario_aula)
            at time zone 'America/Sao_Paulo'
        end
      ) as data_hora_inicio,
      coalesce(
        ae.data_hora_fim,
        case when ae.data_hora_inicio is not null and ae.duracao_minutos is not null
          then ae.data_hora_inicio + make_interval(mins => ae.duracao_minutos)
        end
      ) as data_hora_fim,
      coalesce(nullif(btrim(ae.curso_nome), ''), nullif(btrim(ap.curso_nome), ''), '') as curso_nome,
      ap.aula_emusys_id,
      coalesce(ae.cancelada, false) as aula_cancelada,
      coalesce(ae.justificada, false) as aula_justificada,
      lower(nullif(btrim(ap.status::text), '')) as status_legado,
      lower(nullif(btrim(ap.status_presenca), '')) as status_presenca,
      lower(nullif(btrim(ap.respondido_por::text), '')) as respondido_por,
      ap.respondido_em,
      lower(coalesce(
        nullif(btrim(ap.emusys_presenca_bruta), ''),
        case when ap.respondido_por::text in ('emusys', 'sistema')
          then nullif(btrim(ap.status::text), '') end
      )) as emusys_resultado,
      exists (
        select 1
          from public.aula_roster_sync_estado re
         where re.aula_id = ap.aula_emusys_id
           and re.estado = 'completo'
      ) and not exists (
        select 1
          from public.aula_alunos_emusys aa
         where aa.aula_emusys_id = ap.aula_emusys_id
           and aa.aluno_id = ap.aluno_id
           and aa.ativo_operacional
      ) as roster_fantasma
    from public.aluno_presenca ap
    left join public.aulas_emusys ae
      on ae.id = ap.aula_emusys_id
     and ae.unidade_id = ap.unidade_id
    where ap.unidade_id = p_unidade_id
      and coalesce(ae.data_aula, ap.data_aula) between p_data_inicio and p_data_fim
      and (ae.id is null or coalesce(ae.categoria, 'normal') = 'normal')
  ), raw_normalizada as (
    select
      b.*,
      b.professor_id is not null
        and b.data_hora_inicio is not null
        and b.data_hora_fim is not null
        and nullif(btrim(b.curso_nome), '') is not null as identidade_completa,
      b.respondido_por in (
        'agenda_secretaria', 'manual', 'professor_la_teacher',
        'fabio_audio', 'professor_whatsapp'
      ) and b.respondido_em is not null as fonte_humana,
      case
        when b.aula_cancelada or b.aula_justificada then null
        when b.respondido_por in (
          'agenda_secretaria', 'manual', 'professor_la_teacher',
          'fabio_audio', 'professor_whatsapp'
        ) and b.respondido_em is not null then
          case
            when b.status_presenca in ('presente', 'falta', 'falta_justificada')
              then b.status_presenca
            when b.status_legado = 'presente' then 'presente'
            when b.status_legado = 'ausente' then 'falta'
            else null
          end
        when b.status_presenca in ('presente', 'falta', 'falta_justificada')
          then b.status_presenca
        when b.status_legado = 'presente' then 'presente'
        when b.status_legado = 'ausente' then 'falta'
        when b.emusys_resultado = 'presente' then 'presente'
        when b.emusys_resultado = 'ausente' then 'falta'
        else null
      end as resultado_v1
    from raw_base b
  ), raw_chaves as (
    select
      n.*,
      case when n.identidade_completa then
        public.fn_presenca_slot_key_v2(
          n.aluno_id, n.unidade_id, n.professor_id,
          n.data_hora_inicio, n.data_hora_fim, n.curso_nome
        ) else 'incompleto:' || md5(n.id::text) end as slot_key,
      md5(jsonb_build_array(
        n.aluno_id, n.unidade_id::text, n.professor_id,
        extract(epoch from n.data_hora_inicio),
        extract(epoch from n.data_hora_fim)
      )::text) as slot_sem_curso
    from raw_normalizada n
  ), raw_slots as (
    select
      r.data_aula,
      r.slot_key,
      min(r.slot_sem_curso) as slot_sem_curso,
      count(*) as linhas_raw,
      count(*) filter (where r.identidade_completa and r.resultado_v1 is not null) as terminais_v1,
      array_agg(distinct r.resultado_v1 order by r.resultado_v1)
        filter (where r.resultado_v1 is not null) as resultados_v1,
      bool_or(r.roster_fantasma) as possui_roster_fantasma,
      bool_or(r.fonte_humana) as possui_humano,
      bool_or(
        r.fonte_humana and (
          (r.resultado_v1 = 'presente' and r.emusys_resultado = 'ausente')
          or (r.resultado_v1 in ('falta', 'falta_justificada') and r.emusys_resultado = 'presente')
        )
      ) as conflito_humano_emusys,
      bool_or(not r.fonte_humana and r.emusys_resultado = 'ausente') as possui_ausencia_emusys
    from raw_chaves r
    group by r.data_aula, r.slot_key
  ), colisoes as (
    select r.data_aula, r.slot_sem_curso
      from raw_chaves r
     where r.identidade_completa
     group by r.data_aula, r.slot_sem_curso
    having count(distinct lower(btrim(r.curso_nome))) > 1
  ), canon as (
    select o.*
      from public.vw_presenca_ocorrencia_canonica_v2 o
     where o.unidade_id = p_unidade_id
       and o.data_aula between p_data_inicio and p_data_fim
  ), sync_dia as (
    select
      d.data_alvo,
      exists (
        select 1
          from public.presenca_sync_cobertura sc
         where sc.unidade_id = p_unidade_id
           and sc.modo = 'presenca'
           and sc.data_alvo = d.data_alvo
           and sc.status = 'concluida'
           and sc.snapshot_hash is not null
      ) as sync_publicavel
    from datas d
  ), comparada as (
    select
      r.data_aula,
      r.slot_key,
      r.slot_sem_curso,
      r.linhas_raw,
      r.terminais_v1,
      coalesce(r.resultados_v1, '{}'::text[]) as resultados_v1,
      r.possui_roster_fantasma,
      r.conflito_humano_emusys,
      r.possui_ausencia_emusys,
      c.resultado_canonico,
      c.fonte_decisao,
      coalesce(c.resultado_canonico in ('presente', 'falta', 'falta_justificada'), false)::integer
        as terminal_v2,
      exists (
        select 1 from colisoes x
         where x.data_aula = r.data_aula and x.slot_sem_curso = r.slot_sem_curso
      ) as possui_colisao_curso,
      (
        r.terminais_v1 <> coalesce(
          (c.resultado_canonico in ('presente', 'falta', 'falta_justificada'))::integer, 0
        )
        or (
          c.resultado_canonico in ('presente', 'falta', 'falta_justificada')
          and not (c.resultado_canonico = any(coalesce(r.resultados_v1, '{}'::text[])))
        )
        or cardinality(coalesce(r.resultados_v1, '{}'::text[])) > 1
      ) as possui_diferenca
    from raw_slots r
    left join canon c on c.slot_key = r.slot_key
  ), comparada_classificada as (
    select
      c.*,
      (
        c.linhas_raw > 1
        or c.possui_roster_fantasma
        or c.conflito_humano_emusys
        or c.possui_colisao_curso
        or (
          c.possui_ausencia_emusys
          and (c.resultado_canonico = 'indeterminado'
               or c.fonte_decisao = 'emusys_politica_temporal')
        )
      ) as possui_explicacao,
      array_remove(array[
        case when c.linhas_raw > 1 then 'duplicidade_emusys' end,
        case when c.possui_colisao_curso then 'colisao_curso' end,
        case when c.possui_roster_fantasma then 'roster_fantasma' end,
        case when c.conflito_humano_emusys then 'precedencia_humana' end,
        case when c.possui_ausencia_emusys
          and (c.resultado_canonico = 'indeterminado'
               or c.fonte_decisao = 'emusys_politica_temporal')
          then 'politica_temporal' end,
        case when not s.sync_publicavel then 'sync_incompleto' end
      ], null) as razoes
    from comparada c
    join sync_dia s on s.data_alvo = c.data_aula
  ), raw_dia as (
    select
      r.data_aula,
      count(*) filter (where r.identidade_completa and r.resultado_v1 is not null) as contagem,
      md5(coalesce(string_agg(
        r.id::text || ':' || coalesce(r.resultado_v1, 'indeterminado'),
        '|' order by r.id
      ), '')) as hash_estado
    from raw_chaves r
    group by r.data_aula
  ), canon_dia as (
    select
      c.data_aula,
      count(*) filter (where c.resultado_canonico in ('presente', 'falta', 'falta_justificada')) as contagem,
      md5(coalesce(string_agg(
        c.slot_key || ':' || c.resultado_canonico,
        '|' order by c.slot_key
      ), '')) as hash_estado
    from canon c
    group by c.data_aula
  ), diagnostico_dia as (
    select
      c.data_aula,
      sum(greatest(c.linhas_raw - 1, 0)) as duplicidade_emusys,
      count(*) filter (where c.possui_roster_fantasma) as roster_fantasma,
      count(*) filter (where c.conflito_humano_emusys) as precedencia_humana,
      count(*) filter (
        where c.possui_ausencia_emusys
          and (c.resultado_canonico = 'indeterminado'
               or c.fonte_decisao = 'emusys_politica_temporal')
      ) as politica_temporal,
      count(*) filter (where c.possui_diferenca and not c.possui_explicacao) as sem_explicacao
    from comparada_classificada c
    group by c.data_aula
  ), amostras as (
    select
      x.data_aula,
      coalesce(jsonb_agg(jsonb_build_object(
        'slot_ref', left(x.slot_key, 12),
        'v1', x.resultados_v1,
        'v2', coalesce(x.resultado_canonico, 'ausente_na_projecao'),
        'razoes', x.razoes,
        'explicada', x.possui_explicacao
      ) order by x.slot_key), '[]'::jsonb) as itens
    from (
      select c.*, row_number() over (partition by c.data_aula order by c.slot_key) as rn
        from comparada_classificada c
       where c.possui_diferenca
    ) x
    where x.rn <= 20
    group by x.data_aula
  ), colisao_dia as (
    select data_aula, count(*) as quantidade from colisoes group by data_aula
  )
  select
    p_unidade_id,
    d.data_alvo,
    coalesce(rv.contagem, 0)::bigint,
    coalesce(cv.contagem, 0)::bigint,
    (coalesce(cv.contagem, 0) - coalesce(rv.contagem, 0))::bigint,
    coalesce(dx.duplicidade_emusys, 0)::bigint,
    coalesce(cc.quantidade, 0)::bigint,
    coalesce(dx.roster_fantasma, 0)::bigint,
    coalesce(dx.precedencia_humana, 0)::bigint,
    coalesce(dx.politica_temporal, 0)::bigint,
    (case when s.sync_publicavel then 0 else 1 end)::bigint,
    coalesce(dx.sem_explicacao, 0)::bigint,
    coalesce(rv.hash_estado, md5('')),
    coalesce(cv.hash_estado, md5('')),
    coalesce(a.itens, '[]'::jsonb)
  from datas d
  join sync_dia s using (data_alvo)
  left join raw_dia rv on rv.data_aula = d.data_alvo
  left join canon_dia cv on cv.data_aula = d.data_alvo
  left join diagnostico_dia dx on dx.data_aula = d.data_alvo
  left join colisao_dia cc on cc.data_aula = d.data_alvo
  left join amostras a on a.data_aula = d.data_alvo
  order by d.data_alvo;
end;
$$;

create or replace function public.get_presenca_previa_reparo_v2(
  p_unidade_id uuid,
  p_data_inicio date,
  p_data_fim date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_resultado jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise insufficient_privilege using message = 'service_role obrigatorio';
  end if;
  if p_unidade_id is null or p_data_inicio is null or p_data_fim is null
     or p_data_fim < p_data_inicio or p_data_fim - p_data_inicio > 120 then
    raise exception using errcode = '22023', message = 'janela de previa invalida';
  end if;

  with roster as (
    select
      md5(aa.id::text || ':' || aa.aula_emusys_id::text || ':' || aa.aluno_id::text) as ref,
      ae.data_aula,
      'soft_inativar'::text as acao,
      'ausente_no_run_completo_atual'::text as razao
    from public.aula_alunos_emusys aa
    join public.aulas_emusys ae on ae.id = aa.aula_emusys_id
    join public.aula_roster_sync_estado re on re.aula_id = aa.aula_emusys_id
    where aa.unidade_id = p_unidade_id
      and ae.data_aula between p_data_inicio and p_data_fim
      and aa.ativo_operacional
      and re.estado = 'completo'
      and aa.ultimo_run_visto is distinct from re.run_id
  ), snapshots as (
    select
      md5(re.aula_id::text || ':' || re.snapshot_hash) as ref,
      ae.data_aula,
      'corrigir_estado_snapshot'::text as acao,
      case
        when re.estado = 'completo' then 'completo_com_contagem_incoerente'
        when re.estado = 'vazio_confirmado' then 'vazio_com_contagem_nao_zero'
        else 'estado_terminal_incompativel'
      end as razao
    from public.aula_roster_sync_estado re
    join public.aulas_emusys ae on ae.id = re.aula_id
    where re.unidade_id = p_unidade_id
      and ae.data_aula between p_data_inicio and p_data_fim
      and (
        (re.estado = 'completo' and (re.qtd_esperada <= 0 or re.qtd_esperada <> re.qtd_recebida))
        or (re.estado = 'vazio_confirmado' and (re.qtd_esperada <> 0 or re.qtd_recebida <> 0))
      )
  ), gemeas as (
    select
      left(o.slot_key, 12) as ref,
      o.data_aula,
      'reconciliar_na_projecao'::text as acao,
      'multiplos_ids_emusys_mesmo_slot_sem_reescrever_evidencia'::text as razao
    from public.vw_presenca_ocorrencia_canonica_v2 o
    where o.unidade_id = p_unidade_id
      and o.data_aula between p_data_inicio and p_data_fim
      and cardinality(o.ids_aulas_emusys) > 1
  ), humanas as (
    select
      ap.id,
      coalesce(ap.status_presenca, ap.status::text, '') as estado,
      ap.respondido_por::text as fonte,
      ap.respondido_em
    from public.aluno_presenca ap
    left join public.aulas_emusys ae
      on ae.id = ap.aula_emusys_id
     and ae.unidade_id = ap.unidade_id
    where ap.unidade_id = p_unidade_id
      and coalesce(ae.data_aula, ap.data_aula) between p_data_inicio and p_data_fim
      and lower(coalesce(ap.respondido_por::text, '')) in (
        'agenda_secretaria', 'manual', 'professor_la_teacher',
        'fabio_audio', 'professor_whatsapp'
      )
      and ap.respondido_em is not null
      and (
        lower(coalesce(ap.status_presenca, '')) in ('presente', 'falta', 'falta_justificada')
        or lower(coalesce(ap.status::text, '')) in ('presente', 'ausente')
      )
  ), integridade as (
    select
      count(*) as quantidade,
      md5(coalesce(string_agg(
        id::text || ':' || estado || ':' || fonte || ':' || respondido_em::text,
        '|' order by id
      ), '')) as hash_estado
    from humanas
  )
  select jsonb_build_object(
    'dry_run', true,
    'unidade_id', p_unidade_id,
    'periodo', jsonb_build_object('inicio', p_data_inicio, 'fim', p_data_fim),
    'acoes', jsonb_build_object(
      'vinculos_roster_soft_inativar', coalesce((
        select jsonb_agg(to_jsonb(r) order by r.data_aula, r.ref) from roster r
      ), '[]'::jsonb),
      'estados_snapshot_corrigir', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.data_aula, s.ref) from snapshots s
      ), '[]'::jsonb),
      'gemeas_reconciliar', coalesce((
        select jsonb_agg(to_jsonb(g) order by g.data_aula, g.ref) from gemeas g
      ), '[]'::jsonb),
      'funcoes_live_only_versionar', '[]'::jsonb
    ),
    'integridade_decisoes_humanas', jsonb_build_object(
      'antes', jsonb_build_object('quantidade', i.quantidade, 'hash', i.hash_estado),
      'depois', jsonb_build_object('quantidade', i.quantidade, 'hash', i.hash_estado),
      'alteracao_prevista', false
    ),
    'backfill_presenca_falta', false
  ) into v_resultado
  from integridade i;

  return v_resultado;
end;
$$;

revoke all on function public.get_presenca_shadow_comparacao_v2(uuid, date, date)
  from public, anon, authenticated, service_role;
revoke all on function public.get_presenca_previa_reparo_v2(uuid, date, date)
  from public, anon, authenticated, service_role;
grant execute on function public.get_presenca_shadow_comparacao_v2(uuid, date, date)
  to service_role;
grant execute on function public.get_presenca_previa_reparo_v2(uuid, date, date)
  to service_role;

comment on function public.get_presenca_shadow_comparacao_v2(uuid, date, date) is
  'Compara v1 e v2 por unidade/dia, classifica deltas conhecidos e redige amostras. Read-only e service-role only.';
comment on function public.get_presenca_previa_reparo_v2(uuid, date, date) is
  'Previa read-only: roster soft-inativo, snapshot incoerente, gemeas na projecao e integridade byte-estavel das decisoes humanas.';
