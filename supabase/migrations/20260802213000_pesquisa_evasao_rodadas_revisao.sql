-- Subprojeto B: delimita conversas multipartes em rodadas imutaveis.
-- A janela de 7 dias continua sendo apenas a validade de roteamento.
-- Cada silencio de 15 minutos encerra uma rodada e a proxima mensagem recebe
-- uma nova versao de analise.

alter table public.pesquisa_evasao
  add column if not exists conteudo_novo_desde_revisao boolean not null
  default false;

alter table public.pesquisa_evasao_mensagens
  add column if not exists analise_versao integer;

alter table public.pesquisa_evasao_analises
  add column if not exists primeira_mensagem_id uuid,
  add column if not exists ultima_mensagem_id uuid,
  add column if not exists iniciada_em timestamptz,
  add column if not exists ultima_mensagem_em timestamptz,
  add column if not exists encerrada_em timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pesquisa_evasao_analises_status_check'
      and conrelid = 'public.pesquisa_evasao_analises'::regclass
  ) then
    alter table public.pesquisa_evasao_analises
      add constraint pesquisa_evasao_analises_status_check
      check (status in (
        'rascunho',
        'pronta_para_revisao',
        'em_revisao',
        'revisada'
      ));
  end if;
end;
$$;

-- Metadado derivado para as mensagens V2 que chegaram durante o piloto.
-- O conteudo original nao e alterado: as nove mensagens existentes continuam
-- intactas e passam a pertencer a versao que ja as consolidava.
insert into public.pesquisa_evasao_analises (
  pesquisa_id,
  versao,
  status,
  criado_em
)
select
  pe.id,
  1,
  'rascunho',
  min(coalesce(pem.provider_created_at, pem.recebido_em, pem.criado_em))
from public.pesquisa_evasao pe
join public.pesquisa_evasao_mensagens pem
  on pem.pesquisa_id = pe.id
 and pem.direcao = 'entrada'
 and pem.resolution_status = 'resolvida'
where pe.resposta_ingestao_versao = 'multipartes_v2'
  and not exists (
    select 1
    from public.pesquisa_evasao_analises pea
    where pea.pesquisa_id = pe.id
  )
group by pe.id
on conflict (pesquisa_id, versao) do nothing;

with ultima_analise as (
  select distinct on (pea.pesquisa_id)
    pea.pesquisa_id,
    pea.versao
  from public.pesquisa_evasao_analises pea
  join public.pesquisa_evasao pe on pe.id = pea.pesquisa_id
  where pe.resposta_ingestao_versao = 'multipartes_v2'
  order by pea.pesquisa_id, pea.versao desc
)
update public.pesquisa_evasao_mensagens pem
set analise_versao = ultima_analise.versao
from ultima_analise
where pem.pesquisa_id = ultima_analise.pesquisa_id
  and pem.direcao = 'entrada'
  and pem.resolution_status = 'resolvida'
  and pem.analise_versao is null;

with limites as (
  select
    pem.pesquisa_id,
    pem.analise_versao as versao,
    (array_agg(
      pem.id order by
        coalesce(pem.provider_created_at, pem.recebido_em),
        pem.criado_em,
        pem.id
    ))[1] as primeira_mensagem_id,
    (array_agg(
      pem.id order by
        coalesce(pem.provider_created_at, pem.recebido_em) desc,
        pem.criado_em desc,
        pem.id desc
    ))[1] as ultima_mensagem_id,
    min(coalesce(pem.provider_created_at, pem.recebido_em)) as iniciada_em,
    max(coalesce(pem.provider_created_at, pem.recebido_em)) as ultima_mensagem_em
  from public.pesquisa_evasao_mensagens pem
  where pem.analise_versao is not null
  group by pem.pesquisa_id, pem.analise_versao
)
update public.pesquisa_evasao_analises pea
set
  primeira_mensagem_id = limites.primeira_mensagem_id,
  ultima_mensagem_id = limites.ultima_mensagem_id,
  iniciada_em = limites.iniciada_em,
  ultima_mensagem_em = limites.ultima_mensagem_em
