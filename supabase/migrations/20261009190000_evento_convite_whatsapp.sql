-- Convite do recital por WhatsApp (LAPE-39, item 10 da reunião de 08/10/2026).
--
-- A equipe vê o convite montado (prévia) e só ele sai quando alguém clica em Enviar,
-- pela caixa da SECRETARIA da unidade no Chatwoot (decisão do Hugo, 09/10/2026).
-- O texto vem da Fernanda/Recreio; cada evento guarda o seu (local, prazos e regras
-- mudam por unidade), com campos preenchidos por aluno ({responsavel}, {aluno}, {bloco}…).
--
-- Custo/dia: zero rotina. Uma linha por clique em Enviar; nenhum cron, nenhum gatilho novo.

-- 1) Texto do convite por evento. NULL = o padrão do sistema (src/lib/eventoConvite.ts).
alter table public.evento add column if not exists convite_texto text;
comment on column public.evento.convite_texto is
  'Modelo do convite de WhatsApp deste recital, com campos {saudacao} {responsavel} {aluno} '
  '{bloco} {data} {dia_semana} {horario}. NULL = modelo padrão do sistema.';

-- 2) A tabela de comunicação ganha o resultado do envio.
--    Ela nasceu só-insert (histórico nunca sobrescrito); o desfecho do envio é gravado
--    pela edge com service_role, que continua sendo o único que faz UPDATE.
alter table public.evento_comunicacao
  add column if not exists tipo text not null default 'convite'
    check (tipo in ('convite', 'comunicado')),
  add column if not exists status text
    check (status is null or status in ('enviando', 'enviado', 'erro')),
  add column if not exists destino_tipo text
    check (destino_tipo is null or destino_tipo in ('responsavel', 'aluno')),
  add column if not exists destino_nome text,
  add column if not exists destino_telefone text,
  add column if not exists erro text,
  add column if not exists chatwoot_inbox_id integer,
  add column if not exists chatwoot_conversa_id integer,
  add column if not exists chatwoot_mensagem_id bigint,
  add column if not exists reenvio boolean not null default false,
  add column if not exists concluido_em timestamptz;

comment on column public.evento_comunicacao.status is
  'enviando = reservado antes de chamar o Chatwoot; enviado = Chatwoot aceitou e não marcou falha; '
  'erro = motivo em `erro`. NULL = linha anterior a 09/10/2026 (sem desfecho registrado).';

-- Um envio em andamento por pessoa: dois cliques (ou duas abas) não mandam duas vezes.
create unique index if not exists uq_evento_comunicacao_convite_enviando
  on public.evento_comunicacao (participacao_id)
  where tipo = 'convite' and status = 'enviando';

create index if not exists ix_evento_comunicacao_participacao
  on public.evento_comunicacao (participacao_id, enviado_em desc);
