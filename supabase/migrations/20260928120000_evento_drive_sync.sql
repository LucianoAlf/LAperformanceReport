-- 28/09/2026 — Recital: pipeline LA Teacher → Drive do Alf.
--
-- A ponte é um Google Apps Script implantado pelo Alf (executa COMO ele, acesso público
-- fechado por TOKEN embutido no código): POST na URL /exec cria subpastas e grava o
-- arquivo dentro de "Recitais LA Music 2026", nada mais. O Google responde 302 para
-- script.googleusercontent.com/macros/echo — quem chama precisa buscar a resposta com
-- GET (o doPost JÁ rodou no primeiro POST).
--
-- O fluxo: professor sobe MP3 no LA Teacher → evento_recital_sincronizar_v1 carimba
-- playback_path → a edge recital-drive-sync (cron, a cada 30min) baixa do bucket
-- privado e empurra para a ponte, organizada em Unidade / Evento / Professor.
--
-- Colunas novas em evento_apresentacao são o ESPELHO do que já foi para o Drive:
-- `drive_playback_path` guarda o path que subiu — professor re-enviando o áudio muda o
-- path, e a diferença entre os dois campos é o que dispara o re-upload. Comparar com
-- updated_at reenviaria o arquivo a cada edição de música.

alter table public.evento_apresentacao
  add column if not exists drive_playback_path text,
  add column if not exists drive_file_id text,
  add column if not exists drive_sincronizado_em timestamptz,
  add column if not exists drive_erro text;
comment on column public.evento_apresentacao.drive_playback_path is
  'Último playback_path enviado ao Drive. Diferente de playback_path = pendente de sync.';
comment on column public.evento_apresentacao.drive_erro is
  'Último erro da ponte/download — limpo quando o envio seguinte funciona.';

-- ─────────── auth interna do cron (mesmo padrão de sync-presenca) ───────────
create or replace function public.validar_token_recital_drive_v1(p_token text)
returns boolean
language plpgsql
security definer
stable
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_token_esperado text;
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;

  select s.decrypted_secret
    into v_token_esperado
  from vault.decrypted_secrets s
  where s.name = 'recital_drive_edge_token'
  limit 1;

  return v_token_esperado is not null
    and extensions.digest(p_token, 'sha256')
      = extensions.digest(v_token_esperado, 'sha256');
end;
$$;

revoke all on function public.validar_token_recital_drive_v1(text)
  from public, anon, authenticated;
grant execute on function public.validar_token_recital_drive_v1(text)
  to service_role;

-- Segredo interno dedicado a esta edge. Criado uma vez; NÃO rotacionar aqui — o token
-- só vive no Vault e a edge o valida pela RPC acima.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'recital_drive_edge_token'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'recital_drive_edge_token',
      'Segredo interno do cron recital-drive-sync (ponte Apps Script → Drive)',
      null
    );
  end if;
end;
$$;

-- ─────────── cron: a cada 30 min, minutos fora do cheio ───────────
do $do$
declare
  v_command text;
begin
  if exists (select 1 from cron.job where jobname = 'recital-drive-sync') then
    perform cron.unschedule('recital-drive-sync');
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets where name = 'recital_drive_edge_token'
  ) then
    raise notice 'Cron recital-drive-sync nao criado: secret recital_drive_edge_token ausente no Vault.';
    return;
  end if;

  v_command := $cron$
    select net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/recital-drive-sync',
      headers := jsonb_build_object(
        'x-sync-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'recital_drive_edge_token'
          limit 1
        ),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $cron$;

  perform cron.schedule('recital-drive-sync', '7,37 * * * *', v_command);
end;
$do$;
