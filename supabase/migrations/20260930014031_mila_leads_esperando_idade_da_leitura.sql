-- Gerado da definicao VIVA no banco em 09/10/2026: a migration foi aplicada em 30/09
-- (schema_migrations 20260930014031) e nunca tinha virado arquivo no repositorio.
-- Traz o estado atual das duas funcoes do radar de espera comercial.

CREATE OR REPLACE FUNCTION public.mila_leads_esperando_v1(p_solicitante_telefone text, p_unidade_id uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'governanca'
AS $function$
declare
  q record;
  v_un uuid;
  v_itens jsonb;
  v_rod timestamptz;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado');
  end if;
  v_un := coalesce(q.unidade_id, p_unidade_id);

  select max(concluida_em) into v_rod
    from radar_rodadas where detector = 'espera_comercial' and erros is null;

  with s as (
    select v.*, l.nome lead_nome, l.telefone lead_tel, un.nome unidade_nome
      from vw_radar_sinal_vigencia_v1 v
      left join leads l on v.entidade_tipo = 'lead' and l.id = v.entidade_id
      left join unidades un on un.id = v.unidade_id
     where v.regra_codigo in ('R22', 'R23')
       and v.status = 'aberto'
       and v.vigencia <> 'sanou'
       and (v_un is null or v.unidade_id = v_un)
  ),
  um_por_conversa as (
    select distinct on (evidencia->>'conversa_id') *
      from s order by evidencia->>'conversa_id', detectado_em desc
  )
  select jsonb_agg(jsonb_build_object(
           'sinal_id', x.id,
           'motivo', case x.regra_codigo when 'R22' then 'mila_passou_ninguem_respondeu'
                                         else 'esperando_resposta' end,
           'nome', coalesce(x.lead_nome, x.evidencia->>'contato_nome', split_part(x.contexto, ' — ', 1)),
           'telefone', coalesce(x.lead_tel, x.evidencia->>'telefone'),
           'desde', to_char((x.evidencia->>'ultima_msg_em')::timestamptz at time zone 'America/Sao_Paulo', 'DD/MM'),
           'dias_esperando', floor(extract(epoch from (now() - (x.evidencia->>'ultima_msg_em')::timestamptz)) / 86400)::int,
           'o_que_disse', x.evidencia->>'trecho',
           'consultora_atribuida', x.evidencia->>'agente_atribuido',
           'unidade', x.unidade_nome,
           'lead_id', case when x.entidade_tipo = 'lead' then x.entidade_id end,
           'conversa_id', (x.evidencia->>'conversa_id')::int
         ) order by (x.evidencia->>'ultima_msg_em')::timestamptz asc)
    into v_itens
    from (select * from um_por_conversa
           order by (evidencia->>'ultima_msg_em')::timestamptz asc
           limit greatest(coalesce(p_limite, 30), 1)) x;

  return jsonb_build_object(
    'ok', true,
    'solicitante', q.nome,
    'apelido', mila_apelido_v1(q.nome),
    'unidade', (select nome from unidades where id = v_un),
    'rede', v_un is null,
    'itens', coalesce(v_itens, '[]'::jsonb),
    'n', coalesce(jsonb_array_length(v_itens), 0),
    'ordem', 'do mais antigo para o mais novo',
    'atualizado_em', to_char(v_rod at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
    'atualizado_ha_min', case when v_rod is null then null else floor(extract(epoch from (now() - v_rod)) / 60)::int end,
    'desatualizado', v_rod is null or v_rod < now() - interval '30 minutes',
    'cobertura', 'conversas abertas dos últimos 30 dias; o espelho comercial só existe desde 03/09/2026',
    'fora_da_lista', 'alunos ativos (já recebem o número da secretaria) e conversas em que a equipe já respondeu'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.radar_registrar_espera_comercial_v1(p_itens jsonb, p_truncado boolean, p_resumo jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_regra record;
  v_semana text := to_char(now() at time zone 'America/Sao_Paulo', 'IYYY-"W"IW');
  v_chave text;
  v_nome text;
  v_gravados int := 0;
  v_renovados int := 0;
  v_alunos int := 0;
  v_sem_unidade int := 0;
  v_inseriu boolean;
  v_rodada bigint;
  v_ids jsonb := '[]'::jsonb;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    return jsonb_build_object('ok', false, 'motivo', 'itens_invalidos');
  end if;

  for r in
    with it as (
      select e as item,
             (e->>'conversa_id')::int as cid,
             fn_normalizar_telefone_br_key(e->>'telefone') as k,
             coalesce((select u.id from unidades u where u.nome = e->>'unidade'),
                      (select u.id from unidades u where u.nome ilike (e->>'unidade') || '%' limit 1)) as un
        from jsonb_array_elements(p_itens) e
    ),
    chaves as (select distinct k from it where k is not null),
    ativos as materialized (
      select distinct fn_normalizar_telefone_br_key(v.t) as k
        from alunos a, lateral (values (a.telefone), (a.responsavel_telefone)) v(t)
       where a.status ilike 'ativo%'
         and fn_normalizar_telefone_br_key(v.t) is not null
    ),
    leads_do_lote as materialized (
      select x.* from (
        select l.id, l.nome, l.unidade_id, l.created_at,
               fn_normalizar_telefone_br_key(l.telefone) as k
          from leads l
      ) x
      where x.k in (select k from chaves)
    )
    select it.*,
           -- ⚠️ `in` contra conjunto com NULL devolve NULL, nao false: por isso o
           --    filtro `is not null` em `ativos` e o coalesce aqui.
           coalesce(it.k is not null and it.k in (select k from ativos), false) as eh_aluno,
           ld.id as lead_id, ld.nome as lead_nome
      from it
      left join lateral (
        select d.id, d.nome from leads_do_lote d
         where d.k = it.k
         order by (d.unidade_id = it.un) desc nulls last, d.created_at desc nulls last, d.id desc
         limit 1
      ) ld on true
  loop
    update radar_sinais s
       set visto_em = now(), atualizado_em = now(),
           evidencia = s.evidencia || jsonb_build_object(
             'horas_sem_resposta', (r.item->>'horas_sem_resposta')::int,
             'noul', (r.item->>'noul')::numeric)
     where s.regra_codigo = r.item->>'regra'
       and s.regra_codigo in ('R22', 'R23')
       and s.status in ('aberto', 'triado')
       and s.chave_dedup like '%|c' || r.cid || '|' || v_semana;
    if found then
      v_renovados := v_renovados + 1;
      v_ids := v_ids || to_jsonb(r.cid);
      continue;
    end if;

    if r.un is null then
      v_sem_unidade := v_sem_unidade + 1;
      continue;
    end if;
    if r.eh_aluno then
      v_alunos := v_alunos + 1;
      continue;
    end if;

    v_nome := coalesce(nullif(r.lead_nome, ''), nullif(r.item->>'contato_nome', ''), r.item->>'telefone');

    select severidade_padrao, orientacao_padrao, versao, lastro into v_regra
      from radar_regras where codigo = r.item->>'regra';

    v_chave := (r.item->>'regra') || '|lead|' ||
               coalesce(r.lead_id::text, r.k, r.item->>'telefone', '?') ||
               '|c' || r.cid || '|' || v_semana;

    insert into radar_sinais (
      entidade_tipo, entidade_id, unidade_id, regra_codigo, tipo_sinal, severidade,
      canonico, origem, dominio, contexto, interpretacao, orientacao, evidencia,
      identificacao, detectado_em, visto_em, competencia, expira_em, chave_dedup,
      status, regra_versao)
    values (
      'lead', r.lead_id, r.un, r.item->>'regra',
      case r.item->>'regra' when 'R22' then 'passou_sem_humano' else 'lead_esperando' end,
      coalesce(v_regra.severidade_padrao, 'alto'), true, 'jev_conversa', 'comercial',
      v_nome || ' — ' ||
        case r.item->>'regra'
          when 'R22' then 'a Mila passou para o consultor e ninguém respondeu.'
          else 'está esperando resposta da equipe.' end ||
        ' Última mensagem: "' || left(coalesce(r.item->>'trecho', ''), 200) || '"',
      v_regra.lastro, v_regra.orientacao_padrao,
      jsonb_build_object(
        'conversa_id', r.cid,
        'telefone', r.item->>'telefone',
        'contato_nome', r.item->>'contato_nome',
        'agente_atribuido', r.item->>'agente_nome',
        'ultima_msg_em', r.item->>'ultima_msg_em',
        'horas_sem_resposta', (r.item->>'horas_sem_resposta')::int,
        'trecho', r.item->>'trecho',
        'noul', (r.item->>'noul')::numeric,
        'tipo_ultima', r.item->>'tipo',
        'modelo', r.item->>'modelo'),
      jsonb_build_object(
        'metodo', case when r.lead_id is not null then 'telefone_lead' else 'telefone_sem_lead' end,
        'chave_telefone', r.k),
      now(), now(),
      date_trunc('month', now() at time zone 'America/Sao_Paulo')::date,
      (r.item->>'ultima_msg_em')::timestamptz + interval '30 days',
      v_chave, 'aberto', coalesce(v_regra.versao, 'v1'))
    on conflict (chave_dedup) do update
      set visto_em = now(),
          atualizado_em = now(),
          contexto = excluded.contexto,
          evidencia = excluded.evidencia
    returning (xmax = 0) into v_inseriu;

    if v_inseriu then v_gravados := v_gravados + 1; else v_renovados := v_renovados + 1; end if;
    v_ids := v_ids || to_jsonb(r.cid);
  end loop;

  if not coalesce(p_truncado, false) then
    insert into radar_rodadas (rodada, detector, concluida_em, resultado)
    values ('diaria', 'espera_comercial', now(),
            coalesce(p_resumo, '{}'::jsonb) || jsonb_build_object(
              'gravados_lote_final', v_gravados, 'renovados_lote_final', v_renovados,
              'alunos_fora_lote_final', v_alunos, 'sem_unidade_lote_final', v_sem_unidade))
    returning id into v_rodada;
  end if;

  return jsonb_build_object('ok', true, 'gravados', v_gravados, 'renovados', v_renovados,
    'alunos_fora', v_alunos, 'sem_unidade', v_sem_unidade, 'rodada_id', v_rodada,
    'rodada_fechada', v_rodada is not null, 'conversas', v_ids);
end;
$function$
;

