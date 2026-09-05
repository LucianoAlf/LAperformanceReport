-- RECADO: quem lidera passa a poder mandar, e o recado ganha VOLTA.
--
-- 🔴 DOIS DEFEITOS DE MODELAGEM, NÃO DE CÓDIGO.
--
-- (1) `mila_propor_recado_v1` abortava com `sem_unidade` quando quem pedia não
--     tinha unidade. Isso trancava exatamente a líder comercial (Anne Krissya:
--     departamento comercial, nível líder, `unidade_id` NULL = as três) — a
--     pessoa que MAIS precisa mandar recado. A causa é conceitual: o código
--     tratava a unidade como propriedade de QUEM PEDE, quando ela é propriedade
--     de QUEM RECEBE. A caixa por onde a mensagem sai é decidida pelo
--     destinatário; o solicitante só define o ESCOPO DE BUSCA (a consultora
--     procura na unidade dela, quem lidera procura nas três).
--
-- (2) O recado só ia. Não havia volta. O pedido do Luciano em 05/09 é o ciclo
--     inteiro: a líder pede à Mila que avise a consultora, a consultora responde
--     à Mila, e a Mila leva a resposta de volta. Sem `aguarda_resposta` +
--     `resposta`, cada perna era uma conversa solta e ninguém fechava o laço.
--
-- ⚠️ POR QUE `colaborador` E NÃO REAPROVEITAR `professor`: professor é resolvido
--    em `professores` e só existe dentro de uma unidade. Colaborador é resolvido
--    na GOVERNANÇA (`governanca.agente_usuarios`), tem nível e departamento, e é
--    quem responde. Misturar os dois faria a busca por nome cruzar duas tabelas
--    com regras de identidade diferentes — o mesmo erro que `word_similarity`
--    produziu no caixa da Sol.
--
-- ⚠️ **NÃO se manda recado para si mesmo** e **não se manda para quem não está
--    na governança**: a Mila só fala com quem a escola declarou que ela pode
--    falar.

-- ── 1. o recado passa a ter volta ───────────────────────────────────────────
alter table public.mila_recados
  add column if not exists aguarda_resposta      boolean not null default false,
  add column if not exists resposta              text,
  add column if not exists respondido_em         timestamptz,
  add column if not exists retorno_entregue_em   timestamptz,
  add column if not exists retorno_conversation_id bigint;

comment on column public.mila_recados.aguarda_resposta is
  'Recado a colaborador espera resposta por padrão: a líder pediu para avisar E quer saber o que a pessoa disse.';
comment on column public.mila_recados.retorno_entregue_em is
  'Quando a resposta foi levada de volta a quem pediu. NULL com respondido_em preenchido = laço aberto.';

do $$ begin
  alter table public.mila_recados drop constraint mila_recados_destino_tipo_check;
exception when undefined_object then null; end $$;
alter table public.mila_recados add constraint mila_recados_destino_tipo_check
  check (destino_tipo in ('lead', 'professor', 'colaborador'));

do $$ begin
  alter table public.mila_recados drop constraint mila_recados_status_check;
exception when undefined_object then null; end $$;
alter table public.mila_recados add constraint mila_recados_status_check
  check (status in ('proposto', 'aprovado', 'enviado', 'respondido', 'cancelado', 'falhou'));

