-- Radar espera comercial: resolve aluno/lead UMA VEZ por chamada (29/09/2026)
--
-- A renovacao rapida (20260929233000) nao bastou: o lote de 20 da 1a rodada ainda
-- estourou o statement_timeout de 8s (`authenticator`). Medido:
-- `radar_resolver_entidade_por_telefone` varre `leads` inteira normalizando
-- telefone (0,67s) e `alunos` (0,19s) A CADA conversa -- ~0,9s x 20 = 18s.
-- Aqui as duas varreduras acontecem UMA vez por chamada, para todos os
-- telefones do lote juntos (~0,9s por chamada, qualquer que seja o lote).
-- ⚠️ `materialized` e obrigatorio: sem ele o planejador empurra o filtro para
--    dentro do lateral e volta a varrer `leads` por conversa (medido: 5,5s
--    para 8 conversas).
--
-- A regra de quem fica de fora e a MESMA do resolvedor: telefone que casa com
-- `alunos.telefone` ou `alunos.responsavel_telefone` de aluno com status
-- `ativo%` (um aluno ou uma familia) -> nao e lead, nao vira sinal. O lead
-- escolhido tambem segue o resolvedor: mesma unidade primeiro, depois o mais
-- recente. Ex-aluno e telefone sem cadastro viram lead SEM id, identificados
-- pelo telefone (a cutucada ja trata).

create or replace function public.radar_registrar_espera_comercial_v1(
  p_itens jsonb,
  p_truncado boolean,
  p_resumo jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
    -- caminho rapido: mesmo sinal (regra + conversa + semana) ja existe
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
$$;
