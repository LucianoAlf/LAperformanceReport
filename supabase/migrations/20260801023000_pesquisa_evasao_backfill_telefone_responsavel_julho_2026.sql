-- Decisao de Alf em 01/08/2026:
-- corrigir o escopo do backfill de julho/2026 para os alunos menores cujo
-- contato canonico de envio e o telefone do responsavel. O valor recuperado
-- vem do cadastro atual, nao do momento da saida, e por isso recebe origem
-- propria. A decisao permanente de Alf e: menor sempre recebe pelo responsavel.
-- Somente snapshots recuperados pelo primeiro backfill podem ser substituidos;
-- snapshots reais capturados pelo trigger continuam imutaveis.

comment on column public.movimentacoes_admin.telefone_snapshot_origem is
  'Origem excepcional do telefone_snapshot. cadastro_atual_backfill_2026_07 indica whatsapp/telefone atual do aluno; cadastro_responsavel_backfill_2026_07 indica responsavel_telefone atual; cadastro_responsavel_vinculo_manual_alf_2026_08 indica o vinculo manual confirmado por Alf da movimentacao 3312 ao aluno 1532. NULL indica snapshot real capturado no momento da saida ou valor anterior aos backfills.';

-- Para novas saidas, mantenha telefone e publico do template coerentes:
-- menor recebe o contato do responsavel; adulto recebe o contato do aluno.
-- A Edge continua consumindo somente o snapshot imutavel da movimentacao.
create or replace function public.capturar_telefone_snapshot_movimentacao_retencao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.tipo not in ('evasao', 'nao_renovacao')
     or nullif(btrim(new.telefone_snapshot), '') is not null
     or new.aluno_id is null then
    return new;
  end if;

  if not (
    tg_op = 'INSERT'
    or (
      tg_op = 'UPDATE'
      and old.tipo not in ('evasao', 'nao_renovacao')
    )
  ) then
    return new;
  end if;

  select case
           when a.data_nascimento is not null
            and extract(
              year from age(coalesce(new.data, current_date), a.data_nascimento)
            )::integer < 18
             then nullif(btrim(a.responsavel_telefone), '')
           else coalesce(
             nullif(btrim(a.whatsapp), ''),
             nullif(btrim(a.telefone), '')
           )
         end
    into new.telefone_snapshot
  from public.alunos as a
  where a.id = new.aluno_id;

  return new;
end;
$function$;

revoke all on function public.capturar_telefone_snapshot_movimentacao_retencao()
from public, anon, authenticated;
grant execute on function public.capturar_telefone_snapshot_movimentacao_retencao()
to postgres, service_role;

do $backfill_telefone_responsavel_julho_2026$
declare
  v_ids_preenchimento integer[] := array[
    3221, 3234, 3235, 3236, 3303, 3307,
    3309, 3310, 3368, 3389, 3390, 3400
  ];
  v_ids_substituicao integer[] := array[3305, 3311, 3334, 3367];
  v_ids_encontrados integer[];
  v_candidatas_preenchimento integer;
  v_atualizadas_preenchimento integer;
  v_candidatas_substituicao integer;
  v_atualizadas_substituicao integer;
  v_candidata_vinculo integer;
  v_atualizada_vinculo integer;
