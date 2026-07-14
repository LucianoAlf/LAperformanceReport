-- P0/P1 professores: identidade Emusys por unidade, distinta do vinculo operacional.
-- IDs do Emusys sao namespaced por unidade. Nome e apenas evidencia de backfill auditado.

alter table public.professores_unidades
  add column if not exists identidade_historica_valida boolean not null default false;

comment on column public.professores_unidades.identidade_historica_valida is
  'Permite resolver autoria historica pelo ID Emusys sem tornar o vinculo ativo na unidade.';

alter table public.aulas_emusys
  add column if not exists emusys_professor_id integer,
  add column if not exists sem_acompanhamento boolean not null default false;

create index if not exists idx_aulas_emusys_unidade_emusys_professor
  on public.aulas_emusys (unidade_id, emusys_professor_id)
  where emusys_professor_id is not null;

-- Leonardo: identidade historica em Campo Grande, mas vinculo operacional continua ignorado.
update public.professores_unidades pu
set emusys_id = 3221,
    emusys_nome = 'Léo Cabral de Castro',
    emusys_nome_normalizado = 'leo cabral de castro',
    emusys_ativo = false,
    identidade_historica_valida = true,
    updated_at = now()
from public.professores p, public.unidades u
where pu.professor_id = p.id
  and pu.unidade_id = u.id
  and p.nome_normalizado = 'LEONARDO CASTRO'
  and u.codigo = 'CG'
  and pu.validacao_status = 'ignorado'
  and pu.origem = 'validacao_humana_ignorado_p07'
  and (pu.emusys_id is null or pu.emusys_id = 3221);

insert into public.professores_sync_log (
  evento, unidade_id, professor_id, emusys_id, nome_emusys, detalhes
)
select
  'identidade_historica_revisada_20260714',
  pu.unidade_id,
  pu.professor_id,
  3221,
  'Léo Cabral de Castro',
  jsonb_build_object(
    'vinculo_operacional', false,
    'decisao_original_preservada', 'validacao_humana_ignorado_p07',
    'evidencia_nova', 'Leonardo atua somente na Barra; 3 slots futuros CG sem alunos',
    'revisado_em', '2026-07-14'
  )
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
join public.unidades u on u.id = pu.unidade_id
where p.nome_normalizado = 'LEONARDO CASTRO'
  and u.codigo = 'CG'
  and pu.emusys_id = 3221
  and pu.emusys_ativo = false
  and pu.validacao_status = 'ignorado'
  and pu.origem = 'validacao_humana_ignorado_p07'
  and not exists (
  select 1
  from public.professores_sync_log l
  where l.evento = 'identidade_historica_revisada_20260714'
    and l.unidade_id = pu.unidade_id
    and l.professor_id = pu.professor_id
    and l.emusys_id = 3221
);

-- Vanessa: ex-professora. Cadastro e identidade existem apenas para autoria historica.
do $$
declare
  v_professor_id integer;
