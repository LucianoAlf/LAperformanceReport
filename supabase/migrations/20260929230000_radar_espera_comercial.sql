-- Radar: LEAD ESPERANDO A ESCOLA na inbox comercial (FISC-64 do fiscal-mila, 29/09/2026)
--
-- PARA QUE EXISTE
-- Em 29/09, lendo 24 conversas abertas das 3 inboxes da Mila em que o lead
-- falou por ultimo, 14 estavam esquecidas: 6 que a Mila passou para o consultor
-- e ninguem nunca respondeu (o lead disse "Ok" e ficou esperando), 5 com
-- pergunta sem resposta ("pode ser em outubro? dia 3", 13 dias) e 3 leads
-- antigos que voltaram. O extrator `extrair-sinais-conversa` (gpt-5.4-mini)
-- tinha lido as 11 que estavam na janela dele e marcado TODAS como `cortesia`
-- — a armadilha do "Ok": depois de "vou te passar pro consultor", "Ok" e
-- espera; depois de "o professor vai te chamar", e encerramento.
--
-- COMO FUNCIONA
--   Sol: `vw_atendimento_espera_comercial` (transcript separando bot/consultora)
--   la-hq, de hora em hora: `radar-espera-comercial.py` pergunta ao Jev
--     "o lead esta esperando a escola?" — calibrado em 29/09 com 33 conversas
--     rotuladas: limiar 0,6 -> 31/33, ZERO falso negativo.
--   aqui: `radar_registrar_espera_comercial_v1` grava/renova o sinal e fecha a
--     rodada; quem nao aparece mais na foto sai da pauta sozinho (vigencia).
--   consumo: `mila_leads_esperando_v1` (tool da Mila Consultor) e a cutucada.
--
-- ⚠️ DETECTOR PROPRIO (`espera_comercial`), NAO o `conversa`. A vigencia marca
--    `sanou` todo sinal do detector que nao aparece na rodada mais recente. Se
--    estes fossem R8 (detector `conversa`), a rodada diaria do extrator — que
--    chama esses casos de cortesia — os apagaria toda manha as 07:30.
--
-- ⚠️ ALUNO ATIVO NAO ENTRA (decisao do Hugo, 29/09). A Kailane reclamou em 14/09
--    que a pauta dela misturava aluno com lead; e aluno ativo ja recebe a
--    mensagem automatica com os numeros da secretaria. O filtro e o CADASTRO
--    (`radar_resolver_entidade_por_telefone`), nunca a etiqueta do Chatwoot:
--    os 4 alunos da amostra estavam com `labels=[]`.

-- ---------------------------------------------------------------------------
-- 1. As duas regras
-- ---------------------------------------------------------------------------
insert into public.radar_regras
  (codigo, titulo, descricao, entidade_tipo, origem, severidade_padrao, canonico,
   ativo, params, lastro, orientacao_padrao, versao, dominio, detector)
values
  ('R22', 'A Mila passou o lead e ninguém respondeu',
   'A conversa saiu do bot para um consultor, o lead respondeu (muitas vezes só "Ok") e nenhuma mensagem humana veio depois.',
   'lead', 'jev_conversa', 'critico', true, true,
   '{"limiar_jev": 0.6, "janela_dias": 30}'::jsonb,
   'Medido em 29/09/2026: 6 de 24 conversas abertas com o lead falando por último eram isso — a Mila disse "vou te passar pro consultor", o lead respondeu "Ok" e ninguém falou. A mais velha tinha 7 dias. O extrator semântico marcou as 6 como cortesia.',
   'Responder hoje: o lead já foi qualificado pela Mila e está esperando o consultor.',
   'v1', 'comercial', 'espera_comercial'),
  ('R23', 'Lead esperando resposta da equipe',
   'O lead perguntou, pediu algo ou voltou a escrever, e ninguém da equipe respondeu depois.',
   'lead', 'jev_conversa', 'alto', true, true,
   '{"limiar_jev": 0.6, "janela_dias": 30}'::jsonb,
   'Medido em 29/09/2026: 8 de 24 conversas abertas — pergunta de preço e de data sem resposta (até 13 dias) e leads antigos que voltaram depois do encerramento automático, com a conversa aberta e o bot mudo.',
   'Responder o que o lead perguntou; se ele voltou depois de muito tempo, retomar a conversa do zero.',
   'v1', 'comercial', 'espera_comercial')
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Gravacao (so o detector da la-hq chama, com service_role)
-- ---------------------------------------------------------------------------
-- p_itens: [{conversa_id, regra ('R22'|'R23'), telefone, contato_nome, unidade,
--            agente_nome, ultima_msg_em, horas_sem_resposta, trecho, noul, tipo,
--            modelo}]
-- p_truncado: foto incompleta NAO fecha rodada — ausencia nao prova resposta.
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
    select id into v_un from unidades where nome = it->>'unidade';
    if v_un is null then
      select id into v_un from unidades where nome ilike (it->>'unidade') || '%' limit 1;
    end if;
    if v_un is null then
      v_sem_unidade := v_sem_unidade + 1;
      continue;
    end if;

    v_ident := radar_resolver_entidade_por_telefone(it->>'telefone', v_un);

    -- aluno ativo (ou familia com aluno ativo) fica de fora: nao e lead
    if v_ident->>'entidade_tipo' = 'familia'
       or (v_ident->>'entidade_tipo' = 'aluno'
           and v_ident->'identificacao'->>'metodo' = 'telefone_aluno') then
      v_alunos := v_alunos + 1;
      continue;
    end if;

    -- lead cadastrado -> entidade lead; ex-aluno ou telefone sem cadastro -> lead
    -- sem id, identificado pelo telefone (a cutucada ja sabe tratar isso)
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

  -- 🔴 foto truncada nao fecha rodada: sem rodada nova, quem sumiu da foto
  --    continua vigente (o erro seguro e cobrar de novo, nao esquecer o lead).
  if not coalesce(p_truncado, false) then
    insert into radar_rodadas (rodada, detector, concluida_em, resultado)
    values ('diaria', 'espera_comercial', now(),
            coalesce(p_resumo, '{}'::jsonb) || jsonb_build_object(
              'gravados', v_gravados, 'renovados', v_renovados,
              'alunos_fora', v_alunos, 'sem_unidade', v_sem_unidade,
              'conversas', v_ids))
    returning id into v_rodada;
  end if;

  return jsonb_build_object('ok', true, 'gravados', v_gravados, 'renovados', v_renovados,
    'alunos_fora', v_alunos, 'sem_unidade', v_sem_unidade, 'rodada_id', v_rodada,
    'rodada_fechada', v_rodada is not null);
