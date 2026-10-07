-- Correções da auditoria externa do escritor de presenca (25/09).
-- Aplicadas em producao via MCP e registradas aqui para o repo acompanhar
-- o banco. Contexto: docs/plans/2026-09-25-presenca-escrita-emusys-desenho.md
--
-- 1) Unicidade do livro POR MODO: a sombra marcava 'seria_escrito' e o
--    indice por gatilho puro impedia a linha 'escrito' quando a unidade
--    ligava — 167 pares + 4 fichas ficaram mudos para sempre. Agora o mesmo
--    gatilho pode ter uma linha sombra E uma ativa.
-- 2) Lease por unidade: cada item_aplicado dispara uma execucao completa da
--    edge e elas se sobrepunham (6 no mesmo minuto). A trava com expiracao
--    serializa: quem nao pega o lease devolve em_execucao e o sweeper do
--    cron cobre. Nao usar advisory lock de sessao — o pool do PostgREST
--    pode entregar aquisicao e liberacao em conexoes diferentes.
-- 3) Isolamento do gatilho: net.http_post dentro da transacao que marcou a
--    presenca — excecao ali derrubaria a chamada/ficha inteira. Engolido:
--    o que se perde aqui o sweeper recupera.

-- ── 1) unicidade por (gatilho, modo) ──────────────────────────────────────
drop index if exists presenca_emusys_escrita_evento_uk;
create unique index presenca_emusys_escrita_evento_uk
  on public.presenca_emusys_escrita (presenca_evento_id, modo)
  where presenca_evento_id is not null;

drop index if exists presenca_emusys_escrita_ficha_uk;
create unique index presenca_emusys_escrita_ficha_uk
  on public.presenca_emusys_escrita (ficha_id, modo)
  where ficha_id is not null;

-- ── 2) lease por unidade ──────────────────────────────────────────────────
create table if not exists public.presenca_emusys_escritor_lock (
  unidade_id uuid primary key,
  dono text not null,
  expira_em timestamptz not null
);

comment on table public.presenca_emusys_escritor_lock is
  'Lease por unidade do escritor presenca-emusys-escritor: uma execucao varrendo a fila por vez. expira_em vence sozinho se o dono morrer (TTL ~200s).';

-- Tenta assumir o lease da unidade. Se a linha existe e nao venceu, o
-- update condicional nao pega e found=false — quem chega devolve
-- em_execucao e sai. Se venceu (dono morreu), o lease passa de mao.
create or replace function public.fn_presenca_escritor_trava(
  p_unidade uuid,
  p_dono text,
  p_ttl_segundos integer default 180
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into presenca_emusys_escritor_lock (unidade_id, dono, expira_em)
  values (p_unidade, p_dono, now() + make_interval(secs => p_ttl_segundos))
  on conflict (unidade_id) do update
    set dono = excluded.dono,
        expira_em = excluded.expira_em
    where presenca_emusys_escritor_lock.expira_em < now();
  return found;
end;
$$;

-- So o dono solta o proprio lease (p_dono casa com a linha).
create or replace function public.fn_presenca_escritor_destrava(
  p_unidade uuid,
  p_dono text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from presenca_emusys_escritor_lock
   where unidade_id = p_unidade
     and dono = p_dono;
end;
$$;

-- ── 3) gatilho isolado: falha do POST nunca derruba quem marcou ───────────
create or replace function public.fn_presenca_emusys_escritor_disparar()
returns trigger
language plpgsql
security definer
set search_path = public, net
as $$
begin
  begin
    perform net.http_post(
      url := 'https://ouqwbbermlzqqvtqwlul.supabase.co/functions/v1/presenca-emusys-escritor',
      headers := jsonb_build_object(
        'x-sync-token', (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'sync_presenca_edge_token'
           limit 1
        ),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object('lookback_dias', 7),
      timeout_milliseconds := 150000
    );
  exception when others then
    -- Linha perdida aqui volta pelo cron sweeper; nunca falhar o INSERT/UPDATE
    -- que disparou (ficha do professor, item_aplicado da chamada).
    null;
  end;
  return null;
end;
$$;