begin
  select count(*)::integer, array_agg(m.id order by m.id)
    into v_candidatas_preenchimento, v_ids_encontrados
  from public.movimentacoes_admin as m
  join public.alunos as a on a.id = m.aluno_id
  where m.tipo in ('evasao', 'nao_renovacao')
    and m.data >= date '2026-07-01'
    and m.data < date '2026-08-01'
    and nullif(btrim(m.telefone_snapshot), '') is null
    and nullif(btrim(a.responsavel_telefone), '') is not null
    and nullif(btrim(a.responsavel_nome), '') is not null
    and a.data_nascimento is not null
    and extract(year from age(m.data, a.data_nascimento))::integer < 18
    and public.is_movimentacao_admin_retencao_valida(m.id) is true;

  if v_candidatas_preenchimento <> 12
     or v_ids_encontrados is distinct from v_ids_preenchimento then
    raise exception
      'backfill do responsavel abortado: preenchimento esperava 12 IDs aprovados e encontrou %',
      v_candidatas_preenchimento;
  end if;

  with comparacao as (
    select
      m.id,
      case
        when regexp_replace(m.telefone_snapshot, '[^0-9]', '', 'g') ~ '^[0-9]{10,11}$'
          then '55' || regexp_replace(m.telefone_snapshot, '[^0-9]', '', 'g')
        else regexp_replace(m.telefone_snapshot, '[^0-9]', '', 'g')
      end as snapshot_normalizado,
      case
        when regexp_replace(a.responsavel_telefone, '[^0-9]', '', 'g') ~ '^[0-9]{10,11}$'
          then '55' || regexp_replace(a.responsavel_telefone, '[^0-9]', '', 'g')
        else regexp_replace(a.responsavel_telefone, '[^0-9]', '', 'g')
      end as responsavel_normalizado
    from public.movimentacoes_admin as m
    join public.alunos as a on a.id = m.aluno_id
    where m.tipo in ('evasao', 'nao_renovacao')
      and m.data >= date '2026-07-01'
      and m.data < date '2026-08-01'
      and m.telefone_snapshot_origem = 'cadastro_atual_backfill_2026_07'
      and nullif(btrim(a.responsavel_telefone), '') is not null
      and nullif(btrim(a.responsavel_nome), '') is not null
      and a.data_nascimento is not null
      and extract(year from age(m.data, a.data_nascimento))::integer < 18
      and public.is_movimentacao_admin_retencao_valida(m.id) is true
  )
  select count(*)::integer, array_agg(id order by id)
    into v_candidatas_substituicao, v_ids_encontrados
  from comparacao
  where snapshot_normalizado is distinct from responsavel_normalizado;

  if v_candidatas_substituicao <> 4
     or v_ids_encontrados is distinct from v_ids_substituicao then
    raise exception
      'backfill do responsavel abortado: substituicao esperava 4 IDs aprovados e encontrou %',
      v_candidatas_substituicao;
  end if;

  select count(*)::integer
    into v_candidata_vinculo
  from public.movimentacoes_admin as m
  join public.alunos as a
    on a.id = 1532
   and a.unidade_id = m.unidade_id
  where m.id = 3312
    and m.aluno_id is null
    and m.tipo in ('evasao', 'nao_renovacao')
    and m.data >= date '2026-07-01'
    and m.data < date '2026-08-01'
    and lower(btrim(m.aluno_nome)) = lower(btrim(a.nome))
    and a.emusys_student_id::text = '3460'
    and lower(coalesce(a.status, '')) = 'evadido'
    and nullif(btrim(a.responsavel_nome), '') is not null
    and nullif(btrim(a.responsavel_telefone), '') is not null
    and public.is_movimentacao_admin_retencao_valida(m.id) is true
    and not exists (
      select 1
      from public.movimentacoes_admin as m_outra
      where m_outra.id <> m.id
        and m_outra.aluno_id = 1532
        and m_outra.tipo in ('evasao', 'nao_renovacao')
        and m_outra.data >= date '2026-07-01'
        and m_outra.data < date '2026-08-01'
        and public.is_movimentacao_admin_retencao_valida(m_outra.id) is true
    );

  if v_candidata_vinculo <> 1 then
    raise exception
      'vinculo manual 3312 -> 1532 abortado: esperado 1 candidato confirmado, encontrado %',
      v_candidata_vinculo;
  end if;

  update public.movimentacoes_admin as m
  set
    telefone_snapshot = nullif(btrim(a.responsavel_telefone), ''),
    telefone_snapshot_origem = 'cadastro_responsavel_backfill_2026_07'
  from public.alunos as a
  where a.id = m.aluno_id
    and m.id = any(v_ids_preenchimento)
    and nullif(btrim(m.telefone_snapshot), '') is null;
  get diagnostics v_atualizadas_preenchimento = row_count;

  if v_atualizadas_preenchimento <> 12 then
    raise exception 'backfill do responsavel abortado: esperadas 12 atualizacoes vazias, executadas %',
      v_atualizadas_preenchimento;
  end if;

  update public.movimentacoes_admin as m
  set
    telefone_snapshot = nullif(btrim(a.responsavel_telefone), ''),
    telefone_snapshot_origem = 'cadastro_responsavel_backfill_2026_07'
  from public.alunos as a
  where a.id = m.aluno_id
    and m.id = any(v_ids_substituicao)
    and m.telefone_snapshot_origem = 'cadastro_atual_backfill_2026_07';
  get diagnostics v_atualizadas_substituicao = row_count;

  if v_atualizadas_substituicao <> 4 then
    raise exception 'backfill do responsavel abortado: esperadas 4 substituicoes, executadas %',
      v_atualizadas_substituicao;
  end if;

  update public.movimentacoes_admin as m
  set
    aluno_id = 1532,
    telefone_snapshot = nullif(btrim(a.responsavel_telefone), ''),
    telefone_snapshot_origem = 'cadastro_responsavel_vinculo_manual_alf_2026_08'
  from public.alunos as a
  where m.id = 3312
    and m.aluno_id is null
    and a.id = 1532;
  get diagnostics v_atualizada_vinculo = row_count;

  if v_atualizada_vinculo <> 1 then
    raise exception 'vinculo manual 3312 -> 1532 abortado durante a atualizacao';
  end if;

  raise notice 'backfill de julho/2026 concluido: 12 preenchimentos, 4 substituicoes de menor e 1 vinculo manual';
