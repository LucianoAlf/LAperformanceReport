-- Expoe o numero da aula DE CADA ALUNO dentro de `alunos` jsonb, para marcar
-- quem esta na 1a aula (o "aluno novo" que o Emusys sinaliza com estrela).
--
-- Por que por aluno e nao pela aula: o campo `nr_da_aula` no topo do retorno so
-- e preenchido quando a aula tem exatamente 1 contrato — em turma ele e nulo,
-- entao um calouro dentro de uma turma de 4 ficaria invisivel. Cada linha de
-- `aulas_emusys` com matricula_disciplina_id > 0 e o contrato de UM aluno, e o
-- `nr_da_aula` dela e a contagem daquele aluno. A linha "container" da turma
-- (matricula_disciplina_id = 0) tem o contador da TURMA, nao do aluno.
--
-- RETURNS TABLE inalterado (muda so o conteudo do jsonb), entao CREATE OR
-- REPLACE basta e a ACL nao e recriada — anon nao volta.

create or replace function public.get_agenda_dia(p_data date, p_unidade_id uuid default null::uuid)
returns table(
  chave text, unidade_id uuid, unidade_nome text, professor_nome text,
  professor_id integer, sala_nome text, curso_nome text, turma_nome text,
  hora_inicio text, hora_fim text, duracao_minutos integer, categoria text,
  tipo text, cancelada boolean, justificada boolean, reagendada boolean,
  hora_original text, nr_da_aula integer, qtd_aulas_contrato integer,
  qtd_alunos integer, anotacoes text, anotacoes_fabio text,
  professor_presenca text, alunos jsonb
)
language sql
stable
set search_path to 'public'
as $function$
with base as (
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
vinculos_cru as (
  select b.chave,
         ap.aluno_id,
         coalesce(al.nome, '(aluno removido)') as nome,
         btrim(regexp_replace(
           regexp_replace(lower(unaccent(coalesce(al.nome, '(aluno removido)'))), '\(.*?\)', '', 'g'),
           '\s+', ' ', 'g')) as nome_norm,
         ap.status_presenca::text as status_presenca,
         case when b.matricula_disciplina_id > 0 then b.nr_da_aula else null end as nr_da_aula_aluno,
         case when b.matricula_disciplina_id > 0 then b.qtd_aulas_contrato else null end as qtd_aulas_aluno,
         1 as prioridade,
         case when b.matricula_disciplina_id > 0 then 0 else 1 end as prioridade_contrato
  from aluno_presenca ap
  join base b on b.id = ap.aula_emusys_id
  left join alunos al on al.id = ap.aluno_id
  union all
  select b.chave,
         aa.aluno_id,
         aa.aluno_nome as nome,
         aa.aluno_nome_normalizado,
         null::text,
         case when b.matricula_disciplina_id > 0 then b.nr_da_aula else null end,
         case when b.matricula_disciplina_id > 0 then b.qtd_aulas_contrato else null end,
         2,
         case when b.matricula_disciplina_id > 0 then 0 else 1 end
  from aula_alunos_emusys aa
  join base b on b.id = aa.aula_emusys_id
),
vinculos_ident as (
  select x.*,
         coalesce(
           x.aluno_id,
           min(x.aluno_id) over (partition by x.chave, x.nome_norm)
         ) as identidade
  from vinculos_cru x
),
vinculos as (
  select distinct on (v.chave, coalesce(v.identidade::text, v.nome_norm))
    v.chave, v.aluno_id, v.nome, v.status_presenca, v.nr_da_aula_aluno, v.qtd_aulas_aluno
  from vinculos_ident v
  order by v.chave, coalesce(v.identidade::text, v.nome_norm),
           (v.aluno_id is null), v.prioridade, v.prioridade_contrato
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
      'nr_da_aula', v.nr_da_aula_aluno,
      'qtd_aulas_contrato', v.qtd_aulas_aluno,
      'risco_pct', case
        when r.probabilidade is null then null
        else round((r.probabilidade * 100)::numeric)::int
      end,
      'risco_calculado_em', r.calculado_em,
      'inadimplente', coalesce(inad.tem, false),
      'nota_pesquisa', pesq.nota,
      'data_ultima_aula', jor.data_ultima_aula
    ) as aluno_json
  from vinculos v
  left join alunos al on al.id = v.aluno_id
  left join vw_risco_evasao_atual r on r.aluno_id = v.aluno_id
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
    case
      when count(distinct b.matricula_disciplina_id) filter (where b.matricula_disciplina_id > 0) >= 2 then 'turma'
      when count(distinct b.matricula_disciplina_id) filter (where b.matricula_disciplina_id > 0) = 1 then 'individual'
      else min(b.tipo)
    end as tipo,
    bool_or(b.justificada)  as justificada,
    bool_or(b.reagendada)   as reagendada,
    min(b.data_hora_inicio_original) as data_hora_inicio_original,
    case
      when count(distinct b.matricula_disciplina_id) filter (where b.matricula_disciplina_id > 0) = 1
        then max(b.nr_da_aula) filter (where b.matricula_disciplina_id > 0)
      else null
    end as nr_da_aula,
    case
      when count(distinct b.matricula_disciplina_id) filter (where b.matricula_disciplina_id > 0) = 1
        then max(b.qtd_aulas_contrato) filter (where b.matricula_disciplina_id > 0)
      else null
    end as qtd_aulas_contrato,
    greatest(
      coalesce(max(b.qtd_alunos), 0),
      count(distinct e.aluno_json) filter (where e.aluno_json is not null)::int
    ) as qtd_alunos,
    max(b.anotacoes)        as anotacoes,
    max(b.anotacoes_fabio)  as anotacoes_fabio,
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
  a.qtd_aulas_contrato,
  a.qtd_alunos,
  a.anotacoes,
  a.anotacoes_fabio,
  a.professor_presenca,
  a.alunos
from agrupado a
order by a.professor_nome nulls last, a.data_hora_inicio, a.sala_nome;
$function$;

