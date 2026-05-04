# Regras de Negocio — LA Music

## Leads e Duplicatas
- Mesmo telefone na mesma unidade = duplicata forte (bloqueia criacao)
- Mesmo nome exato + ambos sem telefone na mesma unidade = duplicata fraca (aviso)
- Mesmo nome com telefones diferentes = NAO e duplicata
- Telefone normalizado: prefixo `55` + 10-11 digitos (ex: `5521999999999`)
- Leads arquivados (`arquivado = true`) sao ignorados na busca de duplicatas
- Hook: `src/hooks/useCheckLeadDuplicado.ts`

## Emusys — Variacoes de Estagio
- Emusys envia `estagio_funil.nome` com variacoes: "Novo", "Novo Lead", "Faltou aula experimental", "Experimental Agendada", "Realizou experimental", "Compareceu", "Matriculado"
- Mapeamento completo para NocoDB em `integracao-infra.md` secao "Mapeamento Estagio"

## Pipeline de Etapas (crm_pipeline_etapas)
| ID | Nome | Status correspondente |
|----|------|----------------------|
| 1  | Novo Lead | `novo` |
| 5  | Experimental Agendada | `experimental_agendada` |
| 6  | Visita Escola | `visita_escola` |
| 7  | Experimental Realizada | `experimental_realizada` |
| 8  | Visita Realizada | `experimental_realizada` |
| 9  | Faltou | `experimental_faltou` |
| 10 | Convertido/Matriculado | `convertido` |
| 11 | Arquivado | `arquivado` |

## Transicoes de Etapa
Definidas em `ComercialPage.tsx` (~linha 764):
- **1 (Novo)** → 5 (Exp. Agendada), 6 (Visita Agendada), 10 (Matriculado)
- **5 (Exp. Agendada)** → 7 (Exp. Realizada), 9 (Faltou), 10 (Matriculado)
- **6 (Visita Agendada)** → 8 (Visita Realizada), 9 (Faltou), 10 (Matriculado)
- **7 (Exp. Realizada)** → 10 (Matriculado)
- **8 (Visita Realizada)** → 10 (Matriculado)
- **9 (Faltou)** → 5 (Reagendar Exp.), 6 (Reagendar Visita), 10 (Matriculado)

**Voltar etapa:** 5→1, 6→1, 7→5, 8→6, 9→5. Etapas 1/10/11 nao permitem voltar.

## Filtro por Tab no Funil
- **Leads Atendidos**: `status === 'novo'` (filtrado, nao mostra outros status)
- **Experimentais**: `status.startsWith('experimental')`
- **Visitas**: `status === 'visita_escola'`
- **Matriculas**: `['matriculado', 'convertido']`

## Temperatura de Leads
- Leads novos criados manualmente entram como `quente`
- Campo `temperatura` na tabela `leads` (quente, morno, frio)

## Matricula
- Tipos: `EMLA` (adulto), `LAMK` (kids ate 11 anos)
- Tipos de aluno: `pagante`, `bolsista_integral`, `bolsista_parcial`, `nao_pagante`
- Bolsistas integrais e nao-pagantes nao entram no pipeline comercial
- Matricula pode ser: regular, banda, 2o_curso

## Renovacao
- Rastreada em `movimentacoes_admin` com `tipo = 'renovacao'`
- Compara `valor_parcela_anterior` vs `valor_parcela_novo` (reajuste)
- Meta taxa_renovacao: >= 80%, reajuste_medio: >= 2%

## Evasao (Churn)
- Tipos: `interrompido` (4 subtipos: padrao, bolsista, banda, 2o_curso) ou `transferencia`
- Formula churn: evasoes / (alunos_inicio + novas_matriculas) x 100
- Risco por professor: critico >= 15, alto >= 10, medio >= 5, normal < 5
- Tabela `motivos_saida` com id, nome, categoria, ativo, `conta_score_professor`

## Taxa de Conversao do Professor (>100% Possivel)

A formula `taxa_conversao = matriculas_pos_exp / experimentais * 100` pode passar de 100% por uma assimetria de criterios entre numerador e denominador na RPC `get_kpis_professor_periodo`:

- **Denominador (`experimentais`)**: exige `experimental_realizada = true`
- **Numerador (`matriculas_pos_exp`)**: aceita `experimental_realizada = true` **OU** `(converteu = true AND faltou_experimental IS NOT TRUE)`