from limites
where pea.pesquisa_id = limites.pesquisa_id
  and pea.versao = limites.versao;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pesquisa_evasao_mensagens_analise_fkey'
      and conrelid = 'public.pesquisa_evasao_mensagens'::regclass
  ) then
    alter table public.pesquisa_evasao_mensagens
      add constraint pesquisa_evasao_mensagens_analise_fkey
      foreign key (pesquisa_id, analise_versao)
      references public.pesquisa_evasao_analises (pesquisa_id, versao);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pesquisa_evasao_analises_primeira_mensagem_fkey'
      and conrelid = 'public.pesquisa_evasao_analises'::regclass
  ) then
    alter table public.pesquisa_evasao_analises
      add constraint pesquisa_evasao_analises_primeira_mensagem_fkey
      foreign key (primeira_mensagem_id)
      references public.pesquisa_evasao_mensagens (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pesquisa_evasao_analises_ultima_mensagem_fkey'
      and conrelid = 'public.pesquisa_evasao_analises'::regclass
  ) then
    alter table public.pesquisa_evasao_analises
      add constraint pesquisa_evasao_analises_ultima_mensagem_fkey
      foreign key (ultima_mensagem_id)
      references public.pesquisa_evasao_mensagens (id);
  end if;
end;
$$;

create index if not exists pesquisa_evasao_mensagens_rodada_idx
  on public.pesquisa_evasao_mensagens (
    pesquisa_id,
    analise_versao,
    recebido_em,
    id
  )
  where analise_versao is not null;

create index if not exists pesquisa_evasao_analises_fila_idx
  on public.pesquisa_evasao_analises (
    status,
    ultima_mensagem_em,
    pesquisa_id,
    versao
  );

create or replace function public.fn_pesquisa_evasao_mensagem_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
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
     or new.criado_em is distinct from old.criado_em
     or (
       old.analise_versao is not null
       and new.analise_versao is distinct from old.analise_versao
     ) then
    raise exception 'conteudo original da mensagem de evasao e imutavel';
  end if;

  return new;
end;
$$;

create or replace function public.fn_proteger_analise_evasao_revisada()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'revisada' then
    raise exception 'analise revisada de evasao e imutavel';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_proteger_analise_evasao_revisada
  on public.pesquisa_evasao_analises;
create trigger trg_proteger_analise_evasao_revisada
before update or delete on public.pesquisa_evasao_analises
for each row execute function public.fn_proteger_analise_evasao_revisada();

create or replace function public.fn_atribuir_rodada_pesquisa_evasao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ingestao text;
  v_evento_em timestamptz;
  v_ultima public.pesquisa_evasao_analises%rowtype;
  v_nova_versao integer;
  v_abre_nova boolean := false;
begin
  if new.pesquisa_id is null
     or new.direcao <> 'entrada'
     or new.resolution_status <> 'resolvida'
     or new.analise_versao is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.pesquisa_id::text, 0));

  select pe.resposta_ingestao_versao
  into v_ingestao
  from public.pesquisa_evasao pe
  where pe.id = new.pesquisa_id
  for update;

  if not found or v_ingestao <> 'multipartes_v2' then
    return new;
  end if;

  v_evento_em := coalesce(new.provider_created_at, new.recebido_em, now());

  select pea.*
  into v_ultima
  from public.pesquisa_evasao_analises pea
  where pea.pesquisa_id = new.pesquisa_id
  order by pea.versao desc
  limit 1;

  if not found then
    v_abre_nova := true;
    v_nova_versao := 1;
  else
    v_abre_nova :=
      v_ultima.status in ('pronta_para_revisao', 'em_revisao', 'revisada')
      or v_ultima.encerrada_em is not null
      or (
        v_ultima.ultima_mensagem_em is not null
        and v_evento_em >= v_ultima.ultima_mensagem_em + interval '15 minutes'
      );
    v_nova_versao := case
      when v_abre_nova then v_ultima.versao + 1
      else v_ultima.versao
    end;

    if v_abre_nova
       and v_ultima.status = 'rascunho'
       and v_ultima.encerrada_em is null
       and v_ultima.ultima_mensagem_em is not null then
      update public.pesquisa_evasao_analises
      set encerrada_em = v_ultima.ultima_mensagem_em + interval '15 minutes'
      where id = v_ultima.id
        and status = 'rascunho';
    end if;
  end if;

  if v_abre_nova then
    insert into public.pesquisa_evasao_analises (
      pesquisa_id,
      versao,
      status,
      iniciada_em,
      ultima_mensagem_em
    ) values (
      new.pesquisa_id,
      v_nova_versao,
      'rascunho',
      v_evento_em,
      v_evento_em
    );
  end if;

  new.analise_versao := v_nova_versao;
  return new;
