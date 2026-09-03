-- Projeto: SOL (bvltexmlmydsncfjstbr) — NAO e o LA Report.
-- A1 do Mapa de Sinais: o espelho do Chatwoot cobria so as 3 secretarias.
--
-- Por que basta um INSERT: o webhook 10 do Chatwoot ("Sol - Escuta Secretaria")
-- e de CONTA (inboxes: []), entao a edge `chatwoot-secretaria-webhook` ja recebe
-- evento de TODAS as inboxes e descarta o que nao esta nesta allowlist:
--   .from("sol_chatwoot_inboxes").eq("inbox_id", inboxId).eq("status","ativo")
--   if (!allowed) return json({ skipped: "inbox_not_allowed", inboxId });
-- O proprio autor deixou o comentario "adicionar/remover inbox sem redeploy".
-- Ha tambem FK sol_chatwoot_mensagens.inbox_id -> sol_chatwoot_inboxes, ou seja,
-- a allowlist e estrutural, nao so logica.
--
-- Medicao que motivou (conversas desde 2026-01-01, summary_reports do Chatwoot):
--   155 Mila_CG 4.427 | 148 Mila_Recreio 2.426 | 147 Mila_Barra 1.835  = 8.688
--   168 Sec.Recreio 4.183 | 180 Sec.CG 446 | 179 Sec.Barra 256         = 4.885 (ja espelhadas)
--   209 Instagram 85 (marginal) | 50 ADM Recreio 0 (dormante)
-- O canal comercial e o maior ponto cego: quase o dobro do que ja era ouvido.

begin;

-- 1) departamento
-- Sem esta coluna, todo consumidor do espelho precisaria hardcodar
-- `inbox_id in (147,148,155)` para saber "isto e comercial" — o tipo de
-- duplicacao de regra que ja gerou as duplicatas de renovacao neste projeto.
alter table public.sol_chatwoot_inboxes
  add column if not exists departamento text not null default 'secretaria';

alter table public.sol_chatwoot_inboxes
  drop constraint if exists sol_chatwoot_inboxes_departamento_check;

alter table public.sol_chatwoot_inboxes
  add constraint sol_chatwoot_inboxes_departamento_check
  check (departamento in ('secretaria','comercial','financeiro','social'));

comment on column public.sol_chatwoot_inboxes.departamento is
  'Quem atende o canal: secretaria (Sol/ADM), comercial (Mila/consultoras), financeiro, social (Instagram). Rotear sinal por esta coluna — nunca hardcodar inbox_id no consumidor.';

comment on table public.sol_chatwoot_inboxes is
  'Allowlist do espelho do Chatwoot. A edge chatwoot-secretaria-webhook so grava mensagem de inbox com status=ativo aqui; incluir/excluir canal e INSERT/UPDATE nesta tabela, sem redeploy.';

-- 2) as 5 inboxes que faltavam (idempotente)
insert into public.sol_chatwoot_inboxes (inbox_id, inbox_nome, unidade, status, departamento) values
  (147, 'Mila_Barra',                     'Barra',        'ativo', 'comercial'),
  (148, 'Mila_Recreio',                   'Recreio',      'ativo', 'comercial'),
  (155, 'Mila_CG',                        'Campo Grande', 'ativo', 'comercial'),
  (209, 'instagram-direct-lamusicschool', 'Global',       'ativo', 'social'),
  (50,  'ADM Recreio',                    'Recreio',      'ativo', 'financeiro')
on conflict (inbox_id) do update
  set inbox_nome   = excluded.inbox_nome,
      unidade      = excluded.unidade,
      status       = excluded.status,
      departamento = excluded.departamento;

-- 3) fechar a ACL herdada de ALTER DEFAULT PRIVILEGES
-- As duas tabelas estavam com anon=arwdDxtm (INSERT/UPDATE/DELETE/TRUNCATE).
-- Nao era explorável hoje porque RLS esta ligada e nao ha policy para anon
-- (RLS sem policy nega), mas basta alguem criar uma policy `using(true)` sem
-- declarar role para o anon key — que e publica, vai no bundle do front —
-- ganhar escrita sobre conversa de aluno e de lead. Defesa em profundidade:
-- a partir daqui so service_role escreve e so lia_acesso_restrito le.
revoke all on public.sol_chatwoot_inboxes   from anon, authenticated, public;
revoke all on public.sol_chatwoot_mensagens from anon, authenticated, public;
grant  select on public.sol_chatwoot_inboxes, public.sol_chatwoot_mensagens to lia_acesso_restrito;

commit;