begin
  select id into v_professor_id
  from public.professores
  where nome_normalizado = 'vanessa machado de sousa'
  limit 1;

  if v_professor_id is null then
    insert into public.professores (
      nome, ativo, observacoes, created_at, updated_at
    ) values (
      'Vanessa Machado de Sousa',
      false,
      'Identidade historica criada em 14/07/2026. Ex-professora da Barra.',
      now(),
      now()
    )
    returning id into v_professor_id;
  else
    update public.professores
    set ativo = false,
        updated_at = now()
    where id = v_professor_id;
  end if;

  insert into public.professores_unidades (
    professor_id,
    unidade_id,
    emusys_id,
    emusys_nome,
    emusys_nome_normalizado,
    emusys_ativo,
    validacao_status,
    match_score,
    origem,
    validado_em,
    validado_por,
    identidade_historica_valida,
    updated_at
  ) values (
    v_professor_id,
    (select id from public.unidades where codigo = 'BARRA' limit 1),
    1113,
    'Vanessa Machado de Sousa',
    'vanessa machado de sousa',
    false,
    'ignorado',
    1,
    'auditoria_identidade_historica_20260714',
    now(),
    'alf_regra_negocio_20260714',
    true,
    now()
  )
  on conflict (professor_id, unidade_id) do update
  set emusys_id = excluded.emusys_id,
      emusys_nome = excluded.emusys_nome,
      emusys_nome_normalizado = excluded.emusys_nome_normalizado,
      emusys_ativo = false,
      validacao_status = 'ignorado',
      origem = 'auditoria_identidade_historica_20260714',
      validado_em = now(),
      validado_por = 'alf_regra_negocio_20260714',
      identidade_historica_valida = true,
      updated_at = now();

  insert into public.professores_sync_log (
    evento, unidade_id, professor_id, emusys_id, nome_emusys, detalhes
  )
  select
    'identidade_historica_criada_20260714',
    (select id from public.unidades where codigo = 'BARRA' limit 1),
    v_professor_id,
    1113,
    'Vanessa Machado de Sousa',
    jsonb_build_object(
      'vinculo_operacional', false,
      'evidencia', 'Ex-professora; quatro aulas historicas na Barra',
      'revisado_em', '2026-07-14'
    )
  where not exists (
    select 1 from public.professores_sync_log l
    where l.evento = 'identidade_historica_criada_20260714'
      and l.unidade_id = (select id from public.unidades where codigo = 'BARRA' limit 1)
      and l.professor_id = v_professor_id
      and l.emusys_id = 1113
  );
end $$;

-- Backfill unico e auditado dos IDs crus. O sync continuo nao usa nomes.
with depara(unidade_id, professor_nome, emusys_professor_id) as (
  select id, 'Erick Osmy'::text, 2109 from public.unidades where codigo = 'REC'
  union all select id, 'Erick Osmy'::text, 1160 from public.unidades where codigo = 'BARRA'
  union all select id, 'Vinicius Pinheiro'::text, 1392 from public.unidades where codigo = 'REC'
  union all select id, 'Juliana Azevedo'::text, 769 from public.unidades where codigo = 'CG'
  union all select id, 'Fabricio Costa'::text, 1296 from public.unidades where codigo = 'CG'
  union all select id, 'Léo Cabral de Castro'::text, 3221 from public.unidades where codigo = 'CG'
  union all select id, 'Vanessa Machado de Sousa'::text, 1113 from public.unidades where codigo = 'BARRA'
)
update public.aulas_emusys ae
set emusys_professor_id = d.emusys_professor_id
from depara d
where ae.unidade_id = d.unidade_id
  and ae.emusys_professor_id is null
  and ae.professor_nome like d.professor_nome || '%';

update public.aulas_emusys
set professor_id = null,
    sem_acompanhamento = true
where emusys_professor_id = 0;

update public.aulas_emusys ae
set professor_id = pu.professor_id,
    sem_acompanhamento = false
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
where ae.unidade_id = pu.unidade_id
  and ae.emusys_professor_id = pu.emusys_id
  and ae.emusys_professor_id > 0
  and (
    pu.identidade_historica_valida = true
    or (
      pu.emusys_ativo = true
      and pu.validacao_status <> 'ignorado'
      and p.ativo = true
    )
  )
  and ae.professor_id is distinct from pu.professor_id;

update public.aluno_jornada_matricula_disciplina j
set professor_id = pu.professor_id,
    updated_at = now()
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
where j.unidade_id = pu.unidade_id
  and j.emusys_professor_id = pu.emusys_id
  and (
    pu.identidade_historica_valida = true
    or (
      pu.emusys_ativo = true
      and pu.validacao_status <> 'ignorado'
      and p.ativo = true
    )
  )
  and j.professor_id is distinct from pu.professor_id;

update public.aluno_presenca ap
set professor_id = ae.professor_id
from public.aulas_emusys ae
where ap.aula_emusys_id = ae.id
  and ae.professor_id is not null
  and ae.emusys_professor_id is not null
  and ap.professor_id is distinct from ae.professor_id;

