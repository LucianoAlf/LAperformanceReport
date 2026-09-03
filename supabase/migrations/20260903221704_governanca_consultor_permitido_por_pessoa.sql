-- APLICADA EM PRODUCAO em 03/09/2026 via MCP (version 20260903221704).
-- Arquivo versionado depois; NAO REAPLICAR.
--
-- Modo Consultor da Mila: o gate passa a ser a PESSOA, nao o par telefone x inbox.
--
-- Antes: exigia linha em governanca.agente_canais_diretos com o canal (inbox) exato.
-- Isso obrigava N linhas por pessoa (uma por unidade), era mantido a mao e ja tinha
-- produzido os dois erros opostos: gente da casa barrada por falta de linha (Vitoria,
-- Fernanda) e linha ativa sem identidade correspondente (o telefone da Vick, que
-- devolvia quem_eh() = null e fazia a Mila conversar com "desconhecido").
--
-- Agora: a fonte unica e governanca.agente_usuarios -- a MESMA que quem_eh() le, e a
-- MESMA que o bridge da Sol ja consultava. Consequencias desejadas:
--   * desligar um colaborador (ativo = false) revoga o acesso sozinho;
--   * quem esta na governanca e reconhecido nos 3 numeros, nao em um so;
--   * e impossivel ter permissao sem identidade.
--
-- O criterio de QUEM pode falar com a Mila mora aqui dentro, de proposito: e o unico
-- lugar a editar quando a politica mudar. Hoje sao os departamentos que ja tinham
-- acesso antes desta migration (comercial, administrativo, diretoria) -- nenhuma
-- ampliacao de politica, so o fim do esquecimento. Para incluir pedagogico/rh/
-- marketing/financeiro (que a Sol ja autoriza, pois nao filtra departamento),
-- acrescentar aqui.
--
-- p_agente e p_canal continuam na assinatura para nao quebrar os grants existentes
-- nem os chamadores; sao ignorados. Unico consumidor hoje: governanca-client.js do
-- bridge da Mila (verificado por grep na VPS em 03/09/2026).
--
-- A tabela agente_canais_diretos deixa de ser consultada. Nao e removida: guarda o
-- historico de quem tinha acesso por canal.
--
-- Efeito medido: 7 pessoas com acesso -> 18. Ninguem perdeu.

create or replace function governanca.consultor_permitido(p_telefone text, p_agente text, p_canal text)
returns boolean
language sql
stable
security definer
set search_path to 'governanca', 'pg_temp'
as $$
  select exists (
    select 1
    from governanca.agente_usuarios u
    where u.telefone = p_telefone
      and u.ativo = true
      and u.departamento = any (array['comercial', 'administrativo', 'diretoria'])
  );
$$;

comment on function governanca.consultor_permitido(text, text, text) is
  'Modo Consultor: autoriza pela PESSOA em agente_usuarios (ativa + departamento), nao pelo canal. p_agente/p_canal ignorados, mantidos para compatibilidade de assinatura.';

-- O schema public deste projeto tem ALTER DEFAULT PRIVILEGES concedendo EXECUTE a
-- anon/authenticated/service_role. `revoke from public` NAO cobre isso -- por isso os
-- dois revokes.
revoke execute on function governanca.consultor_permitido(text, text, text) from public;
revoke execute on function governanca.consultor_permitido(text, text, text) from anon, authenticated;
grant execute on function governanca.consultor_permitido(text, text, text) to mila_acesso_restrito;
