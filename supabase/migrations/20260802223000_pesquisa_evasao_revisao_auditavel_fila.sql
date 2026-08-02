-- Subprojeto B: corrige a auditoria da revisao e preserva a visibilidade de
-- conteudo novo enquanto a rodada mais recente ainda esta sendo coletada.

alter table public.pesquisa_evasao_analises
  add column if not exists revisao_iniciada_por_usuario_id integer
    references public.usuarios(id),
  add column if not exists revisao_iniciada_em timestamptz;

-- Versoes ja concluidas antes desta migration nao possuem dois marcos de
-- auditoria. O unico dado honesto disponivel e o da conclusao, portanto ele e
-- usado tambem como limite inferior do inicio, sem inventar outro operador.
update public.pesquisa_evasao_analises
set
  revisao_iniciada_por_usuario_id = revisor_usuario_id,
  revisao_iniciada_em = revisado_em
where status = 'revisada'
  and revisor_usuario_id is not null
  and revisado_em is not null
  and revisao_iniciada_por_usuario_id is null
  and revisao_iniciada_em is null;

-- A versao anterior de iniciar_revisao mudava apenas o status. Nao e seguro
-- atribuir autoria retroativamente; a rodada volta a pronta para que o inicio
-- seja repetido pelo operador autenticado e passe a ter trilha completa.
do $$
declare
  v_reparadas integer;
begin
  select count(*)
  into v_reparadas
  from public.pesquisa_evasao_analises
  where status = 'em_revisao'
    and revisor_usuario_id is null
    and revisado_em is null
    and revisao_iniciada_por_usuario_id is null
    and revisao_iniciada_em is null;

  raise notice 'revisoes sem autoria devolvidas para pronta: %', v_reparadas;

  update public.pesquisa_evasao_analises
  set status = 'pronta_para_revisao'
  where status = 'em_revisao'
    and revisor_usuario_id is null
    and revisado_em is null
    and revisao_iniciada_por_usuario_id is null
    and revisao_iniciada_em is null;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pesquisa_evasao_analises_inicio_revisao_check'
      and conrelid = 'public.pesquisa_evasao_analises'::regclass
  ) then
    alter table public.pesquisa_evasao_analises
      add constraint pesquisa_evasao_analises_inicio_revisao_check
      check (
        (
          revisao_iniciada_por_usuario_id is null
          and revisao_iniciada_em is null
        ) or (
          revisao_iniciada_por_usuario_id is not null
          and revisao_iniciada_em is not null
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pesquisa_evasao_analises_status_inicio_check'
      and conrelid = 'public.pesquisa_evasao_analises'::regclass
  ) then
    alter table public.pesquisa_evasao_analises
      add constraint pesquisa_evasao_analises_status_inicio_check
      check (
        status not in ('em_revisao', 'revisada')
        or (
          revisao_iniciada_por_usuario_id is not null
          and revisao_iniciada_em is not null
        )
      );
  end if;
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
  v_tem_rodada_anterior_relevante boolean;
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
      and anterior.status in ('pronta_para_revisao', 'em_revisao', 'revisada')
  ) into v_tem_rodada_anterior_relevante;

  update public.pesquisa_evasao pe
  set
    resposta_status = case
      when v_tem_rodada_anterior_relevante then 'pronta_para_revisao'
      else 'coletando'
    end,
    resposta_valida = false,
    pronta_para_revisao_em = case
      when v_tem_rodada_anterior_relevante
        then coalesce(pe.pronta_para_revisao_em, v_evento_em)
      else null
    end,
    conteudo_novo_desde_revisao =
      pe.conteudo_novo_desde_revisao or v_tem_rodada_anterior_relevante,
    updated_at = now()
  where pe.id = new.pesquisa_id
    and pe.resposta_ingestao_versao = 'multipartes_v2';

  return new;
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
          'revisao_iniciada_em', pea.revisao_iniciada_em,
          'revisao_iniciada_por_usuario_id', pea.revisao_iniciada_por_usuario_id,
          'revisao_iniciada_por_nome', usuario_inicio.nome,
          'revisado_em', pea.revisado_em,
          'revisor_usuario_id', pea.revisor_usuario_id,
          'revisor_nome', usuario_conclusao.nome,
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
      left join public.usuarios usuario_inicio
        on usuario_inicio.id = pea.revisao_iniciada_por_usuario_id
      left join public.usuarios usuario_conclusao
        on usuario_conclusao.id = pea.revisor_usuario_id
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
  v_tem_outra_pendencia boolean;
