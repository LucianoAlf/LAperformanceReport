-- As 3 funcoes do RECADO: propor -> aprovar -> confirmar.
-- Ver o cabecalho de 20260904200000 para o desenho e o porque das guardas.
--
-- Provado em 04/09 (nenhuma mensagem saiu):
--   · outra consultora tenta aprovar  -> nao_e_seu_recado
--   · a dona aprova                   -> aprovado
--   · aprova de novo                  -> ja_tratado
--   · proposta vencida                -> expirou, com instrucao de remontar
create or replace function public.mila_propor_recado_v1(
  p_solicitante_telefone text, p_destino_tipo text, p_destino_ref text,
  p_texto text, p_assunto text default null::text
) returns jsonb
language plpgsql security definer set search_path to 'public', 'governanca' as $function$
declare
  q record; v_un uuid; v_nome text; v_tel text; v_ref text; v_id uuid; n int;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_un := q.unidade_id;
  if v_un is null then return jsonb_build_object('ok', false, 'motivo', 'sem_unidade'); end if;
  if coalesce(trim(p_texto), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'texto_vazio');
  end if;

  if p_destino_tipo = 'lead' then
    select l.nome, l.telefone, l.id::text into v_nome, v_tel, v_ref
      from leads l
     where l.unidade_id = v_un
       and (l.id::text = p_destino_ref
            or regexp_replace(coalesce(l.telefone,''), '\D', '', 'g') = regexp_replace(p_destino_ref, '\D', '', 'g')
            or unaccent(lower(l.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%')
     order by l.created_at desc limit 1;
    select count(*) into n from leads l
     where l.unidade_id = v_un and unaccent(lower(l.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%'
       and l.created_at > now() - interval '180 days';
    if v_nome is null then
      return jsonb_build_object('ok', false, 'motivo', 'lead_nao_encontrado_na_sua_unidade');
    end if;
    if n > 1 and p_destino_ref !~ '^\d+$' then
      return jsonb_build_object('ok', false, 'motivo', 'ambiguo',
        'nota', 'mais de um lead com esse nome — peca para ela dizer qual, ou use o lead_id',
        'candidatos', (select jsonb_agg(jsonb_build_object('lead_id', c.id, 'nome', c.nome, 'telefone', c.telefone))
                         from (select l.id, l.nome, l.telefone from leads l
                                where l.unidade_id = v_un
                                  and unaccent(lower(l.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%'
                                  and l.created_at > now() - interval '180 days'
                                order by l.created_at desc limit 6) c),
        'total_encontrados', n);
    end if;
  elsif p_destino_tipo = 'professor' then
    select p.nome, p.telefone_whatsapp, p.id::text into v_nome, v_tel, v_ref
      from professores p
      join professores_unidades pu on pu.professor_id = p.id and pu.unidade_id = v_un
     where p.ativo
       and (p.id::text = p_destino_ref
            or unaccent(lower(p.nome)) like '%' || unaccent(lower(trim(p_destino_ref))) || '%')
     order by p.nome limit 1;
    if v_nome is null then
      return jsonb_build_object('ok', false, 'motivo', 'professor_nao_encontrado_na_sua_unidade');
    end if;
  else
    return jsonb_build_object('ok', false, 'motivo', 'destino_tipo_invalido');
  end if;

  if coalesce(trim(v_tel), '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'destino_sem_whatsapp', 'destino', v_nome);
  end if;

  insert into mila_recados (unidade_id, solicitante_telefone, solicitante_nome, destino_tipo,
                            destino_ref, destino_nome, destino_telefone, assunto, texto)
  values (v_un, p_solicitante_telefone, q.nome, p_destino_tipo, v_ref, v_nome, v_tel,
          nullif(trim(coalesce(p_assunto,'')), ''), trim(p_texto))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'recado_id', v_id, 'status', 'proposto',
    'destino', jsonb_build_object('tipo', p_destino_tipo, 'nome', v_nome, 'telefone', v_tel),
    'texto', trim(p_texto), 'expira_em_minutos', 30,
    'nota', 'MOSTRE o texto e espere ela aprovar. So depois chame enviar_recado.');
end $function$;

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
  -- so quem pediu aprova, e so na propria unidade
  if r.solicitante_telefone <> p_solicitante_telefone or r.unidade_id is distinct from q.unidade_id then
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
    'unidade', (select nome from unidades where id = r.unidade_id), 'texto', r.texto);
end $function$;

create or replace function public.mila_confirmar_recado_v1(
  p_recado_id uuid, p_conversation_id bigint default null,
  p_message_id bigint default null, p_erro text default null
) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare r record;
begin
  update mila_recados
     set status = case when p_erro is null then 'enviado' else 'falhou' end,
         enviado_em = case when p_erro is null then now() end,
         conversation_id = p_conversation_id, message_id = p_message_id, erro = p_erro
   where id = p_recado_id and status = 'aprovado'
  returning * into r;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'recado_nao_estava_aprovado'); end if;

  insert into automacao_log (evento, acao, status, aluno_nome, unidade_nome, detalhes)
  values ('mila_recado', r.destino_tipo, case when p_erro is null then 'ok' else 'erro' end,
          r.destino_nome, (select nome from unidades where id = r.unidade_id),
          jsonb_build_object('recado_id', r.id, 'de', r.solicitante_nome, 'para', r.destino_nome,
                             'texto', r.texto, 'assunto', r.assunto,
                             'conversation_id', p_conversation_id, 'erro', p_erro));
  return jsonb_build_object('ok', p_erro is null, 'status', r.status, 'erro', p_erro);
end $function$;

revoke all on function public.mila_propor_recado_v1(text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.mila_aprovar_recado_v1(text,uuid) from public, anon, authenticated;
revoke all on function public.mila_confirmar_recado_v1(uuid,bigint,bigint,text) from public, anon, authenticated;
grant execute on function public.mila_propor_recado_v1(text,text,text,text,text) to service_role, mila_acesso_restrito;
grant execute on function public.mila_aprovar_recado_v1(text,uuid) to service_role, mila_acesso_restrito;
grant execute on function public.mila_confirmar_recado_v1(uuid,bigint,bigint,text) to service_role, mila_acesso_restrito;
