-- kpis_mensais_export_v1: export canônico de indicadores por unidade/mês para o Super Folha.
-- Contrato aprovado em Docs/handoffs/2026-09-28-kpis-canonicos-superfolha.md.
--
-- Fontes:
--   * get_kpis_alunos_canonicos(unidade, ano, mes) → KPIs por unidade (a RPC já resolve
--     internamente snapshot fechado vs vivo).
--   * fechamento_mensal_snapshots (dominio 'alunos_admin') → versao, hash, capturado_em,
--     status real do fechamento; fechamento_mensal_retificacoes → retificado_em.
--   * dados_mensais sem snapshot → status_fechamento='legado' (jan-mai/2026, régua
--     pré-correção de 08/08/2026 — combinação SF: não reapurar).
--   * novos_alunos = novas_matriculas da RPC (ela conta distinct pessoa_key).
--     novas_matriculas (linhas) = derivação de conferência: matrículas acadêmicas criadas
--     na competência, incluindo 2º curso (SEGUNDO_CURSO é matrícula real), excluindo
--     bolsista/banda/transferência — mesma régua de tipos_matricula da RPC.
--   * pagantes_em_banda: pessoa (vw_aluno_pessoa_chave) com matrícula ativa em curso
--     is_projeto_banda (exceto coral) E matrícula regular pagante ativa.
--   * horas de aula: sessão = chave (unidade, professor, data_hora_inicio, sala, curso);
--     dedup universal — o Emusys emite 1 linha 'turma'/'ensaio' + N linhas 'individual'
--     por sessão, e aulas individuais reais chegam só como 'individual'. Cada chave conta
--     uma vez com a duracao máxima observada.
--   * professor sem nome: professor_id + emusys_professor_id + telefone normalizado
--     (a edge aplica HMAC e descarta o telefone cru antes de responder).
--   * e_produtor_banda: papel canônico banda.produtor_professor_id (banda ativa).

