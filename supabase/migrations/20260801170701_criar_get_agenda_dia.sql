-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.get_agenda_dia(
  p_data date,
  p_unidade_id uuid default null
)
returns table (
  chave              text,
  unidade_id         uuid,
  unidade_nome       text,
  professor_nome     text,
  professor_id       integer,
  sala_nome          text,
  curso_nome         text,
  turma_nome         text,
  hora_inicio        text,
  hora_fim           text,
  duracao_minutos    integer,
  categoria          text,
  tipo               text,
  cancelada          boolean,
  justificada        boolean,
  reagendada         boolean,
  hora_original      text,
  nr_da_aula         integer,
  qtd_alunos         integer,
  anotacoes          text,
  professor_presenca text,
  alunos             jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
with base as (
  select ae.*, u.nome as unidade_nome
  from aulas_emusys ae
  join unidades u on u.id = ae.unidade_id
  where ae.data_aula = p_data
    and (p_unidade_id is null or ae.unidade_id = p_unidade_id)
),
-- Alunos da aula: presenca batida (passado) tem prioridade sobre o vinculo
-- da grade (futuro), para nao perder o status_presenca.
vinculos as (
  select distinct on (x.aula_emusys_id, coalesce(x.aluno_id::text, x.nome))
    x.aula_emusys_id, x.aluno_id, x.nome, x.status_presenca
  from (
    select ap.aula_emusys_id,
           ap.aluno_id,
           coalesce(al.nome, '(aluno removido)') as nome,
           ap.status_presenca::text as status_presenca,
           1 as prioridade
    from aluno_presenca ap
    join base b on b.id = ap.aula_emusys_id
    left join alunos al on al.id = ap.aluno_id
    union all
    select aa.aula_emusys_id,
           aa.aluno_id,
           aa.nome,
           null::text,
           2
    from aula_alunos aa
    join base b on b.id = aa.aula_emusys_id
  ) x
  order by x.aula_emusys_id, coalesce(x.aluno_id::text, x.nome), x.prioridade
),
enriquecidos as (
  select
    v.aula_emusys_id,
    jsonb_build_object(
      'aluno_id', v.aluno_id,
      'nome', v.nome,
      'idade', case
        when al.data_nascimento is null then null
        else extract(year from age(al.data_nascimento))::int
      end,
      'responsavel_nome', al.responsavel_nome,
      'responsavel_telefone', al.responsavel_telefone,
      'status_presenca', v.status_presenca,
      'risco_pct', case
        when r.probabilidade is null then null
        else round((r.probabilidade * 100)::numeric)::int
      end,
      'inadimplente', coalesce(inad.tem, false),
      'nota_pesquisa', pesq.nota,
      'data_ultima_aula', jor.data_ultima_aula
    ) as aluno_json
  from vinculos v
  left join alunos al on al.id = v.aluno_id
  left join vw_risco_evasao_atual r on r.aluno_id = v.aluno_id
  left join vw_jornada_aluno_atual jor on jor.aluno_id = v.aluno_id
  left join lateral (
    select true as tem
    from aluno_jornada_matricula_disciplina j
    where j.aluno_id = v.aluno_id
      and j.inadimplente_emusys is true
    limit 1
  ) inad on true
  left join lateral (
    select p.nota
    from pesquisas_whatsapp p
    where p.aluno_id = v.aluno_id
      and p.tipo = 'pos_primeira_aula'
      and p.nota is not null
    order by p.created_at desc
    limit 1
  ) pesq on true
),
agrupado as (
  select
    md5(
      b.unidade_id::text || '|' || coalesce(b.professor_nome, '') || '|' ||
      coalesce(b.sala_nome, '') || '|' || b.data_hora_inicio::text || '|' ||
      coalesce(b.duracao_minutos, 0)::text || '|' || coalesce(b.curso_nome, '') || '|' ||
      coalesce(b.turma_nome, '') || '|' || b.cancelada::text
    ) as chave,
    b.unidade_id,
    b.unidade_nome,
    b.professor_nome,
    b.sala_nome,
    b.curso_nome,
    b.turma_nome,
    b.data_hora_inicio,
    b.duracao_minutos,
    b.cancelada,
    min(b.professor_id)     as professor_id,
    min(b.categoria)        as categoria,
    min(b.tipo)             as tipo,
    bool_or(b.justificada)  as justificada,
    bool_or(b.reagendada)   as reagendada,
    min(b.data_hora_inicio_original) as data_hora_inicio_original,
    -- nr_da_aula so faz sentido quando o card representa um aluno so;
    -- numa turma cada aluno esta num numero diferente do proprio contrato.
    case when count(distinct b.id) = 1 then min(b.nr_da_aula) else null end as nr_da_aula,
    greatest(
      coalesce(max(b.qtd_alunos), 0),
      count(distinct e.aluno_json) filter (where e.aluno_json is not null)::int
    ) as qtd_alunos,
    max(b.anotacoes)        as anotacoes,
    max(b.professor_presenca) as professor_presenca,
    coalesce(
      jsonb_agg(distinct e.aluno_json) filter (where e.aluno_json is not null),
      '[]'::jsonb
    ) as alunos
  from base b
  left join enriquecidos e on e.aula_emusys_id = b.id
  group by
    b.unidade_id, b.unidade_nome, b.professor_nome, b.sala_nome,
    b.curso_nome, b.turma_nome, b.data_hora_inicio, b.duracao_minutos, b.cancelada
)
select
  a.chave,
  a.unidade_id,
  a.unidade_nome,
  a.professor_nome,
  a.professor_id,
  a.sala_nome,
  a.curso_nome,
  a.turma_nome,
  to_char(a.data_hora_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') as hora_inicio,
  to_char(
    (a.data_hora_inicio at time zone 'America/Sao_Paulo')
      + make_interval(mins => coalesce(a.duracao_minutos, 0)),
    'HH24:MI'
  ) as hora_fim,
  a.duracao_minutos,
  a.categoria,
  a.tipo,
  a.cancelada,
  a.justificada,
  a.reagendada,
  case
    when a.reagendada and a.data_hora_inicio_original is not null
      then to_char(a.data_hora_inicio_original at time zone 'America/Sao_Paulo', 'DD/MM/YY "as" HH24:MI')
    else null
  end as hora_original,
  a.nr_da_aula,
  a.qtd_alunos,
  a.anotacoes,
  a.professor_presenca,
  a.alunos
from agrupado a
order by a.professor_nome nulls last, a.data_hora_inicio, a.sala_nome;
$$;

comment on function public.get_agenda_dia(date, uuid) is
  'Agenda de um dia ja agrupada por (professor, sala, horario, curso, turma, cancelada). '
  'Necessario porque aulas_emusys guarda uma linha por aluno em aulas de turma. '
  'p_unidade_id null = todas as unidades visiveis pelo RLS.';

grant execute on function public.get_agenda_dia(date, uuid) to authenticated;
