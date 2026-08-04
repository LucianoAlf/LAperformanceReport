-- Preview editavel da pesquisa de evasao com auditoria do texto original e final.
-- Migration aditiva: nao altera respostas, mensagens, transcricoes ou analises.

alter table public.pesquisa_evasao_previews
  add column if not exists mensagem_template_original text,
  add column if not exists mensagem_editada boolean not null default false,
  add column if not exists editado_por_usuario_id integer
    references public.usuarios(id),
  add column if not exists editado_por_auth_user_id uuid,
  add column if not exists editado_em timestamptz,
  add column if not exists payload_hash_original text;

update public.pesquisa_evasao_previews
set mensagem_template_original = mensagem_renderizada,
    payload_hash_original = payload_hash
where mensagem_template_original is null
   or payload_hash_original is null;

-- Compatibilidade durante a janela migration -> Edge: a versao anterior da
-- funcao ainda insere somente mensagem_renderizada e payload_hash.
create or replace function public.fn_pesquisa_evasao_preview_original_insert()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.mensagem_template_original := coalesce(
    new.mensagem_template_original,
    new.mensagem_renderizada
  );
  new.payload_hash_original := coalesce(
    new.payload_hash_original,
    new.payload_hash
  );
  return new;
end;
$function$;

do $trigger$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.pesquisa_evasao_previews'::regclass
      and tgname = 'trg_pesquisa_evasao_preview_original_insert'
      and not tgisinternal
  ) then
    create trigger trg_pesquisa_evasao_preview_original_insert
      before insert on public.pesquisa_evasao_previews
      for each row
      execute function public.fn_pesquisa_evasao_preview_original_insert();
  end if;
end
$trigger$;

revoke all on function public.fn_pesquisa_evasao_preview_original_insert()
  from public, anon, authenticated;

alter table public.pesquisa_evasao_previews
  alter column mensagem_template_original set not null,
  alter column payload_hash_original set not null;

alter table public.pesquisa_evasao
  add column if not exists mensagem_template_original_snapshot text,
  add column if not exists mensagem_editada boolean not null default false,
  add column if not exists mensagem_editada_por_usuario_id integer
    references public.usuarios(id),
  add column if not exists mensagem_editada_por_auth_user_id uuid,
  add column if not exists mensagem_editada_em timestamptz,
  add column if not exists payload_hash_original_snapshot text,
  add column if not exists payload_hash_snapshot text;

-- Somente pesquisas que ja possuem preview recebem auditoria retrospectiva.
-- Linhas legadas sem preview permanecem sem snapshots; nao se inventa autor.
update public.pesquisa_evasao pe
set mensagem_template_original_snapshot = pp.mensagem_template_original,
    mensagem_renderizada = pp.mensagem_renderizada,
    mensagem_editada = pp.mensagem_editada,
    mensagem_editada_por_usuario_id = pp.editado_por_usuario_id,
    mensagem_editada_por_auth_user_id = pp.editado_por_auth_user_id,
    mensagem_editada_em = pp.editado_em,
    payload_hash_original_snapshot = pp.payload_hash_original,
    payload_hash_snapshot = pp.payload_hash
from public.pesquisa_evasao_previews pp
where pe.preview_id = pp.id
  and pe.mensagem_template_original_snapshot is null;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pesquisa_evasao_previews'::regclass
      and conname = 'pesquisa_evasao_previews_mensagem_editavel_check'
  ) then
    alter table public.pesquisa_evasao_previews
      add constraint pesquisa_evasao_previews_mensagem_editavel_check
      check (
        nullif(btrim(mensagem_template_original), '') is not null
        and char_length(mensagem_template_original) <= 2000
        and nullif(btrim(mensagem_renderizada), '') is not null
        and char_length(mensagem_renderizada) <= 2000
        and nullif(btrim(payload_hash_original), '') is not null
        and nullif(btrim(payload_hash), '') is not null
      ) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pesquisa_evasao_previews'::regclass
      and conname = 'pesquisa_evasao_previews_auditoria_edicao_check'
  ) then
    alter table public.pesquisa_evasao_previews
      add constraint pesquisa_evasao_previews_auditoria_edicao_check
      check (
        (
          mensagem_editada = false
          and mensagem_template_original = mensagem_renderizada
          and payload_hash_original = payload_hash
          and editado_por_usuario_id is null
          and editado_por_auth_user_id is null
          and editado_em is null
        )
        or
        (
          mensagem_editada = true
          and mensagem_template_original is distinct from mensagem_renderizada
          and editado_por_usuario_id is not null
          and editado_por_auth_user_id is not null
          and editado_em is not null
        )
      ) not valid;
  end if;
end
$constraints$;

alter table public.pesquisa_evasao_previews
  validate constraint pesquisa_evasao_previews_mensagem_editavel_check;

alter table public.pesquisa_evasao_previews
  validate constraint pesquisa_evasao_previews_auditoria_edicao_check;

