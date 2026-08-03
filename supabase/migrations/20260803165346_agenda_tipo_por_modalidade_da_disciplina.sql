-- Agenda: `tipo` passa a ser a MODALIDADE contratada, nao a lotacao do horario.
--
-- Ate aqui o campo contava contratos no slot: 1 aluno = 'individual', 2+ =
-- 'turma'. Isso e lotacao com nome de modalidade, e produzia divergencia
-- visivel com o Emusys — a Aline aparecia como "Individual" na nossa tela e
-- como "Grupo" no Emusys, porque ela esta sozinha numa aula de turma.
--
-- A modalidade verdadeira ja estava no banco e nunca tinha sido usada:
-- `emusys_disciplinas_catalogo.modalidade`, populada pela edge
-- `sync-professor-disciplinas-emusys` a partir de GET /disciplinas?tipo=...
-- Cobertura medida em 03/08/2026: 179 de 179 aulas casam pelo par
-- (unidade_id, curso_emusys_id). Resultado: 178 turma, 1 individual.
--
-- ⚠️ Descartados antes de chegar nela, todos derivados de contagem:
--   - `turma_nome` esta preenchido em 171 das 179 aulas "individual" (e o nome
--     do slot, nao prova de turma);
--   - `qtd_alunos` da linha container e SEMPRE igual ao numero de contratos;
--   - `cursos.natureza_operacional` e pedagogica/comercial e
--     `cursos.capacidade_maxima` e NULL em todos os cursos.
--
-- Consequencia para a tela: com 99% "turma", o rotulo deixa de informar no
-- cartao e vai para o drawer; o filtro Individual|Turma vira "sozinho no
-- horario" x "com turma", que le a lotacao (qtd_alunos).
--
-- 🔴 ESTA MIGRATION QUEBROU A AGENDA em producao por alguns minutos, com
-- "permission denied for table emusys_disciplinas_catalogo" para 100% dos
-- usuarios. Corrigida em 20260803170725 — LEIA AS DUAS JUNTAS.
-- Causa: get_agenda_dia e SECURITY INVOKER, entao o join novo passou a exigir
-- que o USUARIO tivesse acesso ao catalogo, que tem RLS ligado, zero policies
-- e nenhum grant para authenticated. Foi validada como service_role, que
-- ignora RLS. Mesma armadilha ja registrada no CLAUDE.md para
-- aula_alunos_emusys — validar SEMPRE com `set local role authenticated`.
--
-- Nota de forma: o que rodou em producao foi a cirurgia sobre
-- pg_get_functiondef (patch no corpo deployado). Este arquivo guarda o corpo
-- completo equivalente, que e mais robusto para replay do zero. O estado final
-- e o mesmo depois de 20260803170725 trocar o join pela view.

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
  select ae.*, u.nome as unidade_nome, dc.modalidade as modalidade_disciplina,
    md5(
      ae.unidade_id::text || '|' || coalesce(ae.professor_nome, '') || '|' ||
      coalesce(ae.sala_nome, '') || '|' || ae.data_hora_inicio::text || '|' ||
      coalesce(ae.duracao_minutos, 0)::text || '|' || coalesce(ae.curso_nome, '') || '|' ||
      coalesce(ae.turma_nome, '') || '|' || ae.cancelada::text
    ) as chave
  from aulas_emusys ae
  join unidades u on u.id = ae.unidade_id
  -- Modalidade REAL da disciplina, sincronizada por sync-professor-disciplinas-emusys
  -- (GET /disciplinas?tipo=turma|individual). O par (unidade, disciplina) e unico
  -- em emusys_disciplinas_catalogo (86/86 em 03/08/2026), entao nao duplica aula.
  left join emusys_disciplinas_catalogo dc
    on dc.emusys_disciplina_id = ae.curso_emusys_id
   and dc.unidade_id = ae.unidade_id
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
      'aluno_novo', (v.nr_da_aula_aluno = 1 and v.aluno_id is not null and hist.tem is null),
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
    select 1 as tem
    from (
      select aa.aula_emusys_id from aula_alunos_emusys aa where aa.aluno_id = v.aluno_id
      union all
      select ap.aula_emusys_id from aluno_presenca ap where ap.aluno_id = v.aluno_id
    ) x
    join aulas_emusys ant on ant.id = x.aula_emusys_id
    where ant.data_aula < p_data
      and ant.matricula_disciplina_id > 0
      and ant.categoria = 'normal'
    limit 1
  ) hist on v.nr_da_aula_aluno = 1 and v.aluno_id is not null
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
    -- MODALIDADE CONTRATADA, nao lotacao. Ate 03/08/2026 este campo contava
    -- alunos no horario (1 = 'individual', 2+ = 'turma') e chamava isso de
    -- modalidade — por isso um aluno sozinho numa aula de turma aparecia como
    -- "Individual" enquanto o Emusys mostrava "Grupo". Sao coisas diferentes:
    -- na LA a maioria das disciplinas E de turma (178 de 179 aulas em 03/08),
    -- e a maioria roda com um aluno so. Lotacao continua em qtd_alunos.
    -- Fallback pela contagem so para disciplina ausente do catalogo.
    coalesce(
      max(b.modalidade_disciplina),
      case
        when count(distinct b.matricula_disciplina_id) filter (where b.matricula_disciplina_id > 0) >= 2 then 'turma'
        when count(distinct b.matricula_disciplina_id) filter (where b.matricula_disciplina_id > 0) = 1 then 'individual'
        else min(b.tipo)
      end
    ) as tipo,
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

