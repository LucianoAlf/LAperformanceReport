-- Carteira do professor deixa de contar aluno de atividade extra (banda/Power Kids/
-- GarageBand/Percussion Kids).
--
-- POR QUE: a regra existe em 4 documentos (docs/REGRAS-DE-NEGOCIO.md §3.5 e §7.1,
-- .claude/memory/regras-negocio-canonicas.md §1.3/§4.1, CLAUDE.md) e NUNCA foi
-- implementada: `is_projeto_banda` só era aplicado a `media_alunos_turma`. Medido em
-- 2026-09-08: 107 linhas de atividade extra dentro de carteiras, 91 duplicando a mesma
-- pessoa em dois professores, 15 professores afetados. Vazou para relatório FECHADO —
-- o snapshot `relatorio_coordenacao` de ago/2026 da Barra publica 283 alunos na
-- carteira numa unidade de 256 alunos ativos.
--
-- DECISÕES: Luciano (2026-09-08) confirmou que média de alunos/turma, Health Score,
-- risco de evasão e contagem total de turmas não contam banda. Hugo: a métrica exclui,
-- a tela mostra os dois números em blocos separados; snapshots já fechados
-- (jun/jul/ago 2026) NÃO são recapturados — a correção vale para frente.
--
-- ⚠️ Curso não resolvido (curso_id null) conta como REGULAR de propósito: aparecer a
-- mais é o erro seguro, sumir da carteira não é. Mesmo critério de fn_carteira_fatiada.
-- ⚠️ NÃO usar `elegivel_media` como filtro: ele combina "modalidade resolvida" E "não é
-- banda", então aluno com modalidade indefinida sairia da carteira por engano.
-- ⚠️ Presença/faltas é EXCEÇÃO (§9.2: banda entra, com badge) e não é tocada aqui.

-- ---------------------------------------------------------------------------
-- 1) Cálculo vivo: telas de Professores, Health Score V3 e relatórios herdam daqui.
-- ---------------------------------------------------------------------------
create or replace function public.get_carteira_professor_periodo_canonica(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null::uuid,
  p_data_inicio date default null::date,
  p_data_fim date default null::date
)
returns table(
  professor_id integer,
  unidade_id uuid,
  carteira_alunos integer,
  media_alunos_turma numeric,
  total_turmas integer,
  alunos_via_turmas integer,
  turmas_elegiveis_media integer,
  fonte_carteira text
)
language sql
stable
set search_path to 'public'
as $function$
  with detalhe as (
    select
      d.*,
      -- Regular = não é atividade extra. Curso não resolvido cai aqui de propósito.
      not coalesce(c.is_projeto_banda, false) as regular
    from public.get_carteira_professor_periodo_detalhe_canonico_v1(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    ) d
    left join public.cursos c
      on c.id = d.curso_id
  ),
  agregado as (
    select
      d.professor_id as prof_id,
      d.unidade_id as uid,
      -- Snapshot auditado continua com precedência: competência já fechada preserva
      -- o número que foi publicado, mesmo inflado (decisão de 2026-09-08).
      coalesce(
        max(d.carteira_total_auditado),
        count(distinct d.pessoa_chave) filter (where d.regular)::integer,
        0
      )::integer as carteira_alunos,
      count(distinct d.turma_chave) filter (where d.regular)::integer as total_turmas,
      count(distinct jsonb_build_array(
        d.pessoa_chave,
        d.ocupacao_chave
      )) filter (
        where d.elegivel_media
          and d.pessoa_chave is not null
      )::integer as alunos_via_turmas,
      count(distinct d.turma_chave) filter (
        where d.elegivel_media
      )::integer as turmas_elegiveis_media,
      case
        when max(d.carteira_total_auditado) is not null
          then 'snapshot_auditado'
        else coalesce(
          min(d.fonte) filter (
            where d.pessoa_chave is not null
              and d.fonte <> 'snapshot_auditado'
          ),
          'sem_base'
        )
      end::text as fonte_carteira
    from detalhe d
    group by d.professor_id, d.unidade_id
  )
  select
    a.prof_id,
    a.uid,
    a.carteira_alunos,
    case
      when a.turmas_elegiveis_media > 0 then round(
        a.alunos_via_turmas::numeric / a.turmas_elegiveis_media,
        2
      )
      else 0
    end::numeric(10, 2) as media_alunos_turma,
    a.total_turmas,
    a.alunos_via_turmas,
    a.turmas_elegiveis_media,
    a.fonte_carteira
  from agregado a
  order by a.prof_id, a.uid;
$function$;

comment on function public.get_carteira_professor_periodo_canonica(integer,integer,uuid,date,date) is
'Carteira canônica do professor por período. carteira_alunos e total_turmas EXCLUEM atividade extra (cursos.is_projeto_banda) desde 2026-09-08 — regra §7.1, confirmada pelo Luciano. Para exibir a atividade extra separada, use get_carteira_professor_periodo_composicao_v1.';