create or replace function public.claim_pesquisa_evasao_preview_editavel(
  p_preview_id uuid,
  p_auth_user_id uuid,
  p_mensagem_final text,
  p_payload_hash_final text
)
returns table (
  pesquisa_id uuid,
  preview_id uuid,
  evasao_id integer,
  aluno_id integer,
  unidade_id uuid,
  modo_teste boolean,
  destinatario_tipo text,
  aluno_nome text,
  aluno_curso text,
  aluno_professor text,
  tempo_permanencia_meses integer,
  data_evasao date,
  motivo_cadastrado text,
  telefone_destino text,
  mensagem_renderizada text,
  caixa_id integer,
  idempotency_key uuid,
  envio_status text,
  provider_message_id text,
  executado_por_usuario_id integer,
  executado_por_auth_user_id uuid,
  assinatura_id uuid,
  assinatura_nome text,
  template_id uuid,
  template_versao integer,
  deve_despachar boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_preview public.pesquisa_evasao_previews%rowtype;
  v_claim record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'PESQUISA_EVASAO_ACESSO_NEGADO'
      using errcode = '42501';
  end if;

  select pp.*
  into v_preview
  from public.pesquisa_evasao_previews pp
  where pp.id = p_preview_id
  for update;

  if not found then
    raise exception 'PESQUISA_EVASAO_PREVIEW_NAO_ENCONTRADA'
      using errcode = 'P0002';
  end if;

  -- Ownership precede expiracao para nao revelar metadata de outro operador.
  if v_preview.auth_user_id is distinct from p_auth_user_id then
    raise exception 'PESQUISA_EVASAO_PREVIEW_AUTOR_INVALIDO'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_mensagem_final), '') is null
     or char_length(p_mensagem_final) > 2000
     or nullif(btrim(p_payload_hash_final), '') is null then
    raise exception 'PESQUISA_EVASAO_PREVIEW_TEXTO_INVALIDO'
      using errcode = '22023';
  end if;

  if v_preview.consumido_em is not null
     and v_preview.mensagem_renderizada is distinct from p_mensagem_final then
    raise exception 'PESQUISA_EVASAO_PREVIEW_TEXTO_DIVERGENTE'
      using errcode = '40001';
  end if;

  if v_preview.consumido_em is null then
    update public.pesquisa_evasao_previews pp
    set mensagem_renderizada = p_mensagem_final,
        payload_hash = p_payload_hash_final,
        mensagem_editada =
          p_mensagem_final is distinct from pp.mensagem_template_original,
        editado_por_usuario_id = case
          when p_mensagem_final is distinct from pp.mensagem_template_original
            then pp.usuario_id
          else null
        end,
        editado_por_auth_user_id = case
          when p_mensagem_final is distinct from pp.mensagem_template_original
            then pp.auth_user_id
          else null
        end,
        editado_em = case
          when p_mensagem_final is distinct from pp.mensagem_template_original
            then clock_timestamp()
          else null
        end
    where pp.id = p_preview_id
      and pp.consumido_em is null;

    if not found then
      raise exception 'PESQUISA_EVASAO_PREVIEW_CONSUMO_CONCORRENTE'
        using errcode = '40001';
    end if;
  end if;

  -- Materializa a delegacao uma unica vez. O comando seguinte enxerga com
  -- seguranca a pesquisa criada/atualizada pelo claim legado e permanece na
  -- mesma transacao atomica da funcao.
  with claim as materialized (
    select *
    from public.claim_pesquisa_evasao_preview(
      p_preview_id,
      p_auth_user_id
    )
  )
  select *
  into strict v_claim
  from claim;

  update public.pesquisa_evasao pe
  set mensagem_template_original_snapshot = pp.mensagem_template_original,
      mensagem_renderizada = pp.mensagem_renderizada,
      mensagem_editada = pp.mensagem_editada,
      mensagem_editada_por_usuario_id = pp.editado_por_usuario_id,
      mensagem_editada_por_auth_user_id = pp.editado_por_auth_user_id,
      mensagem_editada_em = pp.editado_em,
      payload_hash_original_snapshot = pp.payload_hash_original,
      payload_hash_snapshot = pp.payload_hash
  from public.pesquisa_evasao_previews pp
  where pe.id = v_claim.pesquisa_id
    and pe.preview_id = v_claim.preview_id
    and pp.id = v_claim.preview_id;

  return query select
    v_claim.pesquisa_id,
    v_claim.preview_id,
    v_claim.evasao_id,
    v_claim.aluno_id,
    v_claim.unidade_id,
    v_claim.modo_teste,
    v_claim.destinatario_tipo,
    v_claim.aluno_nome,
    v_claim.aluno_curso,
    v_claim.aluno_professor,
    v_claim.tempo_permanencia_meses,
    v_claim.data_evasao,
    v_claim.motivo_cadastrado,
    v_claim.telefone_destino,
    v_claim.mensagem_renderizada,
    v_claim.caixa_id,
    v_claim.idempotency_key,
    v_claim.envio_status,
    v_claim.provider_message_id,
    v_claim.executado_por_usuario_id,
    v_claim.executado_por_auth_user_id,
    v_claim.assinatura_id,
    v_claim.assinatura_nome,
    v_claim.template_id,
    v_claim.template_versao,
    v_claim.deve_despachar;
end;
$function$;

revoke all on function public.claim_pesquisa_evasao_preview_editavel(
  uuid,
  uuid,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.claim_pesquisa_evasao_preview_editavel(
  uuid,
  uuid,
  text,
  text
) to service_role;

comment on function public.claim_pesquisa_evasao_preview_editavel(
  uuid,
  uuid,
  text,
  text
) is
  'Congela texto final editavel, preserva o original e delega uma unica vez ao claim legado. Idempotencia compara o texto final exato.';
;
