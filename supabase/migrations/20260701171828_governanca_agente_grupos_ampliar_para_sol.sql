-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Amplia agente_grupos para suportar a nuance de gatilho que a Sol ja usa
-- (mention vs command), sem quebrar as linhas existentes da Lia (colunas novas
-- ficam null/default para quem nao usa).

alter table governanca.agente_grupos
  add column gatilho text,                                  -- 'mention'|'command'|null
  add column allow_any_participant boolean not null default true,
  add column escopo text,
  add column notas text;

alter table governanca.agente_grupos
  add constraint agente_grupos_gatilho_chk check (gatilho is null or gatilho in ('mention','command'));

-- Cadastra os 2 grupos reais e ja ativos da Sol (espelhando internal-whatsapp-auth.json)
insert into governanca.agente_grupos (grupo_jid, agente, nome_grupo, modo, gatilho, allow_any_participant, escopo, notas) values
  ('120363410155889101@g.us', 'sol', 'Sucesso do aluno', 'responder', 'mention', true, 'success',
   'Grupo WhatsApp interno autorizado pelo Alf. Salva todas as mensagens, mas a Sol so responde quando chamada explicitamente (Sol/@Sol). Ajustado apos falso acionamento em 2026-06-11.'),
  ('120363405764806877@g.us', 'sol', 'LA REPORT - AUDITORIA EQUIPE', 'responder', 'command', false, 'lareport_auditoria',
   'Grupo WhatsApp interno autorizado pelo Alf em 2026-06-10. Sol deve registrar as conversas e so responder quando a mensagem comecar com /sol, usando a skill adequada ao pedido.');

-- Funcao detalhada (retorna o registro completo, nao so o JID) para o sync gerar o JSON.
create function governanca.grupos_detalhados(p_agente text)
returns table (grupo_jid text, nome_grupo text, modo text, gatilho text,
               allow_any_participant boolean, escopo text, notas text)
language sql
stable
security definer
set search_path = governanca, pg_temp
as $$
  select grupo_jid, nome_grupo, modo, gatilho, allow_any_participant, escopo, notas
  from governanca.agente_grupos
  where agente = p_agente and ativo = true
  order by grupo_jid
$$;

revoke execute on function governanca.grupos_detalhados(text) from public;
grant execute on function governanca.grupos_detalhados(text) to sol_acesso_restrito;
grant execute on function governanca.grupos_detalhados(text) to lia_acesso_restrito;
