-- FATIA 2, passo 3 — pauta por unidade e a porta que a Sol le (07/09/2026).
--
-- 🔴 CURADORIA CONTRA A REGUA DA DAIANA. O pedido era "curar as regras antes de
--    entregar". A regua, tirada do que ela reclamou no lado comercial, tem tres
--    perguntas — e so a terceira e nova:
--      1. e verdade agora?      → resolvido no passo 1 (vigencia)
--      2. a pessoa ja resolveu? → idem
--      3. **e trabalho DESTA pessoa?**
--
--    Pela 3a, **R12 fica de fora do publico operacional**. A orientacao da
--    propria regra manda "conversar com o PROFESSOR antes de acionar a
--    familia" — e conversa pedagogica, da coordenacao/Fabio, nao da secretaria.
--    Uma ADM que recebe isso nao tem o que fazer com a linha, e item sem acao
--    possivel e o que ensina a ignorar a lista inteira. As outras 10 entram.
--
-- ⚠️ `severidade_min = 'atencao'` e nao 'alto', de proposito: **R9** ("doenca ou
--    ausencia avisada — ja oferecer reposicao") nasce como `atencao` e e
--    trabalho de secretaria com hora marcada. Cortar por severidade a deixaria
--    de fora. Quem protege o volume e o **teto por turno** (8), e quem protege
--    a prioridade e o ranking — nao o corte. Nao mexi na severidade da regra:
--    reclassificar regra muda medicao, e isso e decisao do Alf, nao minha.
--
-- ⚠️ VOLUME MEDIDO hoje, ja com a vigencia: Barra 47, Campo Grande 42, Recreio
--    51 vigentes canonicos, ~15 criticos cada. Com teto 8 sao ~5 dias de pauta
--    por unidade — cheio, mas nao e a lista de 272 que ninguem le.
--
-- ⚠️ A pauta e PUXADA, nao empurrada: este e o 2o andar (a Sol responde quando
--    perguntam). O envio espontaneo e o 3o andar e nao entra aqui — os
--    destinatarios existem para dar escopo e teto a leitura, e o `horarios`
--    deles so passa a valer quando o 3o andar ligar.

-- ── 1. um destinatario por unidade, com as regras curadas ──────────────────
update radar_destinatarios set ativo = false
 where agente = 'sol' and camada = 'operacional' and unidade_id is null;
-- ⚠️ A linha antiga ("Secretaria — grupo da unidade", unidade NULL = todas)
--    fica DESLIGADA, nao deletada: ela e o registro de como isto foi desenhado
--    antes, e apagar historico de configuracao ja custou caro nesta casa.

insert into radar_destinatarios
  (agente, camada, nome, papel, canal, destino, unidade_id, regras, severidade_min, teto_por_turno, dominio, ativo, observacao)
select 'sol', 'operacional',
       'Secretaria — ' || u.nome, 'secretaria', 'grupo', null, u.id,
       array['R1','R2','R3','R5','R6','R7','R8','R9','R10','R13'],
       'atencao', 8, 'aluno', true,
       'Publico operacional (ADM da unidade). R12 fica fora: a orientacao dela manda falar com o professor — e conversa pedagogica, nao de secretaria.'
from unidades u
where u.nome in ('Barra','Campo Grande','Recreio')
  and not exists (select 1 from radar_destinatarios d
                   where d.agente='sol' and d.camada='operacional' and d.unidade_id = u.id);

-- ── 2. a pauta passa a dizer de qual unidade e cada bloco ──────────────────
-- ⚠️ Sem isso a porta teria de casar o destinatario pelo NOME, que quebra no
--    dia em que alguem renomear a linha. Id nao se renomeia.
do $unidade$
declare v_def text; n int;
begin
  select pg_get_functiondef(oid) into v_def from pg_proc
   where proname='radar_pauta_v1' and pronamespace='public'::regnamespace;

  n := (length(v_def) - length(replace(v_def, 'select d.id dest_id, d.nome dest_nome, d.papel, d.canal, d.camada, d.teto_por_turno,','')))
       / length('select d.id dest_id, d.nome dest_nome, d.papel, d.canal, d.camada, d.teto_por_turno,');
  if n <> 1 then raise exception 'ANCORA campos do dest: esperava 1, achei %', n; end if;
  v_def := replace(v_def,
    'select d.id dest_id, d.nome dest_nome, d.papel, d.canal, d.camada, d.teto_por_turno,',
    'select d.id dest_id, d.nome dest_nome, d.papel, d.canal, d.camada, d.teto_por_turno,' || chr(10) ||
    '           d.unidade_id dest_unidade_id,');

  n := (length(v_def) - length(replace(v_def, '''destinatario'', x.dest_nome, ''papel'', x.papel,','')))
       / length('''destinatario'', x.dest_nome, ''papel'', x.papel,');
  if n <> 1 then raise exception 'ANCORA saida: esperava 1, achei %', n; end if;
  v_def := replace(v_def,
    '''destinatario'', x.dest_nome, ''papel'', x.papel,',
    '''destinatario'', x.dest_nome, ''unidade_id'', x.dest_unidade_id, ''papel'', x.papel,');

  n := (length(v_def) - length(replace(v_def, 'select c.dest_nome, c.papel, c.canal, c.camada,','')))
       / length('select c.dest_nome, c.papel, c.canal, c.camada,');
  if n <> 1 then raise exception 'ANCORA agregacao: esperava 1, achei %', n; end if;
  v_def := replace(v_def,
    'select c.dest_nome, c.papel, c.canal, c.camada,',
    'select c.dest_nome, c.dest_unidade_id, c.papel, c.canal, c.camada,');

  n := (length(v_def) - length(replace(v_def, 'from no_teto c group by c.dest_nome, c.papel, c.canal, c.camada','')))
       / length('from no_teto c group by c.dest_nome, c.papel, c.canal, c.camada');
  if n <> 1 then raise exception 'ANCORA group by: esperava 1, achei %', n; end if;
  v_def := replace(v_def,
    'from no_teto c group by c.dest_nome, c.papel, c.canal, c.camada',
    'from no_teto c group by c.dest_nome, c.dest_unidade_id, c.papel, c.canal, c.camada');

  execute v_def;
  raise notice 'radar_pauta_v1: cada bloco passa a declarar a unidade';
end $unidade$;

revoke all on function public.radar_pauta_v1(text, boolean) from public, anon;
grant execute on function public.radar_pauta_v1(text, boolean) to service_role;

-- ── 3. a 13a porta: a pauta do dia ─────────────────────────────────────────
create or replace function public.sol_porta_pauta_do_dia_v1(
  p_solicitante_telefone text,
  p_unidade              text default null,
  p_limite               integer default null
) returns jsonb
language plpgsql volatile security definer set search_path to 'public', 'pg_temp' as $function$
declare v_e jsonb; v_pauta jsonb; v_blocos jsonb; v_lim int := least(greatest(coalesce(p_limite,8),1),20);
begin
  v_e := sol_resolver_escopo_v1(p_solicitante_telefone, p_unidade);
  if not coalesce((v_e->>'ok')::bool, false) then return v_e; end if;

  -- ⚠️ REUSA `radar_pauta_v1`, nao reimplementa. Vigencia, colapso por pessoa,
  --    ranking e teto moram la; uma segunda implementacao aqui divergiria da
  --    primeira em semanas — foi assim que nasceram as duplicatas de renovacao.
  v_pauta := radar_pauta_v1('sol', false);

  select jsonb_agg(b) into v_blocos
  from jsonb_array_elements(coalesce(v_pauta->'destinatarios','[]'::jsonb)) b
  where b->>'camada' = 'operacional'
    and ( -- diretoria sem unidade pedida ve as tres
          (v_e->>'unidade_id') is null
          or b->>'unidade_id' = v_e->>'unidade_id');

  if v_blocos is null then
    return jsonb_build_object('ok', true, 'quem', v_e->>'quem',
      'unidade', v_e->>'unidade_nome', 'itens', '[]'::jsonb, 'na_fila', 0,
      'recado', 'Nada na pauta agora — nenhum sinal vigente para essa unidade.');
  end if;

  return jsonb_build_object(
    'ok', true, 'quem', v_e->>'quem', 'publico', v_e->>'publico',
    'unidade', v_e->>'unidade_nome',
    'itens', (select jsonb_agg(i) from jsonb_array_elements(v_blocos) b,
                     lateral jsonb_array_elements(b->'itens') i limit v_lim),
    'na_fila', (select coalesce(sum((b->>'na_fila')::int),0) from jsonb_array_elements(v_blocos) b),
    -- ⚠️ O texto pronto vem da pauta: se a Sol reescrever por conta propria,
    --    duas redacoes do mesmo fato passam a circular.
    'mensagem', (select string_agg(b->>'mensagem', chr(10)||chr(10)) from jsonb_array_elements(v_blocos) b));
end; $function$;

comment on function public.sol_porta_pauta_do_dia_v1(text, text, integer) is
  'Quem merece um telefonema hoje, na unidade de quem perguntou. Le apenas sinais VIGENTES (o detector reemitiu na ultima rodada) e colapsa a mesma pessoa numa linha. Reusa radar_pauta_v1 — nao reimplementar ranking nem teto aqui.';

revoke all on function public.sol_porta_pauta_do_dia_v1(text, text, integer) from public, anon;
grant execute on function public.sol_porta_pauta_do_dia_v1(text, text, integer)
  to service_role, sol_operacional, sol_tatico, sol_estrategico;

-- ── prova ──────────────────────────────────────────────────────────────────
do $prova$
declare t_op text; v jsonb; v_n int; v_dest int;
begin
  select count(*) into v_dest from radar_destinatarios
   where agente='sol' and camada='operacional' and ativo and unidade_id is not null;
  if v_dest <> 3 then raise exception 'esperava 3 destinatarios por unidade, achei %', v_dest; end if;

  select telefone into t_op from governanca.agente_usuarios
   where lower(departamento)='administrativo' and lower(nivel)='colaborador'
     and unidade_id is not null and coalesce(ativo,true) limit 1;

  v := sol_porta_pauta_do_dia_v1(t_op, null, null);
  if not (v->>'ok')::bool then raise exception 'a porta recusou o operacional: %', v; end if;

  v_n := jsonb_array_length(coalesce(v->'itens','[]'::jsonb));
  if v_n = 0 then
    raise exception 'a pauta veio vazia para % — com 42-51 vigentes por unidade isso e defeito, nao dia calmo', v->>'unidade';
  end if;

  -- 🔴 nenhum item pode ser de R12: a curadoria tem de estar valendo
  if exists (select 1 from jsonb_array_elements(v->'itens') i where i->>'regra' = 'R12') then
    raise exception 'R12 apareceu na pauta operacional — a curadoria nao pegou';
  end if;

  raise notice 'prova: % → % itens na pauta (fila %), sem R12',
               v->>'unidade', v_n, v->>'na_fila';
end $prova$;