end;
$$;

create or replace function public.fn_registrar_limites_rodada_pesquisa_evasao()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_evento_em timestamptz;
  v_tem_revisao_anterior boolean;
begin
  if new.pesquisa_id is null or new.analise_versao is null then
    return new;
  end if;

  v_evento_em := coalesce(new.provider_created_at, new.recebido_em, now());

  update public.pesquisa_evasao_analises pea
  set
    primeira_mensagem_id = coalesce(pea.primeira_mensagem_id, new.id),
    ultima_mensagem_id = new.id,
    iniciada_em = least(coalesce(pea.iniciada_em, v_evento_em), v_evento_em),
    ultima_mensagem_em = greatest(
      coalesce(pea.ultima_mensagem_em, v_evento_em),
      v_evento_em
    )
  where pea.pesquisa_id = new.pesquisa_id
    and pea.versao = new.analise_versao
    and pea.status <> 'revisada';

  if new.substantividade = 'opt_out' then
    return new;
  end if;

  select exists (
    select 1
    from public.pesquisa_evasao_analises anterior
    where anterior.pesquisa_id = new.pesquisa_id
      and anterior.versao < new.analise_versao
      and anterior.status = 'revisada'
  ) into v_tem_revisao_anterior;

  update public.pesquisa_evasao pe
  set
    resposta_status = 'coletando',
    resposta_valida = false,
    pronta_para_revisao_em = null,
    conteudo_novo_desde_revisao =
      pe.conteudo_novo_desde_revisao or v_tem_revisao_anterior,
    updated_at = now()
  where pe.id = new.pesquisa_id
    and pe.resposta_ingestao_versao = 'multipartes_v2';

  return new;
end;
$$;

drop trigger if exists trg_atribuir_rodada_pesquisa_evasao
  on public.pesquisa_evasao_mensagens;
create trigger trg_atribuir_rodada_pesquisa_evasao
before insert on public.pesquisa_evasao_mensagens
for each row execute function public.fn_atribuir_rodada_pesquisa_evasao();

-- Executa antes dos triggers antigos "trg_agendar" e "trg_aplicar". Para
-- opt-out, esta funcao nao altera o cabecalho e a protecao existente prevalece.
drop trigger if exists trg_00_registrar_rodada_pesquisa_evasao
  on public.pesquisa_evasao_mensagens;
create trigger trg_00_registrar_rodada_pesquisa_evasao
after insert on public.pesquisa_evasao_mensagens
for each row execute function public.fn_registrar_limites_rodada_pesquisa_evasao();