**Caso ambiguo** (lead aparece no numerador mas nao no denominador): lead com `data_experimental` no periodo, `experimental_realizada = false`, `faltou_experimental = false`, `status IN ('matriculado', 'convertido')`. Isso ocorre quando:
- Lead matricula antes da experimental acontecer
- Operador esquece de marcar `experimental_realizada = true` no Emusys

Exemplo real: Willian/T1 2026 → 200% de conversao (Carlos Yan matriculou em 15/04 mas a experimental marcada para 16/04 ficou com `experimental_realizada = false`).

**Ferramenta de diagnostico**: `ModalDetalhesConversao` na coluna Conversao da `TabPerformanceProfessores`. Lista todos os leads, classifica em 6 categorias e destaca os "ambiguos" (badge ambar). Permite identificar quais leads precisam ser corrigidos no Emusys ou se a formula da RPC precisa ser ajustada para usar criterios simetricos.

**TODO** (decisao pendente): definir se a fix e operacional (corrigir registros no Emusys) ou de formula (RPC alinhar criterios — `matriculas_pos_exp` exigir tambem `experimental_realizada = true`, com leads "matriculou sem realizar" caindo em `matriculas_diretas`).

## Telefone do Aluno — Fallback para Responsavel (v10)

`processar-matricula-emusys` v10 (deploy 2026-05-01) corrigiu o bug onde alunos LAMK (kids) ficavam sem telefone porque o Emusys envia `telefone_aluno: null` quando so o responsavel tem fone. Agora o INSERT/UPDATE faz fallback:

- **INSERT (novo aluno):** `telefone: p.telefoneAluno || p.telefoneResponsavel`
- **UPDATE (aluno existente):** `telefone: (p.telefoneAluno || p.telefoneResponsavel) || undefined` (preserva valor existente se ambos forem null no payload)

**Sem backfill** — historicos (~830 alunos sem tel) ficam sem ate passarem por algum webhook futuro (renovacao, ajuste). A self-healing acontece naturalmente ao longo de 6-12 meses.

## Score do Professor — Motivos de Evasao
- Campo `conta_score_professor` (bool) em `motivos_saida` controla se o motivo penaliza o professor no score
- Gerenciado em `MotivosScoreConfig.tsx` (Performance > Professores) via toggles
- Criacao/exclusao de motivos em `ConfigPage.tsx` aba "Motivos de Saida"
- **RPC `get_kpis_professor_periodo`**: filtra evasoes por `ms.conta_score_professor = true`. Lookup por FK (`motivo_saida_id`) ou fallback ILIKE em `motivo` (texto). **Motivo NULL sem match = NAO conta** (regra alterada — antes contava por padrao)
- **Edge function `processar-matricula-emusys`**: ao criar evasao/nao_renovacao, faz ILIKE em `motivos_saida` para popular `motivo_saida_id` automaticamente no insert
- **Modais `ModalDetalhesEvasoes` e `ModalDetalhesRetencao`**: coluna "Score" (Conta/Nao conta), card "Contam no Score", filtro por score, indicadores `vinc. por texto` (match por nome) e `sem vinculo` (sem match algum)

## Aviso Previo
- `mes_saida` = dropdown de 6 meses a partir do mes seguinte ao aviso
- Intervencao antecipada antes do churn real
- Campos: data_aviso, mes_saida, valor_parcela, motivo_saida_id

## Trancamento
- Pausa temporaria (NAO e cancelamento)
- Requer `previsao_retorno`, status muda para `trancado`

## Programas Gamificados
- **Matriculador+ (Hunters):** taxa_showup_exp, taxa_exp_mat, taxa_lead_matricula, volume, ticket_medio
- **Fideliza+ (Farmers):** trimestral, 5 criterios (churn, inadimplencia, renovacao, reajuste, vendas_lojinha)

## Permissoes
- Perfis: admin (ve tudo), unidade (restrito a sua unidade)
- RLS ativo no banco. Admin pode ver consolidado
- Funcoes: `hasPermission(codigo)`, `canViewConsolidated()`, `canManageUsers()`

## Timezone
- Sempre BRT (UTC-3) para datas de negocio