begin
  select u.id into v_usuario_id
  from public.usuarios u
  where u.auth_user_id = auth.uid() and u.ativo = true;
  if v_usuario_id is null then raise exception 'acesso_negado'; end if;

  update public.pesquisa_evasao_analises pea
  set
    status = 'em_revisao',
    revisao_iniciada_por_usuario_id = v_usuario_id,
    revisao_iniciada_em = now()
  where pea.id = p_analise_id
    and pea.status = 'pronta_para_revisao'
    and pea.revisao_iniciada_por_usuario_id is null
    and pea.revisao_iniciada_em is null
  returning pea.pesquisa_id into v_pesquisa_id;
  if v_pesquisa_id is null then raise exception 'rodada_nao_esta_pronta'; end if;

  select exists (
    select 1
    from public.pesquisa_evasao_analises outra
    where outra.pesquisa_id = v_pesquisa_id
      and outra.id <> p_analise_id
      and outra.status in ('rascunho', 'pronta_para_revisao', 'em_revisao')
  ) into v_tem_outra_pendencia;

  update public.pesquisa_evasao pe
  set
    resposta_status = case
      when v_tem_outra_pendencia or pe.conteudo_novo_desde_revisao
        then 'pronta_para_revisao'
      else 'em_revisao'
    end,
    pronta_para_revisao_em = case
      when v_tem_outra_pendencia or pe.conteudo_novo_desde_revisao
        then coalesce(pe.pronta_para_revisao_em, now())
      else pe.pronta_para_revisao_em
    end,
    updated_at = now()
  where pe.id = v_pesquisa_id;

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
  v_tem_outra_pendencia boolean;
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
    and pea.status = 'em_revisao'
    and pea.revisao_iniciada_por_usuario_id is not null
    and pea.revisao_iniciada_em is not null
  returning pea.* into v_analise;
  if v_analise.id is null then raise exception 'rodada_nao_revisavel'; end if;

  select exists (
    select 1
    from public.pesquisa_evasao_analises outra
    where outra.pesquisa_id = v_analise.pesquisa_id
      and outra.id <> v_analise.id
      and outra.status in ('rascunho', 'pronta_para_revisao', 'em_revisao')
  ) into v_tem_outra_pendencia;

  if not v_tem_outra_pendencia then
    update public.pesquisa_evasao
    set
      status = 'respondido',
      resposta_status = 'revisada',
      resposta_valida = true,
      resposta_texto = v_analise.texto_consolidado,
      conteudo_novo_desde_revisao = false,
      updated_at = now()
    where id = v_analise.pesquisa_id;
  else
    update public.pesquisa_evasao
    set
      resposta_status = 'pronta_para_revisao',
      resposta_valida = false,
      pronta_para_revisao_em = coalesce(pronta_para_revisao_em, now()),
      conteudo_novo_desde_revisao = true,
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

-- Reconcilia somente o cabecalho derivado. Nenhuma mensagem, transcricao,
-- consolidacao ou versao revisada e alterada.
with estado as (
  select
    pe.id as pesquisa_id,
    exists (
      select 1
      from public.pesquisa_evasao_analises pendente
      where pendente.pesquisa_id = pe.id
        and pendente.status = 'pronta_para_revisao'
    ) as tem_pronta,
    exists (
      select 1
      from public.pesquisa_evasao_analises revisando
      where revisando.pesquisa_id = pe.id
        and revisando.status = 'em_revisao'
    ) as tem_em_revisao,
    exists (
      select 1
      from public.pesquisa_evasao_analises anterior
      join public.pesquisa_evasao_analises posterior
        on posterior.pesquisa_id = anterior.pesquisa_id
       and posterior.versao > anterior.versao
      where anterior.pesquisa_id = pe.id
        and anterior.status in ('pronta_para_revisao', 'em_revisao', 'revisada')
    ) as tem_conteudo_posterior,
    (
      select max(coalesce(a.encerrada_em, a.ultima_mensagem_em, a.criado_em))
      from public.pesquisa_evasao_analises a
      where a.pesquisa_id = pe.id
        and a.status = 'pronta_para_revisao'
    ) as pronta_em
  from public.pesquisa_evasao pe
  where pe.resposta_ingestao_versao = 'multipartes_v2'
)
update public.pesquisa_evasao pe
set
  resposta_status = case
    when estado.tem_pronta or estado.tem_conteudo_posterior
      then 'pronta_para_revisao'
    when estado.tem_em_revisao then 'em_revisao'
    else pe.resposta_status
  end,
  pronta_para_revisao_em = case
    when estado.tem_pronta or estado.tem_conteudo_posterior
      then coalesce(pe.pronta_para_revisao_em, estado.pronta_em, now())
    else pe.pronta_para_revisao_em
  end,
  conteudo_novo_desde_revisao =
    pe.conteudo_novo_desde_revisao or estado.tem_conteudo_posterior,
  updated_at = now()
from estado
where pe.id = estado.pesquisa_id
  and (
    estado.tem_pronta
    or estado.tem_em_revisao
    or estado.tem_conteudo_posterior
  );

comment on column public.pesquisa_evasao_analises.revisao_iniciada_por_usuario_id is
  'Usuario interno autenticado que iniciou a revisao desta versao.';
comment on column public.pesquisa_evasao_analises.revisao_iniciada_em is
  'Horario em que a revisao desta versao foi iniciada.';
comment on column public.pesquisa_evasao_analises.revisor_usuario_id is
  'Usuario interno autenticado que concluiu a revisao desta versao.';
comment on column public.pesquisa_evasao_analises.revisado_em is
  'Horario em que a revisao desta versao foi concluida.';
comment on column public.pesquisa_evasao.conteudo_novo_desde_revisao is
  'Sinaliza conteudo posterior a uma rodada que ja estava pronta, em revisao ou revisada.';

revoke all on function public.get_conversa_pesquisa_evasao(uuid)
  from public, anon, authenticated;
revoke all on function public.iniciar_revisao_pesquisa_evasao(uuid)
  from public, anon, authenticated;
revoke all on function public.concluir_revisao_pesquisa_evasao(uuid, text)
  from public, anon, authenticated;

grant execute on function public.get_conversa_pesquisa_evasao(uuid)
  to authenticated, service_role;
grant execute on function public.iniciar_revisao_pesquisa_evasao(uuid)
  to authenticated, service_role;
grant execute on function public.concluir_revisao_pesquisa_evasao(uuid, text)
  to authenticated, service_role;
