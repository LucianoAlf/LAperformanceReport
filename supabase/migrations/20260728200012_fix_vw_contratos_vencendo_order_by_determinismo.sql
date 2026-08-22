-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Corrige DISTINCT ON sem ORDER BY em vw_contratos_vencendo: o LEFT JOIN com
-- alunos usa a chave (unidade_id, emusys_matricula_id), mais grossa que o grao
-- da view (unidade_id, emusys_matricula_disciplina_id). Existem matriculas com
-- 2 linhas em alunos nessa chave (duplicatas de cadastro conhecidas, ex.
-- emusys_matricula_id 744 e 784 na Barra) -- sem ORDER BY o Postgres escolhia
-- arbitrariamente qual linha vencia, fazendo data_matricula/valor_parcela/
-- telefone/whatsapp variarem entre execucoes.
--
-- Desempate: entre as linhas de alunos empatadas na chave, preferir a de
-- data_matricula mais recente (cadastro mais novo tende a refletir o estado
-- atual da duplicata) e, por ultimo, a.id maior para determinismo absoluto
-- quando ate a data empatar.

create or replace view public.vw_contratos_vencendo as
select distinct on (j.unidade_id, j.emusys_matricula_disciplina_id)
  j.unidade_id,
  j.unidade_nome,
  j.aluno_id,
  j.aluno_nome,
  j.emusys_matricula_id,
  j.emusys_matricula_disciplina_id,
  j.curso_nome,
  j.professor_nome,
  a.data_matricula,
  j.data_ultima_aula,
  (j.data_ultima_aula::date - current_date) as dias_ate_vencimento,
  j.nr_aulas_futuras,
  -- Venc. ultima fatura = 1a fatura + (nr_faturas - 1) meses, com o DIA vindo do
  -- dia_vencimento do Emusys. Usar o dia da 1a fatura da errado: os dois divergem
  -- (1a fatura dia 11, vencimento dia 5). nr_faturas 0/NULL = sem parcela.
  case
    when jc.nr_faturas is null or jc.nr_faturas <= 0 then null
    when jc.data_primeira_fatura is null then null
    else (
      date_trunc(
        'month',
        jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1)
      )::date
      + (least(
           coalesce(jc.dia_vencimento_emusys, extract(day from jc.data_primeira_fatura)::int),
           extract(day from (
             date_trunc('month', jc.data_primeira_fatura + make_interval(months => jc.nr_faturas - 1))
             + interval '1 month - 1 day'
           ))::int
         ) - 1)
    )
  end as venc_ultima_fatura,
  a.valor_parcela,
  jc.inadimplente_emusys as inadimplente,
  a.telefone,
  a.whatsapp,
  j.ultima_sincronizacao_emusys
from public.vw_jornada_aluno_atual j
-- As 4 colunas de contrato foram criadas na TABELA da jornada e a
-- vw_jornada_aluno_atual nao as expoe (view nao herda coluna nova). Buscamos
-- direto na tabela, em vez de recriar a view existente -- ela tem consumidores
-- ativos e mexer nela ampliaria o risco desta migration sem necessidade.
join public.aluno_jornada_matricula_disciplina jc
  on jc.unidade_id = j.unidade_id
 and jc.emusys_matricula_disciplina_id = j.emusys_matricula_disciplina_id
-- LEFT e sem filtro de alunos.status: quem manda no "ativo" e a jornada (fonte
-- Emusys). Filtrar por alunos.status sumiria com aluno que o Emusys diz ativo e
-- o cadastro local diz trancado -- exatamente o defeito que esta tela corrige.
left join public.alunos a
  on a.unidade_id = j.unidade_id
 and a.emusys_matricula_id = j.emusys_matricula_id::text
where j.status_matricula = 'ativa'
order by
  j.unidade_id,
  j.emusys_matricula_disciplina_id,
  a.data_matricula desc nulls last,
  a.id desc;

alter view public.vw_contratos_vencendo set (security_invoker = true);

comment on view public.vw_contratos_vencendo is
  'Matriculas ativas com data da ultima aula do contrato, aulas restantes e '
  'vencimento da ultima fatura derivado. Grao = matricula/disciplina. '
  'DISTINCT ON com ORDER BY deterministico (desempate por data_matricula/id de alunos '
  'quando ha duplicata de cadastro na chave unidade+emusys_matricula_id).';