create or replace function public.preparar_nova_analise_pesquisa_evasao(
  p_pesquisa_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  if not found then raise exception 'pesquisa_nao_encontrada'; end if;
  if v_ingestao <> 'multipartes_v2' then
    raise exception 'pesquisa_nao_usa_multipartes_v2';
  end if;

  select versao, status
  into v_ultima_versao, v_ultimo_status
  from public.pesquisa_evasao_analises
  where pesquisa_id = p_pesquisa_id
  order by versao desc
  limit 1;

  if found and v_ultimo_status = 'rascunho' then
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
$$;

create or replace function public.get_conversa_pesquisa_evasao(
  p_pesquisa_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_resultado jsonb;
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'acesso_negado';
  end if;

  select jsonb_build_object(
    'pesquisa_id', pe.id,
    'aluno_nome', pe.aluno_nome,
    'modo_teste', pe.modo_teste,
    'resposta_status', pe.resposta_status,
    'conteudo_novo_desde_revisao', pe.conteudo_novo_desde_revisao,
    'resposta_texto_legado', pe.resposta_texto,
    'respondido_em', pe.respondido_em,
    'rodadas', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pea.id,
          'versao', pea.versao,
          'status', pea.status,
          'texto_consolidado', pea.texto_consolidado,
          'iniciada_em', pea.iniciada_em,
          'ultima_mensagem_em', pea.ultima_mensagem_em,
          'encerrada_em', pea.encerrada_em,
          'revisado_em', pea.revisado_em,
          'revisor_usuario_id', pea.revisor_usuario_id,
          'mensagens', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', pem.id,
                'tipo', pem.tipo,
                'texto', pem.texto,
                'substantividade', pem.substantividade,
                'recebido_em', pem.recebido_em,
                'audio_disponivel', pem.audio_storage_path is not null,
                'transcricao_status', transcricao.status,
                'transcricao_texto', transcricao.texto
              ) order by
                coalesce(pem.provider_created_at, pem.recebido_em),
                pem.criado_em,
                pem.id
            )
            from public.pesquisa_evasao_mensagens pem
            left join lateral (
              select pet.status, pet.texto
              from public.pesquisa_evasao_transcricoes pet
              where pet.mensagem_id = pem.id
              order by pet.versao desc
              limit 1
            ) transcricao on true
            where pem.pesquisa_id = pea.pesquisa_id
              and pem.analise_versao = pea.versao
              and pem.direcao = 'entrada'
          ), '[]'::jsonb)
        ) order by pea.versao
      )
      from public.pesquisa_evasao_analises pea
      where pea.pesquisa_id = pe.id
    ), '[]'::jsonb)
  )
  into v_resultado
  from public.pesquisa_evasao pe
  where pe.id = p_pesquisa_id;

  if v_resultado is null then raise exception 'pesquisa_nao_encontrada'; end if;
  return v_resultado;
end;
$$;

