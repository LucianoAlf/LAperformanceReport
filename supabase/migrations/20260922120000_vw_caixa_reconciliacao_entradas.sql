-- 22/09/2026 — relatorio de reconciliacao das entradas de caixa sem fatura_id.
--
-- Uma linha por caixa_movimentacoes tipo='entrada' sem vinculo de fatura, com a
-- classe do cruzamento contra emusys_faturas pagas e as candidatas em jsonb:
--   match_unico        -> 1 fatura paga na unidade, data_pagamento +-7d,
--                         valor_pago exato e nome rigoroso na descricao
--   ambigua            -> 2+ candidatas (mesma regra) — decisao humana
--   composta_2_faturas -> soma exata de 2 faturas cujos alunos aparecem na
--                         descricao — vinculo e por item, nao por fatura_id
--   sem_match          -> sem candidata — receita sem fatura (Super Folha)
--
-- Match de nome: nome_extraido da descricao (" - Nome", "aluno/a Nome") via
-- sol_nome_mesma_pessoa_v1 contra aluno OU responsavel; fallback de nome
-- completo com fronteira de palavra quando a descricao foge do padrao.
-- Nunca substring crua: 'Ana Lima' nao casa com 'Ana Lima Souza' de outra pessoa
-- porque a candidata errada entra como ambigua, nao como match.

create or replace view public.vw_caixa_reconciliacao_entradas as
with mov as (
  select
    m.id,
    m.unidade_id,
    m.data_movimento,
    m.valor,
    m.descricao,
    m.categoria,
    m.forma_pagamento,
    m.criado_por,
    m.aluno_id,
    case
      when m.descricao ~ ' - ' then trim(regexp_replace(substring(m.descricao from '.* - (.+)$'), '\s*·.*$', ''))
      when m.descricao ~* '\malun[oa]s?\s+' then trim(regexp_replace(substring(m.descricao from '(?i)\malun[oa]s?\s+(.+)$'), '\s*(·|\(|\bcurso\b).*$', ''))
      else null
    end as nome_extraido
  from public.caixa_movimentacoes m
  where m.tipo = 'entrada'
    and m.fatura_id is null
),
cand as (
  select
    m.id as mov_id,
    f.id as fatura_id,
    f.emusys_fatura_id,
    a.id as aluno_id,
    a.nome as aluno_nome,
    f.data_pagamento,
    f.valor_pago,
    f.competencia as fatura_competencia,
    abs(f.data_pagamento - m.data_movimento) as delta_dias,
    case
      when m.nome_extraido is not null and public.sol_nome_mesma_pessoa_v1(m.nome_extraido, a.nome) then 'extraido_aluno'
      when m.nome_extraido is not null and a.responsavel_nome is not null and public.sol_nome_mesma_pessoa_v1(m.nome_extraido, a.responsavel_nome) then 'extraido_responsavel'
      when m.nome_extraido is null and upper(unaccent(m.descricao)) ~ ('(^|[^A-Z])' || unaccent(a.nome_normalizado) || '([^A-Z]|$)') then 'boundary_aluno'
      when m.nome_extraido is null and a.responsavel_nome is not null and length(a.responsavel_nome) > 4
           and upper(unaccent(m.descricao)) ~ ('(^|[^A-Z])' || upper(unaccent(a.responsavel_nome)) || '([^A-Z]|$)') then 'boundary_responsavel'
      else null
    end as via
  from mov m
  join public.emusys_faturas f
    on f.unidade_id = m.unidade_id
   and f.status = 'paga'
   and f.data_pagamento between m.data_movimento - 7 and m.data_movimento + 7
   and abs(coalesce(f.valor_pago, 0) - m.valor) < 0.011
  join public.alunos a
    on a.emusys_student_id = f.emusys_student_id::text
),
dupla as (
  select m.id as mov_id
  from mov m
  join public.emusys_faturas f1
    on f1.unidade_id = m.unidade_id and f1.status = 'paga'
   and f1.data_pagamento between m.data_movimento - 7 and m.data_movimento + 7
  join public.emusys_faturas f2
    on f2.unidade_id = m.unidade_id and f2.status = 'paga'
   and f2.data_pagamento between m.data_movimento - 7 and m.data_movimento + 7
   and f2.id > f1.id
  join public.alunos a1 on a1.emusys_student_id = f1.emusys_student_id::text
  join public.alunos a2 on a2.emusys_student_id = f2.emusys_student_id::text
  where abs(coalesce(f1.valor_pago, 0) + coalesce(f2.valor_pago, 0) - m.valor) < 0.011
    and (
      upper(unaccent(m.descricao)) ~ ('(^|[^A-Z])' || unaccent(a1.nome_normalizado) || '([^A-Z]|$)')
      or public.sol_nome_mesma_pessoa_v1(coalesce(m.nome_extraido, ''), a1.nome)
    )
    and (
      upper(unaccent(m.descricao)) ~ ('(^|[^A-Z])' || unaccent(a2.nome_normalizado) || '([^A-Z]|$)')
      or public.sol_nome_mesma_pessoa_v1(coalesce(m.nome_extraido, ''), a2.nome)
    )
  group by m.id
)
select
  m.id as movimentacao_id,
  m.unidade_id,
  u.nome as unidade_nome,
  m.data_movimento,
  date_trunc('month', m.data_movimento)::date as competencia,
  m.forma_pagamento,
  m.categoria,
  m.descricao,
  m.valor,
  m.criado_por,
  m.aluno_id as mov_aluno_id,
  m.nome_extraido,
  case
    when d.mov_id is not null then 'composta_2_faturas'
    when s.n = 1 then 'match_unico'
    when s.n > 1 then 'ambigua'
    else 'sem_match'
  end as classe,
  s.candidatas,
  (m.categoria = 'parcela' and m.forma_pagamento = 'pix' and s.n = 1 and d.mov_id is null) as elegivel_backfill,
  (s.n = 1 and (s.data_pagamento_unica between date '2026-09-18' and date '2026-09-20' or m.valor between 290 and 310)) as revisar_superfolha
from mov m
join public.unidades u on u.id = m.unidade_id
left join (
  select
    mov_id,
    count(*) as n,
    max(data_pagamento) as data_pagamento_unica,
    jsonb_agg(
      jsonb_build_object(
        'fatura_id', fatura_id,
        'emusys_fatura_id', emusys_fatura_id,
        'aluno_id', aluno_id,
        'aluno_nome', aluno_nome,
        'data_pagamento', data_pagamento,
        'valor_pago', valor_pago,
        'fatura_competencia', fatura_competencia,
        'delta_dias', delta_dias,
        'via', via
      ) order by delta_dias, fatura_id
    ) as candidatas
  from cand
  where via is not null
  group by mov_id
) s on s.mov_id = m.id
left join dupla d on d.mov_id = m.id;

comment on view public.vw_caixa_reconciliacao_entradas is
  'Relatorio de reconciliacao caixa x Emusys: cada entrada sem fatura_id com classe (match_unico/ambigua/composta_2_faturas/sem_match) e candidatas em jsonb. Match por unidade + data_pagamento +-7d + valor_pago exato + nome rigoroso (sol_nome_mesma_pessoa_v1 / boundary). elegivel_backfill = escopo do reparo aprovado (parcela+pix, unico, nao composto). revisar_superfolha = proxy das linhas ja consumidas pelo Super Folha (validar origem_id do lado de la).';

grant select on public.vw_caixa_reconciliacao_entradas to anon, authenticated, service_role;
