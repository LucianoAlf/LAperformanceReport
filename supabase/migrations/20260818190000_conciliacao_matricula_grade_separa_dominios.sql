-- A fila historica auto_preview misturava cadastro, financeiro e grade. Esta
-- migration preserva o payload original, reclassifica o que e operacional e
-- deixa auto_preview exclusivamente para curso/professor/dia/horario.
begin;

create temporary table _conciliacao_auto_preview_legado on commit drop as
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
  p.patch_original,
  p.diffs_original,
  coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(p.patch_original) e
    where e.key = any (array['curso_id', 'professor_atual_id', 'dia_aula', 'horario_aula'])
  ), '{}'::jsonb) as grade_patch,
  coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(p.diffs_original) e
    where e.key = any (array['curso_id', 'professor_atual_id', 'dia_aula', 'horario_aula'])
  ), '{}'::jsonb) as grade_diffs,
  coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(p.patch_original) e
    where e.key = any (array['telefone', 'email', 'responsavel_nome', 'responsavel_telefone', 'foto_url', 'instagram'])
  ), '{}'::jsonb) as cadastro_patch,
  coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(p.patch_original) e
    where e.key = any (array['forma_pagamento_id', 'status_pagamento'])
  ), '{}'::jsonb) as financeiro_patch,
  coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(p.patch_original) e
    where e.key = any (array['valor_cheio', 'desconto_fixo', 'desconto_condicional', 'valor_parcela'])
  ), '{}'::jsonb) as valores_patch,
  coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(p.patch_original) e
    where e.key = any (array['data_fim_contrato', 'status', 'data_saida'])
  ), '{}'::jsonb) as contrato_patch,
  coalesce((
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(p.patch_original) e
    where e.key <> all (array[
      'curso_id', 'professor_atual_id', 'dia_aula', 'horario_aula',
      'telefone', 'email', 'responsavel_nome', 'responsavel_telefone', 'foto_url', 'instagram',
      'forma_pagamento_id', 'status_pagamento',
      'valor_cheio', 'desconto_fixo', 'desconto_condicional', 'valor_parcela',
      'data_fim_contrato', 'status', 'data_saida'
    ])
  ), '{}'::jsonb) as desconhecidos_patch
from public.matriculas_divergencias d
left join public.matriculas_divergencias_decisoes dec
  on dec.divergencia_id = d.id
cross join lateral (
  select
    coalesce(d.valor_api -> 'patch', '{}'::jsonb) as patch_original,
    coalesce(d.valor_api -> 'diffs', '{}'::jsonb) as diffs_original
) p
where d.tipo_divergencia = 'auto_preview'
  and d.resolvido = false
  and dec.id is null;

-- Forma de pagamento e status financeiro passam para a fila financeira. Os
-- demais dados cadastrais são preenchidos pelo próximo sync fresco do Emusys,
-- sempre respeitando campos locais já fixados pela equipe.
with campos as (
  select
    l.*,
    e.key as campo_atributo,
    e.value as valor_origem,
    case e.key
      when 'forma_pagamento_id' then 'forma_pagamento_divergente'
      when 'status_pagamento' then 'status_financeiro_divergente'
    end as tipo_atributo
  from _conciliacao_auto_preview_legado l
  cross join lateral jsonb_each(l.patch_original) e
  where e.key in ('forma_pagamento_id', 'status_pagamento')
    and e.value <> 'null'::jsonb
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
    -- Uma decisão humana anterior não é reaberta a partir de um snapshot
    -- legado. O próximo snapshot fresco pode gerar uma nova divergência real.
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
  'emusys_matriculas', severidade, false, now()
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

-- Valor e contrato nunca sao sugestao de grade. Mantemos uma tarefa propria,
-- sem gravar o patch no aluno nem inferir pagamento a partir de ausencia.
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
    'motivo', 'auto_preview_legado_reclassificado',
    'patch', l.valores_patch,
    'diffs', coalesce((
      select jsonb_object_agg(e.key, e.value)
      from jsonb_each(l.diffs_original) e
      where e.key = any (array['valor_cheio', 'desconto_fixo', 'desconto_condicional', 'valor_parcela'])
    ), '{}'::jsonb),
    'parcela_comercial', l.valores_patch -> 'valor_parcela'
  ),
  l.valores_patch -> 'valor_parcela',
  'media', false, 'migracao_conciliacao_dominios', now()