create or replace view public.vw_disponibilidade_professores
with (security_invoker = true) as
select
  pu.id as professores_unidade_id,
  pu.professor_id,
  p.nome as professor_nome,
  pu.unidade_id,
  u.nome as unidade_nome,
  coalesce(pu.disponibilidade, '{}'::jsonb) as disponibilidade,
  pu.emusys_id,
  pu.validacao_status,
  pu.last_seen_em,
  proposta.id as proposta_ativa_id,
  proposta.status as proposta_status,
  proposta.disponibilidade_proposta
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
join public.unidades u on u.id = pu.unidade_id
left join lateral (
  select dp.id, dp.status, dp.disponibilidade_proposta
  from public.disponibilidade_professor_propostas dp
  where dp.professor_id = pu.professor_id
    and dp.unidade_id = pu.unidade_id
    and dp.status in ('pendente_aprovacao', 'aprovada_aguardando_emusys')
  order by dp.created_at desc
  limit 1
) proposta on true
where p.ativo = true
  and pu.emusys_ativo = true
  and pu.validacao_status <> 'ignorado'
  and (
    pu.professor_id = public.fn_professor_do_usuario()
    or public.is_admin()
    or public.usuario_tem_permissao(
      (select usr.id from public.usuarios usr where usr.auth_user_id = auth.uid() limit 1),
      'professores.ver',
      pu.unidade_id
    )
  );

create or replace view public.vw_fabio_carteira_professor
with (security_invoker = true) as
select
  j.unidade_id,
  u.codigo as unidade_codigo,
  u.nome as unidade_nome,
  p.id as professor_id,
  p.nome as professor_nome,
  pu.id as professores_unidade_id,
  pu.emusys_id as emusys_professor_id,
  pu.validacao_status as professor_emusys_validacao_status,
  a.id as aluno_id,
  a.nome as aluno_nome,
  coalesce(a.emusys_student_id, j.emusys_aluno_id::text) as emusys_student_id,
  coalesce(a.emusys_matricula_id, j.emusys_matricula_id::text) as emusys_matricula_id,
  j.status_matricula::varchar(20) as aluno_status,
  coalesce(c.id, j.curso_id) as curso_id,
  coalesce(c.nome, j.curso_nome_emusys)::varchar(100) as curso_nome,
  tm.codigo as tipo_matricula_codigo,
  tm.nome as tipo_matricula_nome,
  coalesce(a.dia_aula, j.dia_semana::varchar)::varchar(20) as dia_aula,
  coalesce(a.horario_aula, nullif(j.horario, '')::time) as horario_aula,
  a.telefone,
  a.whatsapp,
  a.email,
  a.responsavel_nome,
  a.responsavel_telefone,
  a.valor_parcela,
  case
    when p.id is null then 'sem_professor_la'
    when pu.emusys_id is null then 'professor_sem_emusys_id'
    when a.emusys_student_id is null and j.emusys_aluno_id is null then 'aluno_sem_id_emusys'
    when coalesce(a.dia_aula, j.dia_semana::varchar) is null
      or coalesce(a.horario_aula, nullif(j.horario, '')::time) is null then 'sem_horario'
    else 'ok'
  end as qualidade_contexto,
  j.id as jornada_id,
  j.emusys_matricula_disciplina_id
from public.aluno_jornada_matricula_disciplina j
join public.alunos a on a.id = j.aluno_id
join public.unidades u on u.id = j.unidade_id
join public.professores p on p.id = j.professor_id and p.ativo = true
join public.professores_unidades pu
  on pu.professor_id = p.id
 and pu.unidade_id = j.unidade_id
 and pu.emusys_ativo = true
 and pu.validacao_status <> 'ignorado'
left join public.cursos c on c.id = coalesce(j.curso_id, a.curso_id)
left join public.tipos_matricula tm on tm.id = a.tipo_matricula_id
where j.status_matricula = 'ativa'
  and a.arquivado_em is null;

