-- 2026-10-05 — Corrige dois furos do espelho de presenca medidos pelo agente
-- do LA Teacher/Fabio (autorizado pelo Alf):
--
-- (1) vw_presenca_pendencia cobrava vinculo ja tombado pela reconciliacao:
--     aula_alunos_emusys.ativo_operacional=false (ausente_snapshot_completo /
--     roster_vazio_confirmado) seguia na fila porque o join nao filtrava a
--     flag. Medido: 262 das 482 linhas da view eram vinculos mortos.
--     Consumidores: fabio_presencas_pendentes_professor,
--     app_coordenacao_em_aberto, app_coordenacao_professor_detalhe — todos de
--     cobranca de chamada; a Sol/leitura canonica passam por
--     vw_aula_roster_operacional_v1, que ja filtra. vw_registro_pendencia
--     (conteudo) ja filtrava — esta view era a unica com o furo.
--
-- (2) reconciliar_grade_snapshot_emusys_core_v3 so tombava aula ausente do
--     Emusys quando a janela era futura (p_data_inicio >= hoje). Aula apagada
--     no passado nunca era marcada. Agora o candidato negativo cobre tambem a
--     janela de cobranca (45d): presenca sync por dia ja reconcilia rosters
--     do passado — faltava so o cancelamento logico da aula. Presenca humana
--     segue preservada (cancelada e logica, linha e aluno_presenca intactos).
--     Passado > 45d continua intocado.

