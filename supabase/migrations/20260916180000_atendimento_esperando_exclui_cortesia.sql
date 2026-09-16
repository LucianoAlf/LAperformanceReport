-- "76 conversas esperando" tinha 67% de cortesia dentro (16/09/2026)
--
-- Auditando o caso do Bruno Bastos (relatado no PR #477): última mensagem
-- dele é "👍", depois de a Vitória já ter avisado que o atendimento passou
-- para a secretaria. Contava como pendência há 10 dias.
--
-- MEDIDO antes de mexer, cruzando `atendimento_conversa_estado` (o que
-- `snapshot_atendimento_consultor_v1` lia) com a classificação semântica que
-- JÁ EXISTE em `extrair-sinais-conversa` (09/09/2026, mesma pergunta —
-- "essa última mensagem do cliente precisa mesmo de resposta?"):
--
--   consultora          esperando (antigo)   com classificação   cortesia   precisa
--   Vitória Santos              78                    77             52        25
--   Kailane Barbosa             39                    39             26        13
--   Daiana Amorim                 8                     7              4         3
--
-- **67% do que ia para a liderança como "cliente esperando" era cortesia** —
-- "obrigada", emoji, confirmação sem pendência — em conversas que a própria
-- equipe já tinha encerrado por outro canal (áudio, presencial). O Bruno não
-- era exceção, era a maioria.
--
-- A classificação JÁ ESTAVA CORRETA para o Bruno desde 06/09
-- (`tipo:'cortesia', precisa_resposta:false`) — simplesmente não era lida por
-- esta métrica. Mesma família de "ferramenta disponível não vence instrução":
-- o classificador existia, gravava o veredito certo, e `esperando_cliente`
-- nunca olhava para ele.
--
-- FIX: `snapshot_atendimento_consultor_v1()` passa a juntar
-- `atendimento_conversa_estado` com o veredito mais recente de
-- `automacao_log` (evento='mapa_sinais', acao='extrator_conversa') por
-- `conversa_id`. Não reimplementa o classificador — só passa a lê-lo.
--
-- ⚠️ GUARDA DE FRESCOR, fail-open (mesma direção de falha do extrator):
-- a classificação só é confiável quando foi feita DEPOIS da mensagem atual
-- (`classificado_em >= ultima_msg_em`). Medido: 2 de 123 conversas tinham
-- classificação mais velha que a mensagem atual — sem a guarda, um "obrigada"
-- classificado ontem esconderia uma pergunta nova de hoje. Sem classificação
-- nenhuma (1-2 casos por consultora) também conta como esperando — não sei
-- nunca vira "não precisa".
--
-- `horas_max_espera` passa a respeitar o mesmo filtro, para o "pior caso"
-- reportado não ser justamente uma cortesia antiga. `abertas` (contagem bruta
-- de conversas abertas) NÃO muda — cortesia continua contando como conversa
-- aberta, só não conta como "esperando resposta".
--
-- Efeito no dia (16/09): Vitória 78->26, Kailane 39->14, Daiana 8->4.
-- Só a foto de HOJE foi regravada -- atendimento_conversa_estado é espelho do
-- estado ATUAL, dias passados não são reconstruíveis (mesma nota do commit
-- anterior).

create or replace function public.snapshot_atendimento_consultor_v1(p_dia date default ((now() at time zone 'America/Sao_Paulo'::text))::date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_linhas int;
begin
  with classificacoes as (
    select distinct on ((detalhes->>'conversa_id')::int)
           (detalhes->>'conversa_id')::int as conversa_id,
           created_at as classificado_em,
           (detalhes->'veredito'->>'precisa_resposta')::boolean as precisa_resposta
      from public.automacao_log
     where evento = 'mapa_sinais' and acao = 'extrator_conversa'
       and detalhes ? 'conversa_id'
     order by (detalhes->>'conversa_id')::int, created_at desc
  ),
  base as (
    select e.*,
      coalesce(c.precisa_resposta or c.classificado_em < e.ultima_msg_em, true)
        as precisa_resposta_confiavel
      from public.atendimento_conversa_estado e
      left join classificacoes c on c.conversa_id = e.conversa_id
  )
  insert into public.atendimento_consultor_diario as d (
    dia, unidade_id, unidade_nome, assignee_nome, e_bot,
    conversas, abertas, esperando_cliente, esperando_4h, esperando_24h,
    horas_max_espera, so_falou_com_bot, novas_no_dia, min_ate_humano_p50, capturado_em)
  select
    p_dia, unidade_id, max(unidade_texto), coalesce(assignee_nome, '(sem dono)'),
    coalesce(assignee_nome, '(sem dono)') ~* '^mi?ll?a\s',
    count(*),
    count(*) filter (where conversa_status = 'open'),
    count(*) filter (where ultimo_autor = 'contact' and conversa_status = 'open' and precisa_resposta_confiavel),
    count(*) filter (where ultimo_autor = 'contact' and conversa_status = 'open' and precisa_resposta_confiavel and horas_desde_ultima >= 4),
    count(*) filter (where ultimo_autor = 'contact' and conversa_status = 'open' and precisa_resposta_confiavel and horas_desde_ultima >= 24),
    max(horas_desde_ultima) filter (where ultimo_autor = 'contact' and conversa_status = 'open' and precisa_resposta_confiavel),
    count(*) filter (where so_falou_com_bot),
    count(*) filter (where (primeiro_contato_em at time zone 'America/Sao_Paulo')::date = p_dia),
    percentile_cont(0.5) within group (order by minutos_ate_humano)
      filter (where (primeiro_humano_em at time zone 'America/Sao_Paulo')::date = p_dia),
    now()
  from base
  where departamento = 'comercial'
  group by unidade_id, coalesce(assignee_nome, '(sem dono)')
  on conflict (dia, unidade_id, assignee_nome) do update set
    unidade_nome = excluded.unidade_nome, e_bot = excluded.e_bot,
    conversas = excluded.conversas, abertas = excluded.abertas,
    esperando_cliente = excluded.esperando_cliente,
    esperando_4h = excluded.esperando_4h, esperando_24h = excluded.esperando_24h,
    horas_max_espera = excluded.horas_max_espera,
    so_falou_com_bot = excluded.so_falou_com_bot, novas_no_dia = excluded.novas_no_dia,
    min_ate_humano_p50 = excluded.min_ate_humano_p50, capturado_em = now();

  get diagnostics v_linhas = row_count;
  insert into public.automacao_log (evento, acao, status, aluno_nome, unidade_nome, detalhes)
  values ('atendimento_serie', 'snapshot', 'ok', 'serie de atendimento comercial', 'Rede',
          jsonb_build_object('dia', p_dia, 'linhas', v_linhas));
  return jsonb_build_object('ok', true, 'dia', p_dia, 'linhas', v_linhas);
end $function$;

select public.snapshot_atendimento_consultor_v1();

do $mig$
declare
  v_src text; v_novo text;
  v_de text := 'medida'', ''Conversas com o CLIENTE esperando resposta, na foto das 19:10 de cada dia. '
           || 'É estoque do que ficou pendurado, não velocidade de resposta.'',';
  v_para text := 'medida'', ''Conversas com o CLIENTE esperando resposta, na foto das 19:10 de cada dia — '
           || 'já excluindo cortesia (obrigada/emoji/confirmação sem pendência, mesma classificação semântica '
           || 'do extrator de sinais, 16/09/2026). Sem classificação fresca conta como esperando (fail-open). '
           || 'É estoque do que ficou pendurado, não velocidade de resposta.'',';
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p where p.proname='mila_atendimento_serie_v1';
  if (length(v_src) - length(replace(v_src, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'ANCORA_MEDIDA: esperava 1 ocorrencia';
  end if;
  v_novo := replace(v_src, v_de, v_para);
  execute v_novo;
end $mig$;
