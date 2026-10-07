-- Carteira mensal do professor = regra do relatório "Alunos por Professor" do Emusys
-- (sem banda, regra da casa).
--
-- Antes: foto de "quem está com matrícula ativa com o professor" tirada na hora
-- do fechamento. Divergia do Emusys porque: (1) quem saiu durante o mês sumia;
-- (2) matrícula nova com 1ª aula no mês seguinte entrava; (3) ex-aluno ainda
-- "ativa" no espelho, sem aula, entrava; (4) troca de professor no meio do mês
-- tirava o aluno do professor antigo; (5) a lista de nomes incluía banda e o
-- total não (16 professores em set/2026, 89 nomes a mais).
--
-- Agora: o aluno conta para o professor P na competência M quando teve, em M,
-- ao menos uma aula INDIVIDUAL do próprio contrato (matrícula-disciplina),
-- categoria normal, não cancelada, dada por P num momento em que P era o
-- professor do contrato (histórico em professor_passagem_bastao; sem troca, o
-- professor atual do contrato). Uma contagem por (pessoa, curso).
--
-- Por que a linha individual e não a da turma: a linha 'turma' do espelho
-- guarda aluno que já saiu da turma (vínculo fantasma). Por que o titular:
-- aula dada como substituto não conta no Emusys.
--
-- Validação (05-06/10/2026, CG, set/2026, relatório "Alunos por Professor"
-- lido no Emusys): 29 de 30 professores idênticos (contando banda, como o
-- Emusys). Único desvio: Leticia (Davi de Matos, aula de 25/09 cancelada no
-- espelho e contada no Emusys). Gabriel Antony/Barra: 48 = Emusys.
--
-- Custo: ~1 execução/mês por competência (cron 22h do último dia + rerun
-- manual). Lê ~5,6 mil aulas individuais do mês; dezenas de ms.
--
-- Total e lista de nomes saem do MESMO conjunto, na mesma transação.
-- O valor anterior de cada linha fica registrado em `observacoes`.

