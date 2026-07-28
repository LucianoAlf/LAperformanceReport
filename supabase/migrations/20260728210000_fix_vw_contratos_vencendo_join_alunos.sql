-- Corrige vw_contratos_vencendo: o segundo LEFT JOIN com alunos (por
-- unidade_id + emusys_matricula_id) buscava data_matricula/valor_parcela/
-- telefone/whatsapp de uma linha de alunos possivelmente DIFERENTE da que
-- vw_jornada_aluno_atual ja usa para aluno_nome/telefone/whatsapp (ela faz
-- `left join alunos a on a.id = j.aluno_id` internamente). Resultado em
-- producao: em algumas linhas o nome vinha de um cadastro e o valor/telefone
-- de outro; em outras (ex. Natan Pereira Calvo Demidoff, cujo cadastro tem
-- emusys_matricula_id nulo) a Matricula e o Valor apareciam vazios mesmo com
-- j.aluno_id corretamente resolvido.
--
-- Correcao: juntar alunos pela MESMA chave que a jornada ja usa (a.id =
-- j.aluno_id), garantindo que todas as colunas de alunos venham da mesma
-- pessoa que aluno_nome/telefone/whatsapp da jornada.
--
-- Consequencia: com essa chave, vw_jornada_aluno_atual ja e 1 linha por
-- (unidade_id, emusys_matricula_disciplina_id) -- nao ha mais duplicata pra
-- desempatar. O DISTINCT ON e o ORDER BY de desempate introduzidos em
-- 20260728200000 existiam so por causa do join errado; removidos aqui.

create or replace view public.vw_contratos_vencendo as
select
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
-- LEFT e pela MESMA chave que vw_jornada_aluno_atual ja usa internamente
-- (a.id = j.aluno_id) -- garante que data_matricula/valor_parcela/telefone/
-- whatsapp vem da mesma pessoa que aluno_nome. Sem filtro de alunos.status:
-- quem manda no "ativo" e a jornada (fonte Emusys). Filtrar por alunos.status
-- sumiria com aluno que o Emusys diz ativo e o cadastro local diz trancado --
-- exatamente o defeito que esta tela corrige.
left join public.alunos a
  on a.id = j.aluno_id
where j.status_matricula = 'ativa';

alter view public.vw_contratos_vencendo set (security_invoker = true);

comment on view public.vw_contratos_vencendo is
  'Matriculas ativas com data da ultima aula do contrato, aulas restantes e '
  'vencimento da ultima fatura derivado. Grao = matricula/disciplina. '
  'Join com alunos por a.id = j.aluno_id (mesma chave que vw_jornada_aluno_atual '
  'usa internamente) -- garante que todas as colunas de alunos vem da mesma '
  'pessoa que aluno_nome/telefone/whatsapp da jornada.';
