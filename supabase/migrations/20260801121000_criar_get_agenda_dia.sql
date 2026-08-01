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
  -- chave calculada por linha crua (nao apos agregar), para poder ser
  -- propagada ao CTE vinculos e alinhar a deduplicacao de aluno ao mesmo
  -- grupo que vira 1 card. O Emusys duplica o mesmo slot como
  -- tipo=turma (matricula_disciplina_id=0) + tipo=individual (>0) por aluno.
  select ae.*, u.nome as unidade_nome,
    md5(
      ae.unidade_id::text || '|' || coalesce(ae.professor_nome, '') || '|' ||
      coalesce(ae.sala_nome, '') || '|' || ae.data_hora_inicio::text || '|' ||
      coalesce(ae.duracao_minutos, 0)::text || '|' || coalesce(ae.curso_nome, '') || '|' ||
      coalesce(ae.turma_nome, '') || '|' || ae.cancelada::text
    ) as chave
  from aulas_emusys ae
  join unidades u on u.id = ae.unidade_id
  where ae.data_aula = p_data
    and (p_unidade_id is null or ae.unidade_id = p_unidade_id)
),
-- Alunos do CARD (nao da linha crua): dedup por (chave, aluno), nao por
-- aula_emusys_id, senao o mesmo aluno duplicado pelo par turma+individual
-- sobrevive ao jsonb_agg(distinct) porque os JSONs diferem em status_presenca.
-- Prioridade 1: presenca batida (aluno_presenca) vence vinculo de grade (aula_alunos).
-- Dentro da mesma prioridade, a linha com matricula_disciplina_id > 0 (a linha
-- do contrato do aluno) vence a linha tipo=turma (matricula_disciplina_id=0),
-- que e so o "container" do slot.
vinculos as (
  select distinct on (x.chave, coalesce(x.aluno_id::text, x.nome))
    x.chave, x.aluno_id, x.nome, x.status_presenca
  from (
    select b.chave,
           ap.aluno_id,
           coalesce(al.nome, '(aluno removido)') as nome,
           ap.status_presenca::text as status_presenca,
           1 as prioridade,
           case when b.matricula_disciplina_id > 0 then 0 else 1 end as prioridade_contrato
    from aluno_presenca ap
    join base b on b.id = ap.aula_emusys_id
    left join alunos al on al.id = ap.aluno_id
    union all
    select b.chave,
           aa.aluno_id,
           aa.nome,
           null::text,
           2,
           case when b.matricula_disciplina_id > 0 then 0 else 1 end
    from aula_alunos aa
    join base b on b.id = aa.aula_emusys_id
  ) x
  order by x.chave, coalesce(x.aluno_id::text, x.nome), x.prioridade, x.prioridade_contrato
),
enriquecidos as (
  select
    v.chave,
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
  -- vw_jornada_aluno_atual tem 1 linha por (aluno, disciplina/matricula) -
  -- pode ter mais de 1 linha por aluno (2o curso, matricula renovada). Join
  -- direto faz fan-out e gera 2 aluno_json diferentes so por causa do
  -- data_ultima_aula -> nome duplicado no array. Lateral + limit 1 (mais
  -- recente) mantem 1 linha por aluno.
  left join lateral (
    select j.data_ultima_aula
    from vw_jornada_aluno_atual j
    where j.aluno_id = v.aluno_id
    order by j.data_ultima_aula desc nulls last
    limit 1
  ) jor on true
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
    b.chave,
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
    -- tipo: min(b.tipo) alfabetico colocava quase tudo como 'individual'
    -- ('individual' < 'turma'). O sinal real de turma e o numero de
    -- contratos distintos (matricula_disciplina_id > 0) no slot: cada aluno
    -- real gera 1 linha individual com seu proprio matricula_disciplina_id;
    -- a linha tipo=turma (matricula_disciplina_id=0) e so o container.
    case
      when count(distinct b.matricula_disciplina_id) filter (where b.matricula_disciplina_id > 0) >= 2 then 'turma'
      when count(distinct b.matricula_disciplina_id) filter (where b.matricula_disciplina_id > 0) = 1 then 'individual'
      else min(b.tipo)
    end as tipo,
    bool_or(b.justificada)  as justificada,
    bool_or(b.reagendada)   as reagendada,
    min(b.data_hora_inicio_original) as data_hora_inicio_original,
    -- nr_da_aula so faz sentido quando o card representa 1 aluno real (por
    -- contrato distinto); nesse caso pega o nr da linha do contrato dele
    -- (matricula_disciplina_id > 0), nunca o da linha tipo=turma (container,
    -- matricula_disciplina_id=0), que traz um nr de aula diferente e errado.
    case
      when count(distinct b.matricula_disciplina_id) filter (where b.matricula_disciplina_id > 0) = 1
        then max(b.nr_da_aula) filter (where b.matricula_disciplina_id > 0)
      else null
    end as nr_da_aula,
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
  left join enriquecidos e on e.chave = b.chave
  group by
    b.chave, b.unidade_id, b.unidade_nome, b.professor_nome, b.sala_nome,
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
  'Necessario porque aulas_emusys guarda uma linha por aluno em aulas de turma, e o '
  'Emusys ainda duplica cada slot como tipo=turma (matricula_disciplina_id=0, container) '
  '+ tipo=individual (matricula_disciplina_id>0, 1 por contrato de aluno). O tipo, o '
  'nr_da_aula e a lista de alunos do card usam matricula_disciplina_id para nao herdar '
  'essa duplicacao; vw_jornada_aluno_atual e lida via lateral+limit 1 porque pode ter '
  'mais de 1 linha por aluno (2o curso/matricula renovada). '
  'p_unidade_id null = todas as unidades visiveis pelo RLS.';

grant execute on function public.get_agenda_dia(date, uuid) to authenticated;