create or replace view public.vw_presenca_pendencia as
select
  ae.unidade_id,
  u.nome as unidade_nome,
  ae.professor_id,
  p.nome as professor_nome,
  ae.id as aula_id,
  ae.tipo,
  ae.data_aula,
  ae.data_hora_inicio,
  ae.data_hora_fim,
  to_char(ae.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
  ae.curso_nome,
  ae.turma_nome,
  r.aluno_id,
  al.nome as aluno_nome,
  split_part(btrim(al.nome), ' ', 1) as aluno_primeiro_nome,
  coalesce(adm.justificada, false) as justificada,
  floor(extract(epoch from (now() - ae.data_hora_fim)) / 86400)::integer as dias_em_atraso
from public.aulas_emusys ae
join public.aula_alunos_emusys r
  on r.aula_emusys_id = ae.id
 and r.aluno_id is not null
 and r.ativo_operacional
join public.alunos al on al.id = r.aluno_id
join public.unidades u on u.id = ae.unidade_id
left join public.professores p on p.id = ae.professor_id
left join public.aluno_presenca_administrativo adm
  on adm.aula_emusys_id = ae.id
 and adm.aluno_id = r.aluno_id
where ae.id = public.fn_aula_operacional_id(ae.id)
  and coalesce(ae.cancelada, false) = false
  and ae.professor_id is not null
  and ae.data_hora_fim < now()
  and ae.data_aula >= current_date - 45
  and public.fn_presenca_pendencia_elegivel(
    ae.unidade_id,
    r.aluno_id,
    ae.data_aula,
    ae.matricula_disciplina_id,
    ae.curso_nome
  )
  and not exists (
    select 1
      from public.aluno_presenca ap
     where ap.aula_emusys_id = ae.id
       and ap.aluno_id = r.aluno_id
       and public.fn_presenca_fecha_chamada(
         coalesce(
           ap.status_presenca,
           case ap.status
             when 'presente' then 'presente'
             when 'ausente' then 'falta'
             else null
           end
         ),
         ap.respondido_por
       )
  );

comment on view public.vw_presenca_pendencia is
  'Fila canonica de chamada pendente por aluno-aula. 2026-10-05: passa a exigir vinculo operacional (r.ativo_operacional) — vinculo tombado pela reconciliacao de roster nao cobra mais chamada.';

revoke all on public.vw_presenca_pendencia from anon, authenticated;

CREATE OR REPLACE FUNCTION public.reconciliar_grade_snapshot_emusys_core_v3(p_run_id uuid, p_unidade_id uuid, p_data_inicio date, p_data_fim date, p_snapshot jsonb, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_snapshot_emusys_ids integer[];
  v_snapshot_aula_ids integer[];
  v_cancelamento_aula_ids integer[] := array[]::integer[];
  v_reativados integer := 0;
  v_inativados integer := 0;
  v_aulas_canceladas integer := 0;
  v_estados_gravados integer := 0;
  v_detalhe jsonb;
begin
  if p_run_id is null or p_unidade_id is null or p_data_inicio is null
     or p_data_fim is null or p_data_fim < p_data_inicio or p_dry_run is null then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'janela_ou_unidade_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;
  if p_data_inicio < v_hoje - 120 or p_data_fim > v_hoje + 60 then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'janela_fora_do_limite_operacional',
      'alteracoes_aplicadas', 0
    );
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array'
     or jsonb_array_length(p_snapshot) = 0 then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_vazia_ou_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_snapshot) item(valor)
     where jsonb_typeof(item.valor) <> 'object'
        or coalesce(item.valor ->> 'emusys_id', '') !~ '^[1-9][0-9]*$'
        or coalesce(item.valor ->> 'estado', '') not in (
          'completo', 'vazio_confirmado', 'incompleto', 'ambiguo'
        )
        or coalesce(item.valor ->> 'qtd_esperada', '') !~ '^[0-9]+$'
        or coalesce(item.valor ->> 'qtd_recebida', '') !~ '^[0-9]+$'
        or jsonb_typeof(item.valor -> 'aluno_chaves') <> 'array'
        or exists (
          select 1
            from jsonb_array_elements(item.valor -> 'aluno_chaves') chave(valor)
           where jsonb_typeof(chave.valor) <> 'string'
              or btrim(chave.valor #>> '{}') = ''
        )
  ) or exists (
    select 1
      from jsonb_array_elements(p_snapshot) item(valor)
     group by (item.valor ->> 'emusys_id')
    having count(*) > 1
  ) then
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_com_estrutura_invalida',
      'alteracoes_aplicadas', 0
    );
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_snapshot) item(valor)
     where (
       item.valor ->> 'estado' = 'completo'
       and (
         (item.valor ->> 'qtd_esperada')::integer <= 0
         or (item.valor ->> 'qtd_esperada')::integer
            <> (item.valor ->> 'qtd_recebida')::integer
         or jsonb_array_length(item.valor -> 'aluno_chaves')
            <> (item.valor ->> 'qtd_recebida')::integer
         or exists (
           select 1
             from jsonb_array_elements_text(item.valor -> 'aluno_chaves') chave(valor)
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
    return jsonb_build_object(
      'status', 'abortado',
      'motivo', 'fotografia_estado_incoerente',
      'alteracoes_aplicadas', 0
    );
  end if;

  select array_agg((item.valor ->> 'emusys_id')::integer order by item.ord)
    into v_snapshot_emusys_ids
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord);

  -- Captura a identidade local antes de esperar por qualquer row lock. Uma
  -- aula inserida enquanto esperamos nao pode mudar retroativamente o retrato.
  select array_agg(a.id order by item.ord)
    into v_snapshot_aula_ids
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    left join public.aulas_emusys a
      on a.unidade_id = p_unidade_id
     and a.emusys_id = (item.valor ->> 'emusys_id')::integer
     and a.data_aula between p_data_inicio and p_data_fim;

  -- Congela tambem o universo negativo. Uma aula criada depois desta captura
  -- nao fazia parte da comparacao com o Emusys e nao pode ser cancelada.
  -- 2026-10-05: o corte "somente futuro" foi substituido pela janela de
  -- cobranca (45 dias, a mesma de vw_presenca_pendencia). Aula apagada no
  -- Emusys ha poucos dias seguia viva e cobrando chamada do professor;
  -- o passado profundo (>45d) continua intocado como historico.
  select coalesce(array_agg(a.id order by a.id), array[]::integer[])
    into v_cancelamento_aula_ids
    from public.aulas_emusys a
   where a.unidade_id = p_unidade_id
     and a.categoria = 'normal'
     and not coalesce(a.cancelada, false)
     and a.data_aula between p_data_inicio and p_data_fim
     and a.data_aula >= v_hoje - 45
     and not (a.emusys_id = any(v_snapshot_emusys_ids));

  -- Ordem deterministica para todos os registros que existiam no retrato,
  -- inclusive candidatos negativos que talvez sejam cancelados.
  perform a.id
    from public.aulas_emusys a
   where a.id = any(
     coalesce(v_snapshot_aula_ids, array[]::integer[])
     || coalesce(v_cancelamento_aula_ids, array[]::integer[])
   )
   order by a.id
   for update;

  -- Se um registro capturado desapareceu ou mudou de escopo antes do lock,
  -- ele deixa de ser elegivel. IDs que eram nulos continuam nulos.
  select array_agg(
    case
      when a.id is not null
       and a.unidade_id = p_unidade_id
       and a.emusys_id = (item.valor ->> 'emusys_id')::integer
       and a.data_aula between p_data_inicio and p_data_fim
      then capturada.aula_id
      else null
    end
    order by item.ord
  )
    into v_snapshot_aula_ids
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    cross join lateral (
      values (v_snapshot_aula_ids[item.ord::integer])
    ) capturada(aula_id)
    left join public.aulas_emusys a on a.id = capturada.aula_id;

  if not p_dry_run then
    with snapshot_itens as materialized (
      select
        item.ord::integer as indice,
        item.valor,
        v_snapshot_aula_ids[item.ord::integer] as aula_id,
        item.valor ->> 'estado' as estado,
        (item.valor ->> 'qtd_esperada')::integer as qtd_esperada,
        (item.valor ->> 'qtd_recebida')::integer as qtd_recebida
      from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    )
    insert into public.aula_roster_sync_estado(
      aula_id, unidade_id, run_id, estado, qtd_esperada, qtd_recebida,
      snapshot_hash, sincronizado_em, atualizado_em
    )
    select
      s.aula_id, p_unidade_id, p_run_id, s.estado,
      s.qtd_esperada, s.qtd_recebida, md5(s.valor::text),
      clock_timestamp(), clock_timestamp()
    from snapshot_itens s
    where s.aula_id is not null
    on conflict (aula_id) do update set
      unidade_id = excluded.unidade_id,
      run_id = excluded.run_id,
      estado = excluded.estado,
      qtd_esperada = excluded.qtd_esperada,
      qtd_recebida = excluded.qtd_recebida,
      snapshot_hash = excluded.snapshot_hash,
      sincronizado_em = excluded.sincronizado_em,
      atualizado_em = excluded.atualizado_em;
    get diagnostics v_estados_gravados = row_count;
  else
    select count(*)::integer
      into v_estados_gravados
      from unnest(v_snapshot_aula_ids) aula_id
     where aula_id is not null;
  end if;

  with snapshot_itens as materialized (
    select
      v_snapshot_aula_ids[item.ord::integer] as aula_id,
      item.valor ->> 'estado' as estado,
      item.valor -> 'aluno_chaves' as aluno_chaves
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
  )
  select count(*)::integer
    into v_reativados
    from snapshot_itens s
    join public.aula_alunos_emusys aa on aa.aula_emusys_id = s.aula_id
   where s.estado = 'completo'
     and not aa.ativo_operacional
     and exists (
       select 1
         from jsonb_array_elements_text(s.aluno_chaves) chave(valor)
        where chave.valor = aa.aluno_chave
     );

  if p_dry_run then
    with snapshot_itens as materialized (
      select
        v_snapshot_aula_ids[item.ord::integer] as aula_id,
        item.valor ->> 'estado' as estado,
        item.valor -> 'aluno_chaves' as aluno_chaves
      from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    )
    select count(*)::integer
      into v_inativados
      from snapshot_itens s
      join public.aula_alunos_emusys aa on aa.aula_emusys_id = s.aula_id
     where aa.ativo_operacional
       and (
         s.estado = 'vazio_confirmado'
         or (
           s.estado = 'completo'
           and not exists (
             select 1
               from jsonb_array_elements_text(s.aluno_chaves) chave(valor)
              where chave.valor = aa.aluno_chave
           )
         )
       );
  else
    -- Um unico UPDATE marca os presentes no snapshot e reativa quem voltou.
    with snapshot_itens as materialized (
      select
        v_snapshot_aula_ids[item.ord::integer] as aula_id,
        item.valor ->> 'estado' as estado,
        item.valor -> 'aluno_chaves' as aluno_chaves
      from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    )
    update public.aula_alunos_emusys aa set
      ativo_operacional = true,
      ultimo_run_visto = p_run_id,
      inativado_em = case when aa.ativo_operacional then aa.inativado_em else null end,
      inativado_motivo = case
        when aa.ativo_operacional then aa.inativado_motivo else null
      end,
      updated_at = case
        when aa.ativo_operacional then aa.updated_at else clock_timestamp()
      end
    from snapshot_itens s
    where aa.aula_emusys_id = s.aula_id
      and s.estado = 'completo'
      and exists (
        select 1
          from jsonb_array_elements_text(s.aluno_chaves) chave(valor)
         where chave.valor = aa.aluno_chave
      );

    with snapshot_itens as materialized (
      select
        v_snapshot_aula_ids[item.ord::integer] as aula_id,
        item.valor ->> 'estado' as estado,
        item.valor -> 'aluno_chaves' as aluno_chaves
      from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    )
    update public.aula_alunos_emusys aa set
      ativo_operacional = false,
      inativado_em = clock_timestamp(),
      inativado_motivo = case
        when s.estado = 'vazio_confirmado' then 'roster_vazio_confirmado'
        else 'ausente_snapshot_completo'
      end,
      updated_at = clock_timestamp()
    from snapshot_itens s
    where aa.aula_emusys_id = s.aula_id
      and aa.ativo_operacional
      and (
        s.estado = 'vazio_confirmado'
        or (
          s.estado = 'completo'
          and not exists (
            select 1
              from jsonb_array_elements_text(s.aluno_chaves) chave(valor)
             where chave.valor = aa.aluno_chave
          )
        )
      );
    get diagnostics v_inativados = row_count;
  end if;

  if p_dry_run then
    select count(*)::integer
      into v_aulas_canceladas
      from public.aulas_emusys a
     where a.unidade_id = p_unidade_id
       and a.categoria = 'normal'
       and not coalesce(a.cancelada, false)
       and a.data_aula between p_data_inicio and p_data_fim
       and a.data_aula >= v_hoje - 45
       and a.id = any(v_cancelamento_aula_ids)
       and not (a.emusys_id = any(v_snapshot_emusys_ids));
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
      and a.data_aula >= v_hoje - 45
      and a.id = any(v_cancelamento_aula_ids)
      and not (a.emusys_id = any(v_snapshot_emusys_ids));
    get diagnostics v_aulas_canceladas = row_count;
  end if;

  select coalesce(jsonb_agg(
    case
      when capturada.aula_id is null then jsonb_build_object(
        'emusys_aula_id', (item.valor ->> 'emusys_id')::integer,
        'estado', item.valor ->> 'estado',
        'acao', 'aula_local_ausente'
      )
      else jsonb_build_object(
        'aula_local_id', capturada.aula_id,
        'emusys_aula_id', (item.valor ->> 'emusys_id')::integer,
        'estado', item.valor ->> 'estado',
        'acao', case
          when item.valor ->> 'estado' in ('incompleto', 'ambiguo')
            then 'revisao_estrutural'
          when item.valor ->> 'estado' = 'vazio_confirmado'
            then 'inativar_roster_vazio'
          else 'conciliar_roster_completo'
        end
      )
    end order by item.ord
  ), '[]'::jsonb)
    into v_detalhe
    from jsonb_array_elements(p_snapshot) with ordinality item(valor, ord)
    cross join lateral (
      values (v_snapshot_aula_ids[item.ord::integer])
    ) capturada(aula_id);

  return jsonb_build_object(
    'status', 'ok',
    'dry_run', p_dry_run,
    'run_id', p_run_id,
    'unidade_id', p_unidade_id,
    'estados_gravados', v_estados_gravados,
    'vinculos_reativados', v_reativados,
    'vinculos_inativados', v_inativados,
    'vinculos_removidos', 0,
    'vinculos_removidos_aplicados', 0,
    'aulas_canceladas', v_aulas_canceladas,
    'aulas_canceladas_aplicadas', case
      when p_dry_run then 0 else v_aulas_canceladas
    end,
    'alteracoes_aplicadas', case
      when p_dry_run then 0
      else v_reativados + v_inativados + v_aulas_canceladas
    end,
    'detalhe', v_detalhe
  );
end;
$function$