from _conciliacao_auto_preview_legado l
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
    'motivo', 'contrato_emusys_legado_reclassificado',
    'patch', jsonb_build_object(e.key, e.value),
    'diffs', jsonb_build_object(e.key, coalesce(l.diffs_original -> e.key, 'null'::jsonb))
  ),
  e.value,
  'alta', false, 'migracao_conciliacao_dominios', now()
from _conciliacao_auto_preview_legado l
cross join lateral jsonb_each(l.contrato_patch) e
where l.aluno_id is not null
on conflict (aluno_id, tipo_divergencia, campo) do nothing;

-- Em registros mistos preservamos somente a grade ativa. A foto original da
-- migração fica no próprio payload para auditoria, sem precisar criar uma
-- decisão que esconderia a parte de grade ainda pendente.
update public.matriculas_divergencias d
set campo = coalesce((
      select 'auto:' || string_agg(e.key || '=' || left(e.value #>> '{}', 80), '|' order by e.key)
      from jsonb_each(l.grade_patch) e
    ), d.campo),
    valor_api = coalesce(d.valor_api, '{}'::jsonb) || jsonb_build_object(
      'patch', l.grade_patch,
      'diffs', l.grade_diffs,
      'historico_separacao_dominio', jsonb_build_object(
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
from _conciliacao_auto_preview_legado l
where d.id = l.id
  and l.grade_patch <> '{}'::jsonb
  and (
    l.cadastro_patch <> '{}'::jsonb
    or l.financeiro_patch <> '{}'::jsonb
    or l.valores_patch <> '{}'::jsonb
    or l.contrato_patch <> '{}'::jsonb
    or l.desconhecidos_patch <> '{}'::jsonb
  )
  and not exists (
    select 1
    from public.matriculas_divergencias outra
    where outra.id <> d.id
      and outra.aluno_id is not distinct from d.aluno_id
      and outra.tipo_divergencia = 'auto_preview'
      and outra.campo = (
        select 'auto:' || string_agg(e.key || '=' || left(e.value #>> '{}', 80), '|' order by e.key)
        from jsonb_each(l.grade_patch) e
      )
  );

-- Linhas sem qualquer campo de grade deixam de aparecer como Sync grade. A
-- decisão técnica carrega a fotografia original e não representa pagamento,
-- cancelamento ou escolha humana sobre a matrícula.
insert into public.matriculas_divergencias_decisoes (
  divergencia_id, aluno_id, decisao, valor_escolhido, motivo, decidido_por,
  metadata, updated_at
)
select
  l.id,
  l.aluno_id,
  'reclassificado_por_dominio',
  '{}'::jsonb,
  'Fila legada auto_preview sem campo de grade foi encaminhada para o domínio correto.',
  'migration:20260818190000',
  jsonb_build_object(
    'regra', 'auto_preview_exclusivo_grade',
    'patch_legado_original', l.patch_original,
    'diffs_legado_original', l.diffs_original,
    'cadastro_patch', l.cadastro_patch,
    'financeiro_patch', l.financeiro_patch,
    'valores_patch', l.valores_patch,
    'contrato_patch', l.contrato_patch,
    'desconhecidos_patch', l.desconhecidos_patch
  ),
  now()
from _conciliacao_auto_preview_legado l
where l.grade_patch = '{}'::jsonb
on conflict (divergencia_id) do nothing;

update public.matriculas_divergencias d
set resolvido = true,
    updated_at = now()
from _conciliacao_auto_preview_legado l
where d.id = l.id
  and l.grade_patch = '{}'::jsonb;

-- O GET /matriculas e a fonte dos dados cadastrais correntes. A mesma guarda
-- atomica usada para contato agora cobre foto e Instagram, sem conceder ao
-- sync qualquer poder sobre forma de pagamento ou valores financeiros.
create or replace function public.aplicar_cadastro_emusys_canonico(
  p_unidade_id uuid,
  p_aluno_id integer,
  p_emusys_matricula_id text,
  p_patch jsonb
)
returns table (
  aluno_id integer,
  campos_aplicados text[]
)
language plpgsql
set search_path to 'public'
as $function$
declare
  v_aluno_id integer;
  v_campos_aplicados text[] := array[]::text[];
begin
  if nullif(btrim(coalesce(p_emusys_matricula_id, '')), '') is null then
    raise exception using
      errcode = '22023',
      message = 'MATRICULA_EMUSYS_OBRIGATORIA_PARA_PATCH_CADASTRO';
  end if;

  if coalesce(jsonb_typeof(p_patch), '') <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'PATCH_CADASTRO_EMUSYS_INVALIDO';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_patch) as chave(campo)
    where chave.campo not in (
      'telefone',
      'email',
      'responsavel_nome',
      'responsavel_telefone',
      'foto_url',
      'instagram'
    )
  ) then
    raise exception using
      errcode = '22023',
      message = 'PATCH_CADASTRO_EMUSYS_COM_CAMPO_NAO_PERMITIDO';
  end if;

  select a.id
    into v_aluno_id
  from public.alunos a
  where a.id = p_aluno_id
    and a.unidade_id = p_unidade_id
    and a.emusys_matricula_id = p_emusys_matricula_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'IDENTIDADE_MATRICULA_EMUSYS_DIVERGENTE';
  end if;

  select coalesce(array_agg(chave.campo order by chave.campo), array[]::text[])
    into v_campos_aplicados
  from jsonb_object_keys(p_patch) as chave(campo)
  where chave.campo in (
      'telefone',
      'email',
      'responsavel_nome',
      'responsavel_telefone',
      'foto_url',
      'instagram'
    )
    and nullif(btrim(p_patch ->> chave.campo), '') is not null
    and not exists (
      select 1
      from public.matriculas_campos_fixados f
      where f.aluno_id = v_aluno_id
        and f.campo = chave.campo
    );

  if cardinality(v_campos_aplicados) = 0 then
    return query select v_aluno_id, v_campos_aplicados;
    return;
  end if;

  update public.alunos a
  set telefone = case when 'telefone' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'telefone'), '') else a.telefone end,
      email = case when 'email' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'email'), '') else a.email end,
      responsavel_nome = case when 'responsavel_nome' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'responsavel_nome'), '') else a.responsavel_nome end,
      responsavel_telefone = case when 'responsavel_telefone' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'responsavel_telefone'), '') else a.responsavel_telefone end,
      foto_url = case when 'foto_url' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'foto_url'), '') else a.foto_url end,
      instagram = case when 'instagram' = any(v_campos_aplicados) then nullif(btrim(p_patch ->> 'instagram'), '') else a.instagram end,
      updated_at = now(),
      updated_by = 'sync-matriculas-emusys'
  where a.id = v_aluno_id
    and a.unidade_id = p_unidade_id
    and a.emusys_matricula_id = p_emusys_matricula_id;

  return query select v_aluno_id, v_campos_aplicados;
