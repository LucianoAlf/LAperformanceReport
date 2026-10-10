-- Radar espera comercial: renovacao sem re-resolver a entidade (29/09/2026)
--
-- A 1a rodada real estourou o statement timeout (57014): 118 leads x
-- `radar_resolver_entidade_por_telefone` a ~0,3s cada (varre `alunos` por
-- telefone normalizado) = ~35s numa chamada. Duas correcoes:
--  1. aqui: conversa que JA tem sinal R22/R23 aberto nesta semana so renova
--     `visto_em` -- nao resolve de novo. Da 2a rodada em diante quase tudo cai
--     aqui. Quem mudou de regra (R23 -> R22) cai no caminho completo.
--  2. no detector (`radar-espera-comercial.py`): lotes de 20, e so o ultimo
--     fecha a rodada (os demais vao com p_truncado=true).
-- O resto da funcao e identico a 20260929230000_radar_espera_comercial.sql.

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
  it jsonb;
  v_un uuid;
  v_ident jsonb;
  v_tipo text;
  v_id bigint;
  v_nome text;
  v_regra record;
  v_semana text := to_char(now() at time zone 'America/Sao_Paulo', 'IYYY-"W"IW');
  v_chave text;
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

  for it in select * from jsonb_array_elements(p_itens) loop
    -- caminho rapido: mesmo sinal (regra + conversa + semana) ja existe
    update radar_sinais s
       set visto_em = now(), atualizado_em = now(),
           evidencia = s.evidencia || jsonb_build_object(
             'horas_sem_resposta', (it->>'horas_sem_resposta')::int,
             'noul', (it->>'noul')::numeric)
     where s.regra_codigo = it->>'regra'
       and s.regra_codigo in ('R22', 'R23')
       and s.status in ('aberto', 'triado')
       and s.chave_dedup like '%|c' || (it->>'conversa_id') || '|' || v_semana;
    if found then
      v_renovados := v_renovados + 1;
      v_ids := v_ids || to_jsonb((it->>'conversa_id')::int);
      continue;
    end if;

    select id into v_un from unidades where nome = it->>'unidade';
    if v_un is null then
      select id into v_un from unidades where nome ilike (it->>'unidade') || '%' limit 1;
    end if;
    if v_un is null then
      v_sem_unidade := v_sem_unidade + 1;
      continue;
    end if;

    v_ident := radar_resolver_entidade_por_telefone(it->>'telefone', v_un);

    if v_ident->>'entidade_tipo' = 'familia'
       or (v_ident->>'entidade_tipo' = 'aluno'
           and v_ident->'identificacao'->>'metodo' = 'telefone_aluno') then
      v_alunos := v_alunos + 1;
      continue;
    end if;

    if v_ident->>'entidade_tipo' = 'lead' then
      v_tipo := 'lead';
      v_id := (v_ident->>'entidade_id')::bigint;
    else
      v_tipo := 'lead';
      v_id := null;
    end if;
    v_nome := coalesce(nullif(v_ident->>'nome', ''), nullif(it->>'contato_nome', ''), it->>'telefone');

    select severidade_padrao, orientacao_padrao, versao, lastro into v_regra
      from radar_regras where codigo = it->>'regra';

    v_chave := (it->>'regra') || '|lead|' ||
               coalesce(v_id::text, v_ident->'identificacao'->>'chave_telefone', it->>'telefone', '?') ||
               '|c' || (it->>'conversa_id') || '|' || v_semana;

    insert into radar_sinais (
      entidade_tipo, entidade_id, unidade_id, regra_codigo, tipo_sinal, severidade,
      canonico, origem, dominio, contexto, interpretacao, orientacao, evidencia,
      identificacao, detectado_em, visto_em, competencia, expira_em, chave_dedup,
      status, regra_versao)
    values (
      v_tipo, v_id, v_un, it->>'regra',
      case it->>'regra' when 'R22' then 'passou_sem_humano' else 'lead_esperando' end,
      coalesce(v_regra.severidade_padrao, 'alto'), true, 'jev_conversa', 'comercial',
      v_nome || ' — ' ||
        case it->>'regra'
          when 'R22' then 'a Mila passou para o consultor e ninguém respondeu.'
          else 'está esperando resposta da equipe.' end ||
        ' Última mensagem: "' || left(coalesce(it->>'trecho', ''), 200) || '"',
      v_regra.lastro, v_regra.orientacao_padrao,
      jsonb_build_object(
        'conversa_id', (it->>'conversa_id')::int,
        'telefone', it->>'telefone',
        'contato_nome', it->>'contato_nome',
        'agente_atribuido', it->>'agente_nome',
        'ultima_msg_em', it->>'ultima_msg_em',
        'horas_sem_resposta', (it->>'horas_sem_resposta')::int,
        'trecho', it->>'trecho',
        'noul', (it->>'noul')::numeric,
        'tipo_ultima', it->>'tipo',
        'modelo', it->>'modelo',
        'entidade_resolvida', v_ident->>'entidade_tipo'),
      v_ident->'identificacao',
      now(), now(),
      date_trunc('month', now() at time zone 'America/Sao_Paulo')::date,
      (it->>'ultima_msg_em')::timestamptz + interval '30 days',
      v_chave, 'aberto', coalesce(v_regra.versao, 'v1'))
    on conflict (chave_dedup) do update
      set visto_em = now(),
          atualizado_em = now(),
          contexto = excluded.contexto,
          evidencia = excluded.evidencia
    returning (xmax = 0) into v_inseriu;

    if v_inseriu then v_gravados := v_gravados + 1; else v_renovados := v_renovados + 1; end if;
    v_ids := v_ids || to_jsonb((it->>'conversa_id')::int);
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
