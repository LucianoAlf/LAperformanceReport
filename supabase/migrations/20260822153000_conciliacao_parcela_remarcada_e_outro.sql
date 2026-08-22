-- Conciliacao financeira: dois rotulos novos de decisao.
-- Decisao do Hugo, 2026-08-22.
--
-- O CASO QUE ORIGINOU: Daniel Victor (Barra, matricula 803). A unidade fez um acordo
-- comercial com a responsavel, EXCLUIU a parcela de julho no Emusys e criou outra no fim
-- do contrato (fatura 15338, venc. 20/03/2027). O sync viu a de julho sumir e marcou
-- `source_missing` — comportamento correto e conservador. Mas, na hora de baixar a
-- pendencia, nenhum dos 5 rotulos existentes descrevia o que houve: a equipe seria
-- empurrada para 'conferido_sem_cobranca', que MENTE POR OMISSAO — diz "nao cobrar" sem
-- dizer que a cobranca foi transferida para 2027. Quem lesse depois concluiria que a
-- escola abriu mao do valor. Nao abriu: adiou.
--
-- 'parcela_remarcada' cobre tambem o caso em que a parcela so muda de mes (Davi Lima
-- Quintarelli: julho -> agosto, fatura 14122 viva o tempo todo), que a regra automatica
-- da substituta viva (20260820180349) nao alcanca, porque aquela exige substituta na
-- MESMA competencia com id diferente.
--
-- 'outro' e o escape para o que nao couber. ⚠️ Rotulo generico vira balde: em
-- `motivos_saida` os rotulos "Via Emusys (automacao)" e "Contrato concluido sem
-- renovacao" hoje travam 10 pesquisas de evasao. Revisar periodicamente o que cair em
-- 'outro' e promover a rotulo proprio o que se repetir.
--
-- ⚠️ Os dois limpam APENAS o motivo `source_missing`, como os demais rotulos de caso.
-- NAO entram na regra especial de 'conferido_sem_cobranca', que zera todos os motivos —
-- fatura que tambem tenha problema de vinculo continua pendente por esse outro motivo.
--
-- ⚠️ NAO mexe em `entra_nos_totais`, que segue usando `not source_missing`. A decisao
-- manual nunca altera valor: a fatura ja esta fora dos totais desde que foi marcada.

-- 1) CHECK da tabela: sem isto o INSERT falha mesmo com a RPC aceitando o valor.
alter table public.financeiro_fatura_reconciliacao_decisoes
  drop constraint if exists financeiro_fatura_reconciliacao_decisoes_tipo_decisao_check;

alter table public.financeiro_fatura_reconciliacao_decisoes
  add constraint financeiro_fatura_reconciliacao_decisoes_tipo_decisao_check
  check (tipo_decisao = any (array[
    'pagamento_confirmado'::text,
    'renovacao'::text,
    'trancamento'::text,
    'ultima_parcela_aviso_previo'::text,
    'conferido_sem_cobranca'::text,
    'forma_pagamento_manual'::text,
    'parcela_remarcada'::text,
    'outro'::text
  ]));

-- 2) resolver_reconciliacao_fatura: aceitar os dois valores novos.
do $mig$
declare
  v_def text;
  v_new text;
  v_antigo text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'resolver_reconciliacao_fatura';

  if position('parcela_remarcada' in v_def) > 0 then
    raise notice 'resolver_reconciliacao_fatura ja aceita os rotulos novos';
  else
    v_antigo := '    ''conferido_sem_cobranca'',' || E'\n'
             || '    ''forma_pagamento_manual''' || E'\n'
             || '  ) then';

    if position(v_antigo in v_def) = 0 then
      raise exception 'ancora do enum de tipo_decisao nao encontrada';
    end if;

    v_novo := '    ''conferido_sem_cobranca'',' || E'\n'
           || '    ''forma_pagamento_manual'',' || E'\n'
           || '    ''parcela_remarcada'',' || E'\n'
           || '    ''outro''' || E'\n'
           || '  ) then';

    v_new := replace(v_def, v_antigo, v_novo);
    if v_new = v_def then
      raise exception 'replace do enum nao surtiu efeito';
    end if;
    execute v_new;
  end if;
end $mig$;

-- 3) Filtro de motivos: os rotulos novos tambem limpam `source_missing` da fila.
do $mig$
declare
  v_def text;
  v_new text;
  v_antigo text;
  v_novo text;
begin
  select pg_get_functiondef(p.oid) into strict v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_faturas_alunos_financeiro_v1_contrato_tipo_20260817';

  if position('parcela_remarcada' in v_def) > 0 then
    raise notice 'filtro de motivos ja conhece os rotulos novos';
    return;
  end if;

  v_antigo := '        or ''conferido_sem_cobranca'' = any(v_decisoes)' || E'\n'
           || '      ))';

  if position(v_antigo in v_def) = 0 then
    raise exception 'ancora do filtro de motivos nao encontrada';
  end if;

  v_novo := '        or ''conferido_sem_cobranca'' = any(v_decisoes)' || E'\n'
         || '        or ''parcela_remarcada'' = any(v_decisoes)' || E'\n'
         || '        or ''outro'' = any(v_decisoes)' || E'\n'
         || '      ))';

  v_new := replace(v_def, v_antigo, v_novo);
  if v_new = v_def then
    raise exception 'replace do filtro de motivos nao surtiu efeito';
  end if;
  execute v_new;
end $mig$;
