-- Subprojeto B / B4: recusa explícita somente no domínio da pesquisa de evasão.
-- Não altera consentimentos de WhatsApp, marketing ou outros produtos.

alter table public.pesquisa_evasao
  add column if not exists resposta_valida boolean not null default false,
  add column if not exists opt_out_em timestamptz,
  add column if not exists opt_out_provider_message_id text;

update public.pesquisa_evasao
set resposta_valida = resposta_status in (
  'pronta_para_revisao',
  'em_revisao',
  'revisada'
)
where resposta_valida is distinct from (
  resposta_status in ('pronta_para_revisao', 'em_revisao', 'revisada')
);

comment on column public.pesquisa_evasao.resposta_valida is
  'Indica conteúdo válido para análise; recusada_opt_out permanece false.';
comment on column public.pesquisa_evasao.opt_out_em is
  'Instante da recusa explícita dentro desta pesquisa de evasão.';
comment on column public.pesquisa_evasao.opt_out_provider_message_id is
  'ID da mensagem inbound que originou a recusa, sem ampliar o consentimento para outros domínios.';

create or replace function public.fn_aplicar_opt_out_pesquisa_evasao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.pesquisa_id is null
     or new.resolution_status <> 'resolvida'
     or new.substantividade <> 'opt_out' then
    return new;
  end if;

  update public.pesquisa_evasao pesquisa
  set resposta_status = 'recusada_opt_out',
      resposta_valida = false,
      opt_out_em = new.recebido_em,
      opt_out_provider_message_id = new.provider_message_id,
      updated_at = now()
  where pesquisa.id = new.pesquisa_id
    and pesquisa.resposta_ingestao_versao = 'multipartes_v2';

  delete from public.pesquisa_evasao_processamento fila
  where fila.pesquisa_id = new.pesquisa_id;

  return new;
end;
$function$;

drop trigger if exists trg_aplicar_opt_out_pesquisa_evasao
  on public.pesquisa_evasao_mensagens;
create trigger trg_aplicar_opt_out_pesquisa_evasao
after insert on public.pesquisa_evasao_mensagens
for each row execute function public.fn_aplicar_opt_out_pesquisa_evasao();

create or replace function public.fn_proteger_opt_out_pesquisa_evasao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if old.resposta_status = 'recusada_opt_out'
     and new.resposta_status <> 'recusada_opt_out' then
    raise exception 'pesquisa_evasao_opt_out';
  end if;

  if new.resposta_status = 'recusada_opt_out'
     and (
       new.resposta_valida
       or new.opt_out_em is null
     ) then
    raise exception 'pesquisa_evasao_opt_out_inconsistente';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_proteger_opt_out_pesquisa_evasao
  on public.pesquisa_evasao;
create trigger trg_proteger_opt_out_pesquisa_evasao
before update on public.pesquisa_evasao
for each row execute function public.fn_proteger_opt_out_pesquisa_evasao();