-- ---------------------------------------------------------------------------
-- 2) Composição da carteira: o que a TELA usa para mostrar os dois blocos.
--    Fonte única — não reimplementar a separação no front nem em edge, senão os
--    números divergem (foi assim que nasceram as duplicatas de renovação).
-- ---------------------------------------------------------------------------
create or replace function public.get_carteira_professor_periodo_composicao_v1(
  p_ano integer,
  p_mes integer,
  p_unidade_id uuid default null::uuid,
  p_data_inicio date default null::date,
  p_data_fim date default null::date
)
returns table(
  professor_id integer,
  unidade_id uuid,
  carteira_regular integer,
  carteira_atividade_extra integer,
  carteira_so_atividade_extra integer,
  carteira_total integer,
  turmas_regular integer,
  turmas_total integer,
  atividades_extras jsonb
)
language sql
stable
set search_path to 'public'
as $function$
  with detalhe as (
    select
      d.professor_id,
      d.unidade_id,
      d.pessoa_chave,
      d.turma_chave,
      d.curso_id,
      not coalesce(c.is_projeto_banda, false) as regular,
      c.nome::text as curso_nome
    from public.get_carteira_professor_periodo_detalhe_canonico_v1(
      p_ano,
      p_mes,
      p_unidade_id,
      p_data_inicio,
      p_data_fim
    ) d
    left join public.cursos c
      on c.id = d.curso_id
    where d.pessoa_chave is not null
  ),
  -- Uma pessoa pode fazer curso regular E atividade extra com o MESMO professor.
  -- Por isso regular + extra pode ser maior que o total: quem faz os dois aparece
  -- nos dois. `carteira_total` é a contagem sem repetir.
  pessoas as (
    select
      d.professor_id,
      d.unidade_id,
      d.pessoa_chave,
      bool_or(d.regular) as tem_regular,
      bool_or(not d.regular) as tem_extra
    from detalhe d
    group by d.professor_id, d.unidade_id, d.pessoa_chave
  ),
  extras_por_curso as (
    select
      x.professor_id,
      x.unidade_id,
      jsonb_agg(
        jsonb_build_object('curso', x.curso_nome, 'alunos', x.alunos)
        order by x.alunos desc, x.curso_nome
      ) as atividades_extras
    from (
      select
        d.professor_id,
        d.unidade_id,
        coalesce(d.curso_nome, 'Atividade extra') as curso_nome,
        count(distinct d.pessoa_chave)::integer as alunos
      from detalhe d
      where not d.regular
      group by d.professor_id, d.unidade_id, coalesce(d.curso_nome, 'Atividade extra')
    ) x
    group by x.professor_id, x.unidade_id
  ),
  turmas as (
    select
      d.professor_id,
      d.unidade_id,
      count(distinct d.turma_chave) filter (where d.regular)::integer as turmas_regular,
      count(distinct d.turma_chave)::integer as turmas_total
    from detalhe d
    group by d.professor_id, d.unidade_id
  )
  -- Agrega ANTES de juntar: nao existe max(jsonb) no Postgres, e agregar o
  -- detalhe por curso junto com a contagem exigiria isso.
  agregado as (
    select
      p.professor_id,
      p.unidade_id,
      count(*) filter (where p.tem_regular)::integer as carteira_regular,
      count(*) filter (where p.tem_extra)::integer as carteira_atividade_extra,
      count(*) filter (where p.tem_extra and not p.tem_regular)::integer as carteira_so_atividade_extra,
      count(*)::integer as carteira_total
    from pessoas p
    group by p.professor_id, p.unidade_id
  )
  select
    a.professor_id,
    a.unidade_id,
    a.carteira_regular,
    a.carteira_atividade_extra,
    a.carteira_so_atividade_extra,
    a.carteira_total,
    coalesce(t.turmas_regular, 0)::integer as turmas_regular,
    coalesce(t.turmas_total, 0)::integer as turmas_total,
    coalesce(e.atividades_extras, '[]'::jsonb) as atividades_extras
  from agregado a
  left join turmas t
    on t.professor_id = a.professor_id
   and t.unidade_id = a.unidade_id
  left join extras_por_curso e
    on e.professor_id = a.professor_id
   and e.unidade_id = a.unidade_id
  order by a.professor_id, a.unidade_id;
$function$;

comment on function public.get_carteira_professor_periodo_composicao_v1(integer,integer,uuid,date,date) is
'Composicao da carteira do professor: regular x atividade extra, com o detalhe por curso extra. A tela mostra os dois SEPARADOS, deixando claro que a atividade extra nao entra na contagem (decisao do Hugo, 2026-09-08). regular + extra pode exceder o total: quem faz os dois aparece nos dois.';

