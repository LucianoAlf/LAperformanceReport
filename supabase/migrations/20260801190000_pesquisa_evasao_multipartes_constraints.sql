-- Subprojeto B / B2: contrato append-only da conversa de evasão.
-- Esta migration NÃO ativa o motor novo globalmente. Todas as pesquisas
-- existentes permanecem em legado_v1; o opt-in inicial é feito por linha de teste.

alter table public.pesquisa_evasao
  add column if not exists resposta_ingestao_versao text not null default 'legado_v1';

alter table public.pesquisa_evasao
  drop constraint if exists pesquisa_evasao_resposta_ingestao_versao_check;

alter table public.pesquisa_evasao
  add constraint pesquisa_evasao_resposta_ingestao_versao_check
  check (resposta_ingestao_versao in ('legado_v1', 'multipartes_v2'));

comment on column public.pesquisa_evasao.resposta_ingestao_versao is
  'Seleciona o motor inbound por pesquisa. Linhas anteriores ao corte permanecem legado_v1.';

do $block$
declare
  v_duplicidades integer;
begin
  select count(*)
  into v_duplicidades
  from (
    select caixa_id, telefone_destino_snapshot
    from public.pesquisa_evasao
    where modo_teste = false
      and caixa_id is not null
      and nullif(btrim(telefone_destino_snapshot), '') is not null
      and envio_status in ('enviado', 'entregue', 'lido')
      and resposta_status in ('sem_resposta', 'coletando')
    group by caixa_id, telefone_destino_snapshot
    having count(*) > 1
  ) duplicadas;

  if v_duplicidades > 0 then
    raise exception
      'não é seguro criar unicidade de pesquisa aberta: % pares caixa/telefone duplicados',
      v_duplicidades;
  end if;
end;
$block$;

drop index if exists public.pesquisa_evasao_aberta_telefone_uidx;
create unique index pesquisa_evasao_aberta_telefone_uidx
  on public.pesquisa_evasao (caixa_id, telefone_destino_snapshot)
  where modo_teste = false
    and caixa_id is not null
    and nullif(btrim(telefone_destino_snapshot), '') is not null
    and envio_status in ('enviado', 'entregue', 'lido')
    and resposta_status in ('sem_resposta', 'coletando');

do $block$
begin
  if exists (
    select 1
    from public.pesquisa_evasao_mensagens
    where resolution_status not in ('resolvida', 'sem_pesquisa', 'ambigua')
       or substantividade not in (
         'adiamento',
         'abertura',
         'conteudo_substantivo',
         'opt_out',
         'indeterminado'
       )
  ) then
    raise exception
      'pesquisa_evasao_mensagens contém valores incompatíveis com o contrato multipartes';
  end if;
end;
$block$;

alter table public.pesquisa_evasao_mensagens
  alter column resolution_status set default 'sem_pesquisa',
  alter column substantividade set default 'indeterminado';

alter table public.pesquisa_evasao_mensagens
  drop constraint if exists pesquisa_evasao_mensagens_direcao_check,
  drop constraint if exists pesquisa_evasao_mensagens_tipo_check,
  drop constraint if exists pesquisa_evasao_mensagens_resolution_status_check,
  drop constraint if exists pesquisa_evasao_mensagens_substantividade_check;

alter table public.pesquisa_evasao_mensagens
  add constraint pesquisa_evasao_mensagens_direcao_check
    check (direcao in ('entrada', 'saida')),
  add constraint pesquisa_evasao_mensagens_tipo_check
    check (tipo in ('texto', 'audio')),
  add constraint pesquisa_evasao_mensagens_resolution_status_check
    check (resolution_status in ('resolvida', 'sem_pesquisa', 'ambigua')),
  add constraint pesquisa_evasao_mensagens_substantividade_check
    check (
      substantividade in (
        'adiamento',
        'abertura',
        'conteudo_substantivo',
        'opt_out',
        'indeterminado'
      )
    );

-- O índice já foi criado na fundação. Esta forma idempotente preserva a
-- deduplicação de reentrega por provedor sem reescrever a migration aplicada.
create unique index if not exists pesquisa_evasao_mensagens_provider_uidx
  on public.pesquisa_evasao_mensagens (caixa_id, provider_message_id)
  where provider_message_id is not null;

create or replace function public.fn_pesquisa_evasao_mensagem_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'conteudo original da mensagem de evasao e imutavel';
  end if;

  if new.caixa_id is distinct from old.caixa_id
     or new.direcao is distinct from old.direcao
     or new.provider_message_id is distinct from old.provider_message_id
     or new.telefone_normalizado is distinct from old.telefone_normalizado
     or new.tipo is distinct from old.tipo
     or new.texto is distinct from old.texto
     or new.provider_created_at is distinct from old.provider_created_at
     or new.recebido_em is distinct from old.recebido_em
     or new.correlation_id is distinct from old.correlation_id
     or new.idempotency_key is distinct from old.idempotency_key
     or new.criado_em is distinct from old.criado_em then
    raise exception 'conteudo original da mensagem de evasao e imutavel';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_pesquisa_evasao_mensagem_append_only
  on public.pesquisa_evasao_mensagens;
create trigger trg_pesquisa_evasao_mensagem_append_only
before update or delete on public.pesquisa_evasao_mensagens
for each row execute function public.fn_pesquisa_evasao_mensagem_append_only();

create or replace function public.preparar_nova_analise_pesquisa_evasao(
  p_pesquisa_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_ingestao text;
  v_ultima_versao integer;
  v_ultimo_status text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'acesso_negado';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_pesquisa_id::text, 0));

  select resposta_ingestao_versao
  into v_ingestao
  from public.pesquisa_evasao
  where id = p_pesquisa_id
  for update;

  if not found then
    raise exception 'pesquisa_nao_encontrada';
  end if;
  if v_ingestao <> 'multipartes_v2' then
    raise exception 'pesquisa_nao_usa_multipartes_v2';
  end if;

  select versao, status
  into v_ultima_versao, v_ultimo_status
  from public.pesquisa_evasao_analises
  where pesquisa_id = p_pesquisa_id
  order by versao desc
  limit 1;

  if found and v_ultimo_status <> 'revisada' then
    return v_ultima_versao;
  end if;

  v_ultima_versao := coalesce(v_ultima_versao, 0) + 1;
  insert into public.pesquisa_evasao_analises (
    pesquisa_id,
    versao,
    status
  ) values (
    p_pesquisa_id,
    v_ultima_versao,
    'rascunho'
  );

  return v_ultima_versao;
end;
$function$;

revoke all on function public.preparar_nova_analise_pesquisa_evasao(uuid)
  from public, anon, authenticated;
grant execute on function public.preparar_nova_analise_pesquisa_evasao(uuid)
  to service_role;

comment on function public.preparar_nova_analise_pesquisa_evasao(uuid) is
  'Abre de forma serializada uma nova versão derivada quando chega continuação após revisão.';
