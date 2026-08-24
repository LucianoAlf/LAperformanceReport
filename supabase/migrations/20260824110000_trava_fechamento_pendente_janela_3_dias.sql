-- CORREÇÃO URGENTE da trava `fechamento_pendente_dia_anterior` (20260822230000).
-- Incidente: 24/08/2026 08:00 — as TRÊS unidades ficaram sem abrir o caixa.
--
-- O ERRO DE DESENHO (meu, na migration de 22/08): a trava procura QUALQUER caixa
-- anterior com `status='aberto'`, sem limite de idade. Só que existe um passivo
-- histórico de caixas que ninguém fechou — Recreio 10 (desde 10/06), Barra 7, CG 5.
-- Resultado: a primeira abertura depois da trava entrar foi recusada em todas as
-- unidades, com a Sol dizendo apenas "não consegui abrir" (o runtime ainda não trata
-- o motivo novo). Operação parada numa segunda de manhã.
--
-- Eu validei a trava reproduzindo o incidente da Barra (dia imediatamente anterior) e
-- não conferi o passivo histórico — o cenário que quebrou é justamente o que o teste
-- sintético não tinha. Mesma lição das 3 rodadas do composto: dado real primeiro.
--
-- A CORREÇÃO: a trava passa a valer só para pendência RECENTE (3 dias corridos), que é
-- o caso que ela existe para pegar — fechamento esquecido ontem/sexta contamina o
-- carry-over de hoje. Caixa aberto de junho/julho é passivo contábil a resolver por
-- decisão humana, não motivo para travar a operação do dia.
--   • sexta esquecida → segunda: 3 dias (sáb+dom+seg) → BLOQUEIA ✅ (caso real da Barra)
--   • caixa de 11 dias atrás → NÃO bloqueia (abre normal e reporta)
-- O retorno de sucesso agora carrega `pendencias_antigas` (quantidade + data mais
-- recente) para a Sol poder avisar no grupo sem impedir a abertura.

do $mig$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'sol_caixa_abrir';

  if position('JANELA_PENDENCIA_DIAS' in v_def) > 0 then
    raise notice 'janela ja aplicada';
    return;
  end if;

  -- 1) a busca da pendência ganha janela de 3 dias
  v_new := replace(v_def,
    $$     where cd.unidade_id=v_unidade and cd.data_caixa<v_data and cd.status='aberto'
     order by cd.data_caixa desc limit 1;$$,
    $$     where cd.unidade_id=v_unidade and cd.data_caixa<v_data and cd.status='aberto'
       and cd.data_caixa >= v_data - 3  -- JANELA_PENDENCIA_DIAS: so pendencia recente trava
     order by cd.data_caixa desc limit 1;$$);

  if v_new = v_def then
    raise exception 'ancora da busca de pendencia nao encontrada';
  end if;

  -- 2) sucesso reporta o passivo histórico sem bloquear
  v_new := replace(v_new,
    $$  return jsonb_build_object('ok',true,'caixa_diario_id',v_caixa,'saldo_inicial',v_saldo,'data',v_data);$$,
    $$  return jsonb_build_object('ok',true,'caixa_diario_id',v_caixa,'saldo_inicial',v_saldo,'data',v_data)
    || (select case when count(*) = 0 then '{}'::jsonb else jsonb_build_object('pendencias_antigas',
           jsonb_build_object('quantidade', count(*), 'mais_recente', max(cd2.data_caixa))) end
        from public.caixas_diarios cd2
        where cd2.unidade_id = v_unidade and cd2.status = 'aberto' and cd2.data_caixa < v_data);$$);

  if position('pendencias_antigas' in v_new) = 0 then
    raise exception 'ancora do retorno de sucesso nao encontrada';
  end if;

  execute v_new;
end $mig$;
