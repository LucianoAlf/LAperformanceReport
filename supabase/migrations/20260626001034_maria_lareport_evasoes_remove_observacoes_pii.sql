-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

drop function if exists public.maria_lareport_evasoes_mes_detalhe(uuid, integer, integer, integer);

create function public.maria_lareport_evasoes_mes_detalhe(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_limit integer default 200
)
returns table (
  evasao_id integer,
  aluno_id integer,
  aluno_nome text,
  unidade_nome text,
  data_evasao date,
  curso_nome text,
  professor_nome text,
  valor_parcela numeric,
  mrr_perdido numeric,
  tipo_saida text,
  motivo_saida text,
  situacao_pagamento text
)
language sql
security definer
set search_path = public
as $$
  with periodo as (
    select make_date(p_ano,p_mes,1) inicio,
           (make_date(p_ano,p_mes,1) + interval '1 month')::date fim
  )
  select
    e.id,
    e.aluno_id,
    coalesce(e.aluno_nome, a.nome)::text,
    u.nome::text,
    e.data_evasao,
    c.nome::text,
    p.nome::text,
    coalesce(e.valor_parcela, a.valor_parcela),
    coalesce(e.valor_parcela, a.valor_parcela, 0)::numeric,
    ts.nome::text,
    ms.nome::text,
    e.situacao_pagamento::text
  from public.evasoes_v2 e
  join periodo per on true
  left join public.alunos a on a.id = e.aluno_id
  left join public.unidades u on u.id = e.unidade_id
  left join public.cursos c on c.id = coalesce(e.curso_id, a.curso_id)
  left join public.professores p on p.id = coalesce(e.professor_id, a.professor_atual_id)
  left join public.tipos_saida ts on ts.id = e.tipo_saida_id
  left join public.motivos_saida ms on ms.id = e.motivo_saida_id
  where e.unidade_id = p_unidade_id
    and e.data_evasao >= per.inicio
    and e.data_evasao < per.fim
  order by e.data_evasao desc, aluno_nome
  limit greatest(1, least(coalesce(p_limit,200), 500));
$$;

grant execute on function public.maria_lareport_evasoes_mes_detalhe(uuid, integer, integer, integer) to maria_lareport_rpc;
