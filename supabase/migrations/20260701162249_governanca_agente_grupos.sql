-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Governança de grupos: qual agente pode responder em qual grupo de WhatsApp.
-- Chave composta (grupo_jid, agente): o mesmo grupo pode ter varios agentes,
-- cada um com seu proprio modo (ex: Sol e Lia no mesmo grupo "Sucesso do aluno").

create table governanca.agente_grupos (
  grupo_jid   text not null,
  agente      text not null,
  nome_grupo  text not null,
  modo        text not null default 'so_registrar', -- ignorar|so_registrar|responder
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (grupo_jid, agente),
  constraint agente_grupos_modo_chk check (modo in ('ignorar','so_registrar','responder'))
);

comment on table governanca.agente_grupos is
  'Fonte unica de quais grupos de WhatsApp cada agente pode responder. so_registrar = grava mas nunca responde. Consultada via governanca.grupos_permitidos().';

create trigger trg_agente_grupos_updated_at
  before update on governanca.agente_grupos
  for each row execute function governanca.set_updated_at();

-- Devolve so os JIDs de grupo em modo "responder" para um agente (usado pelo sync do bridge).
create function governanca.grupos_permitidos(p_agente text)
returns setof text
language sql
stable
security definer
set search_path = governanca, pg_temp
as $$
  select grupo_jid from governanca.agente_grupos
  where agente = p_agente and modo = 'responder' and ativo = true
  order by grupo_jid
$$;

revoke execute on function governanca.grupos_permitidos(text) from public;
grant execute on function governanca.grupos_permitidos(text) to lia_acesso_restrito;

-- Popular com o estado real e verificado hoje (2026-07-01):
-- so "Sucesso do aluno" tem modo=responder no bridge.js atual; os outros 6 ja sao
-- gravados (lia_mensagens) mas nunca respondidos -> so_registrar.
insert into governanca.agente_grupos (grupo_jid, agente, nome_grupo, modo) values
  ('120363410155889101@g.us', 'lia', 'Sucesso do aluno',              'responder'),
  ('120363399508387277@g.us', 'lia', 'LA MUSIC | Campo Grande (equipe)', 'so_registrar'),
  ('120363417555653370@g.us', 'lia', 'LA MUSIC | Barra (equipe)',        'so_registrar'),
  ('120363418783231492@g.us', 'lia', 'LA MUSIC | Recreio (equipe)',      'so_registrar'),
  ('120363400177495585@g.us', 'lia', 'LA MUSIC | Barra (comunidade)',    'so_registrar'),
  ('120363397281735141@g.us', 'lia', 'LA MUSIC | Recreio (comunidade)',  'so_registrar'),
  ('120363399843706254@g.us', 'lia', 'LA MUSIC | Campo Grande (comunidade)', 'so_registrar');
