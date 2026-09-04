-- O que merece uma CUTUCADA na hora — nao amanha de manha.
--
-- Sao as duas situacoes que o Luciano aprovou como "de hora em hora": lead
-- preso no bot (R18) e promessa da escola sem retorno (R7). As outras tres
-- (experimental sem desfecho, faltou, remarcar) vao no briefing das 8:30, para
-- nao virar enxurrada — enxurrada ensina a ignorar.
--
-- ⚠️ R7 JA EXISTIA e estava ativa desde 03/09, detectada por LLM na conversa
-- (regex dava falso positivo — esta escrito no `lastro` da propria regra).
-- Tinha 7 sinais abertos e nenhum consumidor. Aqui so o dominio COMERCIAL
-- entra: promessa feita a ALUNO e assunto da secretaria, nao da consultora.
--
-- ⚠️ UMA CUTUCADA POR PESSOA, nao por sinal: a Jullyane tem R7 e R18 ao mesmo
-- tempo e apareceu duas vezes na mesma mensagem no 1o ensaio. "Uma vez por
-- pessoa, nunca duas" vale DENTRO da mensagem, nao so entre execucoes. Fica o
-- sinal mais recente e os demais viram `tambem`.
create or replace function public.mila_cutucada_v1(
  p_solicitante_telefone text, p_limite integer default 3
) returns jsonb
language plpgsql stable security definer set search_path to 'public', 'governanca' as $function$
declare q record; v_un uuid; v_itens jsonb;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_un := q.unidade_id;
  if v_un is null then return jsonb_build_object('ok', false, 'motivo', 'sem_unidade'); end if;

  with s as (
    select r.*, l.id lead_id, l.nome lead_nome, l.telefone lead_tel,
           coalesce(l.id::text, r.identificacao->>'chave_telefone', r.id::text) pessoa
    from radar_sinais r
    left join leads l on r.entidade_tipo = 'lead' and l.id::text = r.entidade_id::text
    where r.unidade_id = v_un and r.status = 'aberto'
      and (r.regra_codigo = 'R18' or (r.regra_codigo = 'R7' and r.dominio = 'comercial'))
  ),
  um_por_pessoa as (
    select distinct on (pessoa) * from s order by pessoa, detectado_em desc
  )
  select jsonb_agg(jsonb_build_object(
           'sinal_id', u.id, 'regra', u.regra_codigo, 'tipo', u.tipo_sinal,
           'quem', coalesce(u.lead_nome, split_part(u.contexto, ' — ', 1)),
           'lead_id', u.lead_id, 'telefone', u.lead_tel,
           'o_que_houve', u.contexto, 'orientacao', u.orientacao,
           'detectado_em', to_char(u.detectado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           'horas_atras', round(extract(epoch from (now() - u.detectado_em)) / 3600.0, 1),
           'tambem', (select jsonb_agg(o.regra_codigo) from s o
                       where o.pessoa = u.pessoa and o.id <> u.id)
         ) order by u.detectado_em desc)
    into v_itens
  from (select * from um_por_pessoa order by detectado_em desc limit greatest(p_limite, 1)) u;

  return jsonb_build_object(
    'ok', true, 'solicitante', q.nome, 'apelido', mila_apelido_v1(q.nome),
    'unidade', (select nome from unidades where id = v_un),
    'itens', coalesce(v_itens, '[]'::jsonb),
    'n', coalesce(jsonb_array_length(v_itens), 0),
    'nada_para_cutucar', coalesce(jsonb_array_length(v_itens), 0) = 0
  );
end $function$;

comment on function public.mila_cutucada_v1(text,integer) is
'Sinais que merecem cutucada NA HORA (R18 preso no bot + R7 promessa sem retorno, so dominio comercial), escopados pela governanca e deduplicados por pessoa. Usado pelo cron mila-cutucada.py de hora em hora em horario comercial.';

revoke all on function public.mila_cutucada_v1(text,integer) from public, anon, authenticated;
grant execute on function public.mila_cutucada_v1(text,integer) to service_role, mila_acesso_restrito;