create or replace view public.vw_fabio_aulas_contexto
with (security_invoker = true) as
select
  ae.id as aula_local_id,
  ae.emusys_id as aula_emusys_id,
  ae.unidade_id,
  u.codigo as unidade_codigo,
  u.nome as unidade_nome,
  ae.data_aula,
  ae.data_hora_inicio,
  ae.data_hora_fim,
  (ae.data_hora_inicio at time zone 'America/Sao_Paulo')::time as horario_inicio_brt,
  (ae.data_hora_fim at time zone 'America/Sao_Paulo')::time as horario_fim_brt,
  ae.tipo as aula_tipo,
  ae.categoria as aula_categoria,
  ae.turma_nome,
  ae.curso_emusys_id,
  ae.curso_nome,
  ae.sala_nome,
  ae.professor_id as professor_id_origem_aula,
  ae.professor_nome as professor_nome_origem_aula,
  ae.emusys_professor_id,
  coalesce(pu_identidade.emusys_nome, ae.professor_nome::text) as emusys_professor_nome,
  coalesce(pu_identidade.professor_id, ae.professor_id) as professor_id,
  coalesce(p_identidade.nome, p_la.nome, ae.professor_nome) as professor_nome,
  coalesce(pu_identidade.validacao_status, pu_operacional.validacao_status) as professor_emusys_validacao_status,
  case
    when ae.sem_acompanhamento then 'sem_acompanhamento'
    when pu_identidade.identidade_historica_valida then 'emusys_id_historico'
    when pu_identidade.id is not null then 'emusys_professor_id'
    when p_la.id is not null then 'professor_la_id_historico'
    else 'sem_match'
  end as professor_match_fonte,
  r.aluno_id,
  coalesce(a.nome, r.aluno_nome::varchar(200)) as aluno_nome,
  coalesce(a.emusys_student_id, r.aluno_emusys_id::text) as emusys_student_id,
  a.emusys_matricula_id,
  ap.status as presenca_status,
  ap.respondido_em as presenca_respondida_em,
  ae.cancelada,
  ae.nr_da_aula,
  ae.qtd_alunos,
  ae.anotacoes,
  ae.anotacoes_fabio,
  case
    when ae.sem_acompanhamento then 'sem_acompanhamento'
    when coalesce(pu_identidade.professor_id, ae.professor_id) is null then 'professor_sem_vinculo_la'
    when pu_operacional.id is null or coalesce(p_identidade.ativo, p_la.ativo, false) is not true
      then 'professor_fora_da_unidade_ativa'
    when r.aluno_id is null then 'aula_sem_roster'
    when a.id is null then 'roster_sem_aluno_la'
    else 'ok'
  end as qualidade_contexto,
  (
    pu_operacional.id is not null
    and coalesce(p_identidade.ativo, p_la.ativo, false) is true
  ) as professor_unidade_ativa,
  coalesce(pu_identidade.identidade_historica_valida, false) as identidade_historica_valida,
  ae.sem_acompanhamento
from public.aulas_emusys ae
join public.unidades u on u.id = ae.unidade_id
left join public.professores_unidades pu_identidade
  on pu_identidade.unidade_id = ae.unidade_id
 and pu_identidade.emusys_id = ae.emusys_professor_id
 and (
   pu_identidade.identidade_historica_valida = true
   or (pu_identidade.emusys_ativo = true and pu_identidade.validacao_status <> 'ignorado')
 )
left join public.professores p_identidade on p_identidade.id = pu_identidade.professor_id
left join public.professores p_la on p_la.id = ae.professor_id
left join public.professores_unidades pu_operacional
  on pu_operacional.unidade_id = ae.unidade_id
 and pu_operacional.professor_id = coalesce(pu_identidade.professor_id, ae.professor_id)
 and pu_operacional.emusys_ativo = true
 and pu_operacional.validacao_status <> 'ignorado'
left join public.aula_alunos_emusys r on r.aula_emusys_id = ae.id
left join public.alunos a on a.id = r.aluno_id
left join public.aluno_presenca ap
  on ap.aula_emusys_id = ae.id
 and ap.aluno_id = r.aluno_id;

