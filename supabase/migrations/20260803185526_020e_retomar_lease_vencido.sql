-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.fabio_devolutiva_claim(
  p_worker text, p_lote integer default 5, p_lease_minutos integer default 5)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_token uuid := gen_random_uuid(); v_itens jsonb;
begin
  with alvo as (
    select d.id from public.fabio_devolutivas d
     where
       (d.status = 'pendente'
         and (d.proxima_tentativa_em is null or d.proxima_tentativa_em <= now()))
       -- <<< 020e: órfã de worker que morreu. Sem esta linha, prazo de lease
       --           não servia pra nada: a devolutiva ficava presa pra sempre.
       or (d.status = 'gerando'
         and d.lease_expira_em is not null
         and d.lease_expira_em < now())
     order by d.criado_em
     limit greatest(p_lote, 1)
     for update skip locked
  ), tomadas as (
    update public.fabio_devolutivas d
       set status = 'gerando',
           lease_token = v_token,
           lease_expira_em = now() + make_interval(mins => p_lease_minutos),
           tentativas = d.tentativas + 1,
           atualizado_em = now()
      from alvo where d.id = alvo.id
    returning d.id, d.registro_fatia_id, d.aluno_id, d.professor_id, d.tentativas)
  select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) into v_itens from tomadas t;

  return jsonb_build_object('ok', true, 'worker', p_worker,
                            'lease_token', v_token, 'itens', v_itens);
end $function$;

comment on function public.fabio_devolutiva_claim is
  'Claim da fila da devolutiva. Pega pendentes E orfas de lease vencido (020e) — prazo sem retomada e enfeite. Token novo a cada claim cerca o worker antigo.';

create or replace function public.fabio_devolutiva_ceifar_travadas(p_teto integer default 5)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_n integer;
begin
  update public.fabio_devolutivas
     set status = 'falhou',
         erro = coalesce(erro, '') || ' | teto de tentativas atingido na retomada',
         lease_token = null, lease_expira_em = null, atualizado_em = now()
   where status = 'gerando'
     and lease_expira_em is not null and lease_expira_em < now()
     and tentativas >= p_teto;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

comment on function public.fabio_devolutiva_ceifar_travadas is
  'Tira da fila a linha que ja derrubou o worker p_teto vezes. Sem isto a retomada da 020e viraria loop infinito.';

revoke all on function
  public.fabio_devolutiva_claim(text, integer, integer),
  public.fabio_devolutiva_ceifar_travadas(integer)
from public, anon, authenticated;

grant execute on function
  public.fabio_devolutiva_claim(text, integer, integer),
  public.fabio_devolutiva_ceifar_travadas(integer)
to service_role, fabio_agent;
