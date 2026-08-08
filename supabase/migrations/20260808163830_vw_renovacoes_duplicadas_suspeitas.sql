-- Auditoria de renovacoes possivelmente duplicadas.
--
-- NAO e constraint de propriedade: nao da para bloquear no banco sem quebrar
-- caso legitimo. "Vitoria da Silva Nobre" (Recreio) faz dois tempos individuais
-- seguidos do MESMO curso e paga por cada -- excecao validada pelo Alf em
-- 2026-06-07. No banco ela tem a mesma assinatura de uma duplicata: mesmo aluno,
-- mesmo curso, mesma competencia, mesmo valor. Uma UNIQUE a bloquearia junto.
--
-- RAIZ: o lancamento manual de renovacao nao preenche emusys_matricula_id (456
-- de 497 registros desde jan/2026 estao sem). Com esse campo preenchido a dedup
-- por matricula funcionaria e separaria a Vitoria sozinha, porque sao duas
-- matriculas distintas. Enquanto isso nao existe, o certo e AUDITAR, nao travar.
--
-- Dois padroes distintos:
--   mesma_competencia  -> duas linhas para a mesma competencia (duplicata direta)
--   valor_congelado    -> competencias diferentes com o MESMO valor_parcela_anterior.
--                         Se a renovacao anterior fosse real, o "anterior" da
--                         seguinte seria o valor NOVO da primeira. Nao sendo,
--                         e a mesma renovacao relancada.

create or replace view public.vw_renovacoes_duplicadas_suspeitas as
with base as (
  select
    m.id,
    m.unidade_id,
    u.nome as unidade_nome,
    m.aluno_id,
    m.aluno_nome,
    m.curso_id,
    c.nome as curso_nome,
    m.data,
    m.competencia_referencia,
    m.valor_parcela_anterior,
    m.valor_parcela_novo,
    m.renovacao_status,
    m.emusys_matricula_id,
    m.created_at
  from public.movimentacoes_admin m
  join public.unidades u on u.id = m.unidade_id
  left join public.cursos c on c.id = m.curso_id
  where m.tipo = 'renovacao'
),
mesma_competencia as (
  select b.*, 'mesma_competencia' as padrao,
         count(*) over (
           partition by b.unidade_id, lower(btrim(b.aluno_nome)),
                        coalesce(b.curso_id, -1), b.competencia_referencia
         ) as ocorrencias
  from base b
),
valor_congelado as (
  select b.*, 'valor_congelado' as padrao,
         count(*) over (
           partition by b.unidade_id, lower(btrim(b.aluno_nome)),
                        coalesce(b.curso_id, -1), b.valor_parcela_anterior
         ) as ocorrencias
  from base b
  where b.valor_parcela_anterior is not null
)
select distinct on (id, padrao)
  id, unidade_id, unidade_nome, aluno_id, aluno_nome, curso_id, curso_nome,
  data, competencia_referencia, valor_parcela_anterior, valor_parcela_novo,
  renovacao_status, emusys_matricula_id, created_at, padrao, ocorrencias,
  (emusys_matricula_id is null) as lancamento_manual
from (
  select * from mesma_competencia where ocorrencias > 1
  union all
  select * from valor_congelado where ocorrencias > 1
) t
order by id, padrao;

comment on view public.vw_renovacoes_duplicadas_suspeitas is
  'Renovacoes possivelmente duplicadas. SUSPEITA, nao veredito: aluno com dois tempos do mesmo curso (excecao validada 2026-06-07) aparece aqui legitimamente. Conferir contra o Emusys antes de anular.';

revoke all on public.vw_renovacoes_duplicadas_suspeitas from public, anon, authenticated;
grant select on public.vw_renovacoes_duplicadas_suspeitas to authenticated, service_role;