create or replace function public.get_fabio_aulas_do_professor(
  p_unidade_id uuid default null,
  p_emusys_professor_id integer default null,
  p_data_aula date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'data_aula', p_data_aula,
    'total', count(*),
    'aulas', coalesce(
      jsonb_agg(to_jsonb(v) order by v.data_hora_inicio, v.aluno_nome)
        filter (where v.aula_local_id is not null),
      '[]'::jsonb
    )
  )
  from public.vw_fabio_aulas_contexto v
  where (p_unidade_id is null or v.unidade_id = p_unidade_id)
    and (p_emusys_professor_id is null or v.emusys_professor_id = p_emusys_professor_id)
    and v.data_aula = p_data_aula
    and v.professor_unidade_ativa = true
    and v.sem_acompanhamento = false
    and coalesce(v.cancelada, false) = false
    and coalesce(v.qtd_alunos, 0) > 0;
$$;

create or replace view public.vw_aulas_sem_professor
with (security_invoker = true) as
select
  case
    when ae.sem_acompanhamento then 'treino_sem_acompanhamento'
    when pu_recuperavel.identidade_historica_valida then 'identidade_historica_inativa'
    when ae.emusys_professor_id is not null and ae.emusys_professor_id > 0
      then 'BUG_falha_de_vinculo'
    when ae.professor_nome is not null then 'BUG_falha_de_vinculo'
    else 'indefinido_investigar'
  end as diagnostico,
  ae.id,
  ae.emusys_id,
  ae.data_aula,
  ae.professor_nome,
  ae.emusys_professor_id,
  ae.unidade_id,
  pu_recuperavel.professor_id as professor_recuperavel,
  ae.curso_nome,
  ae.sala_nome,
  ae.data_aula >= current_date as e_futura
from public.aulas_emusys ae
left join public.professores_unidades pu_recuperavel
  on pu_recuperavel.unidade_id = ae.unidade_id
 and pu_recuperavel.emusys_id = ae.emusys_professor_id
 and (
   pu_recuperavel.identidade_historica_valida = true
   or (pu_recuperavel.emusys_ativo = true and pu_recuperavel.validacao_status <> 'ignorado')
 )
where ae.professor_id is null
  and coalesce(ae.cancelada, false) = false;

create or replace view public.vw_professores_emusys_vinculos
with (security_invoker = true) as
select
  pu.id as professores_unidade_id,
  pu.unidade_id,
  u.codigo as unidade_codigo,
  u.nome as unidade_nome,
  pu.professor_id,
  p.nome as professor_nome,
  p.nome_normalizado as professor_nome_normalizado,
  p.ativo as professor_ativo,
  pu.emusys_id as emusys_professor_id,
  pu.emusys_nome,
  pu.emusys_nome_normalizado,
  pu.emusys_ativo,
  pu.validacao_status,
  pu.match_score,
  pu.origem,
  pu.validado_em,
  pu.validado_por,
  pu.last_seen_em,
  pu.updated_at,
  case
    when pu.identidade_historica_valida then 'identidade_historica_inativa'
    when pu.validacao_status = 'ignorado' then 'ignorado'
    when pu.emusys_id is null then 'sem_emusys_id'
    when p.ativo = true and pu.emusys_ativo = true
      and pu.validacao_status in ('validado_humano', 'auto_match', 'preexistente', 'pendente')
      then 'vinculo_utilizavel'
    when pu.emusys_ativo = false or p.ativo = false then 'inativo'
    else 'revisar'
  end as qualidade_vinculo,
  pu.identidade_historica_valida
from public.professores_unidades pu
join public.professores p on p.id = pu.professor_id
join public.unidades u on u.id = pu.unidade_id;