create or replace function public.capturar_carteira_professores_mensal(
  p_competencia date,
  p_fonte text default 'sync_matriculas_emusys_fechamento_automatico'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_fim date;
  v_processados integer := 0;
  v_detalhe_linhas integer := 0;
begin
  if p_competencia is null or p_competencia <> v_competencia then
    raise exception 'Competencia deve ser o primeiro dia do mes: %', p_competencia;
  end if;

  if v_competencia > date_trunc(
    'month',
    now() at time zone 'America/Sao_Paulo'
  )::date then
    raise exception 'Nao e permitido capturar competencia futura: %', v_competencia;
  end if;

  v_fim := (v_competencia + interval '1 month' - interval '1 day')::date;

  drop table if exists _carteira_regra;
  create temp table _carteira_regra on commit drop as
  with aulas_contrato as (
    select
      a.unidade_id,
      a.professor_id,
      a.data_hora_inicio,
      a.matricula_disciplina_id as md,
      j.aluno_id,
      j.curso_id,
      coalesce(
        j.emusys_aluno_id::text,
        case when j.aluno_id is not null then 'local:' || j.aluno_id::text end
      ) as pessoa_chave,
      j.professor_id as professor_atual_id
    from public.aulas_emusys a
    join lateral (
      select j.*
      from public.aluno_jornada_matricula_disciplina j
      where j.unidade_id = a.unidade_id
        and j.emusys_matricula_disciplina_id = a.matricula_disciplina_id
      order by j.updated_at desc
      limit 1
    ) j on true
    where a.tipo = 'individual'
      and a.categoria = 'normal'
      and not a.cancelada
      and a.matricula_disciplina_id is not null
      and a.matricula_disciplina_id <> 0
      and a.professor_id is not null
      and a.data_aula between v_competencia and v_fim
      and not coalesce(
        (select c.is_projeto_banda from public.cursos c where c.id = j.curso_id),
        false
      )
  ),
  com_titular as (
    select
      ac.*,
      coalesce(
        (select pb.professor_destino_id
           from public.professor_passagem_bastao pb
          where pb.emusys_matricula_disciplina_id = ac.md
            and pb.created_at <= ac.data_hora_inicio
            and pb.professor_destino_id is not null
          order by pb.created_at desc
          limit 1),
        (select pb.professor_origem_id
           from public.professor_passagem_bastao pb
          where pb.emusys_matricula_disciplina_id = ac.md
            and pb.created_at > ac.data_hora_inicio
            and pb.professor_origem_id is not null
          order by pb.created_at asc
          limit 1),
        ac.professor_atual_id
      ) as titular_id
    from aulas_contrato ac
  )
  select distinct on (unidade_id, professor_id, pessoa_chave, curso_id)
    unidade_id, professor_id, aluno_id, pessoa_chave, curso_id
  from com_titular
  where professor_id = titular_id
    and pessoa_chave is not null
  order by unidade_id, professor_id, pessoa_chave, curso_id, aluno_id;

  with pares_validos as (
    select distinct pu.unidade_id, pu.professor_id
    from public.professores_unidades pu
    join public.professores p on p.id = pu.professor_id
    where p.ativo = true
      and pu.emusys_ativo = true
      and coalesce(pu.validacao_status, '') <> 'ignorado'
    union
    select distinct r.unidade_id, r.professor_id from _carteira_regra r
    union
    -- linha automática já gravada para a competência e que agora ficaria
    -- sem contagem: regrava como 0 em vez de manter o número velho
    select s.unidade_id, s.professor_id
    from public.professor_carteira_mensal_canonica s
    where s.competencia = v_competencia
      and s.fonte = p_fonte
  ),
  contagens as (
    select r.unidade_id, r.professor_id, count(*)::integer as carteira_alunos
    from _carteira_regra r
    group by r.unidade_id, r.professor_id
  ),
  gravados as (
    insert into public.professor_carteira_mensal_canonica (
      competencia, unidade_id, professor_id, carteira_alunos,
      fonte, auditado_por, auditado_em, observacoes
    )
    select
      v_competencia,
      pv.unidade_id,
      pv.professor_id,
      coalesce(c.carteira_alunos, 0),
      p_fonte,
      'cron_fechamento_professores',
      now(),
      'Regra Emusys v2 (aula individual do contrato com o titular no mes, sem banda).'
    from pares_validos pv
    left join contagens c
      on c.unidade_id = pv.unidade_id
     and c.professor_id = pv.professor_id
    on conflict (competencia, unidade_id, professor_id) do update
    set
      carteira_alunos = excluded.carteira_alunos,
      fonte = excluded.fonte,
      auditado_por = excluded.auditado_por,
      auditado_em = excluded.auditado_em,
      observacoes = excluded.observacoes
        || case
             when professor_carteira_mensal_canonica.carteira_alunos
                  is distinct from excluded.carteira_alunos
             then format(' Valor anterior: %s (%s).',
                         professor_carteira_mensal_canonica.carteira_alunos,
                         to_char(professor_carteira_mensal_canonica.auditado_em
                                 at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'))
             else ''
           end
    where professor_carteira_mensal_canonica.fonte =
      'sync_matriculas_emusys_fechamento_automatico'
    returning 1
  )
  select count(*) into v_processados from gravados;

  delete from public.professor_carteira_mensal_detalhe
  where competencia = v_competencia
    and fonte = p_fonte;

  with detalhe as (
    insert into public.professor_carteira_mensal_detalhe (
      competencia, unidade_id, professor_id, aluno_id, pessoa_chave, curso_id, fonte
    )
    select v_competencia, r.unidade_id, r.professor_id, r.aluno_id, r.pessoa_chave, r.curso_id, p_fonte
    from _carteira_regra r
    on conflict (competencia, unidade_id, professor_id, pessoa_chave, curso_id)
    do nothing
    returning 1
  )
  select count(*) into v_detalhe_linhas from detalhe;

  return jsonb_build_object(
    'ok', true,
    'competencia', v_competencia,
    'regra', 'emusys_v2_aula_individual_titular_sem_banda',
    'linhas_processadas', v_processados,
    'detalhe_linhas', v_detalhe_linhas,
    'fonte', p_fonte
  );
end;
$function$;

revoke all on function public.capturar_carteira_professores_mensal(date, text) from public, anon, authenticated;
grant execute on function public.capturar_carteira_professores_mensal(date, text) to service_role;