create or replace function public.listar_pesquisas_evasao_revisao(
  p_unidade_id uuid default null,
  p_limite integer default 20,
  p_offset integer default 0
)
returns table (
  pesquisa_id uuid,
  evasao_id integer,
  unidade_id uuid,
  aluno_nome text,
  modo_teste boolean,
  resposta_status text,
  conteudo_novo_desde_revisao boolean,
  ultima_versao integer,
  ultima_rodada_status text,
  ultima_mensagem_em timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.fn_pesquisa_evasao_usuario_interno_ativo() then
    raise exception 'acesso_negado';
  end if;

  return query
  select
    pe.id,
    pe.evasao_id,
    pe.unidade_id,
    pe.aluno_nome,
    pe.modo_teste,
    pe.resposta_status,
    pe.conteudo_novo_desde_revisao,
    ultima.versao,
    ultima.status,
    ultima.ultima_mensagem_em,
    count(*) over ()
  from public.pesquisa_evasao pe
  join lateral (
    select pea.versao, pea.status, pea.ultima_mensagem_em
    from public.pesquisa_evasao_analises pea
    where pea.pesquisa_id = pe.id
    order by pea.versao desc
    limit 1
  ) ultima on true
  where (p_unidade_id is null or pe.unidade_id = p_unidade_id)
    and (
      ultima.status in ('pronta_para_revisao', 'em_revisao')
      or pe.conteudo_novo_desde_revisao
    )
  order by
    pe.conteudo_novo_desde_revisao desc,
    ultima.ultima_mensagem_em asc nulls last,
    pe.id
  limit least(greatest(coalesce(p_limite, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

create or replace function public.iniciar_revisao_pesquisa_evasao(
  p_analise_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario_id integer;
  v_pesquisa_id uuid;
begin
  select u.id into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid() and u.ativo = true;
  if v_usuario_id is null then raise exception 'acesso_negado'; end if;

  update public.pesquisa_evasao_analises pea
  set status = 'em_revisao'
  where pea.id = p_analise_id
    and pea.status = 'pronta_para_revisao'
  returning pea.pesquisa_id into v_pesquisa_id;
  if v_pesquisa_id is null then raise exception 'rodada_nao_esta_pronta'; end if;

  update public.pesquisa_evasao
  set resposta_status = 'em_revisao', updated_at = now()
  where id = v_pesquisa_id;

  return jsonb_build_object(
    'success', true,
    'pesquisa_id', v_pesquisa_id,
    'analise_id', p_analise_id,
    'usuario_id', v_usuario_id
  );
end;
$$;

create or replace function public.concluir_revisao_pesquisa_evasao(
  p_analise_id uuid,
  p_texto_consolidado text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_usuario_id integer;
  v_analise public.pesquisa_evasao_analises%rowtype;
  v_eh_ultima boolean;
begin
  select u.id into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid() and u.ativo = true;
  if v_usuario_id is null then raise exception 'acesso_negado'; end if;

  update public.pesquisa_evasao_analises pea
  set
    texto_consolidado = coalesce(
      nullif(btrim(p_texto_consolidado), ''),
      pea.texto_consolidado
    ),
    status = 'revisada',
    revisor_usuario_id = v_usuario_id,
    revisado_em = now()
  where pea.id = p_analise_id
    and pea.status in ('pronta_para_revisao', 'em_revisao')
  returning pea.* into v_analise;
  if v_analise.id is null then raise exception 'rodada_nao_revisavel'; end if;

  select not exists (
    select 1
    from public.pesquisa_evasao_analises posterior
    where posterior.pesquisa_id = v_analise.pesquisa_id
      and posterior.versao > v_analise.versao
  ) into v_eh_ultima;

  if v_eh_ultima then
    update public.pesquisa_evasao
    set
      status = 'respondido',
      resposta_status = 'revisada',
      resposta_valida = true,
      resposta_texto = v_analise.texto_consolidado,
      conteudo_novo_desde_revisao = false,
      updated_at = now()
    where id = v_analise.pesquisa_id;
  end if;

  return jsonb_build_object(
    'success', true,
    'pesquisa_id', v_analise.pesquisa_id,
    'analise_id', v_analise.id,
    'versao', v_analise.versao,
    'usuario_id', v_usuario_id
  );
end;
$$;

comment on column public.pesquisa_evasao_mensagens.analise_versao is
  'Versao imutavel da rodada de conversa a que o evento pertence.';
comment on column public.pesquisa_evasao.conteudo_novo_desde_revisao is
  'Sinaliza que uma rodada posterior reabriu uma pesquisa ja revisada.';
comment on table public.pesquisa_evasao_analises is
  'Uma linha por rodada de conversa; versoes revisadas sao imutaveis.';

revoke all on function public.get_conversa_pesquisa_evasao(uuid)
  from public, anon, authenticated;
revoke all on function public.listar_pesquisas_evasao_revisao(uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.iniciar_revisao_pesquisa_evasao(uuid)
  from public, anon, authenticated;
revoke all on function public.concluir_revisao_pesquisa_evasao(uuid, text)
  from public, anon, authenticated;
revoke all on function public.preparar_nova_analise_pesquisa_evasao(uuid)
  from public, anon, authenticated;

grant execute on function public.get_conversa_pesquisa_evasao(uuid)
  to authenticated, service_role;
grant execute on function public.listar_pesquisas_evasao_revisao(uuid, integer, integer)
  to authenticated, service_role;
grant execute on function public.iniciar_revisao_pesquisa_evasao(uuid)
  to authenticated, service_role;
grant execute on function public.concluir_revisao_pesquisa_evasao(uuid, text)
  to authenticated, service_role;
grant execute on function public.preparar_nova_analise_pesquisa_evasao(uuid)
  to service_role;
