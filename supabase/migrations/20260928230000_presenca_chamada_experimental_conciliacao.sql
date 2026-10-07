-- P25: presenca de experimental registrada na NOSSA chamada conta como evidencia.
--
-- Bug medido em 28/09/2026 (Recreio, set/2026): a experimental da Alessandra da
-- Silva Borges (lead_experimentais 2947, Canto, 19/09 10h, prof. Erick) caiu na
-- fila `realizada_sem_presenca_confirmada` — mas a presenca FOI marcada na
-- agenda do Report (`app_registrar_presenca_experimental` propagou leads com
-- etapa 7 + experimental_realizada=true no mesmo instante, 14:10:26 UTC).
--
-- Por que a conciliacao nao via: ela so confia em `aluno_presenca` (exige
-- aluno_id — lead nao tem) ou em `emusys_experimentais_raw` (zero linhas para
-- ela). A escrita da chamada vai para `le.status`, o MESMO campo que o funil e
-- o sync Emusys escrevem — sem proveniencia, a RPC nao consegue distinguir
-- "presenca marcada na chamada" de "status marcado no funil" e prefere auditar.
--
-- O que muda:
-- 1. `lead_experimentais` ganha chamada_em/chamada_por/chamada_status/
--    chamada_origem — quem marcou presenca/falta pela chamada e quando.
-- 2. `app_registrar_presenca_experimental` grava a proveniencia.
-- 3. `get_conciliacao_experimentais_snapshot_v1` trata presenca marcada pela
--    chamada como evidencia confirmada (mesmo peso do raw Emusys): classifica
--    como experimental_realizada_confirmada e entra no denominador da taxa.
--    ⚠️ Status que volta para 'agendada' depois anula a evidencia da chamada —
--    ultima decisao humana vence.
-- 4. Backfill cirurgico: so marca chamada_* onde a propagacao leads<->le no
--    mesmo instante prova escrita pela chamada/pre-atendimento E nao existe raw
--    Emusys correspondente (se raw existisse, ja estava confirmada).
-- 5. O funil (`salvarCampoExperimental`, modal de matricula "Teve experimental?")
--    NAO grava proveniencia — segue caindo na fila para auditoria.

-- ============================================================
-- 1. Colunas de proveniencia
-- ============================================================

alter table public.lead_experimentais
  add column if not exists chamada_em timestamptz,
  add column if not exists chamada_por integer,
  add column if not exists chamada_status text,
  add column if not exists chamada_origem text;

comment on column public.lead_experimentais.chamada_em is
  'Quando a chamada do Report marcou presenca/falta desta experimental. NULL = nunca passou pela chamada.';
comment on column public.lead_experimentais.chamada_por is
  'usuarios.id de quem marcou na chamada (Agenda). NULL quando a marcacao veio de tela sem resolucao de usuario.';
comment on column public.lead_experimentais.chamada_status is
  'Ultima decisao da chamada: experimental_realizada | experimental_faltou. Vale como evidencia de presenca na conciliacao.';
comment on column public.lead_experimentais.chamada_origem is
  'Tela que marcou: chamada_agenda | pre_atendimento | retroativo_assinatura_propagacao.';

-- ============================================================
-- 2. RPC da chamada grava a proveniencia
-- ============================================================

