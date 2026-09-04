-- T2 (calor do lead) · 1º ANDAR · camada OPERACIONAL
--
-- Detector da R18. Le o espelho `atendimento_conversa_estado` (alimentado pela
-- edge `ingerir-calor-atendimento`) e emite sinal no dominio comercial.
--
-- ⚠️ Nao chama API nem LLM: e SQL puro sobre fato ja ingerido. O cron que o
--    dispara e do banco, sem edge no caminho de decisao.
--
-- ⚠️ DOIS defeitos meus na 1a versao, e o 2o escondeu o 1o:
--    (a) `radar_resolver_entidade_por_telefone` tem UM argumento (text) e eu
--        chamei com dois — toda chamada levantava 42883.
--    (b) o `exception when others then v_ent := null` engoliu isso e gravou
--        `metodo: telefone_sem_match`: o sinal AFIRMAVA que o telefone nao
--        casava quando a funcao nem tinha rodado. O mesmo telefone, com a
--        assinatura certa, resolve para o lead 13928 com confianca 0,9.
--    Handler que transforma erro em "nao achei" e pior que erro: mente com cara
--    de fato. Hoje a falha vai para o proprio sinal (`resolver_falhou` + a
--    mensagem), onde alguem a ve.
--
-- ⚠️ `identificacao` do resolver vem ANINHADA (`->'identificacao'`), nao no topo.
--
-- ⚠️ Idempotente por `chave_dedup` (regra|telefone|semana ISO): o mesmo lead
--    preso nao vira aviso novo a cada execucao. Semana e o grao certo — a
--    conversa pode ficar dias parada e reavisar todo dia seria ruido.

CREATE OR REPLACE FUNCTION public.radar_detectar_calor_atendimento_v1(p_horas_minimas integer DEFAULT 2)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inseridos int := 0;
  v_avaliados int := 0;
  v_sem_match int := 0;
  r record;
  v_ent jsonb;
  v_ident jsonb;
  v_erro text;
begin
  for r in
    select e.*
      from public.atendimento_conversa_estado e
     where e.departamento = 'comercial'
       and e.so_falou_com_bot
       and e.ultimo_autor = 'contact'
       and coalesce(e.horas_desde_ultima, 0) >= p_horas_minimas
       and e.unidade_id is not null
       and e.telefone_key is not null
       and e.ultima_msg_em >= now() - interval '14 days'
  loop
    v_avaliados := v_avaliados + 1;
    v_erro := null;
    begin
      v_ent := public.radar_resolver_entidade_por_telefone(r.telefone);
    exception when others then
      v_ent := null; v_erro := sqlerrm;
    end;

    v_ident := case
      when v_erro is not null
        then jsonb_build_object('metodo','resolver_falhou','confianca',0,'erro',left(v_erro,200))
      when v_ent is null or v_ent->>'entidade_id' is null
        then jsonb_build_object('metodo','telefone_sem_match','confianca',0)
      else coalesce(v_ent->'identificacao',
                    jsonb_build_object('metodo','resolver','confianca',0.5))
    end;
    if v_ident->>'metodo' in ('telefone_sem_match','resolver_falhou') then
      v_sem_match := v_sem_match + 1;
    end if;

    insert into public.radar_sinais (
      entidade_tipo, entidade_id, unidade_id, regra_codigo, tipo_sinal,
      severidade, canonico, origem, contexto, orientacao, evidencia,
      identificacao, competencia, chave_dedup, status, regra_versao, dominio
    ) values (
      coalesce(v_ent->>'entidade_tipo', 'lead'),
      nullif(v_ent->>'entidade_id','')::bigint,
      -- unidade da CONVERSA, nao a do resolver: e onde o atendimento aconteceu
      -- e quem tem de agir. Divergencia fica registrada na evidencia.
      r.unidade_id, 'R18', 'preso_no_bot', 'alto', true, 'sql_atendimento',
      coalesce(nullif(v_ent->>'nome',''), nullif(r.contato_nome,''),
               'Contato ' || coalesce(r.telefone,'?'))
        || ' escreveu e só a Mila respondeu — '
        || r.horas_desde_ultima || 'h sem nenhum humano entrar.',
      (select orientacao_padrao from public.radar_regras where codigo = 'R18'),
      jsonb_build_object(
        'telefone', r.telefone,
        'horas_sem_humano', r.horas_desde_ultima,
        'mensagens_do_contato', r.msgs_do_contato,
        'mensagens_do_bot', r.msgs_do_bot,
        'inbox', r.inbox_nome,
        'conversa_id', r.conversa_id,
        'assignee', r.assignee_nome,
        'unidade_divergente', (v_ent->>'unidade_id' is not null
                               and v_ent->>'unidade_id' <> r.unidade_id::text)
      ),
      v_ident,
      date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date,
      'R18|' || r.telefone_key || '|' ||
        to_char((r.ultima_msg_em at time zone 'America/Sao_Paulo'), 'IYYY-IW'),
      'aberto', 'v1', 'comercial'
    )
    on conflict (chave_dedup) do nothing;
    if found then v_inseridos := v_inseridos + 1; end if;
  end loop;

  return jsonb_build_object('ok', true, 'avaliados', v_avaliados,
                            'sinais_novos', v_inseridos,
                            'sem_identificacao', v_sem_match, 'em', now());
end;
$function$;

-- `telefone_key` derivada pela funcao CANONICA do projeto, nunca reimplementada
-- em TypeScript. Duas regras de telefone no mesmo sistema ja mordeu aqui:
-- `candidatosTelefone()` esta duplicada nas duas edges de Meta Ads e o
-- CLAUDE.md registra que mudar a regra exige mudar nas duas.
create or replace function public.exec_normalizar_telefone_atendimento()
returns integer language plpgsql security definer set search_path = public as $fn$
declare v_n integer;
begin
  update public.atendimento_conversa_estado e
     set telefone_key = public.fn_normalizar_telefone_br_key(e.telefone)
   where e.telefone is not null
     and e.telefone_key is distinct from public.fn_normalizar_telefone_br_key(e.telefone);
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

revoke all on function public.exec_normalizar_telefone_atendimento() from public, anon;
grant execute on function public.exec_normalizar_telefone_atendimento() to service_role;

revoke all on function public.radar_detectar_calor_atendimento_v1(integer) from public, anon;
grant execute on function public.radar_detectar_calor_atendimento_v1(integer) to service_role;

comment on function public.radar_detectar_calor_atendimento_v1(integer) is
  'T2/1o andar/operacional. Emite R18 (lead preso no bot) a partir de atendimento_conversa_estado. SQL puro, sem API nem LLM. Dedup por telefone+semana ISO.';
