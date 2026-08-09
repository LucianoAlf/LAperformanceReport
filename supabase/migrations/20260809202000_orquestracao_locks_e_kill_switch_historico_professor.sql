-- Trava com TTL para orquestradores re-entrantes dirigidos por cron.
--
-- Por que existe: o pipeline de histórico do professor precisa de MUITAS chamadas HTTP
-- para fechar um ciclo (o backfill avança 10 páginas por vez; a reconstrução tem 32
-- partições por unidade). Um `pg_cron` dispara `net.http_post` e retorna na hora, então
-- duas execuções PODEM se sobrepor se uma demorar mais que o intervalo. Sobreposição aqui
-- não corrompe (as escritas são upsert por chave e a finalização tem advisory lock), mas
-- duplica trabalho contra a API do Emusys, que tem teto de 60 req/min por IP dividido com
-- o resto da casa.
--
-- Não é advisory lock do Postgres de propósito: aquele é por sessão, e cada chamada da
-- edge abre uma sessão nova — não sobrevive entre as dezenas de requisições de um ciclo.
create table if not exists public.orquestracao_locks_v1 (
  chave          text primary key,
  travado_ate    timestamptz not null default now() - interval '1 second',
  travado_por    text,
  atualizado_em  timestamptz not null default now()
);

comment on table public.orquestracao_locks_v1 is
  'Trava com TTL para orquestradores re-entrantes (cron → edge que precisa de N chamadas). Primeiro uso: orquestrar-historico-professor.';

alter table public.orquestracao_locks_v1 enable row level security;
-- Sem policy: só `service_role` (que ignora RLS) escreve aqui. Ninguém no app precisa ler.
-- ⚠️ Os roles de agente entram pelo ALTER DEFAULT PRIVILEGES do projeto — revogar nominal.
revoke all on table public.orquestracao_locks_v1 from public, anon, authenticated;
revoke all on table public.orquestracao_locks_v1 from sol_acesso_restrito, mila_acesso_restrito, fabio_agent, lia_acesso_restrito;

-- Aquisição ATÔMICA: o UPDATE só acha a linha se a trava expirou. Um único statement,
-- então duas chamadas simultâneas não podem ambas receber `true`.
create or replace function public.fn_orquestracao_tentar_travar_v1(
  p_chave text,
  p_ttl_segundos integer,
  p_dono text default null
) returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_ok boolean := false;
begin
  if p_ttl_segundos is null or p_ttl_segundos < 1 or p_ttl_segundos > 3600 then
    raise exception 'TTL_INVALIDO' using errcode = '22023';
  end if;

  insert into public.orquestracao_locks_v1 (chave) values (p_chave)
  on conflict (chave) do nothing;

  update public.orquestracao_locks_v1
     set travado_ate = now() + make_interval(secs => p_ttl_segundos),
         travado_por = p_dono,
         atualizado_em = now()
   where chave = p_chave
     and travado_ate < now()
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$fn$;

create or replace function public.fn_orquestracao_destravar_v1(p_chave text)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
  update public.orquestracao_locks_v1
     set travado_ate = now() - interval '1 second', atualizado_em = now()
   where chave = p_chave;
$fn$;

-- ⚠️ ALTER DEFAULT PRIVILEGES do projeto concede EXECUTE a `anon` em função nova:
-- `revoke from public` não basta, precisa ser nominal.
revoke all on function public.fn_orquestracao_tentar_travar_v1(text, integer, text) from public, anon, authenticated;
revoke all on function public.fn_orquestracao_destravar_v1(text) from public, anon, authenticated;
grant execute on function public.fn_orquestracao_tentar_travar_v1(text, integer, text) to service_role;
grant execute on function public.fn_orquestracao_destravar_v1(text) to service_role;

-- Kill switch, começa DESLIGADO (mesmo padrão de auto_pesquisa_1a_aula).
-- Ligado em produção em 09/08/2026 após validação end-to-end.
insert into public.automacoes_config (slug, ativo) values ('auto_historico_professor', false)
on conflict (slug) do nothing;
