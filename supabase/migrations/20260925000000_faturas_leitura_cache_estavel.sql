-- get_faturas_alunos_financeiro_v1: torna o cache efetivo de verdade.
--
-- Bug: a chave do cache incluia o fingerprint max(sync_runs.completed_at).
-- O sync completa ~17 runs/hora, entao a chave mudava a cada ~3,5min —
-- antes do TTL de 10min vencer. Resultado: hit rate ~0, toda chamada
-- pagava o compute frio (~12s) e, sob concorrencia, morria nos 30s (500).
--
-- Correcao: a chave volta a ser so o recorte logico (unidade, periodo,
-- modo, status, as_of, escopo). O limite de frescor continua sendo o TTL
-- de 10min que a funcao ja prometia — um run novo passa a ser absorvido
-- dentro dessa janela em vez de derrubar o cache a cada ciclo do sync.
--
-- Soma-se single-flight: miss concorrente para a mesma chave espera no
-- advisory lock e relê o cache (1 compute + N hits), em vez de N computes.
--
-- O fingerprint segue calculado so para observabilidade em WARNING.

create or replace function public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid default null,
  p_ano integer default extract(year from now() at time zone 'America/Sao_Paulo')::integer,
  p_mes integer default extract(month from now() at time zone 'America/Sao_Paulo')::integer,
  p_modo_periodo text default 'janela_3',
  p_status text default 'todas',
  p_as_of_date date default (now() at time zone 'America/Sao_Paulo')::date
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
set statement_timeout to '90s'
as $function$
declare
  v_payload jsonb;
  v_cached jsonb;
  v_fingerprint text;
  v_escopo text;
  v_key text;
  v_inicio date;
begin
  -- Guarda minima antes de servir cache: mesmo papel exigido pela camada
  -- interna (anon nao pode nem montar chave valida).
  if coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception using
      errcode = '42501',
      message = 'papel nao autorizado para consultar faturas';
  end if;

  v_inicio := case
    when p_modo_periodo = 'janela_3'
      then (make_date(p_ano, p_mes, 1) - interval '2 months')::date
    else make_date(p_ano, p_mes, 1)
  end;

  -- Recorte de unidades que a camada interna enxergaria: entra na chave
  -- para admin e usuario-de-unidade nao compartilharem payload errado.
  select coalesce(string_agg(u.id::text, ',' order by u.id), 'nenhuma')
    into v_escopo
  from public.unidades u
  where u.ativo is true
    and (
      coalesce(auth.role(), '') = 'service_role'
      or public.is_admin()
      or u.id in (select public.get_user_unidade_ids())
    );

  -- Chave logica estavel: sem o fingerprint do sync. O TTL de 10min ja e
  -- o limite de frescor sancionado; run novo atualiza no proximo rebuild.
  v_key := md5(concat_ws('|',
    coalesce(p_unidade_id::text, 'consolidado'),
    p_ano, p_mes, p_modo_periodo, p_status, p_as_of_date,
    v_escopo
  ));

  select c.payload into v_cached
  from public.faturas_leitura_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '10 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  -- Single-flight: quem chega junto no miss espera aqui e rele o cache —
  -- so o primeiro paga o compute frio.
  perform pg_advisory_xact_lock(hashtext('faturas_leitura|' || v_key));

  select c.payload into v_cached
  from public.faturas_leitura_cache c
  where c.cache_key = v_key
    and c.built_at > now() - interval '10 minutes';
  if v_cached is not null then
    return v_cached;
  end if;

  -- Fingerprint do snapshot so para observabilidade: diz qual run gerou
  -- o payload sem participar da chave (o sync completa ~17 runs/hora).
  select coalesce(max(sr.completed_at)::text, 'sem_run')
    into v_fingerprint
  from public.sync_runs sr
  where sr.run_type = 'live'
    and sr.status = 'succeeded'
    and sr.snapshot_complete is true
    and sr.unidades_concluidas = 3
    and sr.completed_at is not null
    and sr.competencia between v_inicio and make_date(p_ano, p_mes, 1);

  v_payload := public.get_faturas_alunos_financeiro_v1_contrato_tipo_20260817(
    p_unidade_id,
    p_ano,
    p_mes,
    p_modo_periodo,
    p_status,
    p_as_of_date
  );
  v_payload := jsonb_set(
    v_payload,
    '{items}',
    public.financeiro_enriquecer_tipos_fatura_v1(coalesce(v_payload->'items', '[]'::jsonb)),
    true
  );
  v_payload := jsonb_set(
    v_payload,
    '{reconciliation,items}',
    public.financeiro_enriquecer_tipos_fatura_v1(coalesce(v_payload #> '{reconciliation,items}', '[]'::jsonb)),
    true
  );

  insert into public.faturas_leitura_cache (cache_key, payload)
  values (v_key, v_payload)
  on conflict (cache_key) do update
    set payload = excluded.payload,
        built_at = now();

  raise warning 'faturas_leitura_cache: chave % rebuild com fingerprint %',
    v_key, v_fingerprint;

  -- Limpeza oportunista: linhas velhas nao voltam a ser lidas; apaga o
  -- que passou de 1 dia para a tabela nao inchar.
  delete from public.faturas_leitura_cache
  where built_at < now() - interval '1 day';

  return v_payload;
end;
$function$;

comment on function public.get_faturas_alunos_financeiro_v1(uuid, integer, integer, text, text, date) is
  'Faturas de alunos (visao financeira). Cache faturas_leitura_cache por chave logica (TTL 10min); fingerprint do sync so em WARNING — o sync completa ~17 runs/hora e fingerprint-na-chave zerava o hit rate. Single-flight por advisory lock no miss. Aplicado em 2026-09-24 (prod).';