end;
$backfill_telefone_responsavel_julho_2026$;

-- A fila operacional aplica a mesma regra antes do clique: menor sem nome ou
-- telefone valido do responsavel, ou com snapshot real divergente, fica
-- bloqueado com motivo explicito. O telefone do responsavel nao e exposto.
create or replace function public.listar_evadidos_para_pesquisa_v2(
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
  elegivel_envio boolean,
  elegibilidade_regra text,
  possui_historico_teste boolean,
  quantidade_testes bigint,
  ultimo_teste_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
with base_autorizada as (
  select
    m.id as evasao_id,
    m.aluno_id,
    a.id as aluno_registro_id,
    coalesce(m.aluno_nome, a.nome)::text as nome,
    nullif(btrim(m.telefone_snapshot), '')::text as telefone,
    c.nome::text as curso,
    pr.nome::text as professor,
    greatest(
      0,
      coalesce(m.tempo_permanencia_meses, a.tempo_permanencia_meses, 0)
    )::integer as tempo_meses,
    m.data as data_evasao,
    ms.nome::text as motivo_catalogado,
    m.motivo::text as motivo_legado,
    coalesce(producao.status, 'pendente')::text as pesquisa_producao_status,
    producao.id as pesquisa_producao_id,
    producao.resposta_texto::text as resposta_producao_texto,
    producao.resposta_audio_url::text as resposta_producao_audio_url,
    producao.resposta_tipo::text as resposta_producao_tipo,
    producao.respondido_em as respondido_producao_em,
    (
      a.data_nascimento is not null
      and extract(year from age(current_date, a.data_nascimento))::integer < 18
    ) as is_menor,
    a.responsavel_nome::text as responsavel_nome,
    a.responsavel_telefone::text as responsavel_telefone,
    publico_interno.aluno_id as publico_interno_aluno_id,
    case
      when publico_interno.aluno_id is not null then publico_interno.tipo
      when (
        a.data_nascimento is not null
        and extract(year from age(current_date, a.data_nascimento))::integer < 18
      ) then 'responsavel'
      else 'aluno'
    end::text as publico_tipo,
    coalesce(testes.quantidade_testes, 0)::bigint as quantidade_testes,
    testes.ultimo_teste_em
  from public.movimentacoes_admin as m
  left join public.alunos as a on a.id = m.aluno_id
  left join public.pesquisa_evasao_publicos_internos as publico_interno
    on publico_interno.aluno_id = m.aluno_id
   and publico_interno.ativo = true
  left join public.cursos as c on c.id = coalesce(m.curso_id, a.curso_id)
  left join public.professores as pr
    on pr.id = coalesce(m.professor_id, a.professor_atual_id)
  left join public.motivos_saida as ms on ms.id = m.motivo_saida_id
  left join lateral (
    select pe0.*
    from public.pesquisa_evasao as pe0
    where pe0.evasao_id = m.id
      and pe0.modo_teste = false
    order by pe0.created_at desc, pe0.id desc
    limit 1
  ) as producao on true
  left join lateral (
    select
      count(*) filter (where pe_t.modo_teste = true)::bigint as quantidade_testes,
      max(coalesce(pe_t.enviado_em, pe_t.created_at))
        filter (where pe_t.modo_teste = true) as ultimo_teste_em
    from public.pesquisa_evasao as pe_t
    where pe_t.evasao_id = m.id
  ) as testes on true
  where m.tipo in ('evasao', 'nao_renovacao')
    and public.is_movimentacao_admin_retencao_valida(m.id)
    and (p_unidade_id is null or m.unidade_id = p_unidade_id)
    and (
      auth.role() = 'service_role'
      or public.fn_pesquisa_evasao_usuario_interno_ativo()
    )
    and (p_status is null or coalesce(producao.status, 'pendente') = p_status)
    and (p_ano is null or extract(year from m.data)::integer = p_ano)
    and (p_mes is null or extract(month from m.data)::integer = p_mes)
    and (
      nullif(btrim(p_busca), '') is null
      or coalesce(m.aluno_nome, a.nome, '') ilike ('%' || btrim(p_busca) || '%')
      or coalesce(c.nome, '') ilike ('%' || btrim(p_busca) || '%')
      or coalesce(pr.nome, '') ilike ('%' || btrim(p_busca) || '%')
      or coalesce(ms.nome, m.motivo, '') ilike ('%' || btrim(p_busca) || '%')
      or coalesce(m.telefone_snapshot, '') ilike ('%' || btrim(p_busca) || '%')
    )
),
telefone_extraida as (
  select
    base_autorizada.*,
    nullif(regexp_replace(telefone, '[^0-9]', '', 'g'), '') as telefone_digitos,
    nullif(
      regexp_replace(responsavel_telefone, '[^0-9]', '', 'g'),
      ''
    ) as responsavel_telefone_digitos
  from base_autorizada
),
classificada as (
  select
    telefone_extraida.*,
    case
      when telefone_digitos ~ '^[0-9]{10,11}$' then '55' || telefone_digitos
      when telefone_digitos ~ '^55[0-9]{10,11}$' then telefone_digitos
      else telefone_digitos
    end as telefone_normalizado,
    case
      when responsavel_telefone_digitos ~ '^[0-9]{10,11}$'
        then '55' || responsavel_telefone_digitos
      when responsavel_telefone_digitos ~ '^55[0-9]{10,11}$'
        then responsavel_telefone_digitos
      else responsavel_telefone_digitos
    end as responsavel_telefone_normalizado
  from telefone_extraida
),
bloqueada as (
  select
    classificada.*,
    case
      when aluno_id is null or aluno_registro_id is null then 'sem_aluno'
      when publico_interno_aluno_id is not null then 'publico_interno'
      when is_menor and nullif(btrim(responsavel_nome), '') is null
        then 'responsavel_sem_nome'
      when is_menor and responsavel_telefone_normalizado is null
        then 'responsavel_sem_telefone'
      when is_menor
       and responsavel_telefone_normalizado !~ '^55[0-9]{10,11}$'
        then 'responsavel_telefone_invalido'
      when is_menor
       and telefone_normalizado is distinct from responsavel_telefone_normalizado
        then 'telefone_responsavel_divergente'
      when telefone_normalizado is null then 'sem_telefone'
      when telefone_normalizado !~ '^55[0-9]{10,11}$' then 'telefone_invalido'
      when motivo_catalogado is null then 'motivo_nao_catalogado'
      when exists (
        select 1
        from public.pesquisa_evasao as pe_aberta
        cross join lateral (
          select nullif(
            regexp_replace(pe_aberta.telefone_destino_snapshot, '[^0-9]', '', 'g'),
            ''
          ) as telefone_aberta_digitos
        ) as telefone_aberta
        cross join lateral (
          select case
            when telefone_aberta_digitos ~ '^[0-9]{10,11}$'
              then '55' || telefone_aberta_digitos
            when telefone_aberta_digitos ~ '^55[0-9]{10,11}$'
              then telefone_aberta_digitos
            else telefone_aberta_digitos
          end as telefone_aberta_normalizado
        ) as telefone_aberta_canonica
        where pe_aberta.modo_teste = false
          and pe_aberta.evasao_id <> classificada.evasao_id
          and telefone_aberta_normalizado = classificada.telefone_normalizado
          and pe_aberta.envio_status in (
            'enviando', 'incerto', 'enviado', 'entregue', 'lido'
          )
          and pe_aberta.resposta_status in ('sem_resposta', 'coletando')
      ) then 'pesquisa_aberta_no_mesmo_numero'
      else null
    end::text as bloqueio_codigo
  from classificada
),
elegibilidade as (
  select
    bloqueada.*,
    (
      bloqueio_codigo is null
      and pesquisa_producao_status in ('pendente', 'falha_envio', 'sem_whatsapp')
    ) as elegivel_envio,
    case
      when bloqueio_codigo is not null then bloqueio_codigo
      when pesquisa_producao_status not in (
        'pendente', 'falha_envio', 'sem_whatsapp'
      ) then 'status_producao_nao_enviavel'
      else 'elegivel'
    end::text as elegibilidade_regra
  from bloqueada
)
select
  count(*) over () as total_count,
  evasao_id,
  aluno_id,
  nome,
  telefone,
  curso,
  professor,
  tempo_meses,
  data_evasao,
  motivo_catalogado,
  motivo_legado,
  pesquisa_producao_status,
  pesquisa_producao_id,
  resposta_producao_texto,
  resposta_producao_audio_url,
  resposta_producao_tipo,
  respondido_producao_em,
  is_menor,
  responsavel_nome,
  publico_tipo,
  bloqueio_codigo,
  elegivel_envio,
  elegibilidade_regra,
  quantidade_testes > 0 as possui_historico_teste,
  quantidade_testes,
  ultimo_teste_em
from elegibilidade
order by
  case pesquisa_producao_status
    when 'pendente' then 1
    when 'falha_envio' then 2
    when 'sem_whatsapp' then 3
    when 'enviado' then 4
    when 'respondido' then 5
    else 6
  end,
  data_evasao desc,
  evasao_id desc
limit least(greatest(coalesce(p_limite, 50), 1), 100)
offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.listar_evadidos_para_pesquisa_v2(
  uuid, integer, integer, varchar, integer, integer, text
) from public, anon, mila_acesso_restrito, sol_acesso_restrito,
       fabio_agent, lia_acesso_restrito;
grant execute on function public.listar_evadidos_para_pesquisa_v2(
  uuid, integer, integer, varchar, integer, integer, text
) to authenticated, service_role;
