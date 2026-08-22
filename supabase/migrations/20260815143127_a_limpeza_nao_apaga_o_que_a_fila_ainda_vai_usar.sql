-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

create or replace function public.fabio_provar_limpeza(p_acao_id uuid, p_storage_path text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_a public.fabio_acoes_pendentes%rowtype;
begin
  select * into v_a
    from public.fabio_acoes_pendentes
   where id = p_acao_id;
  if not found then
    return jsonb_build_object('ok', false, 'codigo', 'acao_nao_encontrada', 'pode_remover', false);
  end if;

  if p_storage_path is null or btrim(p_storage_path) = ''
     or v_a.storage_path is distinct from p_storage_path then
    return jsonb_build_object('ok', false, 'codigo', 'storage_path_divergente', 'pode_remover', false);
  end if;

  if v_a.estado not in ('cancelada', 'expirada', 'erro') then
    return jsonb_build_object('ok', false, 'codigo', 'limpeza_nao_elegivel', 'pode_remover', false);
  end if;

  if exists (
    select 1
      from public.fabio_acoes_pendentes a
     where a.id <> v_a.id
       and a.storage_path = p_storage_path
       and a.estado in ('aberta', 'processando', 'adiada')
  ) then
    return jsonb_build_object(
      'ok', true,
      'codigo', 'limpeza_reprovada',
      'motivo', 'acao_ativa_referencia_storage',
      'pode_remover', false
    );
  end if;

  -- NOVO: a fila de áudio ainda pode reprocessar este objeto. Espelha a
  -- elegibilidade de fn_fabio_retry_fila — a limpeza só apaga o que o retry
  -- não alcança mais.
  if exists (
    select 1
      from public.fabio_fila_audios f
     where f.storage_path = p_storage_path
       and f.status not in ('normalizado', 'erro_terminal')
       and f.erro_tipo = 'transitorio'
       and f.tentativas < 3
       and f.criado_em > now() - interval '3 days'
  ) then
    return jsonb_build_object(
      'ok', true,
      'codigo', 'limpeza_reprovada',
      'motivo', 'fila_ainda_pode_reprocessar',
      'pode_remover', false
    );
  end if;

  if exists (
    select 1
      from public.fabio_fila_audios f
      join public.fabio_registros_aula r on r.audio_id = f.id
     where f.storage_path = p_storage_path
       and r.status in ('confirmado', 'gravado_emusys')
  ) then
    return jsonb_build_object(
      'ok', true,
      'codigo', 'limpeza_reprovada',
      'motivo', 'registro_confirmado_referencia_storage',
      'pode_remover', false
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'codigo', 'limpeza_provada',
    'pode_remover', true,
    'storage_path', p_storage_path
  );
end;
$function$;

comment on function public.fabio_provar_limpeza(uuid, text) is
  'Prova antes de remover o áudio do Storage. Reprova quando: outra ação ativa usa o path, a FILA ainda pode reprocessar (espelha fn_fabio_retry_fila), ou um registro confirmado aponta pro áudio.';
