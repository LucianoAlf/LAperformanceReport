-- A Edge remota versionada fora do Git reintroduziu `auto_preview` misturando
-- grade, financeiro, valores e foto. Esta migration é idempotente para o lote
-- ainda aberto: preserva a evidência, move cada domínio para sua fila e deixa
-- `auto_preview` somente com curso/professor/dia/horário.
begin;

create temporary table _conciliacao_auto_preview_reintroduzido on commit drop as
with base as (
  select
    d.id,
    d.aluno_id,
    d.emusys_matricula_id,
    d.unidade_id,
    d.campo,
    d.valor_nosso,
    d.valor_api,
    d.sugestao,
    d.severidade,
    d.fonte,
    d.analise_sol,
    coalesce(d.valor_api -> 'patch', '{}'::jsonb) as patch_original,
    coalesce(d.valor_api -> 'diffs', '{}'::jsonb) as diffs_original
  from public.matriculas_divergencias d
  left join public.matriculas_divergencias_decisoes dec
    on dec.divergencia_id = d.id
  where d.tipo_divergencia = 'auto_preview'
    and d.resolvido = false
    and dec.id is null
), partes as (
  select
    b.*,
    coalesce((
      select jsonb_object_agg(e.key, e.value)
      from jsonb_each(b.patch_original) e
      where e.key = any (array['curso_id', 'professor_atual_id', 'dia_aula', 'horario_aula'])
    ), '{}'::jsonb) as grade_patch,
    coalesce((
      select jsonb_object_agg(e.key, e.value)
      from jsonb_each(b.diffs_original) e
      where e.key = any (array['curso_id', 'professor_atual_id', 'dia_aula', 'horario_aula'])
    ), '{}'::jsonb) as grade_diffs,
    coalesce((
      select jsonb_object_agg(e.key, e.value)
      from jsonb_each(b.patch_original) e
      where e.key = any (array['telefone', 'email', 'responsavel_nome', 'responsavel_telefone', 'foto_url', 'instagram'])
    ), '{}'::jsonb) as cadastro_patch,
    coalesce((
      select jsonb_object_agg(e.key, e.value)
      from jsonb_each(b.patch_original) e
      where e.key = any (array['forma_pagamento_id', 'status_pagamento'])
    ), '{}'::jsonb) as financeiro_patch,
    coalesce((
      select jsonb_object_agg(e.key, e.value)
      from jsonb_each(b.patch_original) e
      where e.key = any (array['valor_cheio', 'desconto_fixo', 'desconto_condicional', 'valor_parcela'])
    ), '{}'::jsonb) as valores_patch,
    coalesce((
      select jsonb_object_agg(e.key, e.value)
      from jsonb_each(b.patch_original) e
      where e.key = any (array['data_fim_contrato', 'status', 'data_saida'])
    ), '{}'::jsonb) as contrato_patch
  from base b
)
select
  p.*,
  coalesce((
    select 'auto:' || string_agg(e.key || '=' || left(e.value #>> '{}', 80), '|' order by e.key)
    from jsonb_each(p.grade_patch) e
  ), 'auto:vazio') as campo_grade
from partes p
where p.patch_original ?| array[
  'telefone', 'email', 'responsavel_nome', 'responsavel_telefone', 'foto_url', 'instagram',
  'forma_pagamento_id', 'status_pagamento',
  'valor_cheio', 'desconto_fixo', 'desconto_condicional', 'valor_parcela',
  'data_fim_contrato', 'status', 'data_saida'
];

-- Financeiro tem fila própria. Não reapresentar uma decisão humana já concluída
-- apenas porque a versão legada da Edge trouxe o mesmo campo de novo.
with campos as (
  select
    l.*,
    e.key as campo_atributo,
    e.value as valor_origem,
    case e.key
      when 'forma_pagamento_id' then 'forma_pagamento_divergente'
      when 'status_pagamento' then 'status_financeiro_divergente'
    end as tipo_atributo
  from _conciliacao_auto_preview_reintroduzido l
  cross join lateral jsonb_each(l.financeiro_patch) e
  where e.value <> 'null'::jsonb
), prontos as (
  select
    c.unidade_id,
    c.aluno_id,
    a.emusys_student_id::text as emusys_student_id,
    c.emusys_matricula_id,
    c.tipo_atributo as tipo_divergencia,
    c.campo_atributo as campo,
    jsonb_build_object(c.campo_atributo, to_jsonb(a) -> c.campo_atributo) as valor_nosso,
    jsonb_build_object(c.campo_atributo, c.valor_origem) as valor_emusys,
    jsonb_build_object(c.campo_atributo, c.valor_origem) as sugestao,
    case when c.campo_atributo = 'status_pagamento' then 'alta' else 'baixa' end as severidade
  from campos c
  join public.alunos a
    on a.id = c.aluno_id
   and a.unidade_id = c.unidade_id
  where c.aluno_id is not null
    and not exists (
      select 1
      from public.alunos_emusys_atributos_divergencias antiga
      where antiga.unidade_id = c.unidade_id
        and antiga.aluno_id is not distinct from c.aluno_id
        and antiga.emusys_matricula_id is not distinct from c.emusys_matricula_id
        and antiga.tipo_divergencia = c.tipo_atributo
        and antiga.campo = c.campo_atributo
        and antiga.resolvido = true
        and antiga.decisao is not null
    )
)
insert into public.alunos_emusys_atributos_divergencias (
  unidade_id, aluno_id, emusys_student_id, emusys_matricula_id,
  tipo_divergencia, campo, valor_nosso, valor_emusys, sugestao,
  fonte, severidade, resolvido, updated_at
)
select
  unidade_id, aluno_id, emusys_student_id, emusys_matricula_id,
  tipo_divergencia, campo, valor_nosso, valor_emusys, sugestao,
  'migracao_conciliacao_reintroducao', severidade, false, now()
from prontos
on conflict (
  unidade_id,
  (coalesce(aluno_id, '-1'::integer)),
  (coalesce(emusys_matricula_id, ''::text)),
  tipo_divergencia,
  campo
) where resolvido = false do update
set emusys_student_id = excluded.emusys_student_id,
    valor_nosso = excluded.valor_nosso,
    valor_emusys = excluded.valor_emusys,
    sugestao = excluded.sugestao,
    severidade = excluded.severidade,
    updated_at = now();

-- Valores e contrato ficam na sua própria divergência, sem alterar o aluno nem
-- inferir recebimento. Se já existe uma decisão, ela prevalece.
insert into public.matriculas_divergencias (
  aluno_id, emusys_matricula_id, unidade_id, tipo_divergencia, campo,
  valor_nosso, valor_api, sugestao, severidade, resolvido, fonte, updated_at
)
select
  l.aluno_id,
  l.emusys_matricula_id,
  l.unidade_id,
  'valor_divergente',
  'valor_parcela',
  l.valor_nosso,
  jsonb_build_object(
    'motivo', 'auto_preview_reintroduzido_reclassificado',
    'patch', l.valores_patch,
    'diffs', coalesce((
      select jsonb_object_agg(e.key, e.value)
      from jsonb_each(l.diffs_original) e
      where e.key = any (array['valor_cheio', 'desconto_fixo', 'desconto_condicional', 'valor_parcela'])
    ), '{}'::jsonb)
  ),
  l.valores_patch -> 'valor_parcela',
  'media', false, 'migracao_conciliacao_reintroducao', now()
from _conciliacao_auto_preview_reintroduzido l
where l.aluno_id is not null
  and l.valores_patch <> '{}'::jsonb
on conflict (aluno_id, tipo_divergencia, campo) do nothing;

insert into public.matriculas_divergencias (
  aluno_id, emusys_matricula_id, unidade_id, tipo_divergencia, campo,
  valor_nosso, valor_api, sugestao, severidade, resolvido, fonte, updated_at
)
select
  l.aluno_id,
  l.emusys_matricula_id,
  l.unidade_id,
  'status_divergente',
  e.key,
  l.valor_nosso,
  jsonb_build_object(
    'motivo', 'contrato_auto_preview_reintroduzido_reclassificado',
    'patch', jsonb_build_object(e.key, e.value),
    'diffs', jsonb_build_object(e.key, coalesce(l.diffs_original -> e.key, 'null'::jsonb))
  ),
  e.value,
  'alta', false, 'migracao_conciliacao_reintroducao', now()
from _conciliacao_auto_preview_reintroduzido l
cross join lateral jsonb_each(l.contrato_patch) e
where l.aluno_id is not null
on conflict (aluno_id, tipo_divergencia, campo) do nothing;

-- Registro misto permanece aberto somente se ainda houver grade real. O payload
-- completo anterior é preservado dentro do próprio registro para auditoria.
update public.matriculas_divergencias d
set campo = l.campo_grade,
    valor_api = jsonb_build_object(
      'patch', l.grade_patch,
      'diffs', l.grade_diffs,
      'status_api', l.valor_api -> 'status_api',
      'historico_reclassificacao_reintroducao', jsonb_build_object(
        'migrado_em', now(),
        'patch_legado_original', l.patch_original,
        'diffs_legado_original', l.diffs_original,
        'campos_encaminhados', (
          select coalesce(jsonb_agg(e.key order by e.key), '[]'::jsonb)
          from jsonb_each(l.patch_original) e
          where e.key <> all (array['curso_id', 'professor_atual_id', 'dia_aula', 'horario_aula'])
        )
      )
    ),
    updated_at = now()
from _conciliacao_auto_preview_reintroduzido l
where d.id = l.id
  and l.grade_patch <> '{}'::jsonb
  and not exists (
    select 1
    from public.matriculas_divergencias outra
    where outra.id <> d.id
      and outra.aluno_id is not distinct from d.aluno_id
      and outra.tipo_divergencia = 'auto_preview'
      and outra.campo = l.campo_grade
  );

-- Sem grade, ou duplicado de uma grade já existente: sai da fila operacional,
-- mas fica com decisão técnica e payload integral guardado.
insert into public.matriculas_divergencias_decisoes (
  divergencia_id, aluno_id, decisao, valor_escolhido, motivo, decidido_por,
  metadata, updated_at
)
select
  l.id,
  l.aluno_id,
  'reclassificado_por_dominio_reintroducao',
  '{}'::jsonb,
  'Registro auto_preview reintroduzido foi separado por domínio; não é decisão financeira nem alteração automática de grade.',
  'migration:20260818194337',
  jsonb_build_object(
    'regra', 'auto_preview_exclusivo_grade',
    'patch_legado_original', l.patch_original,
    'diffs_legado_original', l.diffs_original,
    'cadastro_patch', l.cadastro_patch,
    'financeiro_patch', l.financeiro_patch,
    'valores_patch', l.valores_patch,
    'contrato_patch', l.contrato_patch,
    'grade_patch', l.grade_patch,
    'motivo_saida_fila', case
      when l.grade_patch = '{}'::jsonb then 'sem_grade'
      else 'duplicado_de_grade_canonica'
    end
  ),
  now()
from _conciliacao_auto_preview_reintroduzido l
where l.grade_patch = '{}'::jsonb
   or exists (
     select 1
     from public.matriculas_divergencias outra
     where outra.id <> l.id
       and outra.aluno_id is not distinct from l.aluno_id
       and outra.tipo_divergencia = 'auto_preview'
       and outra.campo = l.campo_grade
   )
on conflict (divergencia_id) do nothing;

update public.matriculas_divergencias d
set resolvido = true,
    updated_at = now()
from _conciliacao_auto_preview_reintroduzido l
where d.id = l.id
  and (
    l.grade_patch = '{}'::jsonb
    or exists (
      select 1
      from public.matriculas_divergencias outra
      where outra.id <> d.id
        and outra.aluno_id is not distinct from d.aluno_id
        and outra.tipo_divergencia = 'auto_preview'
        and outra.campo = l.campo_grade
    )
  );

commit;
