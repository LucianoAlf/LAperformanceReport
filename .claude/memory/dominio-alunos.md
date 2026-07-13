# Dominio Alunos — LA Music

## Pagina Principal
- `src/components/App/Alunos/AlunosPage.tsx`
- Tabs: Distribuicao, Importar, Gestao Turmas, Grade Horaria, Sucesso Cliente (Presenca, Feedback, Evasao, Auditoria)

## Tabela Alunos
- `src/components/App/Alunos/TabelaAlunos.tsx`
- Filtros: status, professor, curso
- Edicao inline, historico, anotacoes
- Campos: id, nome, classificacao, idade_atual, data_inicio, data_saida, status, unidade_id, professor_atual_id, valor_parcela

## Status do Aluno
- `ativo` — frequentando normalmente
- `trancado` — pausa temporaria
- `aviso_previo` — vai sair (intervenção possivel)
- `evadido` — saiu (evasao confirmada)
- `nao_renovou` — contrato venceu sem renovacao
- ⚠️ **Status NAO esconde o aluno do banco.** O sync de presenca ignora status (ver integracao-infra.md) e varias queries leem `aluno_presenca` direto. Soft-delete via status é leaky.

## Arquivamento (lixeira) — `alunos_arquivados`
- Criada 2026-05-27 como lixeira **permanente e oficial** para remover matriculas duplicadas/erradas sem perder o dado. Espelha `alunos` (`LIKE alunos INCLUDING DEFAULTS`) + colunas `arquivado_em`, `arquivado_por`, `motivo`.
- **Arquivar** = `INSERT INTO alunos_arquivados SELECT a.*, now(), 'quem', 'motivo' FROM alunos a WHERE id=X` + `DELETE FROM alunos WHERE id=X`.
- **Restaurar** = `INSERT INTO alunos (<cols>) SELECT <cols> FROM alunos_arquivados WHERE id=X`.
- Tirar a linha de `alunos` é o que de fato para o sync de presenca de alimentar o registro. Audit_log tambem guarda `dados_antigos` no DELETE (rede extra).
- **Nao criar mais tabelas `*_backup_<data>`** — usar essa. (As antigas alunos_backup_* e staging_alunos_recreio foram dropadas em 2026-05-27.)

## Gestao de Turmas
- `src/components/App/Alunos/GestaoTurmas.tsx`
- Criar turma: nome, curso, professor, dias, horarios, sala, capacidade
- Distribuir alunos entre turmas/professores
- **Remover aluno da turma**: acao nos modais de detalhe em `AlunosPage.tsx` e `GestaoTurmas.tsx`

## Importacao Emusys
- `src/components/App/Alunos/ImportarAlunos.tsx` — bulk import do Emusys

## Presenca (Attendance)
- `src/components/App/SucessoCliente/PresencaTab.tsx` (modulo Sucesso do Aluno → aba Acompanhamento → subaba Presenca)
- Grade semanal (seg-sab) por aluno com cards por dia
- Status: presente (check), ausente (X), justificado (warning)
- **Filtro por data**: permite selecionar semana especifica
- **Filtro tipo registro** (todas/turma/individual): exibe as 2 visoes da aula (NAO deduplica — proposital, transparencia)
- Sync log com paginacao (tabela `emusys_sync_log`)

### Painel de Faltas do Mes (`FaltasMesSection.tsx` + hook `useFaltasPeriodo.ts`)
- Subaba propria "Faltas" em `TabSucessoAluno` (Acompanhamento). Ranking de alunos faltosos no mes (default: mes passado), alerta por faixa: 2 (amarelo), 3 (laranja), 4+ (vermelho). Filtro min de faltas (default 2), busca, KPIs clicaveis, contato (telefone/whatsapp/responsavel) com copiar.
- **RPC `get_faltas_periodo(p_unidade_id, p_data_inicio, p_data_fim)`**: deduplica a aula duplicada do Emusys via `DISTINCT ON (aluno_id, data_aula, curso_nome)` priorizando `tipo=individual` (fallback turma). Sem dedup a falta CONTA EM DOBRO (cru maio CG 1623 → dedup 893). Filtra `categoria='normal'`, alunos `ativo`/`aviso_previo`. Projeto banda **é incluído** mas retorna flag `is_projeto_banda` → front mostra badge "Banda" (decisão do usuario: sinalizar, nao esconder). Ver [[pendencias-emusys.md]] p/ origem da duplicata.
- Contexto real (maio/Barra, 251 ativos): ~34% com 2+ faltas, 63% com 0–1. Numero alto é dado real (media ~4.8 aulas/mes), nao bug.

