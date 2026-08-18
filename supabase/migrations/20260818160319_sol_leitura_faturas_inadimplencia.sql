-- Autoriza a Sol a LER faturas e inadimplencia. Aprovado pelo Alf em 2026-08-18.
--
-- Problema: get_faturas_alunos_financeiro_v1 e get_inadimplencia_canonica exigem
-- auth.role() in ('authenticated','service_role'). auth.role() le o claim do JWT, nao o
-- papel do Postgres — a Sol conecta direto no banco como sol_acesso_restrito, sem JWT,
-- entao auth.role() e NULL e ela leva 42501. GRANT nao resolve (ela ja tinha o de faturas).
--
-- Por que WRAPPER e nao alterar o guard: as funcoes canonicas servem a tela financeira em
-- producao. Mexer no guard delas para encaixar a Sol arrisca o escopo por unidade dos
-- usuarios reais. O wrapper e explicito, auditavel, revogavel numa linha e nao toca em
-- nenhum consumidor existente.
--
-- Descartado: sol_caixa_inadimplentes ja existia com nome da Sol, mas NAO serve para
-- consulta — ela exige collection_scope = 'confirmed_only' e a canonica hoje devolve
-- 'confirmed_active_d2_3_competencias', entao sairia em erro. E do fluxo de caixa.
--
-- Escopo: LEITURA. Delegam para a canonica sem reimplementar regra nenhuma.
-- Alcance: todas as unidades (a Sol responde pela rede inteira), igual ao relatorio diario.
--
-- Nota de seguranca: isto NAO amplia privilegio. Qualquer papel que possa chamar set_config
-- ja consegue se declarar service_role hoje — inclusive a Sol. O wrapper so troca esse
-- contorno anonimo por uma porta nomeada. A fragilidade do guard segue como item aberto.
--
-- Validado apos aplicar (sessao SEM claim de JWT, igual a da Sol):
--   auth.role() antes  = NULL
--   sol_inadimplencia_v1(CG)                  -> status 'partial', 15 itens
--   sol_faturas_alunos_v1(CG,2026,8,'competencia') -> em_aberto 142 / R$ 51.159,64
--   auth.role() depois = NULL   (o claim e restaurado; nao vaza service_role na transacao)
--   ACL das duas = {postgres=X, service_role=X, sol_acesso_restrito=X}; anon/authenticated nao.

create or replace function public.sol_faturas_alunos_v1(
  p_unidade_id   uuid    default null,
  p_ano          integer default (extract(year  from (now() at time zone 'America/Sao_Paulo')))::integer,
  p_mes          integer default (extract(month from (now() at time zone 'America/Sao_Paulo')))::integer,
  p_modo_periodo text    default 'janela_3',
  p_status       text    default 'todas',
  p_as_of_date   date    default ((now() at time zone 'America/Sao_Paulo'))::date
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_claims_anteriores text := current_setting('request.jwt.claims', true);
  v_result jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    v_result := public.get_faturas_alunos_financeiro_v1(
      p_unidade_id, p_ano, p_mes, p_modo_periodo, p_status, p_as_of_date
    );
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_claims_anteriores, ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(v_claims_anteriores, ''), true);
  return v_result;
end;
$function$;

create or replace function public.sol_inadimplencia_v1(
  p_unidade_id uuid default null,
  p_as_of_date date default ((now() at time zone 'America/Sao_Paulo'))::date
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_claims_anteriores text := current_setting('request.jwt.claims', true);
  v_result jsonb;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    v_result := public.get_inadimplencia_canonica(p_unidade_id, p_as_of_date);
  exception when others then
    perform set_config('request.jwt.claims', coalesce(v_claims_anteriores, ''), true);
    raise;
  end;
  perform set_config('request.jwt.claims', coalesce(v_claims_anteriores, ''), true);
  return v_result;
end;
$function$;

-- ALTER DEFAULT PRIVILEGES deste projeto concede EXECUTE a anon em funcao nova.
-- revoke from public NAO basta: precisa ser nominal.
revoke all on function public.sol_faturas_alunos_v1(uuid, integer, integer, text, text, date)
  from public, anon, authenticated;
revoke all on function public.sol_inadimplencia_v1(uuid, date)
  from public, anon, authenticated;

grant execute on function public.sol_faturas_alunos_v1(uuid, integer, integer, text, text, date)
  to sol_acesso_restrito;
grant execute on function public.sol_inadimplencia_v1(uuid, date)
  to sol_acesso_restrito;
