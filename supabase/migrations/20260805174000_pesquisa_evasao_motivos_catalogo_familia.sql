-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

begin
-- O catalogo continua sendo a fonte oficial. O alias apenas torna textos de
-- historico legados rastreaveis sem reescrever movimentacoes_admin.motivo.
alter table public.motivos_saida
  drop constraint if exists motivos_saida_categoria_check
alter table public.motivos_saida
  add constraint motivos_saida_categoria_check
  check (categoria in (
    'financeiro',
    'tempo',
    'mudanca',
    'saude',
    'desistencia',
    'estudos',
    'inadimplencia',
    'outro',
    'conclusao'
  ))
create or replace function public.normalizar_motivo_saida_alias(
  p_valor text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select nullif(
    upper(regexp_replace(public.unaccent(btrim(coalesce(p_valor, ''))), '\\s+', ' ', 'g')),
    ''
  );
$function$
create table if not exists public.motivos_saida_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_normalizado text not null,
  alias_exibicao text not null,
  motivo_saida_id integer not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint motivos_saida_aliases_alias_normalizado_key
    unique (alias_normalizado),
  constraint motivos_saida_aliases_motivo_saida_fk
    foreign key (motivo_saida_id)
    references public.motivos_saida(id),
  constraint motivos_saida_aliases_alias_nao_vazio_check
    check (btrim(alias_normalizado) <> ''),
  constraint motivos_saida_aliases_alias_exibicao_nao_vazio_check
    check (btrim(alias_exibicao) <> '')
)
alter table public.motivos_saida_aliases enable row level security
revoke all on table public.motivos_saida_aliases
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito
insert into public.motivos_saida (
  nome,
  categoria,
  ativo,
  ordem,
  conta_score_professor,
  eh_transferencia_interna
)
values
  ('Concluído e não vai renovar', 'conclusao', true, 0, false, false),
  ('Mudança de curso', 'mudanca', true, 0, false, false)
on conflict (nome_normalizado) do update
set
  categoria = excluded.categoria,
  ativo = true
do $block$
declare
  v_conclusao_id integer;
  v_mudanca_id integer;
  v_desanimo_id integer;
  v_desistencia_id integer;
  v_transferencia_id integer;
  v_outro_id integer;
begin
  select id into v_conclusao_id
  from public.motivos_saida
  where public.normalizar_motivo_saida_alias(nome) = 'CONCLUIDO E NAO VAI RENOVAR';

  select id into v_mudanca_id
  from public.motivos_saida
  where public.normalizar_motivo_saida_alias(nome) = 'MUDANCA DE CURSO';

  select id into v_desanimo_id
  from public.motivos_saida
  where public.normalizar_motivo_saida_alias(nome) = 'DESANIMO';

  select id into v_desistencia_id
  from public.motivos_saida
  where public.normalizar_motivo_saida_alias(nome) = 'DESISTENCIA';

  select id into v_transferencia_id
  from public.motivos_saida
  where public.normalizar_motivo_saida_alias(nome) = 'TRANSFERENCIA INTERNA';

  select id into v_outro_id
  from public.motivos_saida
  where nome_normalizado = 'OUTRO';

  if v_conclusao_id is null
    or v_mudanca_id is null
    or v_desanimo_id is null
    or v_desistencia_id is null
    or v_transferencia_id is null
    or v_outro_id is null then
    raise exception 'PESQUISA_EVASAO_MOTIVOS_CATALOGO_INCOMPLETO';
  end if;

  insert into public.motivos_saida_aliases (
    alias_normalizado,
    alias_exibicao,
    motivo_saida_id,
    ativo
  )
  values
    (public.normalizar_motivo_saida_alias('Perdeu o Interesse'), 'Perdeu o Interesse', v_desanimo_id, true),
    (public.normalizar_motivo_saida_alias('Abandono de Curso'), 'Abandono de Curso', v_desistencia_id, true),
    (public.normalizar_motivo_saida_alias('Troca de Unidade'), 'Troca de Unidade', v_transferencia_id, true),
    (public.normalizar_motivo_saida_alias('Outros Motivos'), 'Outros Motivos', v_outro_id, true),
    (public.normalizar_motivo_saida_alias('Concluido e nao vai renovar'), 'Concluído e não vai renovar', v_conclusao_id, true),
    (public.normalizar_motivo_saida_alias('Mudanca de Curso'), 'Mudança de Curso', v_mudanca_id, true)
  on conflict (alias_normalizado) do update
  set
    alias_exibicao = excluded.alias_exibicao,
    motivo_saida_id = excluded.motivo_saida_id,
    ativo = true,
    updated_at = now();
