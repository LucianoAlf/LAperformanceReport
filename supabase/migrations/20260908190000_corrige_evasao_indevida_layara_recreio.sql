-- Layara Sales Magalhães (Recreio, aluno_id 1604) está como EVADIDA no sistema, e não saiu.
--
-- PROVA (medida antes de escrever, nesta ordem):
--   • presença AFIRMADA em 22/08/2026 — dezesseis dias depois da evasão lançada em 06/08;
--   • mensalidades de 08/2026 e 09/2026 PAGAS (R$ 430 cada, matrícula Emusys 1428);
--   • jornada da matrícula 1428: `ativa`, 27 aulas futuras, contrato até 10/04/2027;
--   • aviso prévio lançado em 08/09/2026 pelo próprio Emusys
--     (`emusys_aviso_previo_id` 412), saída prevista 31/10/2026.
-- Ela seguiu estudando e pagando, e só agora avisou que sai — em OUTUBRO.
--
-- É CASO ÚNICO: das 29 saídas de agosto do Recreio, é a única com presença posterior à
-- data de saída. Carlos Yan e Daniel Duque aparecem no sinal financeiro (parcela de
-- setembro paga) mas estão `finalizada` com 0 e 1 aula futura e nenhuma presença depois —
-- parcela paga não é aluno ativo, e por isso o sinal aqui é a PRESENÇA.
--
-- POR QUE ARQUIVAR E NÃO ANULAR: `anulado` significa "existe mas não conta" e é respeitado
-- por `movimentacoes_admin_vigentes` — só que `recalcular_dados_mensais_unguarded` e
-- `get_kpis_alunos_canonicos_base_p01q` leem a TABELA CRUA, então o flag não as alcançaria.
-- Arquivar move a linha e resolve em todos os consumidores de uma vez. Semanticamente
-- também é o certo: esta evasão não deveria existir.
--
-- 🔴 POR QUE NÃO USA `arquivar_movimentacao_admin`: a RPC está QUEBRADA em produção desde
-- 05/09/2026. A migration `20260905180228_saida_emusys_canonica_por_matricula` acrescentou
-- `origem_registro` a `movimentacoes_admin` sem espelhar em `movimentacoes_admin_arquivadas`,
-- e a RPC copia POSICIONALMENTE (`select v_linha.*`) — hoje ela levanta
-- "INSERT has more expressions than target columns". Último arquivamento bem-sucedido:
-- 04/09 16:22. Como o DELETE direto é bloqueado por trigger, a equipe está sem conseguir
-- nem arquivar nem excluir movimentação pela tela. Consertar a RPC é frente própria e
-- NÃO é feito aqui; esta migration copia por NOME, com as guardas abaixo.
--
-- O QUE ESTA MIGRATION NÃO FAZ: não toca no snapshot fechado de agosto/2026, que segue
-- publicando 29 evasões e ticket R$ 433,38. Retificar exigiria mexer no denominador
-- (`alunos_pagantes` 334 -> 335), confirmado de propósito na v8
-- (`fechamento_agosto_2026_recreio_334_pagantes_confirmados`), arrastando churn, ticket e
-- inadimplência numa 10ª versão de um mês já enviado duas vezes ao grupo. Decisão pendente.

do $$
declare
  v_mov public.movimentacoes_admin%rowtype;
  v_presencas_depois integer;
  v_status_atual text;
  v_colunas text;
  v_faltando text;
  v_motivo text := 'Evasao lancada a mao em 06/08/2026 sem saida real: aluna presente em '
    || '22/08, mensalidades de 08 e 09/2026 pagas, 27 aulas futuras na matricula Emusys '
    || '1428 e aviso previo do Emusys em 08/09/2026 para sair em outubro. Inflava as '
    || 'evasoes de agosto do Recreio (29 contra 28 do Emusys). origem_registro da linha: ';
begin
  select * into v_mov from public.movimentacoes_admin where id = 3541;

  if v_mov.id is null then
    raise notice 'CORRECAO_LAYARA: movimentacao 3541 ja nao existe; nada a fazer';
    return;
  end if;

  -- Nunca arquivar às cegas por id: se a linha não for exatamente a que foi investigada,
  -- alguém mexeu nela desde a apuração e a correção precisa ser refeita à mão.
  if v_mov.tipo <> 'evasao'
     or v_mov.aluno_id <> 1604
     or v_mov.data <> date '2026-08-06'
     or v_mov.unidade_id <> '95553e96-971b-4590-a6eb-0201d013c14d' then
    raise exception 'CORRECAO_LAYARA_LINHA_INESPERADA: tipo=%, aluno=%, data=%',
      v_mov.tipo, v_mov.aluno_id, v_mov.data;
  end if;

  -- A prova que sustenta a correção precisa continuar valendo no instante de aplicá-la.
  select count(*) into v_presencas_depois
  from public.vw_presenca_slot_canonica_v1 v
  where v.aluno_id = 1604
    and v.presenca_afirmada = 'presente'
    and v.data_aula > v_mov.data;

  if v_presencas_depois < 1 then
    raise exception 'CORRECAO_LAYARA_SEM_PROVA: nenhuma presenca afirmada apos %', v_mov.data;
  end if;

  -- Cópia por NOME, não por posição: é o que torna esta migration imune ao defeito da RPC.
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into v_colunas
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'movimentacoes_admin'
    and exists (
      select 1 from information_schema.columns d
      where d.table_schema = 'public'
        and d.table_name = 'movimentacoes_admin_arquivadas'
        and d.column_name = c.column_name
    );

  -- Coluna sem espelho na lixeira não passa em silêncio: ela é registrada no motivo, que é
  -- texto livre e sobrevive. Hoje é só `origem_registro`; se aparecer outra, o motivo dirá.
  select string_agg(c.column_name, ', ' order by c.ordinal_position)
    into v_faltando
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'movimentacoes_admin'
    and not exists (
      select 1 from information_schema.columns d
      where d.table_schema = 'public'
        and d.table_name = 'movimentacoes_admin_arquivadas'
        and d.column_name = c.column_name
    );

  if v_faltando is not null then
    raise notice 'CORRECAO_LAYARA: colunas sem espelho na lixeira (vao no motivo): %', v_faltando;
  end if;

  v_motivo := v_motivo || coalesce(v_mov.origem_registro, 'n/d')
    || '. Arquivada por migration porque arquivar_movimentacao_admin esta quebrada '
    || 'desde 05/09/2026 (origem_registro sem espelho na lixeira).';

  execute format(
    'insert into public.movimentacoes_admin_arquivadas (%s, arquivado_em, arquivado_por, arquivado_motivo)
     select %s, now(), %L, %L from public.movimentacoes_admin where id = %s',
    v_colunas, v_colunas, 'migration:20260908190000', v_motivo, v_mov.id
  );

  -- O trigger de bloqueio libera DELETE quando não há claims de JWT (migration/psql/cron).
  delete from public.movimentacoes_admin where id = v_mov.id;
  raise notice 'CORRECAO_LAYARA: evasao 3541 arquivada e removida';

  -- Arquivar a movimentação não mexe em `alunos`; o status volta em separado.
  select status into v_status_atual from public.alunos where id = 1604;
  if v_status_atual is distinct from 'ativo' then
    update public.alunos set status = 'ativo', updated_at = now() where id = 1604;
    raise notice 'CORRECAO_LAYARA: status do aluno 1604 % -> ativo', v_status_atual;
  end if;
end $$;