create or replace function public.app_registrar_presenca_experimental(
  p_experimental_id integer,
  p_status text -- 'experimental_realizada' ou 'experimental_faltou'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id integer;
  v_experimental public.lead_experimentais%rowtype;
  v_status_anterior text;
begin
  select id into v_usuario_id
  from public.usuarios
  where auth_user_id = auth.uid() and coalesce(ativo, true)
  limit 1;

  if v_usuario_id is null then
    raise exception 'sem_permissao_chamada' using errcode = '42501';
  end if;

  if p_status not in ('experimental_realizada', 'experimental_faltou') then
    raise exception 'status_invalido' using errcode = '22023';
  end if;

  select * into v_experimental
  from public.lead_experimentais
  where id = p_experimental_id;

  if not found then
    raise exception 'experimental_nao_encontrada' using errcode = 'P0002';
  end if;

  if not public.usuario_tem_permissao(v_usuario_id, 'agenda.chamada', v_experimental.unidade_id) then
    raise exception 'sem_permissao_unidade' using errcode = '42501';
  end if;

  if v_experimental.status::text = p_status then
    -- Mesmo status, mas garante a proveniencia se a marcacao original veio de
    -- outra tela (funil, matricula) e a chamada esta confirmando agora.
    if v_experimental.chamada_em is null then
      update public.lead_experimentais
      set chamada_em = now(),
          chamada_por = v_usuario_id,
          chamada_status = p_status,
          chamada_origem = 'chamada_agenda'
      where id = p_experimental_id;
    end if;
    return jsonb_build_object('atualizado', false, 'status', p_status);
  end if;

  v_status_anterior := v_experimental.status::text;

  update public.lead_experimentais
  set status = p_status,
      chamada_em = now(),
      chamada_por = v_usuario_id,
      chamada_status = p_status,
      chamada_origem = 'chamada_agenda',
      updated_at = now()
  where id = p_experimental_id;

  if v_experimental.lead_id is not null then
    update public.leads
    set experimental_realizada = (p_status = 'experimental_realizada'),
        faltou_experimental = (p_status = 'experimental_faltou'),
        status = p_status,
        etapa_pipeline_id = case when p_status = 'experimental_realizada' then 7 else 9 end,
        updated_at = now()
    where id = v_experimental.lead_id;
  end if;

  return jsonb_build_object(
    'atualizado', true,
    'status_anterior', v_status_anterior,
    'status_novo', p_status,
    'lead_id', v_experimental.lead_id
  );
end;
$$;

revoke all on function public.app_registrar_presenca_experimental(integer, text) from public, anon;
grant execute on function public.app_registrar_presenca_experimental(integer, text) to authenticated;

-- ============================================================
-- 3. Backfill: chamada comprovada pela assinatura de propagacao
-- ============================================================
-- A RPC propaga leads e lead_experimentais no mesmo instante; o AgendaTab do
-- pre-atendimento faz os dois writes sequenciais (segundos de distancia). O
-- funil e a matricula NAO propagam desse jeito, e o sync Emusys so age onde
-- existe linha raw — por isso exigimos NOT EXISTS em emusys_experimentais_raw:
-- se raw existe, a linha ja estava confirmada e o backfill seria cosmetico.

update public.lead_experimentais le
set chamada_em = le.updated_at,
    chamada_status = le.status::text,
    chamada_origem = 'retroativo_assinatura_propagacao'
from public.leads l
where l.id = le.lead_id
  and le.status::text in ('experimental_realizada', 'experimental_faltou')
  and le.chamada_em is null
  and coalesce(l.experimental_realizada, false) = (le.status::text = 'experimental_realizada')
  and coalesce(l.faltou_experimental, false) = (le.status::text = 'experimental_faltou')
  and l.etapa_pipeline_id = case when le.status::text = 'experimental_realizada' then 7 else 9 end
  and le.updated_at > le.created_at
  and l.updated_at > l.created_at
  and abs(extract(epoch from (l.updated_at - le.updated_at))) < 10
  and not exists (
    select 1
    from public.emusys_experimentais_raw r
    where r.unidade_id = le.unidade_id
      and r.data_aula = le.data_experimental
      and (
        r.lead_experimental_id = le.id
        or (le.emusys_lead_id is not null and r.emusys_lead_id = le.emusys_lead_id)
        or r.lead_id = le.lead_id
      )
  );

-- ============================================================
-- 4. Conciliacao: presenca da nossa chamada vale como evidencia
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_conciliacao_experimentais_snapshot_v1(p_unidade_id uuid, p_ano integer, p_mes integer, p_periodo text DEFAULT 'mensal'::text, p_data date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
with periodo as (
  select
    case when lower(coalesce(p_periodo, 'mensal')) = 'diario' then 'diario' else 'mensal' end as tipo,
    case
      when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then coalesce(p_data, make_date(p_ano, p_mes, 1))
      else make_date(p_ano, p_mes, 1)
    end as inicio,
    case
      when lower(coalesce(p_periodo, 'mensal')) = 'diario'
      then coalesce(p_data, make_date(p_ano, p_mes, 1)) + interval '1 day'
      else make_date(p_ano, p_mes, 1) + interval '1 month'
    end as fim_exclusivo,
    (
      case
        when lower(coalesce(p_periodo, 'mensal')) = 'diario'
        then coalesce(p_data, make_date(p_ano, p_mes, 1))
        else make_date(p_ano, p_mes, 1)
      end
    ) >= date '2026-07-01' as regra_nova_p11
),
unidades_alvo as (
  select u.id as unidade_id, u.nome as unidade_nome
  from public.unidades u
  where u.ativo = true
    and (p_unidade_id is null or u.id = p_unidade_id)
),
eventos as (
  select
    le.id,
    le.lead_id,
    le.emusys_lead_id,
    le.nome_aluno,
    le.unidade_id,
    ua.unidade_nome,
    le.data_experimental,
    le.horario_experimental,
    le.status,
    lower(coalesce(le.status, '')) as status_norm,
    le.aluno_id,
    le.professor_experimental_id,
    p.nome as professor_nome,
    le.curso_interesse_id,
    c.nome as curso_nome,
    l.nome as lead_nome,
    l.telefone as lead_telefone,
    l.status as lead_status,
    l.aluno_id as lead_aluno_id,
    l.converteu as lead_converteu,
    l.data_conversao,
    le.chamada_em,
    le.chamada_origem,
    al_vinc.nome as aluno_vinculado_nome,
    al_vinc.status as aluno_vinculado_status,
    coalesce(al_lead.id, al_origem.id) as aluno_sugerido_id,
    coalesce(al_lead.nome, al_origem.nome) as aluno_sugerido_nome,
    coalesce(al_lead.status, al_origem.status) as aluno_sugerido_status,
    dh.decisao as decisao_humana,
    dh.incluir_denominador_exp_mat,
    dh.contar_conversao_exp_mat,
    dh.aluno_id_decidido,
    dh.motivo as decisao_motivo,
    dh.decidido_por,
    dh.decidido_em,
    coalesce(dh.aluno_id_decidido, le.aluno_id, l.aluno_id, al_origem.id) as aluno_taxa_id,
    al_taxa.nome as aluno_taxa_nome,
    al_taxa.status as aluno_taxa_status,
    al_taxa.data_matricula as aluno_taxa_data_matricula,
    al_taxa.is_segundo_curso as aluno_taxa_segundo_curso,
    al_taxa.valor_passaporte as aluno_taxa_valor_passaporte,
    c_taxa.is_projeto_banda as aluno_taxa_curso_banda,
    c_taxa.nome as aluno_taxa_curso_nome,
    tm_taxa.codigo as aluno_taxa_tipo_codigo,
    coalesce(raw_emusys.presenca_raw_confirmada, false) as presenca_raw_confirmada,
    coalesce(raw_emusys.falta_raw_confirmada, false) as falta_raw_confirmada,
    raw_emusys.emusys_raw_ids,
    -- P25: a chamada do Report marca presenca de lead experimental (Fase 1, 11/08)
    -- mas so escrevia `status` — o mesmo campo do funil/sync. `chamada_status`
    -- registra quem passou pela chamada; so conta se o status atual seguir na
    -- familia realizada (reverter para agendada desfaz a evidencia).
    coalesce(
      le.chamada_status = 'experimental_realizada'
      and lower(coalesce(le.status, '')) in ('experimental_realizada','convertido','matriculado'),
      false
    ) as presenca_chamada_confirmada,
    exists (
      select 1
      from public.lead_experimentais le_reagendada
      where le_reagendada.lead_id = le.lead_id
        and le_reagendada.id <> le.id
        and (
          le_reagendada.data_experimental,
          coalesce(le_reagendada.horario_experimental, time '00:00')
        ) > (
          le.data_experimental,
          coalesce(le.horario_experimental, time '00:00')
        )
        and lower(coalesce(le_reagendada.status, '')) in (
          'experimental_agendada',
          'experimental_realizada',
          'convertido',
          'matriculado',
          'experimental_faltou',
          'faltou',
          'no_show',
          'no-show',
          'cancelada',
          'cancelado',
          'experimental_cancelada'
        )
    ) as substituida_por_reagendamento,
    (
      exists (
        select 1
        from public.aluno_presenca ap
        join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
        where ap.aluno_id = le.aluno_id
          and ap.data_aula = le.data_experimental
          and ap.unidade_id = le.unidade_id
          and lower(coalesce(ap.status, '')) = 'presente'
          and lower(coalesce(ae.categoria, '')) = 'experimental'
          and coalesce(ae.cancelada, false) = false
      )
      or coalesce(raw_emusys.presenca_raw_confirmada, false)
      or coalesce(
        le.chamada_status = 'experimental_realizada'
        and lower(coalesce(le.status, '')) in ('experimental_realizada','convertido','matriculado'),
        false
      )
    ) as presenca_confirmada,
    (
      exists (
        select 1
        from public.aluno_presenca ap
        join public.aulas_emusys ae on ae.id = ap.aula_emusys_id
        where ap.aluno_id = coalesce(dh.aluno_id_decidido, le.aluno_id, l.aluno_id, al_origem.id)
          and ap.data_aula = le.data_experimental
          and ap.unidade_id = le.unidade_id
          and lower(coalesce(ap.status, '')) = 'presente'
          and lower(coalesce(ae.categoria, '')) = 'experimental'
          and coalesce(ae.cancelada, false) = false
      )
      or coalesce(raw_emusys.presenca_raw_confirmada, false)
      or coalesce(
        le.chamada_status = 'experimental_realizada'
        and lower(coalesce(le.status, '')) in ('experimental_realizada','convertido','matriculado'),
        false
      )
    ) as presenca_confirmada_taxa,
    coalesce(raw_emusys.experimental_interna_emusys, false) as experimental_interna_emusys,
    (
      l.aluno_id is not null
      or al_origem.id is not null
      or coalesce(l.converteu, false) = true
      or l.data_conversao is not null
      or lower(coalesce(l.status, '')) in ('convertido', 'matriculado')
    ) as sinal_conversao
  from public.lead_experimentais le
  join unidades_alvo ua on ua.unidade_id = le.unidade_id
  cross join periodo pr
  left join public.leads l on l.id = le.lead_id
  left join public.alunos al_vinc on al_vinc.id = le.aluno_id
  left join public.alunos al_lead on al_lead.id = l.aluno_id
  left join public.alunos al_origem on al_origem.lead_origem_id = le.lead_id
  left join public.lead_experimentais_decisoes_humanas dh on dh.lead_experimental_id = le.id
  left join public.alunos al_taxa on al_taxa.id = coalesce(dh.aluno_id_decidido, le.aluno_id, l.aluno_id, al_origem.id)
  left join public.tipos_matricula tm_taxa on tm_taxa.id = al_taxa.tipo_matricula_id
  left join public.cursos c_taxa on c_taxa.id = al_taxa.curso_id
  left join lateral (
    select
      bool_or(
        r.situacao_operacional in ('presente', 'matriculado')
        or (
          r.situacao_operacional in ('sem_status', 'desconhecida')
          and lower(coalesce(r.presenca_emusys, '')) = 'presente'
        )
      ) as presenca_raw_confirmada,
      bool_or(
        r.situacao_operacional = 'faltou'
        or (
          r.situacao_operacional in ('sem_status', 'desconhecida')
          and lower(coalesce(r.presenca_emusys, '')) in ('ausente', 'faltou')
        )
      ) as falta_raw_confirmada,
      array_agg(r.id order by r.id) as emusys_raw_ids,
      bool_or(
        r.emusys_lead_id is null
        and r.emusys_aluno_id is not null
        -- P10C: so e interno se a pessoa NAO converteu no mes (sem matricula nova E sem passaporte)
        and not exists (
          select 1 from public.alunos a_conv
          where a_conv.unidade_id = r.unidade_id
            and (
              (r.aluno_id is not null and a_conv.id = r.aluno_id)
              or a_conv.emusys_student_id = r.emusys_aluno_id::text
            )
            and (
              (a_conv.data_matricula >= (select inicio::date from periodo)
               and a_conv.data_matricula < (select fim_exclusivo::date from periodo))
              or coalesce(a_conv.valor_passaporte, 0) > 0
            )
        )
      ) as experimental_interna_emusys
    from public.emusys_experimentais_raw r
    where r.snapshot_ativo is true
      and r.unidade_id = le.unidade_id
      and r.data_aula = le.data_experimental
      and (
        (
          r.emusys_lead_id is not null
          and (
            r.emusys_lead_id = le.emusys_lead_id
            or r.emusys_lead_id = l.emusys_lead_id
          )
        )
        or (
          r.emusys_aluno_id is not null
          and exists (
            select 1
            from public.alunos a_identidade
            where a_identidade.unidade_id = r.unidade_id
              and a_identidade.emusys_student_id = r.emusys_aluno_id::text
              and a_identidade.id = coalesce(
                dh.aluno_id_decidido,
                le.aluno_id,
                l.aluno_id,
                al_origem.id
              )
          )
        )
        -- Compatibilidade somente por chaves relacionais legadas materializadas.
        or r.lead_experimental_id = le.id
        or (le.lead_id is not null and r.lead_id = le.lead_id)
        or (
          r.aluno_id is not null
          and r.aluno_id = coalesce(
            dh.aluno_id_decidido,
            le.aluno_id,
            l.aluno_id,
            al_origem.id
          )
        )
      )
      and (
        r.horario_aula = le.horario_experimental
        or r.horario_aula is null
        or le.horario_experimental is null
      )
  ) raw_emusys on true
  left join public.professores p on p.id = le.professor_experimental_id
  left join public.cursos c on c.id = le.curso_interesse_id
  where le.data_experimental >= pr.inicio::date
    and le.data_experimental < pr.fim_exclusivo::date
),
classificados as (
  select
    e.*,
    case
      when e.experimental_interna_emusys then 'experimental_interna_emusys'
      when e.decisao_humana in ('realizada_sem_matricula_confirmada', 'realizada_com_matricula_confirmada') then 'experimental_realizada_confirmada'
      when e.decisao_humana = 'experimental_faltou_confirmada' then 'experimental_faltou'
      when e.decisao_humana = 'duplicidade_reagendamento_ignorar' then 'ignorada_decisao_humana'
      when e.decisao_humana = 'matricula_direta_sem_experimental' then 'matricula_direta'
      when e.decisao_humana in ('responsavel_sem_aluno', 'pendente_cadastro_nao_encontrado', 'aluno_excluido_pos_matricula', 'revisar_manual') then 'pendente_conciliacao'
      when e.substituida_por_reagendamento and not e.presenca_raw_confirmada and not e.falta_raw_confirmada then 'ignorada_reagendamento_emusys'
      when e.presenca_raw_confirmada or e.presenca_chamada_confirmada then 'experimental_realizada_confirmada'
      when e.falta_raw_confirmada and not e.presenca_raw_confirmada then 'experimental_faltou'
      when e.status_norm in ('cancelada','cancelado','experimental_cancelada') then 'experimental_cancelada'
      when e.status_norm in ('experimental_faltou','faltou','no_show','no-show') then 'experimental_faltou'
      when e.status_norm = 'experimental_agendada' then 'experimental_agendada'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is not null and e.presenca_confirmada_taxa then 'experimental_realizada_confirmada'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is null and e.sinal_conversao then 'pendente_conciliacao'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and not e.presenca_confirmada_taxa then 'realizada_sem_presenca_confirmada'
      else 'pendente_conciliacao'
    end as etapa_canonica,
    case
      when e.experimental_interna_emusys then 'remanejamento_interno_emusys'
      when e.decisao_humana is not null then e.decisao_humana
      when e.substituida_por_reagendamento and not e.presenca_raw_confirmada and not e.falta_raw_confirmada then 'substituida_por_reagendamento'
      when e.presenca_raw_confirmada then 'presenca_emusys_raw_confirmada'
      when e.presenca_chamada_confirmada then 'presenca_chamada_agenda_confirmada'
      when e.falta_raw_confirmada and not e.presenca_raw_confirmada then 'falta_emusys_raw_confirmada'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is null and e.sinal_conversao then 'sem_aluno_vinculado_com_sinal_conversao'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is not null and not e.presenca_confirmada_taxa then 'aluno_vinculado_sem_presenca_experimental'
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and not e.sinal_conversao then 'realizada_sem_conversao_aparente'
      when e.status_norm = 'experimental_agendada' then 'aguardando_aula'
      when e.status_norm in ('experimental_faltou','faltou','no_show','no-show') then 'falta_operacional'
      when e.status_norm in ('cancelada','cancelado','experimental_cancelada') then 'cancelada_operacional'
      else 'revisar_manual'
    end as motivo_fila,
    case
      when e.experimental_interna_emusys then false
      when e.decisao_humana in ('realizada_sem_matricula_confirmada', 'realizada_com_matricula_confirmada') then true
      when e.presenca_raw_confirmada or e.presenca_chamada_confirmada then true
      when e.status_norm in ('experimental_realizada','convertido','matriculado') and e.aluno_taxa_id is not null and e.presenca_confirmada_taxa then true
      else false
    end as incluir_taxa_exp_mat,
    case
      when e.experimental_interna_emusys then false
      when e.contar_conversao_exp_mat = true then true
      when (select regra_nova_p11 from periodo) then (
        e.presenca_confirmada_taxa
        and e.aluno_taxa_id is not null
        and e.aluno_taxa_data_matricula is not null
        and e.aluno_taxa_data_matricula >= (select inicio from periodo)
        and e.aluno_taxa_data_matricula < (select fim_exclusivo from periodo)
        and lower(coalesce(e.aluno_taxa_status, '')) not in ('excluido', 'excluida', 'cancelado', 'cancelada')
        and coalesce(e.aluno_taxa_segundo_curso, false) = false
        and coalesce(e.aluno_taxa_valor_passaporte, 0) > 0
        and coalesce(e.aluno_taxa_curso_banda, false) = false
        and lower(coalesce(e.aluno_taxa_curso_nome, '')) not like '%banda%'
        and lower(coalesce(e.aluno_taxa_curso_nome, '')) not like '%canto coral%'
        and upper(coalesce(e.aluno_taxa_tipo_codigo, '')) not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'SEGUNDO_CURSO', 'TRANSFERENCIA')
      )
      when e.presenca_confirmada_taxa
        and e.aluno_taxa_id is not null
        and e.aluno_taxa_data_matricula is not null
        and lower(coalesce(e.aluno_taxa_status, '')) <> 'excluido'
      then true
      else false
    end as contar_taxa_exp_mat
  from eventos e
),
raw_por_unidade as (
  select
    ua.unidade_id,
    count(r.*) filter (where r.situacao_operacional in ('presente', 'matriculado'))::int as raw_realizadas_emusys,
    count(r.*) filter (
      where r.situacao_operacional in ('presente', 'matriculado')
        and coalesce(raw_flags.experimental_interna_emusys, false)
    )::int as raw_internas_emusys,
    count(r.*) filter (
      where r.situacao_operacional in ('presente', 'matriculado')
        and not coalesce(raw_flags.experimental_interna_emusys, false)
        and not coalesce(raw_decisao.excluir_denominador_decisao, false)
    )::int as raw_realizadas_emusys_comercial,
    count(r.*) filter (
      where r.situacao_operacional in ('presente', 'matriculado')
        and coalesce(raw_decisao.excluir_denominador_decisao, false)
    )::int as raw_excluidas_decisao,
    count(r.*) filter (
      where r.situacao_operacional = 'faltou'
        and not coalesce(raw_flags.experimental_interna_emusys, false)
        and not coalesce(raw_decisao.excluir_denominador_decisao, false)
    )::int as raw_faltas_emusys,
    count(r.*) filter (
      where r.situacao_operacional = 'cancelada'
        and not coalesce(raw_flags.experimental_interna_emusys, false)
        and not coalesce(raw_decisao.excluir_denominador_decisao, false)
    )::int as raw_canceladas_emusys,
    count(distinct a.id) filter (
      where r.situacao_operacional in ('presente', 'matriculado')
        and not coalesce(raw_flags.experimental_interna_emusys, false)
        and not coalesce(raw_decisao.excluir_denominador_decisao, false)
        and a.id is not null
        and lower(coalesce(a.status, '')) <> 'excluido'
        and a.data_matricula >= (select inicio::date from periodo)
        and a.data_matricula < (select fim_exclusivo::date from periodo)
        and coalesce(a.valor_passaporte, 0) > 0
        and case
          when (select regra_nova_p11 from periodo) then (
            coalesce(a.is_segundo_curso, false) = false
            and coalesce(c_raw.is_projeto_banda, false) = false
            and lower(coalesce(c_raw.nome, '')) not like '%banda%'
            and lower(coalesce(c_raw.nome, '')) not like '%canto coral%'
            and upper(coalesce(tm_raw.codigo, '')) not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'SEGUNDO_CURSO', 'TRANSFERENCIA')
          )
          else true
        end
    )::int as raw_conversoes_exp_mat
  from unidades_alvo ua
  left join public.emusys_experimentais_raw r
    on r.snapshot_ativo is true
   and r.unidade_id = ua.unidade_id
   and r.data_aula >= (select inicio::date from periodo)
   and r.data_aula < (select fim_exclusivo::date from periodo)
  left join lateral (
    select (
      r.emusys_lead_id is null
      and r.emusys_aluno_id is not null
      -- P10C: so e interno se a pessoa NAO converteu no mes (sem matricula nova E sem passaporte)
      and not exists (
        select 1 from public.alunos a_conv
        where a_conv.unidade_id = r.unidade_id
          and (
            (r.aluno_id is not null and a_conv.id = r.aluno_id)
            or a_conv.emusys_student_id = r.emusys_aluno_id::text
          )
          and (
            (a_conv.data_matricula >= (select inicio::date from periodo)
             and a_conv.data_matricula < (select fim_exclusivo::date from periodo))
            or coalesce(a_conv.valor_passaporte, 0) > 0
          )
      )
    ) as experimental_interna_emusys
  ) raw_flags on true
  left join lateral (
    select
      coalesce(dh.incluir_denominador_exp_mat = false, false) as excluir_denominador_decisao
    from public.lead_experimentais le_raw
    left join public.leads l_raw on l_raw.id = le_raw.lead_id
    left join public.lead_experimentais_decisoes_humanas dh
      on dh.lead_experimental_id = le_raw.id
    where le_raw.unidade_id = r.unidade_id
      and le_raw.data_experimental = r.data_aula
      and (
        (
          r.emusys_lead_id is not null
          and (
            r.emusys_lead_id = le_raw.emusys_lead_id
            or r.emusys_lead_id = l_raw.emusys_lead_id
          )
        )
        or (
          r.emusys_aluno_id is not null
          and exists (
            select 1
            from public.alunos a_identidade
            where a_identidade.unidade_id = r.unidade_id
              and a_identidade.emusys_student_id = r.emusys_aluno_id::text
              and (
                a_identidade.id = le_raw.aluno_id
                or a_identidade.id = l_raw.aluno_id
                or a_identidade.lead_origem_id = le_raw.lead_id
              )
          )
        )
        -- Compatibilidade somente por chaves relacionais legadas materializadas.
        or r.lead_experimental_id = le_raw.id
        or (le_raw.lead_id is not null and r.lead_id = le_raw.lead_id)
        or (le_raw.aluno_id is not null and r.aluno_id = le_raw.aluno_id)
      )
      and (
        r.horario_aula = le_raw.horario_experimental
        or r.horario_aula is null
        or le_raw.horario_experimental is null
      )
    order by
      case
        when r.emusys_lead_id is not null then 1
        when r.emusys_aluno_id is not null then 2
        when r.lead_experimental_id = le_raw.id then 3
        when le_raw.lead_id is not null and r.lead_id = le_raw.lead_id then 4
        else 5
      end,
      le_raw.id desc
    limit 1
  ) raw_decisao on true
  left join lateral (
    select a_match.*
    from public.alunos a_match
    where a_match.unidade_id = r.unidade_id
      and (
        (r.aluno_id is not null and a_match.id = r.aluno_id)
        or (
          r.emusys_aluno_id is not null
          and a_match.emusys_student_id = r.emusys_aluno_id::text
        )
      )
    order by (a_match.id = r.aluno_id) desc nulls last, a_match.id
    limit 1
  ) a on true
  left join public.tipos_matricula tm_raw on tm_raw.id = a.tipo_matricula_id
  left join public.cursos c_raw on c_raw.id = a.curso_id
  group by ua.unidade_id
),
classificados_por_unidade as (
  select
    ua.unidade_id,
    case
      when (select regra_nova_p11 from periodo)
      then count(distinct c.aluno_taxa_id) filter (where c.incluir_taxa_exp_mat and c.contar_taxa_exp_mat)
      else count(c.*) filter (where c.incluir_taxa_exp_mat and c.contar_taxa_exp_mat)
    end::int as conversoes_classificadas
  from unidades_alvo ua
  left join classificados c on c.unidade_id = ua.unidade_id
  group by ua.unidade_id
),
conversoes_por_unidade as (
  select
    r.unidade_id,
    greatest(
      coalesce(c.conversoes_classificadas, 0),
      coalesce(r.raw_conversoes_exp_mat, 0)
    )::int as conversoes_exp_mat
  from raw_por_unidade r
  left join classificados_por_unidade c on c.unidade_id = r.unidade_id
),
resumo_base as (
  select
    coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0)::int as raw_realizadas_emusys,
    coalesce((select sum(raw_realizadas_emusys_comercial) from raw_por_unidade), 0)::int as raw_realizadas_emusys_comercial,
    coalesce((select sum(raw_internas_emusys) from raw_por_unidade), 0)::int as raw_internas_emusys,
    coalesce((select sum(raw_excluidas_decisao) from raw_por_unidade), 0)::int as raw_excluidas_decisao,
    coalesce((select sum(raw_faltas_emusys) from raw_por_unidade), 0)::int as raw_faltas_emusys,
    coalesce((select sum(raw_canceladas_emusys) from raw_por_unidade), 0)::int as raw_canceladas_emusys,
    coalesce((select sum(raw_conversoes_exp_mat) from raw_por_unidade), 0)::int as raw_conversoes_exp_mat,
    count(*) filter (where etapa_canonica = 'experimental_agendada')::int as experimentais_agendadas,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(raw_realizadas_emusys_comercial) from raw_por_unidade), 0)::int
      else count(*) filter (where etapa_canonica = 'experimental_realizada_confirmada')::int
    end as experimentais_realizadas_confirmadas,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(raw_faltas_emusys) from raw_por_unidade), 0)::int
      else count(*) filter (where etapa_canonica = 'experimental_faltou')::int
    end as experimentais_faltaram,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(raw_canceladas_emusys) from raw_por_unidade), 0)::int
      else count(*) filter (where etapa_canonica = 'experimental_cancelada')::int
    end as experimentais_canceladas,
    count(*) filter (where etapa_canonica = 'matricula_direta')::int as matriculas_diretas,
    count(*) filter (where etapa_canonica = 'ignorada_decisao_humana')::int as ignoradas_por_decisao,
    count(*) filter (where etapa_canonica = 'ignorada_reagendamento_emusys')::int as ignoradas_por_reagendamento,
    count(*) filter (where etapa_canonica = 'pendente_conciliacao')::int as pendentes_conciliacao,
    count(*) filter (where etapa_canonica = 'realizada_sem_presenca_confirmada')::int as realizadas_sem_presenca_confirmada,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(raw_realizadas_emusys_comercial) from raw_por_unidade), 0)::int
      else count(*) filter (where status_norm in ('experimental_realizada','convertido','matriculado'))::int
    end as realizadas_status_operacional,
    count(*) filter (where decisao_humana is not null)::int as decisoes_humanas,
    count(*) filter (where contar_conversao_exp_mat = true)::int as conversoes_confirmadas_decisao,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(raw_realizadas_emusys_comercial) from raw_por_unidade), 0)::int
      else count(*) filter (where incluir_taxa_exp_mat)::int
    end as denominador_taxa_exp_mat,
    case
      when coalesce((select sum(raw_realizadas_emusys) from raw_por_unidade), 0) > 0
      then coalesce((select sum(conversoes_exp_mat) from conversoes_por_unidade), 0)::int
      else count(*) filter (where incluir_taxa_exp_mat and contar_taxa_exp_mat)::int
    end as conversoes_exp_mat_canonicas
  from classificados
),
resumo as (
  select
    rb.*,
    (rb.pendentes_conciliacao + rb.realizadas_sem_presenca_confirmada)::int as pendencias_taxa_exp_mat,
    (rb.pendentes_conciliacao + rb.realizadas_sem_presenca_confirmada = 0)::boolean as taxa_exp_mat_liberada,
    case
      when rb.denominador_taxa_exp_mat > 0
      then round(rb.conversoes_exp_mat_canonicas::numeric / rb.denominador_taxa_exp_mat * 100, 1)
      else null
    end as taxa_exp_mat_canonica,
    case
      when rb.pendentes_conciliacao + rb.realizadas_sem_presenca_confirmada = 0 then 'liberada_p02y_raw_emusys_denominador'
      else 'bloqueada_pendencias_conciliacao'
    end as taxa_exp_mat_status
  from resumo_base rb
),
filas as (
  select *
  from classificados
  where etapa_canonica in (
    'pendente_conciliacao',
    'realizada_sem_presenca_confirmada'
  )
  order by data_experimental desc nulls last, horario_experimental desc nulls last, id desc
  limit 250
)
select jsonb_build_object(
  'periodo', jsonb_build_object(
    'tipo', (select tipo from periodo),
    'inicio', (select inicio::date from periodo),
    'fim_exclusivo', (select fim_exclusivo::date from periodo)
  ),
  'resumo', (select to_jsonb(resumo) from resumo),
  'fonte_taxa_exp_mat', jsonb_build_object(
    'status', 'p11_numerador_comercial_canonico_pessoa_unica',
    'denominador', 'experimental realizada no raw Emusys, removendo remanejamento interno de aluno ja cadastrado que NAO converteu no mes e decisoes humanas que nao entram no denominador comercial; fallback para conciliacao/funil',
    'numerador', 'p/ periodos >= 2026-07-01: pessoa unica com passaporte pago + matricula comercial canonica (nao 2o curso/banda/coral/bolsista) na mesma competencia, ou decisao humana confirmada; p/ periodos anteriores mantido o calculo legado (nao reabre meses fechados)',
    'publicavel_quando', 'pendencias_taxa_exp_mat = 0'
  ),
  'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id,
      'lead_id', f.lead_id,
      'emusys_lead_id', f.emusys_lead_id,
      'nome_aluno', f.nome_aluno,
      'lead_nome', f.lead_nome,
      'lead_telefone', f.lead_telefone,
      'unidade_id', f.unidade_id,
      'unidade_nome', f.unidade_nome,
      'data_experimental', f.data_experimental,
      'horario_experimental', f.horario_experimental,
      'status_operacional', f.status,
      'etapa_canonica', f.etapa_canonica,
      'motivo_fila', f.motivo_fila,
      'professor_nome', f.professor_nome,
      'curso_nome', f.curso_nome,
      'aluno_id', f.aluno_id,
      'aluno_vinculado_nome', f.aluno_vinculado_nome,
      'aluno_vinculado_status', f.aluno_vinculado_status,
      'aluno_sugerido_id', f.aluno_sugerido_id,
      'aluno_sugerido_nome', f.aluno_sugerido_nome,
      'aluno_sugerido_status', f.aluno_sugerido_status,
      'aluno_taxa_id', f.aluno_taxa_id,
      'aluno_taxa_nome', f.aluno_taxa_nome,
      'aluno_taxa_status', f.aluno_taxa_status,
      'presenca_confirmada', f.presenca_confirmada_taxa,
      'presenca_raw_confirmada', f.presenca_raw_confirmada,
      'presenca_chamada_confirmada', f.presenca_chamada_confirmada,
      'chamada_em', f.chamada_em,
      'chamada_origem', f.chamada_origem,
      'falta_raw_confirmada', f.falta_raw_confirmada,
      'experimental_interna_emusys', f.experimental_interna_emusys,
      'substituida_por_reagendamento', f.substituida_por_reagendamento,
      'emusys_raw_ids', to_jsonb(f.emusys_raw_ids),
      'sinal_conversao', f.sinal_conversao,
      'taxa_exp_mat_denominador', f.incluir_taxa_exp_mat,
      'taxa_exp_mat_conversao', f.contar_taxa_exp_mat,
      'decisao_humana', f.decisao_humana,
      'incluir_denominador_exp_mat', f.incluir_denominador_exp_mat,
      'contar_conversao_exp_mat', f.contar_conversao_exp_mat,
      'aluno_id_decidido', f.aluno_id_decidido,
      'decisao_motivo', f.decisao_motivo,
      'decidido_por', f.decidido_por,
      'decidido_em', f.decidido_em
    ) order by f.data_experimental desc nulls last, f.horario_experimental desc nulls last, f.id desc)
    from filas f
  ), '[]'::jsonb)
);
$function$;

comment on function public.get_conciliacao_experimentais_snapshot_v1(uuid, integer, integer, text, date) is
  'P25: nucleo privado P11 sobre snapshot_ativo; presenca marcada pela chamada do Report (lead_experimentais.chamada_status) vale como evidencia confirmada.';