### Marcos da Jornada (`MarcosJornadaSection.tsx` + hook `useMarcosJornada.ts`)
- Subaba "Marcos" em `TabSucessoAluno` (Acompanhamento). Segmenta alunos p/ envio de pesquisas (so lista + contato, sem envio integrado). 3 blocos:
  1. **Primeiras aulas**: aluno com `nr_da_aula=1` agendada na janela + `data_matricula >= hoje-45d` + ativo + nao-banda (boas-vindas).
  2. **Marco de aula (so calouros)**: aula `nr=nr_alvo` (input, default 15) na janela + `numero_renovacoes=0` + nao-banda. Selo "Apenas calouros" no front — `nr_da_aula` **reinicia a cada renovação/temporada de banda**, entao so 1º contrato representa "~N/4 meses de escola".
  3. **Prestes a renovar**: le view `vw_renovacoes_proximas` (status_renovacao: vencido/urgente_7/atencao_15/proximo_30), reusa infra de [[regras-negocio.md]].
- **Edge `marcos-jornada`** (v1): busca `/v1/aulas/` FUTURAS (hoje..hoje+janela) on-demand, deduplica individual+turma, resolve aluno reusando matching do `sync-presenca-emusys`. Ignora presença (Emusys pre-marca futuro como 'ausente'). Aulas futuras NAO entram em aluno_presenca (so passado) — ver [[integracao-infra.md]].
- **Exibir != contar**: a grade mostra as 2 visoes; o ranking usa 1 numero deduplicado.

### Fluxo de Sync
1. **Emusys API** (`GET /v1/aulas/`) retorna aulas com presenca individual
2. **Edge Function** `sync-presenca-emusys` processa diariamente (pg_cron 22h BRT)
3. **Tabela `aulas_emusys`**: aula com emusys_id, professor, curso, sala, duracao, alunos
4. **Tabela `aluno_presenca`**: vinculo aluno_id + aula_emusys_id com status presente/ausente
5. **RPC** `atualizar_percentual_presenca` recalcula % por aluno apos sync

### Matching de Alunos
- Nome normalizado (lowercase, sem acentos, sem parenteses)
- Prioriza alunos ativos (`ativo`, `aviso_previo`)
- Inativos sao logados separadamente no sync log
- Nao encontrados: registrados em `nomes_nao_encontrados[]`

### Sync Log
- Tabela `emusys_sync_log` com metricas por unidade/data
- Campos: total_aulas, presentes, ausentes, matched, nao_encontrados, experimentais_count, inativos_count

## Auditoria de Vínculos `emusys_matricula_id`

### Regra: verificar ID + curso, nunca só o ID

Ao auditar se um `emusys_matricula_id` está correto, **sempre cruzar com `emusys_api_payload`** para confirmar que o ID aponta para o curso certo. Verificar apenas se a linha está ativa/encerrada não é suficiente.

**Padrão legítimo (multi-curso):** pessoa com linha encerrada vinculada a ID X e linha ativa vinculada a ID Y. Se X no Emusys = mesmo curso da linha encerrada no banco → ambos os vínculos estão corretos. Não é vínculo errado.

**Vínculo realmente errado:** `emusys_matricula_id` aponta para um contrato de curso diferente do que está em `alunos.curso_id` — detectável cruzando `ep.curso_nome` (emusys_api_payload) com `c.nome` (cursos).

**Query de diagnóstico correto:**
```sql
-- cruza a linha do banco com o que o Emusys diz sobre aquele ID
LEFT JOIN emusys_api_payload ep
  ON ep.emusys_id::text = a.emusys_matricula_id
  AND ep.unidade_codigo = um.codigo
-- vínculo errado = curso no banco ≠ curso no Emusys para o mesmo ID
WHERE lower(unaccent(ep.curso_nome)) != lower(unaccent(c.nome))
```

**Caso real (2026-06-27):** Matheus Alves Tiburcio (Recreio) — banco diz Percussion Kids, ID 1419 no Emusys = Garage Band. Linha evadida, sem impacto operacional.

## Auditoria IA
- `src/components/App/Alunos/Auditoria/RelatorioAuditoria.tsx`
- OpenAI com function calling para insights de alunos