-- ALTER DEFAULT PRIVILEGES no schema public concede EXECUTE a anon em funcao nova.
-- A anon key e publica (vai no bundle do front): revogar nominalmente.
revoke all on function public.get_carteira_professor_periodo_composicao_v1(integer,integer,uuid,date,date) from public, anon;
grant execute on function public.get_carteira_professor_periodo_composicao_v1(integer,integer,uuid,date,date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Snapshot mensal do dia 1º. É uma TERCEIRA implementação da carteira (conta
--    direto de aluno_jornada_matricula_disciplina) e tem PRECEDÊNCIA sobre o
--    cálculo vivo. Sem corrigir aqui, o snapshot de outubro sobrescreveria a
--    correção do passo 1.
--    ⚠️ Alterado por replace sobre pg_get_functiondef com guarda de ocorrências,
--    nunca por transcrição — função grande reescrita à mão perde correção
--    anterior em silêncio (lição de Bandas, 2026-08-28).
--    O DETALHE (professor_carteira_mensal_detalhe) segue gravando TODOS os cursos,
--    inclusive atividade extra: é o rastro que permite auditar a diferença. Só o
--    agregado passa a excluir.
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def  text := pg_get_functiondef('public.capturar_carteira_professores_mensal(date,text)'::regprocedure);
  v_novo text;
  v_n    integer;
begin
  select count(*) into v_n
  from regexp_matches(
    v_def,
    $re$as carteira_alunos\s+from public\.aluno_jornada_matricula_disciplina j\s+where j\.status_matricula = 'ativa'$re$,
    'g'
  );
  if v_n <> 1 then
    raise exception 'CARTEIRA_MENSAL_ANCORA_INESPERADA: esperava 1 ocorrencia, achei %', v_n;
  end if;

  v_novo := regexp_replace(
    v_def,
    $re$(as carteira_alunos\s+from public\.aluno_jornada_matricula_disciplina j\s+where j\.status_matricula = 'ativa')$re$,
    E'\1\n      and not coalesce((select c.is_projeto_banda from public.cursos c where c.id = j.curso_id), false)',
    'g'
  );

  if v_novo = v_def then
    raise exception 'CARTEIRA_MENSAL_REPLACE_NAO_APLICOU';
  end if;

  execute v_novo;
end
$mig$;

-- ---------------------------------------------------------------------------
-- 4) RPC legada: alimenta o fallback contratual da aba Carteira e o bloco
--    financeiro (ticket/MRR). O ticket já filtrava por tipos_matricula; o
--    headcount não.
--    ⚠️ tempo_medio_meses entra no mesmo filtro de propósito: numerador e
--    denominador de filtros diferentes é exatamente o defeito que produziu o
--    churn incoerente de bolsista (27/08).
-- ---------------------------------------------------------------------------
do $mig$
declare
  v_def  text := pg_get_functiondef('public.get_carteira_professores(uuid)'::regprocedure);
  v_novo text;
  v_n    integer;
begin
  -- headcount total
  select count(*) into v_n
  from regexp_matches(v_def, $re$p\.foto_url::text,\s+count\(\*\)::integer,$re$, 'g');
  if v_n <> 1 then
    raise exception 'CARTEIRA_LEGADA_ANCORA_TOTAL_INESPERADA: % ocorrencias', v_n;
  end if;
  v_novo := regexp_replace(
    v_def,
    $re$(p\.foto_url::text,\s+)count\(\*\)::integer,$re$,
    E'\1count(*) filter (where ab.conta_turma)::integer,',
    'g'
  );

  -- LAMK / EMLA
  select count(*) into v_n
  from regexp_matches(v_novo, $re$count\(\*\) filter \(where ab\.classificacao = '(LAMK|EMLA)'\)::integer$re$, 'g');
  if v_n <> 2 then
    raise exception 'CARTEIRA_LEGADA_ANCORA_CLASSIFICACAO_INESPERADA: esperava 2, achei %', v_n;
  end if;
  v_novo := regexp_replace(
    v_novo,
    $re$count\(\*\) filter \(where ab\.classificacao = '(LAMK|EMLA)'\)::integer$re$,
    E'count(*) filter (where ab.classificacao = \'\1\' and ab.conta_turma)::integer',
    'g'
  );

  -- tempo medio de permanencia
  select count(*) into v_n
  from regexp_matches(v_novo, $re$avg\(ab\.tempo_permanencia_meses\)$re$, 'g');
  if v_n <> 1 then
    raise exception 'CARTEIRA_LEGADA_ANCORA_TEMPO_INESPERADA: % ocorrencias', v_n;
  end if;
  v_novo := regexp_replace(
    v_novo,
    $re$avg\(ab\.tempo_permanencia_meses\)$re$,
    'avg(ab.tempo_permanencia_meses) filter (where ab.conta_turma)',
    'g'
  );

  if v_novo = v_def then
    raise exception 'CARTEIRA_LEGADA_REPLACE_NAO_APLICOU';
  end if;

  execute v_novo;
end
$mig$;
