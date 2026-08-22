-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

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
    case
      when coalesce(a.agente_comercial, l.agente_comercial) like '%@%' then initcap(split_part(coalesce(a.agente_comercial, l.agente_comercial),'@',1))
      else coalesce(a.agente_comercial, l.agente_comercial)
    end::text,
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
    case
      when coalesce(a.agente_comercial, l.agente_comercial) like '%@%' then initcap(split_part(coalesce(a.agente_comercial, l.agente_comercial),'@',1))
      else coalesce(a.agente_comercial, l.agente_comercial)
    end::text,
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

grant execute on function public.maria_lareport_buscar_alunos(text, uuid, integer) to maria_lareport_rpc;
grant execute on function public.maria_lareport_matriculas_mes_detalhe(uuid, integer, integer, integer) to maria_lareport_rpc;
