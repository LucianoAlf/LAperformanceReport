-- [RECUPERADA DO HISTORICO 2026-08-22, issue #201] Migration aplicada em producao
-- (via CLI/MCP) sem arquivo versionado. SQL extraido de supabase_migrations.
-- schema_migrations (statements como aplicados). NAO REAPLICAR: ja esta no
-- schema_migrations com esta mesma version.

-- Reverte as colunas valor_mensalidade_emusys e desconto_condicional_emusys criadas
-- horas antes nesta mesma data. Foram um erro de analise: a divergencia de valor entre
-- o Emusys e o nosso cadastro JA e tratada pela Conciliacao Emusys
-- (matriculas_divergencias, tipo_divergencia='valor_divergente', campo='valor_parcela'),
-- que tem fila, aprovacao humana e fixacao de campo. Persistir o valor de novo na
-- jornada duplicava essa feature.
--
-- O consumo que motivou as colunas -- o icone de divergencia ao lado da parcela na
-- Lista de Alunos -- foi removido da tela no mesmo commit: ele comparava o valor CHEIO
-- da API contra alunos.valor_parcela, que e o LIQUIDO, acendendo alerta falso em 747
-- de 1171 matriculas ativas (todo aluno com desconto condicional).
--
-- inadimplente_emusys, nr_faturas, data_primeira_fatura e dia_vencimento_emusys
-- PERMANECEM -- essas sao usadas (banner de inadimplencia e aba Contratos).
--
-- Seguro: nenhuma edge deployada escreve nelas (sync-matriculas-emusys v74 e
-- processar-matricula-emusys v70 verificados apos redeploy) e nenhum consumidor le.

alter table public.aluno_jornada_matricula_disciplina
  drop column if exists valor_mensalidade_emusys,
  drop column if exists desconto_condicional_emusys;