end;
$$;

revoke all on function public.radar_registrar_espera_comercial_v1(jsonb, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.radar_registrar_espera_comercial_v1(jsonb, boolean, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Leitura para a Mila Consultor (tool `leads_esperando`)
-- ---------------------------------------------------------------------------
-- 🔴 A UNIDADE VEM DE `quem_eh`, NUNCA DO PEDIDO. Quem tem unidade propria ve so
--    a propria — `p_unidade_id` e ignorado para essa pessoa, mesmo que o modelo
--    o passe. So quem enxerga a rede (unidade_id nulo) escolhe unidade.
create or replace function public.mila_leads_esperando_v1(
  p_solicitante_telefone text,
  p_unidade_id uuid default null,
  p_limite integer default 30
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, governanca
as $$
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
    -- dado parado tem de se denunciar: o detector roda de hora em hora
    'desatualizado', v_rod is null or v_rod < now() - interval '3 hours',
    'cobertura', 'conversas abertas dos últimos 30 dias; o espelho comercial só existe desde 03/09/2026',
    'fora_da_lista', 'alunos ativos (já recebem o número da secretaria) e conversas em que a equipe já respondeu'
  );
end;
$$;

revoke all on function public.mila_leads_esperando_v1(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.mila_leads_esperando_v1(text, uuid, integer)
  to service_role, mila_acesso_restrito;

-- ---------------------------------------------------------------------------
-- 4. Cutucada: passa a entregar R22/R23. Unica mudanca na funcao: o filtro de
--    regra e o fallback do telefone (sinal sem lead cadastrado traz o telefone
--    na evidencia). O resto e copia literal da definicao vigente em 29/09.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mila_cutucada_v1(p_solicitante_telefone text, p_limite integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'governanca'
AS $function$
declare q record; v_un uuid; v_itens jsonb; v_porque text;
begin
  select * into q from governanca.quem_eh(p_solicitante_telefone) limit 1;
  if q.nome is null then return jsonb_build_object('ok', false, 'motivo', 'nao_autorizado'); end if;
  v_un := q.unidade_id;
  if v_un is null then return jsonb_build_object('ok', false, 'motivo', 'sem_unidade'); end if;

  with s as (
    select r.*, l.id lead_id, l.nome lead_nome, l.telefone lead_tel,
           coalesce(l.id::text, r.identificacao->>'chave_telefone', r.id::text) pessoa,
           -- 2º ANDAR: o aprendizado que explica esta regra. Precedencia do sinal
           -- sobre a regra; so padrao de visibilidade 'rede' (P7 nomeia gente).
           p.codigo padrao_codigo, p.titulo padrao_titulo, p.aprendizado padrao_aprendizado
    from vw_radar_sinal_vigencia_v1 r
    left join leads l on r.entidade_tipo = 'lead' and l.id::text = r.entidade_id::text
    left join radar_regras rr on rr.codigo = r.regra_codigo and rr.dominio = r.dominio
    left join radar_padroes p on p.codigo = coalesce(r.padrao_codigo, rr.padrao_codigo)
                             and p.ativo and p.visibilidade = 'rede'
    where r.unidade_id = v_un and r.status = 'aberto' and r.vigencia <> 'sanou'
      and (r.regra_codigo in ('R18', 'R21', 'R22', 'R23') or (r.regra_codigo = 'R7' and r.dominio = 'comercial'))
  ),
  um_por_pessoa as (
    select distinct on (pessoa) * from s order by pessoa, detectado_em desc
  )
  select jsonb_agg(jsonb_build_object(
           'sinal_id', u.id, 'regra', u.regra_codigo, 'tipo', u.tipo_sinal,
           'quem', coalesce(u.lead_nome, split_part(u.contexto, ' — ', 1)),
           'lead_id', u.lead_id, 'telefone', coalesce(u.lead_tel, u.evidencia->>'telefone'),
           'o_que_houve', u.contexto, 'orientacao', u.orientacao,
           'porque', u.padrao_aprendizado,
           'detectado_em', to_char(u.detectado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
           'horas_atras', round(extract(epoch from (now() - u.detectado_em)) / 3600.0, 1),
           'tambem', (select jsonb_agg(o.regra_codigo) from s o
                       where o.pessoa = u.pessoa and o.id <> u.id)
         ) order by u.detectado_em desc),
         max(u.padrao_aprendizado)
    into v_itens, v_porque
  from (select * from um_por_pessoa order by detectado_em desc limit greatest(p_limite, 1)) u;

  return jsonb_build_object(
    'ok', true, 'solicitante', q.nome, 'apelido', mila_apelido_v1(q.nome),
    'unidade', (select nome from unidades where id = v_un),
    'itens', coalesce(v_itens, '[]'::jsonb),
    'n', coalesce(jsonb_array_length(v_itens), 0),
    'porque_vale_agora', v_porque,
    'nada_para_cutucar', coalesce(jsonb_array_length(v_itens), 0) = 0
  );
end $function$;

-- ---------------------------------------------------------------------------
-- 5. TRAVA: R22/R23 NUNCA vao para grupo (pedido do Hugo, 29/09).
--    `radar_bloco_comercial_grupo_v1` monta a secao "SINAIS DO DIA" do
--    relatorio comercial das 20h, que a Sol posta no grupo da unidade — e le
--    TODO sinal comercial aberto. Sem esta linha, os leads esperando (com o que
--    o lead escreveu) sairiam no grupo. Eles sao da consultora: cutucada e tool.
--    Unica mudanca: o filtro `regra_codigo not in ('R22','R23')`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.radar_bloco_comercial_grupo_v1(p_unidade_id uuid, p_limite integer DEFAULT 6, p_janela_dias integer DEFAULT 30)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with gate as (
  select coalesce((
    select ac.ativo
      from public.automacoes_config ac
     where ac.slug = 'radar_bloco_sinais_comercial'
  ), false) as ligado
),
vivos as (
  select distinct on (coalesce(v.evidencia->>'conversa_id', v.situacao, v.id::text))
         v.id, v.regra_codigo, v.contexto, v.orientacao, v.detectado_em, v.evidencia
    from public.vw_radar_sinal_vigencia_v1 v
   where (select ligado from gate)
     and v.dominio = 'comercial'
     and v.status in ('aberto','triado')
     and v.unidade_id = p_unidade_id
     and (v.expira_em is null or v.expira_em > now())
     and v.vigencia <> 'sanou'
     and v.regra_codigo not in ('R22', 'R23')
   order by coalesce(v.evidencia->>'conversa_id', v.situacao, v.id::text),
            case v.regra_codigo when 'R2' then 0 when 'R14' then 1 else 2 end,
            v.detectado_em desc
),
s as (
  select v.regra_codigo, v.contexto, v.orientacao,
         coalesce((v.evidencia->>'dias_parado')::int,
                  (v.evidencia->>'horas_sem_resposta')::int / 24, 0) as idade_dias,
         row_number() over (order by
           case v.regra_codigo when 'R2' then 0 when 'R14' then 1 else 2 end,
           coalesce((v.evidencia->>'dias_parado')::int,
                    (v.evidencia->>'horas_sem_resposta')::int / 24, 999),
           v.detectado_em desc) as rn_bruto
    from vivos v
),
uteis as (
  select *, row_number() over (order by rn_bruto) rn, count(*) over () total
    from s
   where idade_dias <= p_janela_dias
),
linhas as (
  select rn, total,
         regexp_replace(split_part(u.contexto, ' Escreveu há', 1), '\s+', ' ', 'g')
         || case when u.orientacao is not null
                 then ' → ' || split_part(u.orientacao, '.', 1) || '.'
                 else '' end as linha
    from uteis u
   where rn <= p_limite
)
select case
  when (select count(*) from linhas) = 0 then array[]::text[]
  else array_agg(linha order by rn)
       || case when (select max(total) from linhas) > p_limite
               then array['Mais ' || ((select max(total) from linhas) - p_limite)::text
                          || ' na fila — os próximos vêm amanhã.']
               else array[]::text[] end
end
from linhas;
$function$;
