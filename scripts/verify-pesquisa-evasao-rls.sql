-- Verificacao operacional do Subprojeto A.
-- Usa um usuario interno ativo existente, nao cria identidade e nao persiste nada.
-- Executar somente no rollout assistido. Sempre termina em rollback.

begin;

select set_config(
  'verify_pesquisa.auth_user_id',
  coalesce(
    (
      select u.auth_user_id::text
      from public.usuarios u
      where u.ativo = true
        and u.auth_user_id is not null
      order by u.id
      limit 1
    ),
    ''
  ),
  true
);

select set_config(
  'verify_pesquisa.total_pesquisas',
  (select count(*)::text from public.pesquisa_evasao),
  true
);

do $preflight$
begin
  if nullif(current_setting('verify_pesquisa.auth_user_id', true), '') is null then
    raise exception 'nenhum usuario interno ativo com auth_user_id para verificacao';
  end if;
end;
$preflight$;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  current_setting('verify_pesquisa.auth_user_id', true),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $usuario_ativo$
declare
  v_total bigint;
  v_esperado bigint;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'usuario interno ativo nao foi reconhecido';
  end if;

  select count(*) into v_total from public.pesquisa_evasao;
  v_esperado := current_setting('verify_pesquisa.total_pesquisas', true)::bigint;
  if v_total <> v_esperado then
    raise exception 'usuario interno ativo nao leu todas as pesquisas: % de %', v_total, v_esperado;
  end if;

  perform *
  from public.listar_evadidos_para_pesquisa_v2(
    null,
    1,
    0,
    null,
    extract(year from current_date)::integer,
    extract(month from current_date)::integer,
    null
  );
end;
$usuario_ativo$;

select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000001',
  true
);

do $usuario_externo$
declare
  v_total bigint;
begin
  if public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'JWT sem usuario interno ativo foi aceito';
  end if;

  select count(*) into v_total from public.pesquisa_evasao;
  if v_total <> 0 then
    raise exception 'JWT sem usuario interno ativo leu % pesquisas', v_total;
  end if;
end;
$usuario_externo$;

reset role;

do $backfill$
declare
  v_total integer;
begin
  select count(*)
    into v_total
  from public.pesquisa_evasao
  where id in (
    '5edc499f-4a91-4ebb-a291-0f052bc16351',
    '416624a9-2d74-4c26-a083-c6aadba21bf2',
    '718fa72e-ca51-4995-960f-575bb00c2b0e',
    '1b918f39-c528-431d-9d7d-3d9160982e6a',
    '61ebbbd0-a8e8-4e77-99ee-d4ff9bcc6f03',
    '147a6632-fccb-4089-9ae0-13db822d7bf9'
  )
    and modo_teste = true;

  if v_total <> 6 then
    raise exception 'backfill incompleto: % de 6 registros como teste', v_total;
  end if;
end;
$backfill$;

rollback;
