-- "Concluido - Renovacao Pendente" NAO e uma saida sem motivo (Alf, 10/08/2026).
--
-- O contador `encerramentos_pos_corte_pendentes` pergunta "o periodo encerrou e nao tem
-- motivo de saida?". A pergunta certa e "o ALUNO saiu?". Sao coisas diferentes: o periodo
-- do professor encerra quando a JORNADA acaba (ultima aula do contrato), e o aluno segue
-- matriculado aguardando renovacao. E o mesmo erro de categoria que o CP8 corrigiu para
-- troca de professor, agora no fim de contrato.
--
-- Medido em producao antes de aplicar (ciclo 2026-JUN-AGO, consolidado):
--
--   as 9 pendencias    | as 19 penalizadoras `concluida`
--   -------------------+--------------------------------
--   8 de 9 aluno ATIVO | 19 de 19 aluno INATIVO
--   3 a 7 dias do fim  | 32 a 69 dias do fim
--   0 saida registrada | 14 de 17 com saida registrada
--
-- O corte e limpo e a variavel que separa e o ESTADO DO ALUNO, nao o tempo. As 19
-- penalizadoras sao nao-renovacao de verdade e continuam penalizando: o numero da
-- retencao NAO muda com esta migration (provado por assinatura md5 antes/depois).
--
-- ⚠️ O motivo estava na origem e nunca tinha sido lido. `GET /matriculas` devolve
-- `motivo_inativa`, com exatamente dois valores no banco inteiro:
--     interrompida  3.240  -> parou no meio do contrato = SAIDA
--     concluida       409  -> cumpriu ate a ultima aula = FIM DE JORNADA
-- Nas 9 pendencias, `nr_aulas_passadas = nr_aulas_contratadas` (40/40, 43/43, 45/45,
-- 50/50) e `motivo_inativa = 'concluida'`. O Emusys ja dizia que ninguem tinha saido.
-- E o mesmo padrao das outras correcoes desta frente: ancorar no id/estado da FONTE em
-- vez de derivar. Nao inventamos regra — passamos a ler a que ja existia.
--
-- ⚠️ TRAVA DE 45 DIAS, de proposito. Sem ela, um aluno que ficasse eternamente "ativo"
-- sem renovar sumiria da governanca para sempre. 45 dias nao e numero escolhido a esmo:
-- e a MESMA janela que `vw_professor_periodos_baseline_v3_sombra` ja usa para aceitar uma
-- movimentacao de saida como evidencia (`s.data between data_fim-45 and data_fim+45`).
-- Alarmar antes disso e alarmar antes de a evidencia poder existir; depois disso, volta
-- a ser pendencia legitima. Nada e escondido — so adiado ate ser acionavel.
--
-- ⚠️ NAO mexe em `encerramentos_penalizadores`. Pos-corte ele ja exige
-- `atribuicao_confirmada is true`, que renovacao pendente nunca tem. Pre-corte e historico
-- fechado (so alcanca periodos terminados antes de 03/08) e as 19 medidas ali sao saidas
-- reais. Mexer mudaria numero publicado sem corrigir erro nenhum.
--
-- ⚠️ Os JOINs sao seguros para os contadores: `aluno_jornada_matricula_disciplina` e 1:1
-- no par (unidade_id, emusys_matricula_disciplina_id) — verificado, 0 duplicatas — e
-- `alunos` entra pela PK. Ainda assim todos os contadores usam
-- `count(distinct pe.periodo_chave)`, entao duplicacao futura nao inflaria contagem.
--
-- PARIDADE PROVADA apos aplicar, recriando a versao anterior sob outro nome e comparando
-- linha a linha em 7 cenarios (ciclo consolidado + 3 unidades, mensal jun/jul/ago):
--   248 linhas | valor_bruto 0 dif | numerador 0 dif | denominador 0 dif | publicavel 0 dif
--   estado_base 4 dif e confianca 4 dif -> Fabricio Costa de Oliveira e Matheus dos Santos
--   Silva de Oliveira saem de `ok_com_pendencias` para `ok` (valor_bruto igual: 87,50 /
--   86,67 / 100,00). Pendencias somadas nos 7 cenarios: 27 -> 3.
--
-- ⚠️ Editada via pg_get_functiondef + replace com guarda de unicidade, padrao do projeto
-- (mesma tecnica do CP8). O arquivo `20260727120000_..._universo_governado.sql` NAO e
-- alterado — e ele que os testes de contrato leem. Reaplicar aquela migration desfaz
-- esta; se isso acontecer, reaplicar esta em seguida.
do $mig$
declare
  v_def text;
  v_novo text;
  v_de_join constant text := E'  from periodos pe\n  cross join params p\n  left join public.motivos_saida ms on ms.id = pe.motivo_saida_id\n  group by\n';
  v_para_join constant text := E'  from periodos pe\n  cross join params p\n  left join public.motivos_saida ms on ms.id = pe.motivo_saida_id\n  left join public.aluno_jornada_matricula_disciplina j\n    on j.unidade_id = pe.unidade_id\n   and j.emusys_matricula_disciplina_id = pe.emusys_matricula_disciplina_id\n  left join public.alunos al on al.id = pe.aluno_id\n  group by\n';
  v_de_filtro constant text := E'        )\n    )::integer as encerramentos_pos_corte_pendentes\n';
  v_para_filtro constant text := E'        )\n        and not (\n          coalesce(j.motivo_inativa, '''') = ''concluida''\n          and al.status = ''ativo''\n          and (pe.data_fim at time zone ''America/Sao_Paulo'')::date\n            > current_date - 45\n        )\n    )::integer as encerramentos_pos_corte_pendentes\n';
  v_de_doc constant text := E'    ''troca_de_professor'', ''nao_e_encerramento_de_retencao'',\n';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_professor_retencao_v3_governada';

  if v_def is null then
    raise exception 'ABORTADO: get_professor_retencao_v3_governada nao encontrada';
  end if;

  if position('motivo_inativa' in v_def) > 0 then
    raise exception 'ABORTADO: guarda de renovacao pendente ja aplicada';
  end if;

  if (length(v_def) - length(replace(v_def, v_de_join, ''))) / length(v_de_join) <> 1
     or (length(v_def) - length(replace(v_def, v_de_filtro, ''))) / length(v_de_filtro) <> 1
     or (length(v_def) - length(replace(v_def, v_de_doc, ''))) / length(v_de_doc) <> 1 then
    raise exception 'ABORTADO: ancoras nao bateram exatamente 1x; a funcao mudou desde a leitura';
  end if;

  v_novo := replace(v_def, v_de_join, v_para_join);
  v_novo := replace(v_novo, v_de_filtro, v_para_filtro);
  v_novo := replace(v_novo, v_de_doc,
    v_de_doc || E'    ''renovacao_pendente'', ''contrato_concluido_com_aluno_ativo_nao_e_saida_por_ate_45_dias'',\n');

  execute v_novo;

  -- ACL: recriar funcao reabre EXECUTE para `anon` neste projeto
  -- (ALTER DEFAULT PRIVILEGES). `revoke from public` nao basta — precisa ser nominal.
  revoke all on function public.get_professor_retencao_v3_governada(date, uuid, text)
    from public, anon, authenticated;
  grant execute on function public.get_professor_retencao_v3_governada(date, uuid, text)
    to service_role;
end
$mig$;