end;
$block$
create or replace function public.resolver_motivo_saida_evasao_v1(
  p_evasao_id integer
)
returns table (
  motivo_saida_id integer,
  motivo_catalogado text,
  motivo_origem text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select
    coalesce(direto.id, mapeado.id) as motivo_saida_id,
    coalesce(direto.nome, mapeado.nome)::text as motivo_catalogado,
    case
      when direto.id is not null then 'catalogo'
      when mapeado.id is not null then 'legado_mapeado'
      else 'nao_catalogado'
    end::text as motivo_origem
  from public.movimentacoes_admin as m
  left join public.motivos_saida as direto
    on direto.id = m.motivo_saida_id
  left join public.motivos_saida_aliases as alias
    on direto.id is null
   and alias.ativo = true
   and alias.alias_normalizado = public.normalizar_motivo_saida_alias(m.motivo)
  left join public.motivos_saida as mapeado
    on mapeado.id = alias.motivo_saida_id
   and mapeado.ativo = true
  where m.id = p_evasao_id;
$function$
create or replace function public.pode_enviar_pesquisa_evasao(
  p_evasao_id integer
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_data_evasao date;
  v_motivo_resolvido boolean;
begin
  if not (
    auth.role() = 'service_role'
    or public.fn_pesquisa_evasao_usuario_interno_ativo()
  ) then
    return false;
  end if;

  select
    m.data,
    r.motivo_saida_id is not null
  into
    v_data_evasao,
    v_motivo_resolvido
  from public.movimentacoes_admin as m
  left join lateral public.resolver_motivo_saida_evasao_v1(m.id) as r
    on true
  where m.id = p_evasao_id
    and m.tipo in ('evasao', 'nao_renovacao')
    and public.is_movimentacao_admin_retencao_valida(m.id);

  return v_data_evasao is not null
    and coalesce(v_motivo_resolvido, false)
    and now() >= public.pesquisa_evasao_elegivel_a_partir_v1(v_data_evasao);
end;
$function$
create or replace function public.listar_evadidos_para_pesquisa_v4(
  p_unidade_id uuid,
  p_limite integer,
  p_offset integer,
  p_status varchar,
  p_ano integer,
  p_mes integer,
  p_busca text
)
returns table (
  total_count bigint,
  evasao_id integer,
  aluno_id integer,
  nome text,
  telefone text,
  curso text,
  professor text,
  tempo_meses integer,
  data_evasao date,
  motivo_catalogado text,
  motivo_legado text,
  motivo_origem text,
  pesquisa_producao_status text,
  pesquisa_producao_id uuid,
  resposta_producao_texto text,
  resposta_producao_audio_url text,
  resposta_producao_tipo text,
  respondido_producao_em timestamptz,
  is_menor boolean,
  responsavel_nome text,
  publico_tipo text,
  bloqueio_codigo text,
  pesquisa_aberta_aluno_nome text,
  pesquisa_aberta_enviado_em timestamptz,
  elegivel_envio boolean,
  elegibilidade_regra text,
  elegivel_a_partir_em timestamptz,
  possui_historico_teste boolean,
  quantidade_testes bigint,
  ultimo_teste_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with base as (
  select
    l.*,
    r.motivo_saida_id as motivo_saida_resolvido_id,
    r.motivo_catalogado as motivo_catalogado_resolvido,
    r.motivo_origem,
    familia.aluno_nome as pesquisa_aberta_aluno_nome,
    familia.enviado_em as pesquisa_aberta_enviado_em
  from public.listar_evadidos_para_pesquisa_v3(
    p_unidade_id,
    p_limite,
    p_offset,
    p_status,
    p_ano,
    p_mes,
    p_busca
  ) as l
  left join lateral public.resolver_motivo_saida_evasao_v1(l.evasao_id) as r
    on true
  left join lateral (
    select
      pe_aberta.aluno_nome::text as aluno_nome,
      pe_aberta.enviado_em
    from public.pesquisa_evasao as pe_aberta
    cross join lateral (
      select nullif(
        regexp_replace(pe_aberta.telefone_destino_snapshot, '[^0-9]', '', 'g'),
        ''
      ) as telefone_aberta_digitos
    ) as telefone_aberta
    cross join lateral (
      select nullif(regexp_replace(l.telefone, '[^0-9]', '', 'g'), '')
        as telefone_linha_digitos
    ) as telefone_linha
    cross join lateral (
      select case
        when telefone_aberta.telefone_aberta_digitos ~ '^[0-9]{10,11}$'
          then '55' || telefone_aberta.telefone_aberta_digitos
        when telefone_aberta.telefone_aberta_digitos ~ '^55[0-9]{10,11}$'
          then telefone_aberta.telefone_aberta_digitos
        else telefone_aberta.telefone_aberta_digitos
      end as telefone_aberta_normalizado,
      case
        when telefone_linha.telefone_linha_digitos ~ '^[0-9]{10,11}$'
          then '55' || telefone_linha.telefone_linha_digitos
        when telefone_linha.telefone_linha_digitos ~ '^55[0-9]{10,11}$'
          then telefone_linha.telefone_linha_digitos
        else telefone_linha.telefone_linha_digitos
      end as telefone_linha_normalizado
    ) as telefones
    where pe_aberta.modo_teste = false
      and pe_aberta.evasao_id <> l.evasao_id
      and telefones.telefone_linha_normalizado is not null
      and telefones.telefone_aberta_normalizado = telefones.telefone_linha_normalizado
      and pe_aberta.envio_status in ('enviando', 'incerto', 'enviado', 'entregue', 'lido')
      and pe_aberta.resposta_status in ('sem_resposta', 'coletando')
    order by pe_aberta.enviado_em desc nulls last, pe_aberta.created_at desc, pe_aberta.id desc
    limit 1
  ) as familia
    on true
), bloqueios as (
  select
    base.*,
    case
      when base.bloqueio_codigo not in (
        'motivo_nao_catalogado',
        'pesquisa_aberta_no_mesmo_numero'
      ) then base.bloqueio_codigo
      when base.motivo_saida_resolvido_id is null then 'motivo_nao_catalogado'
      when base.pesquisa_aberta_aluno_nome is not null then 'pesquisa_aberta_no_mesmo_numero'
      else null
    end::text as bloqueio_codigo_resolvido
  from base
)
select
  total_count,
  evasao_id,
  aluno_id,
  nome,
  telefone,
  curso,
  professor,
  tempo_meses,
  data_evasao,
  motivo_catalogado_resolvido,
  motivo_legado,
  motivo_origem,
  pesquisa_producao_status,
  pesquisa_producao_id,
  resposta_producao_texto,
  resposta_producao_audio_url,
  resposta_producao_tipo,
  respondido_producao_em,
  is_menor,
  responsavel_nome,
  publico_tipo,
  bloqueio_codigo_resolvido,
  pesquisa_aberta_aluno_nome,
  pesquisa_aberta_enviado_em,
  case
    when bloqueio_codigo_resolvido is not null then false
    when elegibilidade_regra = 'aguardando_d1' then false
    when pesquisa_producao_status not in ('pendente', 'falha_envio', 'sem_whatsapp') then false
    else true
  end as elegivel_envio,
  case
    when bloqueio_codigo_resolvido is not null then bloqueio_codigo_resolvido
    when elegibilidade_regra = 'aguardando_d1' then 'aguardando_d1'
    when pesquisa_producao_status not in ('pendente', 'falha_envio', 'sem_whatsapp')
      then 'status_producao_nao_enviavel'
    else 'elegivel'
  end::text as elegibilidade_regra,
  elegivel_a_partir_em,
  possui_historico_teste,
  quantidade_testes,
  ultimo_teste_em
from bloqueios;
$function$
comment on table public.motivos_saida_aliases is
  'Aliases de textos legados de movimentacoes para o catalogo canonico; nao reescreve o texto historico.'
comment on function public.resolver_motivo_saida_evasao_v1(integer) is
  'Resolve motivo direto ou alias legado para o catalogo governado de evasao.'
comment on function public.listar_evadidos_para_pesquisa_v4(uuid, integer, integer, varchar, integer, integer, text) is
  'Read model da evasao com motivo canonico e contexto minimo de pesquisa familiar aberta; preserva v2 e v3.'
revoke all on function public.normalizar_motivo_saida_alias(text)
  from public, anon, authenticated, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito
revoke all on function public.resolver_motivo_saida_evasao_v1(integer)
  from public, anon, mila_acesso_restrito,
       sol_acesso_restrito, fabio_agent, lia_acesso_restrito
grant execute on function public.resolver_motivo_saida_evasao_v1(integer)
  to authenticated, service_role
revoke all on function public.listar_evadidos_para_pesquisa_v4(
  uuid, integer, integer, varchar, integer, integer, text
) from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito
grant execute on function public.listar_evadidos_para_pesquisa_v4(
  uuid, integer, integer, varchar, integer, integer, text
) to authenticated, service_role
commit
