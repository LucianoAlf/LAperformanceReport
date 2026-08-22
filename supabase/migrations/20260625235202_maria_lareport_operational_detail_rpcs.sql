-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- RPCs de detalhe operacional para Maria: sem SQL livre, sem telefone/email, com nomes e impacto financeiro necessário.

create or replace function public.maria_lareport_buscar_alunos(
  p_busca text,
  p_unidade_id uuid default null,
  p_limit integer default 20
)
returns table (
  aluno_id integer,
  aluno_nome text,
  unidade_nome text,
  status text,
  classificacao text,
  curso_nome text,
  professor_nome text,
  dia_aula text,
  horario_aula text,
  valor_parcela numeric,
  valor_passaporte numeric,
  data_matricula date,
  agente_comercial text,
  consultor_nome text,
  tipo_matricula text
)
language sql
security definer
set search_path = public
as $$
  select
    a.id,
    a.nome::text,
    u.nome::text,
    a.status::text,
    a.classificacao::text,
    c.nome::text,
    p.nome::text,
    a.dia_aula::text,
    a.horario_aula::text,
    a.valor_parcela,
    a.valor_passaporte,
    a.data_matricula,
    coalesce(a.agente_comercial, l.agente_comercial)::text,
    coalesce(col.apelido, col.nome)::text,
    tm.nome::text
  from public.alunos a
  left join public.unidades u on u.id = a.unidade_id
  left join public.cursos c on c.id = a.curso_id
  left join public.professores p on p.id = a.professor_atual_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  left join public.leads l on l.id = a.lead_origem_id or l.aluno_id = a.id
  left join public.colaboradores col on col.id = l.consultor_id
  where (p_unidade_id is null or a.unidade_id = p_unidade_id)
    and (
      p_busca is null or length(trim(p_busca)) = 0
      or lower(a.nome) like '%' || lower(trim(p_busca)) || '%'
      or lower(coalesce(p.nome,'')) like '%' || lower(trim(p_busca)) || '%'
      or lower(coalesce(c.nome,'')) like '%' || lower(trim(p_busca)) || '%'
    )
  order by case when lower(a.nome) = lower(trim(coalesce(p_busca,''))) then 0 else 1 end, a.nome
  limit greatest(1, least(coalesce(p_limit,20), 100));
$$;

create or replace function public.maria_lareport_matriculas_mes_detalhe(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_limit integer default 200
)
returns table (
  aluno_id integer,
  aluno_nome text,
  unidade_nome text,
  data_matricula date,
  curso_nome text,
  professor_nome text,
  dia_aula text,
  horario_aula text,
  valor_parcela numeric,
  valor_passaporte numeric,
  mrr_acrescimo numeric,
  agente_comercial text,
  consultor_nome text,
  canal_origem text,
  tipo_matricula text,
  aluno_novo_retorno text
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
    a.id,
    a.nome::text,
    u.nome::text,
    a.data_matricula,
    c.nome::text,
    coalesce(pfix.nome, pexp.nome)::text,
    a.dia_aula::text,
    a.horario_aula::text,
    a.valor_parcela,
    a.valor_passaporte,
    coalesce(a.valor_parcela,0)::numeric,
    coalesce(a.agente_comercial, l.agente_comercial)::text,
    coalesce(col.apelido, col.nome)::text,
    coalesce(co.nome, co2.nome)::text,
    coalesce(tm.nome, l.tipo_matricula)::text,
    coalesce(l.aluno_novo_retorno, case when a.is_aluno_retorno then 'retorno' else 'novo' end)::text
  from public.alunos a
  join periodo per on true
  left join public.unidades u on u.id = a.unidade_id
  left join public.cursos c on c.id = a.curso_id
  left join public.professores pfix on pfix.id = a.professor_atual_id
  left join public.professores pexp on pexp.id = a.professor_experimental_id
  left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
  left join public.leads l on l.id = a.lead_origem_id or l.aluno_id = a.id
  left join public.colaboradores col on col.id = l.consultor_id
  left join public.canais_origem co on co.id = a.canal_origem_id
  left join public.canais_origem co2 on co2.id = l.canal_origem_id
  where a.unidade_id = p_unidade_id
    and a.data_matricula >= per.inicio
    and a.data_matricula < per.fim
  order by a.data_matricula desc, a.nome
  limit greatest(1, least(coalesce(p_limit,200), 500));
$$;

create or replace function public.maria_lareport_evasoes_mes_detalhe(
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
  situacao_pagamento text,
  observacoes text
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
    e.situacao_pagamento::text,
    e.observacoes::text
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

create or replace function public.maria_lareport_professor_carteira(
  p_unidade_id uuid default null,
  p_professor_busca text default null,
  p_limit integer default 200
)
returns table (
  unidade_nome text,
  professor_id integer,
  professor_nome text,
  aluno_id integer,
  aluno_nome text,
  aluno_status text,
  curso_nome text,
  tipo_matricula text,
  dia_aula text,
  horario_aula text,
  valor_parcela numeric,
  qualidade_contexto text
)
language sql
security definer
set search_path = public
as $$
  select
    v.unidade_nome::text,
    v.professor_id,
    v.professor_nome::text,
    v.aluno_id,
    v.aluno_nome::text,
    v.aluno_status::text,
    v.curso_nome::text,
    v.tipo_matricula_nome::text,
    v.dia_aula::text,
    v.horario_aula::text,
    v.valor_parcela,
    v.qualidade_contexto::text
  from public.vw_fabio_carteira_professor v
  where (p_unidade_id is null or v.unidade_id = p_unidade_id)
    and (
      p_professor_busca is null or length(trim(p_professor_busca)) = 0
      or lower(v.professor_nome) like '%' || lower(trim(p_professor_busca)) || '%'
    )
  order by v.unidade_nome, v.professor_nome, v.dia_aula, v.horario_aula, v.aluno_nome
  limit greatest(1, least(coalesce(p_limit,200), 500));
$$;

create or replace function public.maria_lareport_consultor_matriculas_mes(
  p_unidade_id uuid,
  p_ano integer,
  p_mes integer,
  p_limit integer default 200
)
returns table (
  aluno_nome text,
  unidade_nome text,
  data_matricula date,
  consultor_nome text,
  agente_comercial text,
  canal_origem text,
  curso_nome text,
  professor_nome text,
  valor_parcela numeric,
  valor_passaporte numeric,
  mrr_acrescimo numeric
)
language sql
security definer
set search_path = public
as $$
  select
    d.aluno_nome,
    d.unidade_nome,
    d.data_matricula,
    d.consultor_nome,
    d.agente_comercial,
    d.canal_origem,
    d.curso_nome,
    d.professor_nome,
    d.valor_parcela,
    d.valor_passaporte,
    d.mrr_acrescimo
  from public.maria_lareport_matriculas_mes_detalhe(p_unidade_id,p_ano,p_mes,p_limit) d
  order by d.consultor_nome nulls last, d.agente_comercial nulls last, d.data_matricula desc, d.aluno_nome;
$$;

grant execute on function public.maria_lareport_buscar_alunos(text, uuid, integer) to maria_lareport_rpc;
grant execute on function public.maria_lareport_matriculas_mes_detalhe(uuid, integer, integer, integer) to maria_lareport_rpc;
grant execute on function public.maria_lareport_evasoes_mes_detalhe(uuid, integer, integer, integer) to maria_lareport_rpc;
grant execute on function public.maria_lareport_professor_carteira(uuid, text, integer) to maria_lareport_rpc;
grant execute on function public.maria_lareport_consultor_matriculas_mes(uuid, integer, integer, integer) to maria_lareport_rpc;