end;
$function$;

revoke all on function public.aplicar_cadastro_emusys_canonico(uuid, integer, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.aplicar_cadastro_emusys_canonico(uuid, integer, text, jsonb)
  to service_role;

-- Escolha manual de forma de pagamento e uma decisão operacional local. Ela
-- precisa ser fixada para que o próximo snapshot Emusys não reabra a mesma
-- pendência apenas porque a API não tem esse metadado cadastrado.
create or replace function public.definir_forma_pagamento_conciliacao_aluno(
  p_divergencia_id bigint,
  p_forma_pagamento_id integer,
  p_decidido_por text default 'usuario_app'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_div public.alunos_emusys_atributos_divergencias%rowtype;
  v_forma public.formas_pagamento%rowtype;
  v_agora timestamptz := now();
  v_valor_aplicado jsonb;
begin
  select *
    into v_div
  from public.alunos_emusys_atributos_divergencias
  where id = p_divergencia_id
  for update;

  if not found then
    raise exception 'divergencia % nao encontrada', p_divergencia_id;
  end if;

  if v_div.resolvido then
    return jsonb_build_object('ok', true, 'ja_resolvido', true, 'id', p_divergencia_id);
  end if;

  if v_div.aluno_id is null then
    raise exception 'aluno_id obrigatorio para definir forma de pagamento';
  end if;

  if v_div.campo <> 'forma_pagamento_id' then
    raise exception 'campo % nao pode ser alterado por esta RPC', v_div.campo;
  end if;

  perform 1
  from public.alunos
  where id = v_div.aluno_id
  for update;

  if not found then
    raise exception 'aluno % da divergencia nao encontrado', v_div.aluno_id;
  end if;

  select *
    into v_forma
  from public.formas_pagamento
  where id = p_forma_pagamento_id
    and ativo is true;

  if not found then
    raise exception 'forma de pagamento % nao encontrada ou inativa', p_forma_pagamento_id;
  end if;

  update public.alunos
  set forma_pagamento_id = v_forma.id,
      updated_at = v_agora,
      updated_by = coalesce(p_decidido_por, 'usuario_app')
  where id = v_div.aluno_id;

  v_valor_aplicado := jsonb_build_object(
    'forma_pagamento_id', v_forma.id,
    'forma_pagamento', v_forma.nome,
    'sigla', v_forma.sigla
  );

  insert into public.matriculas_campos_fixados
    (aluno_id, campo, valor, fixado_por, fixado_em)
  values
    (
      v_div.aluno_id,
      'forma_pagamento_id',
      v_valor_aplicado,
      coalesce(p_decidido_por, 'usuario_app'),
      v_agora
    )
  on conflict (aluno_id, campo) do update set
    valor = excluded.valor,
    fixado_por = excluded.fixado_por,
    fixado_em = excluded.fixado_em;

  insert into public.alunos_emusys_atributos_decisoes
    (divergencia_id, aluno_id, decisao, campo, valor_nosso, valor_emusys, valor_aplicado, motivo, decidido_por, metadata)
  values
    (
      v_div.id,
      v_div.aluno_id,
      'definir_manual',
      v_div.campo,
      coalesce(v_div.valor_nosso, '{}'::jsonb),
      coalesce(v_div.valor_emusys, '{}'::jsonb),
      v_valor_aplicado,
      'Conciliacao atributo aluno: definir forma de pagamento manual e fixar escolha local',
      coalesce(p_decidido_por, 'usuario_app'),
      jsonb_build_object(
        'tipo_divergencia', v_div.tipo_divergencia,
        'emusys_student_id', v_div.emusys_student_id,
        'emusys_matricula_id', v_div.emusys_matricula_id,
        'fonte', v_div.fonte,
        'campo_fixado', true
      )
    );

  update public.alunos_emusys_atributos_divergencias
  set resolvido = true,
      decisao = 'definir_manual',
      decidido_por = coalesce(p_decidido_por, 'usuario_app'),
      decidido_em = v_agora,
      updated_at = v_agora
  where id = v_div.id;

  return jsonb_build_object(
    'ok', true,
    'id', p_divergencia_id,
    'aluno_id', v_div.aluno_id,
    'decisao', 'definir_manual',
    'resolvido', true,
    'valor_aplicado', v_valor_aplicado,
    'campo_fixado', true
  );
end;
$function$;

revoke all on function public.definir_forma_pagamento_conciliacao_aluno(bigint, integer, text)
  from public, anon;
grant execute on function public.definir_forma_pagamento_conciliacao_aluno(bigint, integer, text)
  to authenticated, service_role;

commit;