create or replace view public.vw_professores_performance_atual
with (security_invoker = true) as
with alunos_por_professor as (
  select
    p.id as professor_id,
    p.nome as professor,
    u.nome as unidade,
    u.id as unidade_id,
    count(a.id) as total_alunos,
    coalesce(avg(a.valor_parcela), 0::numeric) as ticket_medio,
    coalesce(sum(a.valor_parcela), 0::numeric) as mrr,
    coalesce(avg(a.tempo_permanencia_meses), 0::numeric) as tempo_medio,
    coalesce(avg(a.percentual_presenca), 0::numeric) as presenca_media
  from public.professores p
  join public.professores_unidades pu
    on pu.professor_id = p.id
   and pu.emusys_ativo = true
   and pu.validacao_status <> 'ignorado'
  join public.unidades u on u.id = pu.unidade_id
  left join public.alunos a
    on a.professor_atual_id = p.id
   and a.unidade_id = u.id
   and a.status = 'ativo'
  where p.ativo = true
  group by p.id, p.nome, u.nome, u.id
), experimentais_ano as (
  select professor_id, unidade_id, sum(experimentais) as total_experimentais
  from public.experimentais_professor_mensal
  where ano::numeric = extract(year from current_date)
  group by professor_id, unidade_id
), matriculas_ano as (
  select l.professor_fixo_id as professor_id, l.unidade_id,
         sum(coalesce(l.quantidade, 1)) as total_matriculas
  from public.leads l
  where l.status in ('matriculado', 'convertido')
    and l.professor_fixo_id is not null
    and extract(year from l.data_contato) = extract(year from current_date)
  group by l.professor_fixo_id, l.unidade_id
), evasoes_ano as (
  select m.professor_id, m.unidade_id, count(*) as total_evasoes
  from public.movimentacoes_admin m
  where public.is_movimentacao_admin_retencao_valida(m.id)
    and m.professor_id is not null
    and m.tipo in ('evasao', 'nao_renovacao')
    and extract(year from m.data) = extract(year from current_date)
  group by m.professor_id, m.unidade_id
)
select
  ap.professor_id,
  ap.professor,
  ap.unidade,
  extract(year from current_date)::integer as ano,
  ap.total_alunos,
  ap.ticket_medio::numeric(10,2) as ticket_medio,
  ap.mrr::numeric(12,2) as mrr,
  ap.tempo_medio::numeric(5,1) as tempo_permanencia_medio,
  ap.presenca_media::numeric(5,1) as presenca_media,
  coalesce(ea.total_experimentais, 0)::integer as experimentais,
  coalesce(ma.total_matriculas, 0)::integer as matriculas,
  case when coalesce(ea.total_experimentais, 0) > 0
    then round(coalesce(ma.total_matriculas, 0)::numeric / ea.total_experimentais::numeric * 100, 1)
    else 0::numeric end as taxa_conversao,
  coalesce(ev.total_evasoes, 0)::integer as evasoes
from alunos_por_professor ap
left join experimentais_ano ea on ea.professor_id = ap.professor_id and ea.unidade_id = ap.unidade_id
left join matriculas_ano ma on ma.professor_id = ap.professor_id and ma.unidade_id = ap.unidade_id
left join evasoes_ano ev on ev.professor_id = ap.professor_id and ev.unidade_id = ap.unidade_id
order by ap.total_alunos desc;

revoke all on public.vw_fabio_carteira_professor from public, anon;
revoke all on public.vw_fabio_aulas_contexto from public, anon;
revoke all on public.vw_aulas_sem_professor from public, anon;
revoke all on public.vw_professores_emusys_vinculos from public, anon;
revoke all on function public.get_fabio_aulas_do_professor(uuid, integer, date) from public, anon;

grant select on public.vw_disponibilidade_professores to authenticated;
grant select on public.vw_professores_performance_atual to authenticated;
grant select on public.vw_fabio_carteira_professor to authenticated, service_role;
grant select on public.vw_fabio_aulas_contexto to service_role;
grant select on public.vw_aulas_sem_professor to authenticated, service_role;
grant select on public.vw_professores_emusys_vinculos to authenticated, service_role;
grant execute on function public.get_fabio_aulas_do_professor(uuid, integer, date)
  to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'fabio_agent') then
    execute 'grant select on public.vw_fabio_carteira_professor to fabio_agent';
    execute 'grant select on public.vw_fabio_aulas_contexto to fabio_agent';
    execute 'grant select on public.vw_aulas_sem_professor to fabio_agent';
    execute 'grant select on public.vw_professores_emusys_vinculos to fabio_agent';
  end if;
end $$;