## Automacoes
- `src/components/App/Alunos/Automacao/TabAutomacao.tsx`
- Webhooks n8n para aulas experimentais e matriculas

## Movimentacoes (em AdministrativoPage)
- Renovacao, Nao Renovacao, Aviso Previo, Trancamento, Evasao
- Cada tipo com modal dedicado (`Modal*.tsx`)

## KPIs de Retencao
- alunos_ativos, alunos_pagantes, matriculas_ativas
- renovacoes_previstas/realizadas/pendentes, nao_renovacoes
- ticket_medio, faturamento, churn_rate, ltv_meses, mrr_perdido

## Risco de Evasão (Churn Preditivo) — desde 2026-07-11

- **Modelo**: Random Forest treinado offline em `estudo/pesquisas/churn-alunos/notebooks/01_churn_alunos.ipynb`, exportado pra JS via `m2cgen` → `supabase/functions/calcular-risco-evasao/model.ts` (pesos embutidos, ~35k linhas). Validado contra o notebook Python em `validate_port.py` (0 divergências no port).
- **Feature engineering (SQL)**: RPC `features_churn_alunos_ativos()` (migration `20260711120000_features_churn_alunos_ativos.sql`, `SECURITY DEFINER`, só `service_role`). Por aluno `status='ativo' AND arquivado_em IS NULL`:
  - Numéricas (12): `idade_atual`, `tempo_permanencia_meses`, `valor_parcela`, `pct_desconto` (desconto/valor_cheio, 0 se valor_cheio≤0), `numero_renovacoes`, `dias_desde_renovacao` (NULL se nunca renovou), `nunca_renovou` (flag), `taxa_presenca_geral/60d/30d` (0 se sem aula no período), `dias_desde_ultima_aula` (NULL se sem aula), `dia_vencimento`.
  - Categóricas (10): `classificacao`, `modalidade`, `tipo_aluno`, `status_pagamento`, `tipo_matricula_nome`, `canal_origem_nome`, `forma_pagamento_nome`, `is_segundo_curso`, `is_aluno_retorno`, `anamnese_preenchida` (booleanos viram string `'True'/'False'`, mesmo formato do `str(bool)` do pandas usado no treino).
  - Presença: só status `'presente'` conta; janelas 60d/30d relativas a `CURRENT_DATE`.
- **Edge `calcular-risco-evasao`** (`index.ts`): cron diário → pagina `features_churn_alunos_ativos()` em blocos de 1000 (PostgREST corta em 1000/página, sem isso alunos são descartados em silêncio) → `buildVector` (`preprocessing.ts`) → `score()` (probabilidade churn = `p_churn/(p_ativo+p_churn)`) → `faixaRisco()` (`contract.ts`) → upsert em `risco_evasao` por `(aluno_id, calculado_em, modelo_versao)` — múltiplas versões de modelo coexistem, permite comparação. Aceita body `{dry_run:true}` (calcula e devolve resumo/top10 sem gravar).
- **"Fatores"** (JSON por linha): não é SHAP — é importância global do modelo (`FEATURE_IMPORTANCE` em `contract.ts`) cruzada com o valor cru do aluno, sinal `ok`/`atencao`/`risco`/`neutro` por limiar simples (ex: presença <50%=risco, dias desde última aula >14=risco, status_pagamento='inadimplente'=risco). Só cobre as 5 features de presença/pagamento, não as 17 restantes.
- **Fonte canônica de leitura**: `vw_risco_evasao_atual` (não ler `risco_evasao` bruta — ela é histórico bruto por dia). Consumida por `TabSucessoAluno.tsx` (coluna "Risco de Evasão IA").
- **Gaps conhecidos** (vs. práticas de churn de mercado): não separa voluntário/involuntário (competing risks — evasão por inadimplência e por desmotivação tratadas como um único evento); sem matriz de custo-benefício/valor esperado nas ações de retenção; sem survival analysis (LTV é média, não curva); a feature engineering é acoplada ao modelo (`SECURITY DEFINER` só `service_role`), não é uma assinatura do aluno genérica reutilizável por upsell/RFM.

## Hooks Relacionados
- `useEvasoesData` — agregacao por mes, motivo, professor, unidade
- `useKPIsRetencao` — KPIs consolidados de retencao
- `useFidelizaPrograma` — programa gamificado Fideliza+
- `useDadosMensais` — snapshots mensais
- `useHealthScore` — presenca = 15% do health score do aluno