-- Sessões de aula deduplicadas do espelho aulas_emusys (interno ao export).
create or replace function public._kpis_mensais_export_sessoes(
  p_inicio date,
  p_fim date,
  p_unidade_id uuid default null
)
returns table (
  unidade_id uuid,
  professor_key text,
  professor_id integer,
  emusys_professor_id integer,
  sessao_inicio timestamptz,
  sala_nome varchar,
  curso_emusys_id integer,
  duracao_minutos integer,
  is_banda boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with curso_banda as (
    select c.id, c.emusys_ids,
           lower(translate(c.nome, 'áàãâéêíóôõúç', 'aaaaeeiooouc')) as nome_norm
    from cursos c
    where c.is_projeto_banda = true
      and c.nome not ilike '%coral%'
  )
  select a.unidade_id,
         coalesce(a.professor_id::text, 'emp:' || a.emusys_professor_id::text) as professor_key,
         a.professor_id,
         a.emusys_professor_id,
         a.data_hora_inicio as sessao_inicio,
         a.sala_nome,
         a.curso_emusys_id,
         max(a.duracao_minutos)::integer as duracao_minutos,
         bool_or(exists (
           select 1
           from curso_banda cb
           where a.curso_emusys_id = any(cb.emusys_ids)
              or replace(lower(translate(coalesce(a.curso_nome, ''), 'áàãâéêíóôõúç', 'aaaaeeiooouc')), ' pra ', ' para ')
                 like '%' || replace(cb.nome_norm, ' pra ', ' para ') || '%'
         )) as is_banda
  from aulas_emusys a
  where a.data_aula >= p_inicio
    and a.data_aula <= p_fim
    and a.cancelada = false
    and a.data_hora_inicio is not null
    and (a.professor_id is not null or a.emusys_professor_id is not null)
    and (p_unidade_id is null or a.unidade_id = p_unidade_id)
  group by 1, 2, 3, 4, 5, 6, 7;
$$;

revoke all on function public._kpis_mensais_export_sessoes(date, date, uuid) from public, anon, authenticated;
grant execute on function public._kpis_mensais_export_sessoes(date, date, uuid) to service_role;

create or replace function public.kpis_mensais_export_v1(
  p_unidade_id uuid default null,
  p_ano integer default null,
  p_mes integer default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ano integer := coalesce(p_ano, extract(year from (now() at time zone 'America/Sao_Paulo'))::integer);
  v_mes integer := coalesce(p_mes, extract(month from (now() at time zone 'America/Sao_Paulo'))::integer);
  v_inicio date;
  v_fim date;
  v_kpis jsonb;
  v_linhas jsonb;
  v_profs jsonb;
begin
  v_inicio := make_date(v_ano, v_mes, 1);
  v_fim := (v_inicio + interval '1 month - 1 day')::date;
  v_kpis := get_kpis_alunos_canonicos(p_unidade_id, v_ano, v_mes);

  with
  un as (
    select u.id, u.codigo, u.nome
    from unidades u
    where u.ativo = true
      and (p_unidade_id is null or u.id = p_unidade_id)
  ),
  snap as (
    select distinct on (s.unidade_id)
      s.unidade_id, s.versao, s.status, s.fonte, s.capturado_em, s.fechado_em, s.payload_hash
    from fechamento_mensal_snapshots s
    join un on un.id = s.unidade_id
    where s.dominio = 'alunos_admin'
      and s.ano = v_ano and s.mes = v_mes
      and s.status <> 'preview'
    order by s.unidade_id, s.versao desc
  ),
  retif as (
    select s.unidade_id, max(r.created_at) as retificado_em
    from fechamento_mensal_retificacoes r
    join fechamento_mensal_snapshots s on s.id = r.snapshot_id
    join un on un.id = s.unidade_id
    where s.dominio = 'alunos_admin'
      and s.ano = v_ano and s.mes = v_mes
    group by s.unidade_id
  ),
  dm as (
    select d.unidade_id
    from dados_mensais d
    join un on un.id = d.unidade_id
    where d.ano = v_ano and d.mes = v_mes
  ),
  novas_linhas as (
    select a.unidade_id, count(*)::integer as n
    from alunos a
    join un on un.id = a.unidade_id
    join tipos_matricula tm on tm.id = a.tipo_matricula_id
    left join cursos c on c.id = a.curso_id
    where a.data_matricula >= v_inicio
      and a.data_matricula <= v_fim
      and a.status = 'ativo'
      and a.arquivado_em is null
      and coalesce(c.is_projeto_banda, false) = false
      and tm.codigo not in ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA', 'TRANSFERENCIA')
      and (tm.conta_como_pagante = true or tm.entra_ticket_medio = true)
      and coalesce(a.valor_parcela, 0) > 0
    group by a.unidade_id
  ),
  pessoas as (
    select pk.unidade_id, pk.pessoa_chave,
      bool_or(a.status = 'ativo' and a.arquivado_em is null
              and c.is_projeto_banda = true and c.nome not ilike '%coral%') as em_banda,
      bool_or(a.status = 'ativo' and a.arquivado_em is null
              and coalesce(c.is_projeto_banda, false) = false
              and tm.conta_como_pagante = true
              and coalesce(a.valor_parcela, 0) > 0) as pagante
    from vw_aluno_pessoa_chave pk
    join un on un.id = pk.unidade_id
    join alunos a on a.id = pk.aluno_id
    left join cursos c on c.id = a.curso_id
    left join tipos_matricula tm on tm.id = a.tipo_matricula_id
    group by pk.unidade_id, pk.pessoa_chave
  ),
  banda_pag as (
    select unidade_id,
           count(*) filter (where em_banda and pagante)::integer as n,
           count(*) filter (where em_banda)::integer as pessoas_banda
    from pessoas
    group by unidade_id
  ),
  un_agg as (
    select s.unidade_id,
           count(*) filter (where s.is_banda)::integer as sessoes_banda_mes,
           round(sum(s.duracao_minutos) filter (where s.is_banda) / 60.0, 1) as horas_banda_mes,
           round(sum(s.duracao_minutos) / 60.0, 1) as horas_aula_total_mes
    from public._kpis_mensais_export_sessoes(v_inicio, v_fim, p_unidade_id) s
    join un on un.id = s.unidade_id
    group by s.unidade_id
  ),
  produtores as (
    select b.unidade_id, count(distinct b.produtor_professor_id)::integer as n
    from banda b
    join un on un.id = b.unidade_id
    where b.status = 'ativa'
      and coalesce(b.descartada, false) = false
      and b.produtor_professor_id is not null
    group by b.unidade_id
  )
  select
    jsonb_agg(
      jsonb_build_object(
        'competencia', to_char(v_inicio, 'YYYY-MM-01'),
        'unidade_id', un.id,
        'unidade_codigo', un.codigo,
        'unidade_nome', un.nome,
        'status_fechamento', case
          when snap.unidade_id is not null then 'fechado'
          when dm.unidade_id is not null then 'legado'
          else 'aberto'
        end,
        'snapshot_status', snap.status,
        'versao', snap.versao,
        'fonte_snapshot', snap.fonte,
        'fonte_kpis', kpi.value ->> 'fonte',
        'status_competencia', kpi.value ->> 'status_competencia',
        'capturado_em', snap.capturado_em,
        'fechado_em', snap.fechado_em,
        'retificado_em', coalesce(retif.retificado_em,
          case when snap.fonte ilike 'retificacao%' then snap.capturado_em end),
        'payload_hash', snap.payload_hash,
        'alunos_ativos', (kpi.value ->> 'alunos_ativos')::integer,
        'alunos_pagantes', (kpi.value ->> 'alunos_pagantes')::integer,
        'novos_alunos', (kpi.value ->> 'novas_matriculas')::integer,
        'novas_matriculas', coalesce(nl.n, 0),
        'evasoes', (kpi.value ->> 'evasoes')::integer,
        'churn_rate', (kpi.value ->> 'churn_rate')::numeric,
        'ticket_medio', (kpi.value ->> 'ticket_medio')::numeric,
        'tempo_permanencia_meses', (kpi.value ->> 'tempo_permanencia')::numeric,
        'inadimplencia_pct', coalesce((kpi.value ->> 'inadimplencia_pct')::numeric,
                                      (kpi.value ->> 'inadimplencia')::numeric),
        'ltv_medio', (kpi.value ->> 'ltv_medio')::numeric,
        'mrr', (kpi.value ->> 'mrr')::numeric,
        'faturamento_previsto', (kpi.value ->> 'faturamento_previsto')::numeric,
        'faturamento_realizado', (kpi.value ->> 'faturamento_realizado')::numeric,
        'alunos_trancados', (kpi.value ->> 'alunos_trancados')::integer,
        'bolsistas_integrais', (kpi.value ->> 'bolsistas_integrais')::integer,
        'bolsistas_parciais', (kpi.value ->> 'bolsistas_parciais')::integer,
        'matriculas_2_curso', (kpi.value ->> 'matriculas_2_curso')::integer,
        'matriculas_banda', (kpi.value ->> 'matriculas_banda')::integer,
        'pessoas_em_banda', coalesce(bp.pessoas_banda, 0),
        'pagantes_em_banda', coalesce(bp.n, 0),
        'sessoes_banda_mes', coalesce(ua.sessoes_banda_mes, 0),
        'horas_banda_mes', coalesce(ua.horas_banda_mes, 0),
        'horas_aula_total_mes', coalesce(ua.horas_aula_total_mes, 0),
        'produtores_banda', coalesce(pr.n, 0),
        'identidade_emusys_cobertura_pct', (kpi.value ->> 'identidade_emusys_cobertura_pct')::numeric
      )
      order by un.codigo
    ) into v_linhas
  from un
  left join lateral (
    select value
    from jsonb_array_elements(coalesce(v_kpis -> 'por_unidade', '[]'::jsonb)) t(value)
    where (t.value ->> 'unidade_id')::uuid = un.id
    limit 1
  ) kpi on true
  left join snap on snap.unidade_id = un.id
  left join retif on retif.unidade_id = un.id
  left join dm on dm.unidade_id = un.id
  left join novas_linhas nl on nl.unidade_id = un.id
  left join banda_pag bp on bp.unidade_id = un.id
  left join un_agg ua on ua.unidade_id = un.id
  left join produtores pr on pr.unidade_id = un.id;

  select jsonb_agg(
    jsonb_build_object(
      'competencia', to_char(v_inicio, 'YYYY-MM-01'),
      'unidade_id', sa.unidade_id,
      'professor_id', sa.professor_id,
      'emusys_professor_id', sa.emusys_professor_id,
      'fone_norm', regexp_replace(coalesce(pf.telefone_whatsapp, ''), '\D', '', 'g'),
      'sessoes_banda', sa.sessoes_banda,
      'horas_banda', sa.horas_banda,
      'sessoes_total', sa.sessoes_total,
      'horas_aula_total', sa.horas_total,
      'e_produtor_banda', exists (
        select 1 from banda b
        where b.produtor_professor_id = sa.professor_id
          and b.status = 'ativa'
          and coalesce(b.descartada, false) = false
      )
    )
    order by sa.unidade_id, sa.horas_total desc
  ) into v_profs
  from (
    select s.unidade_id, s.professor_key, s.professor_id, s.emusys_professor_id,
           count(*) filter (where s.is_banda)::integer as sessoes_banda,
           round(sum(s.duracao_minutos) filter (where s.is_banda) / 60.0, 1) as horas_banda,
           count(*)::integer as sessoes_total,
           round(sum(s.duracao_minutos) / 60.0, 1) as horas_total
    from public._kpis_mensais_export_sessoes(v_inicio, v_fim, p_unidade_id) s
    group by 1, 2, 3, 4
  ) sa
  left join professores pf on pf.id = sa.professor_id;

  return jsonb_build_object(
    'competencia', to_char(v_inicio, 'YYYY-MM-01'),
    'gerado_em', now(),
    'linhas', coalesce(v_linhas, '[]'::jsonb),
    'professores', coalesce(v_profs, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.kpis_mensais_export_v1(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.kpis_mensais_export_v1(uuid, integer, integer) to service_role;
