-- supabase/migrations/20261001150000_fechamento_dia1_competencia_viva.sql
--
-- O 1o disparo real do fechamento automatico (01/10/2026 09:15 BRT) falhou nas 3 unidades.
--
-- (1) Preview bloqueado (admin_vs_canonico_divergente + tempo_ltv_zerado).
--     Desde 20260902121000 a captura roda no dia 1o, quando o mes fechado ja nao e o corrente
--     e ainda nao tem dados_mensais. get_kpis_alunos_canonicos_base_p01q devolvia
--     fonte='indisponivel' (tempo/LTV 0, contagem sem o overlay do admin). A rodada antiga
--     (ultimo dia 22h) funcionava porque o mes ainda era 'vivo'.
--     Correcao: a flag de transacao app.fechamento_competencia_viva = 'AAAA-M', setada SO por
--     fechar_competencia_mensal_automatico, faz aquela competencia ser lida como 'vivo'
--     (corte = ultimo dia do mes, v_data_corte ja fazia LEAST(hoje, fim_mes)). Telas nao mudam.
--     A flag entra na chave do cache de get_kpis_alunos_canonicos: sem isso o fechamento
--     receberia o payload 'indisponivel' cacheado (e as telas receberiam o 'vivo').
--
-- (2) Passo 4 bloqueado: trg_relatorio_coordenacao_final_v4 tratava aprovado -> fechado
--     (a transicao do proprio fechamento) como violacao de documento imutavel. Passa a aceitar
--     somente essa transicao, com payload/hash/identidade identicos.
--
-- Validado em ensaio com rollback contra producao: 3 unidades fechadas, 0 erro.

do $$
declare
  d text;
  n int;
  v_ancora text;
  v_novo text;
begin
  -- (1a) p01q: competencia em fechamento e lida como 'vivo'
  d := pg_get_functiondef('public.get_kpis_alunos_canonicos_base_p01q'::regproc);
  v_ancora := 'WHEN v_mes_atual = true THEN ''vivo''';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'p01q: ancora esperava 1 ocorrencia, achou %', n; end if;
  d := replace(d, v_ancora,
    'WHEN v_mes_atual = true OR current_setting(''app.fechamento_competencia_viva'', true) = format(''%s-%s'', p_ano, p_mes) THEN ''vivo''');
  execute d;

  -- (1b) chave do cache de get_kpis_alunos_canonicos carrega a flag
  d := pg_get_functiondef('public.get_kpis_alunos_canonicos(uuid,integer,integer)'::regprocedure);
  v_ancora := '(now() at time zone ''America/Sao_Paulo'')::date' || chr(10) || '  ));';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'cache canonicos: ancora esperava 1 ocorrencia, achou %', n; end if;
  v_novo := '(now() at time zone ''America/Sao_Paulo'')::date,' || chr(10)
    || '    coalesce(current_setting(''app.fechamento_competencia_viva'', true), '''')' || chr(10) || '  ));';
  d := replace(d, v_ancora, v_novo);
  execute d;

  -- (1c) fechar_competencia_mensal_automatico seta a flag antes de gravar o snapshot
  d := pg_get_functiondef('public.fechar_competencia_mensal_automatico()'::regprocedure);
  v_ancora := 'perform set_config(''request.jwt.claims'', ''{"role":"service_role"}'', true);';
  n := (length(d) - length(replace(d, v_ancora, ''))) / length(v_ancora);
  if n <> 1 then raise exception 'automatico: ancora esperava 1 ocorrencia, achou %', n; end if;
  d := replace(d, v_ancora, v_ancora || chr(10)
    || '  perform set_config(''app.fechamento_competencia_viva'', format(''%s-%s'', v_ano, v_mes), true);');
  execute d;
end $$;

-- (2) aprovado -> fechado deixa de ser violacao
create or replace function public.proteger_relatorio_coordenacao_final_v4()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if old.dominio in ('relatorio_coordenacao', 'relatorio_coordenacao_ciclo')
     and old.status in ('aprovado', 'fechado', 'retificado') then
    -- transicao do proprio fechamento mensal (fechar_competencia_mensal_canonica_v2)
    if tg_op = 'UPDATE'
       and old.status = 'aprovado' and new.status = 'fechado'
       and new.payload is not distinct from old.payload
       and new.payload_hash is not distinct from old.payload_hash
       and new.dominio is not distinct from old.dominio
       and new.unidade_id is not distinct from old.unidade_id
       and new.ano = old.ano and new.mes = old.mes
       and new.versao is not distinct from old.versao then
      return new;
    end if;
    raise exception 'RELATORIO_COORDENACAO_V4_DOCUMENTO_FINAL_IMUTAVEL: %', old.id
      using errcode = '55000';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;
