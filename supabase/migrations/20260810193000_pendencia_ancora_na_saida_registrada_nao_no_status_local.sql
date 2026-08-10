-- Refino do PR #125, no mesmo dia e pelo mesmo motivo de fundo: eu ancorei no NOSSO
-- espelho (`alunos.status`) em vez de na FONTE. O Alf pegou.
--
-- Caso que expos: Anna Klara de Abreu Coutinho (Lohana, fim 03/08). Ela ficou como a
-- unica pendencia porque `alunos.status = 'inativo'`. Na fonte ela e IDENTICA as outras
-- oito -- `motivo_inativa='concluida'`, 43/43 aulas, zero aula futura, `data_saida` NULL --
-- e a tela do Emusys ainda mostra "Concluido - Renovacao Pendente". Os pais avisaram que
-- nao vao renovar, mas ninguem finalizou no Emusys ainda.
--
-- Decisao do Alf (10/08/2026): **esperar a fonte finalizar, nao forcar aqui**. O caminho
-- automatico existe e funciona -- medido nos 25 casos `concluida` sem aula futura dos
-- ultimos 60 dias: 16 estao inativos e **14 deles ja tem a saida registrada sozinha**
-- (webhook `matricula_finalizada` -> `handleFinalizacaoCanonica` -> `handleEvasao`).
--
-- ⚠️ `alunos.status` CORRE NA FRENTE da fonte. Anna Klara prova: local `inativo`, Emusys
-- `Renovacao Pendente`. Usar esse campo como prova de saida era herdar a deriva do espelho.
-- `data_saida` e melhor porque e uma AFIRMACAO POSITIVA -- alguem registrou que a pessoa
-- saiu -- e nao um estado derivado. Nas 9, `data_saida` e NULL em todas.
--
-- ⚠️ Nao afrouxa a governanca: a trava de 45 dias continua e devolve o caso se a renovacao
-- nunca vier. Anna Klara volta em 17/09/2026 se ate la ninguem finalizar no Emusys.
--
-- PARIDADE PROVADA apos aplicar, recriando a versao pre-refino sob outro nome:
--   248 linhas em 7 cenarios | valor_bruto 0 dif | numerador 0 dif | denominador 0 dif
--   publicavel 0 dif | encerramentos_penalizadores 342 -> 342 (identico)
--   estado_base 1 dif (Lohana Leopoldo de Araujo: `ok_com_pendencias` -> `ok`)
--   pendencias somadas nos 7 cenarios: 3 -> 0. No ciclo consolidado: 1 -> 0.
do $mig$
declare
  v_def text;
  v_novo text;
  v_de constant text := E'          and al.status = ''ativo''\n';
  v_para constant text := E'          and al.data_saida is null\n';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_professor_retencao_v3_governada';

  if v_def is null then
    raise exception 'ABORTADO: get_professor_retencao_v3_governada nao encontrada';
  end if;

  if position('motivo_inativa' in v_def) = 0 then
    raise exception 'ABORTADO: a guarda do PR #125 nao esta aplicada; aplicar 20260810180000 antes';
  end if;

  if (length(v_def) - length(replace(v_def, v_de, ''))) / length(v_de) <> 1 then
    raise exception 'ABORTADO: ancora nao bateu exatamente 1x; a funcao mudou desde a leitura';
  end if;

  v_novo := replace(v_def, v_de, v_para);
  v_novo := replace(v_novo,
    '''contrato_concluido_com_aluno_ativo_nao_e_saida_por_ate_45_dias''',
    '''contrato_concluido_sem_saida_registrada_nao_e_saida_por_ate_45_dias''');

  execute v_novo;

  revoke all on function public.get_professor_retencao_v3_governada(date, uuid, text)
    from public, anon, authenticated;
  grant execute on function public.get_professor_retencao_v3_governada(date, uuid, text)
    to service_role;
end
$mig$;