-- ── 2. propor: escopo de quem pede, unidade de quem recebe ──────────────────
create or replace function public.mila_propor_recado_v1(
  p_solicitante_telefone text, p_destino_tipo text, p_destino_ref text,
  p_texto text, p_assunto text default null::text
) returns jsonb
language plpgsql security definer set search_path to 'public', 'governanca' as $function$
declare
  q record; v_escopo uuid; v_un uuid; v_nome text; v_tel text; v_ref text;
  v_id uuid; v_aguarda boolean := false; n int; v_ref_norm text;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  if coalesce(trim(p_texto), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'texto_vazio');
  end if;
  -- NULL aqui NÃO é erro: é "procure nas três". Quem lidera não tem unidade.
  v_escopo := q.unidade_id;
  v_ref_norm := regexp_replace(coalesce(p_destino_ref, ''), '\D', '', 'g');

  if p_destino_tipo = 'lead' then
    select l.nome, l.telefone, l.id::text, l.unidade_id into v_nome, v_tel, v_ref, v_un
      from leads l
     where (v_escopo is null or l.unidade_id = v_escopo)
       and (l.id::text = p_destino_ref
            or (v_ref_norm <> '' and regexp_replace(coalesce(l.telefone,''), '\D', '', 'g') = v_ref_norm)
            or unaccent(lower(l.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%')
     order by l.created_at desc limit 1;
    select count(*) into n from leads l
     where (v_escopo is null or l.unidade_id = v_escopo)
       and unaccent(lower(l.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%'
       and l.created_at > now() - interval '180 days';
    if v_nome is null then
      return jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado_no_seu_escopo');
    end if;
    if n > 1 and p_destino_ref !~ '^\d+$' then
      return jsonb_build_object('ok', false, 'motivo', 'ambiguo',
        'nota', 'mais de um lead com esse nome — peca para ela dizer qual, ou use o lead_id',
        'candidatos', (select jsonb_agg(jsonb_build_object('lead_id', c.id, 'nome', c.nome,
                                                           'telefone', c.telefone, 'unidade', c.un))
                         from (select l.id, l.nome, l.telefone, u.nome un from leads l
                                join unidades u on u.id = l.unidade_id
                                where (v_escopo is null or l.unidade_id = v_escopo)
                                  and unaccent(lower(l.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%'
                                  and l.created_at > now() - interval '180 days'
                                order by l.created_at desc limit 6) c),
        'total_encontrados', n);
    end if;

  elsif p_destino_tipo = 'professor' then
    select p.nome, p.telefone_whatsapp, p.id::text, pu.unidade_id into v_nome, v_tel, v_ref, v_un
      from professores p
      join professores_unidades pu on pu.professor_id = p.id
                                  and (v_escopo is null or pu.unidade_id = v_escopo)
     where p.ativo
       and (p.id::text = p_destino_ref
            or unaccent(lower(p.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%')
     order by p.nome limit 1;
    if v_nome is null then
      return jsonb_build_object('ok', false, 'motivo', 'professor_nao_encontrado_no_seu_escopo');
    end if;

  elsif p_destino_tipo = 'colaborador' then
    -- ⚠️ Só gente da GOVERNANÇA. A Mila não fala com quem a escola não declarou.
    select a.nome, a.telefone, a.telefone, coalesce(a.unidade_id, v_escopo)
      into v_nome, v_tel, v_ref, v_un
      from governanca.agente_usuarios a
     where a.ativo
       and a.telefone <> p_solicitante_telefone            -- recado para si mesmo nao existe
       and ((v_ref_norm <> '' and a.telefone = v_ref_norm)
            or unaccent(lower(a.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%')
     order by a.nome limit 1;
    select count(*) into n from governanca.agente_usuarios a
     where a.ativo and a.telefone <> p_solicitante_telefone
       and unaccent(lower(a.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%';
    if v_nome is null then
      return jsonb_build_object('ok', false, 'motivo', 'colaborador_nao_encontrado',
        'nota', 'so consigo falar com quem esta cadastrado na governanca');
    end if;
    if n > 1 and v_ref_norm = '' then
      return jsonb_build_object('ok', false, 'motivo', 'ambiguo',
        'nota', 'mais de uma pessoa com esse nome — pergunte qual',
        'candidatos', (select jsonb_agg(jsonb_build_object('nome', c.nome, 'departamento', c.departamento))
                         from (select a.nome, a.departamento from governanca.agente_usuarios a
                                where a.ativo and unaccent(lower(a.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%'
                                order by a.nome limit 6) c));
    end if;
    -- recado entre gente da casa espera resposta: quem pediu quer saber o que ela disse
    v_aguarda := true;

  else
    return jsonb_build_object('ok', false, 'motivo', 'destino_tipo_invalido');
  end if;

  if coalesce(trim(v_tel), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'destino_sem_whatsapp', 'destino', v_nome);
  end if;

  insert into mila_recados (unidade_id, solicitante_telefone, solicitante_nome, destino_tipo,
                            destino_ref, destino_nome, destino_telefone, assunto, texto, aguarda_resposta)
  values (v_un, p_solicitante_telefone, q.nome, p_destino_tipo, v_ref, v_nome, v_tel,
          nullif(trim(coalesce(p_assunto,'')), ''), trim(p_texto), v_aguarda)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'recado_id', v_id, 'status', 'proposto',
    'destino', jsonb_build_object('tipo', p_destino_tipo, 'nome', v_nome, 'telefone', v_tel,
                                  'unidade', (select nome from unidades where id = v_un)),
    'texto', trim(p_texto), 'expira_em_minutos', 30, 'aguarda_resposta', v_aguarda,
    'nota', case when v_aguarda
                 then 'MOSTRE o texto e espere ela aprovar. Depois de enviado eu fico esperando a resposta e te aviso quando vier.'
                 else 'MOSTRE o texto e espere ela aprovar. So depois chame enviar_recado.' end);
end $function$;

-- ── 3. aprovar e revisar: quem lidera aprova o proprio recado em qualquer unidade
-- ⚠️ A trava que importa continua sendo `solicitante_telefone` — so quem PEDIU
-- aprova. O que muda e a checagem de unidade, que barrava a lider por ela nao
-- ter nenhuma.
create or replace function public.mila_aprovar_recado_v1(
  p_solicitante_telefone text, p_recado_id uuid
) returns jsonb
language plpgsql security definer set search_path to 'public', 'governanca' as $function$
declare q record; r record;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;

  select * into r from mila_recados where id = p_recado_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'recado_nao_encontrado'); end if;
  if r.solicitante_telefone <> p_solicitante_telefone
     or (q.unidade_id is not null and r.unidade_id is distinct from q.unidade_id) then
    return jsonb_build_object('ok', false, 'motivo', 'nao_e_seu_recado');
  end if;
  if r.status <> 'proposto' then
    return jsonb_build_object('ok', false, 'motivo', 'ja_tratado', 'status', r.status);
  end if;
  if now() > r.expira_em then
    update mila_recados set status = 'cancelado', erro = 'expirou' where id = r.id;
    return jsonb_build_object('ok', false, 'motivo', 'expirou',
      'nota', 'a proposta venceu (30 min) — remonte com o dado de agora e mostre de novo');
  end if;

  update mila_recados set status = 'aprovado', aprovado_em = now() where id = r.id;
  return jsonb_build_object('ok', true, 'recado_id', r.id, 'status', 'aprovado',
    'destino', jsonb_build_object('tipo', r.destino_tipo, 'nome', r.destino_nome, 'telefone', r.destino_telefone),
    'unidade', (select nome from unidades where id = r.unidade_id),
    'aguarda_resposta', r.aguarda_resposta,
    'de', r.solicitante_nome, 'texto', r.texto);
end $function$;

create or replace function public.mila_revisar_recado_v1(
  p_solicitante_telefone text, p_recado_id uuid, p_novo_texto text, p_motivo text default null::text
) returns jsonb
language plpgsql security definer set search_path to 'public', 'governanca' as $function$
declare q record; r record;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  if coalesce(trim(p_novo_texto), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'texto_vazio');
  end if;

  select * into r from mila_recados where id = p_recado_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'recado_nao_encontrado'); end if;
  if r.solicitante_telefone <> p_solicitante_telefone
     or (q.unidade_id is not null and r.unidade_id is distinct from q.unidade_id) then
    return jsonb_build_object('ok', false, 'motivo', 'nao_e_seu_recado');
  end if;
  if r.status <> 'proposto' then
    return jsonb_build_object('ok', false, 'motivo', 'ja_tratado', 'status', r.status,
      'nota', case when r.status in ('enviado','respondido')
                   then 'esse ja foi enviado — nao da para trocar. Se precisar, mande um recado novo corrigindo.'
                   else 'esse recado ja saiu do estado de proposta' end);
  end if;

  update mila_recados
     set texto = trim(p_novo_texto),
         versoes = versoes || jsonb_build_object('texto', r.texto, 'trocado_em', now(),
                                                 'motivo', nullif(trim(coalesce(p_motivo,'')), '')),
         expira_em = now() + interval '30 minutes'
   where id = r.id;

  return jsonb_build_object('ok', true, 'recado_id', r.id, 'status', 'proposto',
    'destino', jsonb_build_object('tipo', r.destino_tipo, 'nome', r.destino_nome),
    'texto', trim(p_novo_texto), 'versao', jsonb_array_length(r.versoes) + 2,
    'expira_em_minutos', 30,
    'nota', 'MOSTRE o texto novo e espere ela aprovar de novo.');
end $function$;

-- ── 4. A VOLTA ──────────────────────────────────────────────────────────────
-- O que chegou PARA MIM e ainda não respondi.
create or replace function public.mila_recado_para_mim_v1(p_telefone text)
returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare q record; v jsonb;
begin
  select * into q from governanca.quem_eh(p_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;

  select jsonb_agg(jsonb_build_object(
           'recado_id', r.id, 'de', r.solicitante_nome, 'assunto', r.assunto, 'texto', r.texto,
           'recebido_ha_horas', round(extract(epoch from (now() - r.enviado_em)) / 3600.0, 1))
         order by r.enviado_em desc)
    into v
  from mila_recados r
  where r.destino_tipo = 'colaborador'
    and r.destino_telefone = p_telefone
    and r.status = 'enviado' and r.aguarda_resposta and r.respondido_em is null;

  return jsonb_build_object('ok', true, 'tem', coalesce(jsonb_array_length(v), 0) > 0,
    'recados', coalesce(v, '[]'::jsonb),
    'nota', 'Se ela responder a algum destes, chame responder_recado com o recado_id — eu levo a resposta a quem pediu.');
end $function$;

-- Grava a resposta e devolve a quem levar de volta.
create or replace function public.mila_responder_recado_v1(
  p_telefone text, p_recado_id uuid, p_resposta text
) returns jsonb
language plpgsql security definer set search_path to 'public', 'governanca' as $function$
declare q record; r record;
begin
  select * into q from governanca.quem_eh(p_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  if coalesce(trim(p_resposta), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'resposta_vazia');
  end if;

  select * into r from mila_recados where id = p_recado_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'recado_nao_encontrado'); end if;
  -- só quem RECEBEU responde
  if r.destino_telefone <> p_telefone then
    return jsonb_build_object('ok', false, 'motivo', 'esse_recado_nao_e_para_voce');
  end if;
  if r.status <> 'enviado' then
    return jsonb_build_object('ok', false, 'motivo', 'nao_esta_aguardando', 'status', r.status);
  end if;

  update mila_recados
     set resposta = trim(p_resposta), respondido_em = now(), status = 'respondido'
   where id = r.id;

  -- quem pediu recebe de volta; a unidade do RETORNO é a de quem pediu
  return jsonb_build_object('ok', true, 'recado_id', r.id,
    'levar_para', jsonb_build_object(
      'nome', r.solicitante_nome, 'telefone', r.solicitante_telefone,
      'unidade', (select coalesce(u.nome, un2.nome)
                    from governanca.agente_usuarios a
                    left join unidades u on u.id = a.unidade_id
                    left join unidades un2 on un2.id = r.unidade_id
                   where a.telefone = r.solicitante_telefone limit 1)),
    'quem_respondeu', q.nome, 'pedido_original', r.texto, 'resposta', trim(p_resposta),
    'nota', 'Escreva o retorno para quem pediu citando o pedido e a resposta, e mande com enviar_retorno_recado.');
end $function$;

create or replace function public.mila_confirmar_retorno_recado_v1(
  p_recado_id uuid, p_conversation_id bigint default null, p_erro text default null
) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare r record;
begin
  update mila_recados
     set retorno_entregue_em = case when p_erro is null then now() end,
         retorno_conversation_id = p_conversation_id,
         erro = coalesce(p_erro, erro)
   where id = p_recado_id and status = 'respondido'
  returning * into r;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'recado_nao_estava_respondido'); end if;

  insert into automacao_log (evento, acao, status, aluno_nome, unidade_nome, detalhes)
  values ('mila_recado', 'retorno', case when p_erro is null then 'ok' else 'erro' end,
          coalesce(r.solicitante_nome, 'sem nome'),
          coalesce((select nome from unidades where id = r.unidade_id), 'Rede'),
          jsonb_build_object('recado_id', r.id, 'de', r.destino_nome, 'para', r.solicitante_nome,
                             'resposta', r.resposta, 'erro', p_erro));
  return jsonb_build_object('ok', p_erro is null, 'entregue', p_erro is null);
end $function$;

revoke all on function public.mila_recado_para_mim_v1(text)                     from public, anon, authenticated;
revoke all on function public.mila_responder_recado_v1(text,uuid,text)          from public, anon, authenticated;
revoke all on function public.mila_confirmar_retorno_recado_v1(uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.mila_recado_para_mim_v1(text)                     to service_role, mila_acesso_restrito;
grant execute on function public.mila_responder_recado_v1(text,uuid,text)          to service_role, mila_acesso_restrito;
grant execute on function public.mila_confirmar_retorno_recado_v1(uuid,bigint,text) to service_role, mila_acesso_restrito;

-- ── 5. quem levar o retorno, sem re-responder ───────────────────────────────
-- 🔴 A 1a versao do MCP chamava `mila_responder_recado_v1` de novo so para
-- descobrir o destino do retorno — e isso SOBRESCREVERIA a resposta real com um
-- texto de servico. Leitura tem que ser leitura.
create or replace function public.mila_retorno_pendente_v1(
  p_telefone text, p_recado_id uuid
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare r record;
begin
  select * into r from mila_recados
   where id = p_recado_id and destino_telefone = p_telefone
     and status = 'respondido' and retorno_entregue_em is null;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'nada_para_levar',
      'nota', 'ou o recado nao e seu, ou voce ainda nao respondeu, ou o retorno ja foi entregue');
  end if;
  return jsonb_build_object('ok', true, 'recado_id', r.id,
    'levar_para', jsonb_build_object(
      'nome', r.solicitante_nome, 'telefone', r.solicitante_telefone,
      'unidade', (select coalesce(u.nome, un2.nome)
                    from governanca.agente_usuarios a
                    left join unidades u on u.id = a.unidade_id
                    left join unidades un2 on un2.id = r.unidade_id
                   where a.telefone = r.solicitante_telefone limit 1)),
    'pedido_original', r.texto, 'resposta', r.resposta);
end $function$;

revoke all on function public.mila_retorno_pendente_v1(text,uuid) from public, anon, authenticated;
grant execute on function public.mila_retorno_pendente_v1(text,uuid) to service_role, mila_acesso_restrito;
