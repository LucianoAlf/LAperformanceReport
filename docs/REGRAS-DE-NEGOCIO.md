# Regras de Negócio — LA Music Performance Report

> **Documento único e consolidado.** Reúne as regras de negócio de todos os âmbitos da empresa traduzidos no LA Music Performance Report: alunos e matrículas, financeiro, retenção, comercial (leads e experimentais), professores, salas, sucesso do aluno, relatórios e programas gamificados.
>
> **Data de consolidação:** 2026-08-08
> **Método:** cada regra foi conferida em três camadas — documentação existente, código-fonte (`src/`, `supabase/functions/`, migrations) e **banco de produção ao vivo** (SELECT-only). Nada foi alterado no banco.
> **Números de referência:** medidos em 2026-08-08 (ver §12).

---

## Índice

1. [Como usar este documento](#1-como-usar-este-documento)
2. [Conceitos-base](#2-conceitos-base)
3. [Alunos e matrículas](#3-alunos-e-matrículas)
4. [Financeiro](#4-financeiro)
5. [Retenção](#5-retenção)
6. [Comercial — leads, experimentais e funil](#6-comercial--leads-experimentais-e-funil)
7. [Professores](#7-professores)
8. [Salas e turmas](#8-salas-e-turmas)
9. [Sucesso do Aluno](#9-sucesso-do-aluno)
10. [Relatórios e fechamento mensal](#10-relatórios-e-fechamento-mensal)
11. [Programas gamificados](#11-programas-gamificados)
12. [Referência de aceite](#12-referência-de-aceite-2026-08-08)
13. [Divergências resolvidas nesta consolidação](#13-divergências-resolvidas-nesta-consolidação)
14. [Pendências abertas](#14-pendências-abertas)
15. [Governança e travas de segurança](#15-governança-e-travas-de-segurança)

---

## 1. Como usar este documento

### Hierarquia de autoridade

Quando duas fontes discordam, vale nesta ordem:

1. **Regra validada pelo Alf** — canônica.
2. **Este documento.**
3. **Banco de produção**, conferido com SELECT-only.
4. **Código-fonte** — evidência, não verdade.
5. **Documento antigo divergente** — legado.

> Documento antigo divergente = legado. Código divergente = possível bug. Regra validada pelo Alf = canônica.

Sujeira de banco, fallback antigo ou comportamento legado **nunca** viram regra oficial.

### Legenda de status

| Marca | Significado |
|---|---|
| ✅ | Validada pelo Alf **e** confirmada no banco ao vivo |
| ✔️ | Validada pelo Alf (documental); implementação não verificada linha a linha |
| 📋 | Implementada e verificada no banco/código, sem validação verbal explícita |
| ⚠️ | Divergente ou pendente — não usar como canônica sem decisão |
| 🚫 | Legado — não usar |

### Antes de escrever qualquer query, KPI ou relatório

- [ ] Se conta "alunos": é **pessoa** (dedup) ou **matrícula** (linha)? — §2.1
- [ ] Se conta "pagantes": exclui bolsista integral, bolsista parcial, banda, coral e 2º curso do denominador? — §4.2
- [ ] Se conta evasão: usa `movimentacoes_admin` com `tipo IN ('evasao','nao_renovacao')`? — §5.1
- [ ] Se é retenção: aplicou o filtro de atividade extra (`is_atividade_extra_curso`)? — §3.5
- [ ] Se conta experimental: usa a data da **experimental**, não a data do lead? — §6.3
- [ ] Se lê competência encerrada: usa `fechamento_mensal_snapshots`, não cálculo vivo? — §10.1
- [ ] Não executou DDL, migration, backfill ou cron sem aprovação do Alf? — §15

---

## 2. Conceitos-base

### 2.1 Pessoa ≠ matrícula ✅

**`alunos` armazena matrículas, não pessoas.** Uma pessoa com 2 cursos tem 2 linhas.

- 1 pessoa = 1 matrícula principal (`is_segundo_curso = false`) + N adicionais (`is_segundo_curso = true`).
- **Base "alunos ativos" = PESSOAS** (deduplicado).
- **Base "matrículas ativas" = REGISTROS** (linhas). Sempre ≥ alunos ativos.
- 🚫 `COUNT(*)` sobre `alunos` para contar ativos/pagantes é bug — duplica quem tem 2+ cursos.

### 2.2 Identidade da pessoa ⚠️

Existem **duas identidades convivendo** hoje, em RPCs canônicas diferentes:

| Onde | Chave | Fonte |
|---|---|---|
| KPIs de alunos (`get_kpis_alunos_admin_operacional_impl_v2`) | `'emusys:' + emusys_student_id`, fallback `'local:' + alunos.id` | Identidade Emusys |
| Financeiro (`get_kpis_alunos_financeiro_vivo_canonico`) | `lower(btrim(nome)) + '|' + unidade_id` | Nome + unidade |

**Regra atual:** a identidade preferencial é a do **Emusys** (`emusys_student_id`). Quando ela não existe, a linha fica isolada pelo ID local e é contada em `linhas_identidade_pendente`, com cobertura publicada em `identidade_emusys_cobertura_pct`.

⚠️ Enquanto o financeiro não migrar, **alunos pagantes contados pelo módulo de Alunos e pelo módulo Financeiro podem divergir** para homônimos ou para quem não tem identidade Emusys. Ver §14.

**Atenção com nome:** `nome` sozinho colide. Dois "João Silva" na mesma unidade podem ser a mesma pessoa ou não — exige checagem humana.

### 2.3 Unidades e timezone 📋

- Três unidades: **Campo Grande**, **Recreio**, **Barra**.
- **Timezone de negócio: BRT (UTC−3).** Sempre aplicar o offset. Nunca usar `new Date().toISOString().slice(0,10)` para data de negócio — depois das 21h BRT o UTC já virou o dia.

### 2.4 Competência

Competência = mês/ano do fato de negócio. Um evento lançado em agosto referente a setembro pertence a **setembro**, não a agosto. Isso vale especialmente para renovação antecipada (§5.6) e aviso prévio (§5.3).

---

## 3. Alunos e matrículas

### 3.1 Estado operacional da matrícula ✅

Fonte canônica: `vw_alunos_estado_operacional_v131`, resolvida por `unidade_id + emusys_matricula_id`. O campo local `alunos.status` é **apenas fallback** de compatibilidade e fica defasado.

| Estado no Emusys | Estado operacional | Efeito |
|---|---|---|
| `ativa` | `ativo` | entra na base viva |
| `trancada` | `trancado` | aparece em "Trancados agora", **fora** dos denominadores ativos |
| `inativa` + `interrompida` | `evadido` | interrupção definitiva |
| `inativa` + `concluida` | `inativo` | contrato concluído / não renovação — **não é evasão** |
| ausente ou ambíguo | `desconhecido` | auditoria; **nunca** presume ativo nem evasão |

Só matrícula resolvida como `ativa` entra nos denominadores de base viva, carteira, presença, Health Score e churn. **Exceção financeira explícita:** o radar de faturas vencidas inclui a pessoa com matrícula atual `ativa` ou `trancada`, porque o trancamento temporário mantém a parcela do mês (§4.6 e cláusula contratual 6.1).

### 3.1.1 Conciliação de matrícula: domínio certo, decisão auditável ✅

A chave de identidade é sempre `unidade_id + emusys_matricula_id`; nome, telefone e curso nunca escolhem um aluno por aproximação.

- O sync atualiza diretamente no cadastro canônico, quando o campo não foi fixado por decisão humana: telefone, e-mail, responsável, telefone do responsável, foto e Instagram.
- `auto_preview`/“Sync grade” é reservado exclusivamente para divergências reais de **curso, professor, dia ou horário**. A sugestão não altera a grade sem decisão humana.
- Forma/status de pagamento pertencem à conciliação financeira; valores e situação contratual têm seus próprios tipos de divergência. Nenhum deles pode reaparecer como sugestão de grade.
- Ao informar a forma de pagamento no LA Report, a decisão fica fixada e auditada. Um sync posterior incompleto do Emusys não a sobrescreve nem reabre a pendência.
- Reclassificações preservam o payload original e a decisão em auditoria; a plataforma não apaga histórico para “limpar” a fila.

### 3.2 Aluno ativo ✅

**Pessoa** com pelo menos uma matrícula que satisfaça, ao mesmo tempo:

```
entra_base_ativa = true      (estado Emusys = ativa)
AND é matrícula acadêmica     (NÃO é banda, NÃO é coral)
```

- Deduplicado pela identidade da pessoa (§2.2).
- **Trancado NÃO conta como ativo.**
- ✅ **Quem tem apenas banda ou apenas coral não conta como aluno ativo.** Banda e coral são *atividades extras* — para fazê-las o aluno precisa ser aluno de um curso regular. Contam em cards próprios (`matriculas_banda`, `matriculas_coral`), nunca na base ativa.
  - Verificado em 2026-08-08: 4 pessoas em Campo Grande caem nessa condição, todas legítimas — 1 aluno regular **trancado** cuja banda seguiu ativa e 3 **bolsistas integrais de banda/Power Kids** (categoria já tratada à parte). Nenhum pagante entra na base só por atividade extra.

### 3.3 Matrículas ativas ✅

**Base = registros/vínculos**, não pessoas. Inclui curso regular, 2º curso, banda, coral, bolsistas integrais/parciais e pagantes. Pode (e deve) ser maior que alunos ativos.

### 3.4 Segundo curso ✅

- `is_segundo_curso = true`. Mesma pessoa, **curso diferente** do principal. Cada linha tem `curso_id`, professor, turma e presenças próprios.
- A linha principal (`is_segundo_curso = false`) é única por pessoa.
- **Duas linhas com o MESMO `curso_id` da mesma pessoa NÃO são duplicata por si só.**
  - ✅ **Critério canônico (Alf, 2026-06-07; refinado em 2026-08-19):** só é duplicata quando coincidem **curso + professor + horário**. Se qualquer um dos três difere, são vínculos legítimos e pagos separadamente.
  - Casos legítimos medidos em 2026-08-19: **Vitória da Silva Nobre** (Canto IND, mesmo professor, Quarta 15h **e** Quinta 16h), **Vicente Pereira Costard** (Musicalização Prep., mesmo professor, Segunda 09h **e** 10h) e **Vinícius Lopa** (três Power Kids na Terça 17h com **três professores diferentes** = três bandas).
  - ✅ **Banda/Power Kids (Alf, 2026-08-19):** o aluno **pode** ter duas matrículas de Power Kids — "Power Kids é a banda e ele pode tocar em duas bandas diferentes". Turma e professor distintos bastam.
  - ⚠️ **A chave no banco é `idx_alunos_duplicata_matricula_unique`** `(unidade_id, nome, curso_id, professor_atual_id, horario_aula)` parcial em linha viva. Substituiu `idx_alunos_telefone_unidade_nome_curso_unique`, que usava **telefone** na chave e por isso **barrava o caso legítimo** — a mesma pessoa repete o telefone nas duas linhas, então o telefone vindo do Emusys era recusado pelo banco. Auditado em 19/08: **zero** duplicata ativa pelo critério real.
  - ⚠️ **Antes de chamar algo de duplicata, conferir dia/horário ATUALIZADOS.** Em 19/08 o único grupo que parecia duplicata (Gabriel Teixeira Nogueira, Guitarra) tinha as duas linhas com "Segunda 18h" por defasagem local; o Emusys mostrava turmas `G_Ter_14` e `G_Seg_17` — duas aulas reais.
- Segundo curso **não duplica a pessoa** em alunos ativos nem no denominador de pagantes/ticket.
- Segundo curso **entra** no numerador de MRR e de ticket médio (§4.4).

### 3.5 Atividade extra: banda e coral ✅

Atividade extra é curso que o aluno faz **além** do curso regular. **Não é cobrada e não conta como aluno pagante.** Banda e Canto Coral seguem a mesma regra.

Função canônica no banco: **`is_atividade_extra_curso(curso_id)`** — usada para filtrar retenção.

Retorna `true` quando o curso satisfaz qualquer uma:

```
cursos.is_projeto_banda = true
OR nome ILIKE '%canto coral%'
OR nome ILIKE '%power kids%'
OR nome ILIKE '%minha banda%'
OR nome ILIKE '%garageband%'
OR nome ILIKE '%percussion kids%'
```

Efeitos da atividade extra:
- **Excluída** de: alunos ativos, alunos pagantes, ticket médio, MRR, LTV, churn, médias de turma, carteira do professor, score do professor, matrículas novas canônicas.
- **Contada** separadamente em `matriculas_banda` e `matriculas_coral`.
- Movimentações (evasão, renovação, não renovação) de atividade extra **não entram na retenção** — é o que `is_movimentacao_admin_retencao_valida` garante.
- Bolsista de banda/projeto é tratado à parte e **não infla o número de bolsistas regulares**.

⚠️ **O critério técnico de "coral" ainda não é único** — hoje há 4 variantes rodando (§14, pendência P1). A regra de negócio é clara; a implementação é que precisa ser padronizada.

### 3.6 Tipos de matrícula ✅

Tabela `tipos_matricula` — flags conferidas no banco em 2026-08-08:

| Código | Nome | Pagante | Ticket médio | LTV | Churn |
|---|---|:--:|:--:|:--:|:--:|
| `REGULAR` | Regular | ✔ | ✔ | ✔ | ✔ |
| `SEGUNDO_CURSO` | Segundo Curso | ✔ | ✔ | ✔ | ✔ |
| `BOLSISTA_INT` | Bolsista Integral | ✘ | ✘ | ✘ | ✘ |
| `BOLSISTA_PARC` | Bolsista Parcial | ✘ | ✘ | ✘ | ✘ |
| `BANDA` | Matrícula em Banda | ✘ | ✘ | ✘ | ✘ |
| `TRANSFERENCIA` | Transferência Interna | ✔ | ✔ | ✔ | ✔ |

> **A classificação de bolsista em KPI/MRR usa `tipo_matricula_id`, nunca o `tipo_aluno` legado** — este último está contaminado (aluno marcado `bolsista_integral` que é pagante regular no contrato).

### 3.7 Bolsistas ✅

- **Bolsista integral:** 100% de desconto. Não é pagante, não entra em ticket/MRR/LTV/churn, não entra no pipeline comercial.
- **Bolsista parcial:** paga, mas **não conta como pagante e não entra no ticket médio** (validado pelo Alf, P5; confirmado no banco: `conta_como_pagante = false`).
- Cards de bolsistas integrais e parciais são separados no dashboard.

### 3.8 Kids / School ✅

Por **idade**, sobre a mesma base de alunos ativos:

- `idade_atual <= 11` → **LAMK / LA Music Kids**
- `idade_atual >= 12` → **EMLA / LA Music School**
- `idade_atual IS NULL` → **Sem classificação**

**`Kids + School + Sem classificação` deve fechar exatamente com `alunos_ativos`.**

⚠️ Não usar o campo textual `classificacao` como fonte — pode estar desatualizado.

### 3.9 Arquivamento — lixeira oficial 📋 ⚠️ DESTRUTIVO

- Tabela `alunos_arquivados` (espelha `alunos` + `arquivado_em`, `arquivado_por`, `motivo`).
- **Arquivar** = `INSERT INTO alunos_arquivados SELECT ...` + `DELETE FROM alunos WHERE id = X`.
- **Nunca criar tabelas `*_backup_<data>`.**
- **Tirar a linha de `alunos` é o único jeito de parar o sync de presença** — o sync casa aula↔aluno por nome+curso e **ignora `status`**. Soft-delete via status é leaky.
- 🚫 **A operação inclui `DELETE FROM alunos`. Não executar sem autorização explícita do Alf.**

### 3.10 Telefone do aluno 📋

`telefone_aluno` no Emusys costuma ser `null` para kids. Fallback obrigatório:
- **INSERT:** `telefone = telefoneAluno || telefoneResponsavel`
- **UPDATE:** preserva o valor existente se ambos vierem `null` no payload.

### 3.11 Vínculo professor ↔ aluno 📋

**Quando o aluno sai, `professor_atual_id` NÃO é zerado** — o vínculo histórico é mantido.

Consequência: toda query de carteira/score/KPI precisa filtrar o status.

- **Aluno órfão:** `professor_atual_id IS NULL` e ativo → bug de cadastro.
- **Aluno fantasma:** `professor_atual_id` preenchido e não-ativo → vínculo histórico legítimo.

---

## 4. Financeiro

### 4.1 Valor da parcela (mensalidade) ✅

**Fórmula canônica (desde 2026-06-23):**

```
valor_parcela = valor_cheio − desconto_condicional
```

- `valor_cheio` = `contrato_atual.valor_mensalidade` da API Emusys.
- `desconto_condicional` é subtraído (inclui a bolsa, no caso de bolsista parcial).
- **`desconto_fixo` NÃO entra na parcela** — é desconto de pontualidade, auditado à parte em `alunos.desconto_fixo`.
- `liquido_financeiro = cheio − fixo − condicional` existe **apenas para auditoria**, não é a parcela comercial.
- Parcela ≤ 0 ou cheio ≤ 0 → fila `valor_divergente` (revisão humana).
- 🚫 Regra anterior (`cheio − fixo − cond`), vigente até 22/06/2026, é **obsoleta**.

### 4.2 Aluno pagante ✅

**Por PESSOA**, não por matrícula. A pessoa é pagante quando tem ao menos uma matrícula com:

```
entra_base_ativa = true
AND é matrícula acadêmica (não banda, não coral)
AND tipos_matricula.entra_ticket_medio = true
AND valor_parcela > 0
AND tipo_matricula NOT IN ('BOLSISTA_INT', 'BOLSISTA_PARC', 'BANDA')
```

- Aluno com múltiplos cursos conta como **1 aluno pagante**.
- Bolsista integral e bolsista parcial **não** contam.
- Inadimplente **conta** como pagante (é base faturável do mês, não "quem pagou").

### 4.3 MRR ✅

```
MRR = Σ valor_parcela das matrículas pagantes elegíveis, agrupado por pessoa
```

- Segundo curso pagante **entra** no MRR — é recorrência real paga pelo aluno.
- Banda, bolsista integral e bolsista parcial ficam de fora **pelo flag**, não por pagarem zero.
- Arquivados (`arquivado_em IS NOT NULL`) ficam de fora.
- **Passaporte NÃO entra no MRR** — é receita à parte (validado pelo Alf, P6).
- `ARR = MRR × 12`.

### 4.4 Ticket médio (mensalidade) ✅

```
Ticket médio = faturamento total dos cursos dos alunos pagantes / alunos pagantes únicos
```

- **Numerador:** soma **todos os cursos** do aluno pagante, incluindo o segundo curso.
- **Denominador:** cada pessoa conta **uma única vez**.
- Bolsistas integrais e parciais ficam fora dos dois lados.
- 🚫 **Nunca calcular como `AVG(valor_parcela)` por linha** — duplica quem tem vários cursos.

> Exemplo: aluno com 4 cursos de R$ 380 + R$ 355 + R$ 367 + R$ 127 → numerador recebe R$ 1.229, denominador recebe 1 pessoa.

**Consequência correta e intencional: o segundo curso ELEVA o ticket médio** (soma no numerador, conta 1 no denominador). É o que a flag `entra_ticket_medio = true` do tipo `SEGUNDO_CURSO` descreve.

#### Refinamento por fatura da competência

✅ Validado pelo Alf em 2026-07-07 (resolvendo divergência com o Financeiro do Emusys):

```
Ticket médio = soma das parcelas de mensalidade da competência / alunos pagantes únicos da competência
```

- O denominador "por pessoa" **está correto e não muda**.
- O que muda é a **fonte do numerador**: deve vir da **fatura da competência** (`GET /faturas`), não do campo cadastral estático `alunos.valor_parcela`.
- Entra só fatura de **Parcela/Mensalidade** — passaporte, taxa de matrícula e lojinha não entram.
- Valor de cada fatura: fatura **paga** → `valor_pago`; fatura **aberta** → valor devido do snapshot. Fatura cancelada não compõe aberto nem previsto.
- `get_financeiro_faturas_emusys` e o relatório administrativo do período aberto já usam o último `sync_run_items` live, completo e fresco. Competência histórica usa o snapshot mensal fechado e não recebe sobreposição viva.
- ⚠️ Os KPIs legados de Ticket Médio/LTV que ainda partem de `alunos.valor_parcela` continuam na pendência P2; esta entrega não os recalcula retroativamente.

### 4.5 Ticket médio da carteira do professor ✅

Mesmo critério de `entra_ticket_medio`, **sem a dedup por pessoa**: na carteira por professor, aluno com 2 cursos é carteira dos 2 professores — deduplicar faria um deles perder o aluno. Segundo curso entra nos **dois** lados.

- Denominador exposto em `alunos_ticket`; o card agregado divide `mrr_total` pela soma de `alunos_ticket` (média de médias não é média).
- ⚠️ **`total_alunos` é o headcount inteiro** (inclui banda e bolsista) — **nunca** usar como denominador de ticket.

### 4.6 Inadimplência ✅

```
inadimplência % = qtd_inadimplentes / alunos_pagantes × 100
```

**Percentual de PESSOAS (cabeças), não de valor.**

Conta na verdade financeira canônica **somente** uma fatura confirmada pela leitura `get_inadimplencia_canonica`, quando a pessoa possui ao menos uma matrícula atual ativa ou trancada, não arquivada, na mesma unidade:
```
ultimo snapshot live completo e ainda fresco da competência
AND status da fatura = 'aberta'
AND source_missing = false
AND data_vencimento < data de corte
AND competência entre o mês corrente e os dois meses-calendário anteriores
AND identidade exata = unidade_id + emusys_matricula_id + emusys_student_id
AND papel atual da pessoa = alguma matrícula ativa ou trancada na unidade
```

- **Trancado entra no radar financeiro.** O trancamento temporário não elimina a parcela mensal prevista no contrato. A view operacional continua livre para excluir trancados de carteira pedagógica e headcount ativo; a RPC financeira inclui explicitamente `eh_trancamento_atual`.
- **Ex-aluno sem nenhuma matrícula atual ativa ou trancada fica fora.** Reingresso conta como aluno atual: o estado Emusys v1.3.1 (`ativa|trancada`) prevalece sobre `data_saida` histórica. Sem raw atual, o fallback local exige `ativo|trancado` e `data_saida IS NULL`.
- Uma dívida da matrícula anterior só pode acompanhar um reingresso quando a matrícula da fatura é conhecida, pertence ao mesmo `unidade_id + emusys_student_id` e existe papel atual da pessoa. Nome nunca participa da identidade.
- **Banda e bolsista integral permanecem `sem_parcela`** mesmo quando o Emusys devolve `em_dia`.
- 🚫 Percentual por **valor** (`mrr_inadimplente / mrr_contratual`) foi **rejeitado pelo Alf**.
- 🚫 `(faturamento_previsto − faturamento_realizado) / faturamento_previsto` é legado — não usar.

**Fonte canônica:** `get_inadimplencia_canonica`, sobre `sync_runs` + `sync_run_items`. O booleano `aluno_jornada_matricula_disciplina.inadimplente_emusys` permanece compatibilidade, não autoriza lista ou cobrança. `source_missing` significa reconciliação pendente e **nunca** pagamento.

Qualquer competência necessária stale bloqueia a lista inteira (`items=[]`). Erro estrutural ou snapshot incompleto também bloqueia. `partial` fresco libera **somente** os `items` confirmados; `source_missing`, identidade inválida e contato local não unívoco permanecem em quarentena, fora dos totais confirmados ou do contato conforme o tipo do problema. `source_missing` só se resolve por run fresco/status autoritativo; “sumiu” nunca significa “pagou”.

**Duas réguas, uma fonte:** a verdade financeira é D+0 (`data_vencimento < hoje`). Farmer e Sol aplicam a carência amigável D+2 publicada pelo mesmo contrato; nenhum consumidor pode sobrescrevê-la. O contato é agrupado uma vez por `unidade_id + aluno_id_canonico`, preservando no payload todas as matrículas e faturas exatas. Zero ou múltiplos candidatos locais mantêm o valor no financeiro, mas não geram ação de contato.

**Valor atualizado único:** perde-se o desconto condicional e parte-se de `valor_original`; aplica-se multa de 2% + mora de 1% ao mês pro rata die (`dias_atraso / 30`). O Emusys continua fonte do status; este cálculo apenas apresenta o valor contratual na data de corte.

**Fora desta carteira:** competências anteriores à janela de três meses-calendário e ex-alunos devedores serão tratados em produto separado. Sol, LA Report, exportação e agentes não podem consultar uma fonte paralela para reconstruir esta lista.

### 4.7 Faturamento ✅

```
faturamento_previsto  = MRR
faturamento_realizado = MRR − valor da inadimplência
```

Financeiro do mês = **faturamento PREVISTO por parcela canônica**. O período aberto só usa snapshot completo e fresco; stale ou integridade pendente retorna `tem_dados=false`. O realizado usa `valor_pago` do Emusys. O bloco de inadimplência anexo usa a fórmula contratual acima.

### 4.8 Status de pagamento 📋

`status_pagamento ∈ {em_dia, inadimplente, parcial, sem_parcela}`. Aberto/indefinido = `null`.

### 4.9 Divergência de valor de parcela ⚠️

Divergência entre o valor do Emusys e o nosso **não é** assunto da tela de inadimplência — é da **Conciliação Emusys** (`matriculas_divergencias`, `tipo_divergencia = 'valor_divergente'`).

> O alerta antigo comparava o valor **cheio** da API contra `alunos.valor_parcela`, que é o **líquido** — acendia em 747 de 1.171 matrículas ativas. Foi removido.

---

## 5. Retenção

### 5.1 Evasão ✅

```
Evasão = movimentacoes_admin.tipo IN ('evasao', 'nao_renovacao')
```

- **Aviso prévio NÃO é evasão.**
- **Trancamento NÃO é evasão.**
- **Transferência interna entre unidades NÃO é evasão nem churn global da LA Music.** Para análise por unidade pode aparecer como saída da origem e entrada no destino, mas separada de evasão.
- **Deduplicação:** `DISTINCT ON (lower(trim(aluno_nome)), unidade_id, ano, mês)`.
- Movimentações de **atividade extra** (banda/coral) são excluídas via `is_movimentacao_admin_retencao_valida`.
- 🚫 Movimentação por nome, sem vínculo confiável por `aluno_id` / `matricula_id` / `emusys_matricula_id`, **não autoriza** classificar evasão.
- 🚫 Não usar `evasoes_v2`. 🚫 As tabelas `evasoes` e `renovacoes` **não existem mais** — foram aposentadas.

**Fonte de verdade: `movimentacoes_admin`.**

### 5.2 Tipos de movimentação 📋

`renovacao | nao_renovacao | aviso_previo | evasao | trancamento`

- Para **retenção**: agregam-se todos.
- Para **evasão pura**: só `evasao + nao_renovacao`.

### 5.3 Aviso prévio ✅

O aluno avisa que vai sair e **cumpre o mês vigente do aviso + o mês seguinte**.

> Exemplo: aviso dado em **agosto** → o aluno estuda **agosto e setembro**; a saída real é no fim de setembro.

- **Aviso prévio não é evasão na competência em que foi avisado.** Para KPI, usar a competência da **saída real**, não a do aviso.
- **Aviso prévio não entra no denominador da taxa de renovação** — são indicadores distintos (§5.4).
- É a janela de intervenção antecipada, antes do churn real.
- Campos: `data_aviso`, `mes_saida`, `valor_parcela`, `motivo_saida_id`.

### 5.4 Taxa de renovação ✅

```
taxa_renovacao = renovações / (renovações + não renovações) × 100
```

- **Aviso prévio NÃO entra no denominador.**
- Renovação só conta se **confirmada** (exclui `pendente_validacao`).
- Movimentações de atividade extra ficam fora.
- Meta: **≥ 80%**.
- **Por professor:** `renovações / contratos_a_vencer × 100`.
- 🚫 `renovacoes / total_alunos` ou `/ total_contratos` (no sentido de base inteira) é legado.

### 5.5 Reajuste médio ✅

```
reajuste_medio = AVG((valor_novo − valor_anterior) / valor_anterior × 100)
WHERE valor_novo > valor_anterior AND valor_anterior > 0
```

**Só aumentos positivos entram.** Reajuste zero ou negativo fica fora. Meta: **≥ 2%**.

### 5.6 Renovação antecipada ✅

Renovação lançada no Emusys **antes** da competência efetiva do novo ciclo.

- **Não conta como renovação realizada no mês do lançamento.**
- Conta como renovação efetiva **na competência da primeira aula do novo ciclo**, se continuar válida.
- Deve aparecer em lista própria de **Renovações Antecipadas**.
- **Nunca apagar** uma renovação antecipada para "limpar" relatório.
- Campo canônico de competência: `payload_bruto.matricula.data_primeira_aula`; fallback: maior `disciplinas[].data_hora_primeira_aula`.
- O sistema deve separar: data de lançamento, data efetiva, competência efetiva e status (`antecipada`, `efetivada`, `cancelada`).
- 🚫 Gravar `data = hoje` para renovação antecipada é bug operacional — suja o mês do lançamento.

### 5.7 Trancamento 📋

Pausa temporária, **não é cancelamento**. Requer `previsao_retorno`; status vai para `trancado`.
Sai dos denominadores pedagógicos ativos, mas continua elegível no radar de faturas vencidas enquanto o trancamento estiver vigente; isso não transforma o aluno em ativo para as demais métricas.

- Trancado **não** conta em alunos ativos, carteira do professor nem denominadores financeiros.
- **"Trancados agora"** (foto atual) e **"trancamentos do período"** (movimentações) são indicadores **diferentes** — não confundir.

### 5.8 Churn ✅

```
churn = evasões / alunos_pagantes × 100
```

Confirmado no banco. Transferência interna não entra no numerador.

- Faixas de risco por professor: **crítico ≥ 15% · alto ≥ 10% · médio ≥ 5% · normal < 5%**.
- 🚫 `evasoes / total_alunos_ativos` — legado.
- 🚫 `evasoes / (alunos_inicio + novas_matriculas)` — legado.

### 5.9 LTV e tempo de permanência ✅

```
LTV = ticket_medio × tempo_permanencia_meses
```

**Regra "saiu de tudo":** o tempo de permanência só é contabilizado quando o aluno encerra **TODAS** as matrículas, inclusive o segundo curso. Se mantém uma viva, não grava passagem.

- `tempo = MAX(data_saida) − MIN(data_matricula)` das matrículas da passagem.
- **Filtro: `tempo_permanencia_meses >= 4`** — saídas curtas ficam fora da média.
- Excluídos do `aluno_ids[]`: `BOLSISTA_INT`, `BOLSISTA_PARC`, `BANDA`.
- Passagens anuladas (`anulado = true`) saem da tela e das estatísticas, mas ficam no banco (soft delete reversível, motivo obrigatório).
- Idempotência: UNIQUE `(aluno_id, data_saida) WHERE anulado = false`.

### 5.10 Taxa de retorno 📋

```
taxa_retorno = % de pessoas com 2 ou mais passagens
```

Cada passagem é uma entrada independente — aluno que sai e volta gera passagens separadas, tratadas como casos individuais (sem somar).

---

## 6. Comercial — leads, experimentais e funil

### 6.1 Etapas do pipeline 📋

`novo → agendado / experimental_agendada → experimental_realizada / experimental_faltou → convertido / matriculado` (ou `arquivado`).

| ID | Etapa | Status |
|---|---|---|
| 1 | Novo Lead | `novo` |
| 5 | Experimental Agendada | `experimental_agendada` |
| 6 | Visita Escola | `visita_escola` |
| 7 | Experimental Realizada | `experimental_realizada` |
| 8 | Visita Realizada | `experimental_realizada` |
| 9 | Faltou | `experimental_faltou` |
| 10 | Convertido/Matriculado | `convertido` |
| 11 | Arquivado | `arquivado` |

**Transições permitidas:** 1→{5,6,10} · 5→{7,9,10} · 6→{8,9,10} · 7→{10} · 8→{10} · 9→{5,6,10}.
**Voltar etapa:** 5→1, 6→1, 7→5, 8→6, 9→5. As etapas 1, 10 e 11 não permitem voltar.

### 6.2 Leads e duplicatas 📋

- Mesmo **telefone** na mesma unidade = duplicata forte → **bloqueia** criação.
- Mesmo **nome exato** + ambos sem telefone na mesma unidade = duplicata fraca → **avisa**.
- Mesmo nome com telefones diferentes = **não** é duplicata.
- Telefone normalizado: `55` + 10-11 dígitos.
- Leads arquivados (`arquivado = true`) são ignorados na busca de duplicatas **e não entram no funil**.
- Leads novos criados manualmente entram como `quente`.

### 6.3 Aulas experimentais ✅

**A experimental conta quando é REALIZADA, não quando é agendada.** Nunca contar pela data de agendamento.

O caminho canônico (`get_kpis_comercial_canonicos_v2`) conta pela **`data_experimental`**, e publica duas medidas de "realizada":

| Medida | Critério |
|---|---|
| `experimentais_realizadas_presenca_confirmada` | presença individual confirmada no Emusys |
| `experimentais_realizadas_status_operacional` | `status IN ('experimental_realizada', 'convertido')` |
| `experimentais_agendadas_periodo` | todas as experimentais do período **não canceladas** |
| `experimentais_no_show` | `status IN ('experimental_faltou', 'faltou')` |
| `experimentais_canceladas` | `status IN ('cancelada', 'cancelado', 'experimental_cancelada')` |

**Cancelamento sempre prevalece.** Antes do início da aula (BRT), mesmo que o Emusys mande `presenca = 'ausente'`, a situação é `agendada` — o Emusys marca aula futura como ausente por padrão.

- Uma linha por **aula + participante** (`emusys_aula_id`), o que destrava multi-instrumento: 2 cursos no mesmo dia não colapsam.
- Vínculo canônico por IDs externos (`id_lead`, `id_aluno`). **Nome e telefone nunca criam vínculo.**
- Experimental de aluno existente (2º instrumento) **conta**.

### 6.4 Taxas do funil 📋

```
taxa_showup            = experimentais_realizadas / experimentais_agendadas × 100
taxa_conversao_exp_mat = novas_matriculas / experimentais_realizadas × 100
taxa_lead_experimental = leads que agendaram/realizaram experimental / total de leads × 100
```

⚠️ **Taxa de conversão geral do funil segue pendente** — `novas / total_leads` (código) vs. `novas / leads_com_experimental`. Ver §14, pendência P3.

### 6.5 Matrículas novas — fonte é `alunos` ✅

A etapa "Matrículas" do funil lê de **`alunos`** (`data_matricula` no período), **não** de leads convertidos.

> Motivo: matrículas sem lead (irmãos no mesmo telefone, matrículas diretas) sumiam do funil.

**Matrícula nova canônica** = matrícula do período que **não** é 2º curso, **não** é bolsista (`BOLSISTA_INT`/`BOLSISTA_PARC`), **não** é banda e **não** é canto coral.

O relatório distingue:
- `matriculas_academicas` — todas as matrículas acadêmicas do período
- `matriculas_comerciais_principais` — as que contam para o funil
- `conversoes_de_lead` — as que têm lead vinculado
- `matriculas_sem_lead_vinculado` — matrículas diretas

### 6.6 Ticket médio de novas matrículas ✅

Duas métricas separadas, sobre a **mesma coorte agrupada**:

```
Ticket médio das parcelas    = soma das parcelas positivas / grupos com parcela positiva
Ticket médio dos passaportes = soma dos passaportes positivos / grupos com passaporte positivo
```

- **O agrupamento ocorre antes do cálculo:** um segundo curso pode acrescentar parcela ao valor consolidado, mas **não cria outro denominador**.
- Zero, nulo e valor inválido ficam fora **apenas** do denominador correspondente.
- Matrículas com `valor_passaporte = 0` (re-matrícula, bolsista) **não entram** no ticket de passaporte.
- Valores não são arredondados antes da divisão; só o resultado recebe 2 casas.
- A meta `metas_kpi.tipo = 'ticket_medio'` acompanha **só** o ticket das parcelas — não há meta canônica de passaporte.

> Referência de aceite (Barra, jul/2026): parcelas `R$ 6.819,00 / 16 = R$ 426,19`; passaportes `R$ 7.142,00 / 16 = R$ 446,38`.

⚠️ Esta regra é específica da coorte de novas matrículas do **relatório comercial** e não substitui a regra financeira por fatura/competência do ticket da base ativa (§4.4).

### 6.7 Famílias e irmãos ⚠️ GAP CONHECIDO

O Emusys cria 1 registro por **pessoa**; `matricula.lead_id` identifica o **aluno**, não a família. A família só é ligada pelos campos de responsável, idênticos entre irmãos.

Como `leads.telefone` recebe o `telefone_responsavel` e existe UNIQUE `(telefone, unidade_id) WHERE arquivado = false`, **irmãos colapsam em 1 lead** e os filhos extras viram aluno sem lead.

**Efeito:** matrículas de irmãos extras somem do funil e o nome exibido é o do irmão. Ver §14, pendência P4.

### 6.8 Origem e atribuição de anúncio 📋

- Leads chegam ao Supabase pela via **Emusys** (os agentes Mila SDR cadastram no Emusys, que dispara o webhook).
- Atribuição de anúncio Meta é **first-touch**: `meta_ad_source_id`, `meta_ctwa_clid` e `canal_origem_id` só são gravados **quando vazios**.
- Ambiguidade não é resolvida por chute — fica registrada como `ambiguo_pendente`.
- 🚫 **Nunca deduzir o canal a partir de outros leads do mesmo anúncio** — um anúncio com 135 leads tinha 2 com canal diferente; deduzir propagaria o erro.

---

## 7. Professores

### 7.1 Carteira do professor ✅

```
COUNT(alunos) WHERE professor_atual_id = <prof> AND matrícula ativa
```

- Inclui `is_segundo_curso = true`? **Sim** — cada matrícula conta como 1.
- Inclui banda/atividade extra? **Não.**
- Inclui trancado? **Não** (decisão de 2026-05-20).
- Exige `entra_carteira_professor = true` no estado operacional.

**Fonte canonica da leitura atual:** na Carteira e no Health Score V3 do periodo
aberto, o numero de alunos vem de
`get_carteira_professor_periodo_canonica`, que prioriza a jornada ativa
`aluno_jornada_matricula_disciplina` por professor e unidade. A RPC legada
`get_carteira_professores` continua existindo para o contrato/ticket legado, mas
nao pode alimentar o V3 nem substituir a jornada por
`alunos.professor_atual_id`; esse campo pode estar defasado. No consolidado, o
V3 soma as linhas canonicas das unidades, mantendo o mesmo criterio da Carteira.

### 7.2 Score do professor — evasões que contam ✅

```
Apenas evasões com motivos_saida.conta_score_professor = true
```

**Lookup, nesta ordem:**
1. FK `motivo_saida_id` — preferencial
2. Fallback ILIKE do texto do motivo contra `motivos_saida.nome`
3. **Motivo NULL sem match = NÃO conta** (regra alterada em 2026-04; antes contava por padrão)

Alunos de atividade extra ficam fora do denominador. Gerenciado em `MotivosScoreConfig` (toggles).

### 7.3 Taxa de conversão do professor ✅

```
taxa_conversao_professor = matriculas_pos_experimental / experimentais_realizadas × 100
```

- **Somente experimentais realizadas por aquele professor** entram (validado pelo Alf, P7).
- **Matrícula sem experimental não entra no numerador.**
- Fonte canônica: **`lead_experimentais`** (1 linha por aula, presença real) — substituiu a contagem por `leads`, que agregava 1 por pessoa, subcontava realizadas e inflava a taxa.
- Denominador: `status IN ('experimental_realizada', 'convertido')`. Numerador: realizadas cujo lead converteu.
- Experimental de aluno existente (2º instrumento) **conta**.
- 🚫 Qualquer cálculo que permita taxa > 100% é bug (caso real: Willian, T1/2026, 200%).

### 7.4 Health Score do Professor V3 ✅

Calculado e **persistido no banco**. Frontend, relatórios e agentes apenas **leem o snapshot** — não recalculam e não substituem ausência de base por zero.

**Pesos da configuração ativa (conferidos no banco em 2026-08-08):**

| Pilar | Peso | Meta | Amostra mínima |
|---|---:|---:|---:|
| Retenção atribuível | 25% | 90% | 10 |
| Permanência com o professor | 25% | 12 meses | 3 |
| Conversão Exp→Mat | 15% | 70% | 3 |
| Média de alunos/turma | 15% | segmentada | 1 |
| Número de alunos | 10% | segmentada | 1 |
| Presença dos alunos | 10% | 80% | 10 (cobertura 95%) |
| **Total** | **100%** | | |

⚠️ **`docs/METRICAS.md` afirma que "Número de alunos" tem peso efetivo 0 (diagnóstico).** A configuração ativa no banco tem peso **10**. Item **não tratado ainda** — ver §14, pendência P5.

**Regras da nota:**
- Nos pilares percentuais, a nota é o percentual real. Nos pilares com meta de atingimento: `min(100, valor_real / meta × 100)`.
- **Métrica sem base tem nota `null` e seu peso sai do denominador** — nunca vira zero.
- Conversão só pontua com a amostra mínima; sem amostra recebe `sem_experimental_periodo` ou `amostra_insuficiente` e sai do denominador.
- Classificação: **Saudável ≥ 70 · Atenção 50–69 · Crítico < 50**.
- **Score comparável** exige ≥ 3 pilares pontuáveis, cobertura normalizada ≥ 60% e Retenção ou Permanência válida.
- Score não comparável continua visível como diagnóstico, mas **nunca é rankeável nem premiável**.
- **Ranking só existe em ciclo oficial fechado**, habilitado, com professores comparáveis.
- Capacidade excedida gera **alerta operacional**, não reduz nota.
- Configuração ativa é **imutável**: alteração cria rascunho → simulação → ativação em ação separada. Snapshots fechados não são reescritos.

**Ciclos fixos:** Mar-Abr-Mai · Jun-Jul-Ago · Set-Out-Nov · Dez-Jan-Fev (atravessa o ano civil).

- Retenção e conversão: no ciclo, **somam-se numeradores e denominadores brutos** dos meses elegíveis. 🚫 **Proibido** obter a taxa do ciclo pela média dos percentuais mensais.
- Número de alunos e média/turma: fotografia do fim do recorte; no ciclo, o último mês alcançado.
- Permanência: histórico acumulado de vínculos encerrados; vínculos < 4 meses ficam no histórico mas não entram na média.
- Score do ciclo é recalculado das métricas agregadas — **nunca** é média dos scores mensais.

**Metas segmentadas:** média/turma e número de alunos não usam meta global — cada regra pertence a `unidade + curso + modalidade` (`turma` ou `individual`). Regra ausente produz `segmentacao_incompleta`, **nunca fallback para meta global**. Curso atribuído e ainda sem alunos continua visível e **não recebe nota zero**.

🚫 Health Score V2 (crescimento, média/turma, renovação, conversão, presença, evasões) existe **só para histórico e rollback**.

### 7.5 Taxa de presença — faixas 📋

**Crítico < 70% · Atenção 70–79% · OK ≥ 80%**

### 7.6 Modo trimestral (aba Performance) 📋

Agrega 3 meses para diluir distorção estatística em professores com poucas experimentais: **T1 = Mar/Abr/Mai · T2 = Jun/Jul/Ago · T3 = Set/Out/Nov · Período Não Considerado = Dez/Jan/Fev**.

### 7.7 Schema multi-unidade 📋

`professores` guarda a **pessoa**; `professores_unidades` é a junção N×N e guarda o `emusys_id` **por par (professor, unidade)** — o Emusys é por escola, então o mesmo humano tem `emusys_id` diferente em cada unidade.

---

## 8. Salas e turmas

```
Ocupação (%)          = Σ capacidade_maxima das turmas ativas na sala / capacidade_maxima da sala × 100
Taxa de utilização (%) = horas_ocupadas / horas_disponiveis × 100
```

onde cada turma ativa = 1h e a capacidade = `nº_salas × 73h/semana` (seg–sex 13h/dia + sáb 8h). Considera `turmas.ativo = true` e `salas.ativo = true`.

### Agenda / grade do dia 📋

- **Reconciliação da grade Emusys (15/08/2026):** `sync-grade-futura-emusys` e o modo `metadados` de `sync-presenca-emusys` usam uma fotografia completa e paginada de `/aulas`. Só `categoria='normal'` de hoje em diante entra em `reconciliar_grade_snapshot_emusys_v1`: aula ausente vira cancelamento lógico `sync_ausente_emusys`; participante ausente pode remover apenas seu vínculo de roster. Nunca apaga `aluno_presenca`, justificativa ou retificação. Qualquer evidência que `fn_presenca_fecha_chamada` reconheça, inclusive o fallback legado de `status`, ou identidade aluno/Emusys ambígua, bloqueia a alteração automática. Erro de upsert, roster incompleto ou fotografia inválida aborta somente a reconciliação daquela unidade; a janela de ontem fica exclusivamente com a reconciliação individual do webhook.
- **`tipo` é a MODALIDADE contratada, não a lotação.** A modalidade verdadeira vem de `emusys_disciplinas_catalogo.modalidade`. Na LA quase tudo é disciplina de turma (164 de 165 aulas) e a maioria roda com um aluno só.
- O filtro da tela é de **lotação** (Sozinho / Com turma), lendo `qtd_alunos` — filtrar por modalidade devolveria quase tudo ou quase nada.
- **`professor_presenca` é `'ausente'` por DEFAULT no Emusys** — 100% das aulas futuras vêm assim. Só exibir presença depois que a aula terminou.
- ⚠️ **A janela 19/07–01/08/2026 é RECESSO ESCOLAR, não buraco de dados.** Não há calendário acadêmico no banco — se alguma métrica tratar recesso como "dado faltando", o denominador fica errado.
- **Chamada pela Agenda (2026-08-11, Fase 1 — spec `docs/superpowers/plans/2026-08-11-chamada-agenda-motor-presenca.md`):** secretaria registra `presente` / `falta` / `falta_justificada` por aluno via RPC `app_registrar_chamada_agenda` (origem `respondido_por = 'agenda_secretaria'`, fonte humana forte — o sync do Emusys nunca sobrescreve). **Falta justificada CONTA COMO FALTA** nos indicadores (decisão D2); o que muda é o rótulo (`status_presenca = 'falta_justificada'`, motivo obrigatório + evidência em `aluno_presenca_administrativo`) e o **crédito de reposição** (`aluno_reposicoes`, `origem = 'falta_justificada'`). **Cancelamento é da aula** (RPC `app_cancelar_aula`, motivo obrigatório, escopo `aula` | `unidade_dia` — em massa só admin): ninguém toma falta, aula sai do denominador e cada aluno do roster ganha crédito (`origem = 'cancelamento'`). **Reposição = reagendamento da aula original no Emusys**; `casar_reposicoes()` roda após cada sync e casa créditos por elo direto (mesma aula, `data_hora_inicio_original`) ou rede (aluno + disciplina + janela). Cancelamento humano nunca é desfeito pelo sync (`cancelada_origem = 'agenda_secretaria'` trava; reativação no Emusys vira conflito logado em `automacao_log`). View semântica v1.4 expõe `status_presenca` para separar falta seca de justificada. ⚠️ **O fallback `ausente→falta_confirmada` (política de confiabilidade) continua ativo até decisão do Alf no rollout** — spec item 7.1.

---

## 9. Sucesso do Aluno

### 9.1 Health score do aluno 📋

View `vw_aluno_sucesso_lista` (`health_score_numerico`, `health_status`, `fase_jornada`, `percentual_presenca`, `status_pagamento`), recalculado por `calcular_health_score_alunos_batch`. Presença pesa 15%.

### 9.2 Faltas 📋

RPC `get_faltas_periodo` **deduplica a aula duplicada do Emusys** via `DISTINCT ON (aluno, dia, curso)`, priorizando a visão individual.

> Sem dedup a falta **conta em dobro** — em maio/CG o número cru era 1.623 contra 893 deduplicado.

- Filtra `categoria = 'normal'`, alunos `ativo`/`aviso_previo`.
- Projeto banda **é incluído**, mas com flag para o front exibir badge "Banda" — decisão: sinalizar, não esconder.
- **Exibir ≠ contar:** a grade mostra as 2 visões da aula (transparência); o ranking usa 1 número deduplicado.
- Alerta por faixa: 2 faltas (amarelo), 3 (laranja), 4+ (vermelho).

### 9.3 Pesquisas 📋

- **Pós-1ª aula:** `pesquisas_whatsapp` `tipo = 'pos_primeira_aula'`; 5 níveis (⭐ Esperava mais = 1 … ⭐⭐⭐⭐⭐ Amei = 5). Régua da timeline: 1ª aula → 3 meses → evasão.
- Variante do texto: **responsável ≠ aluno → fala do filho na 3ª pessoa**; mesma pessoa ou sem responsável → direto.
- Aula **experimental não conta como 1ª aula** — quem faz experimental e matricula no mesmo dia não pode receber a pesquisa no dia seguinte.
- **Pesquisa de evasão:** `pesquisa_evasao.evasao_id` referencia a saída canônica em `movimentacoes_admin.id`. Envio e resposta são estados da pesquisa, **não uma nova contagem de evasão**. Rodadas e versões de análise **não multiplicam** a taxa de resposta.

### 9.4 Risco de evasão (churn preditivo) 📋

Modelo Random Forest treinado offline, exportado para JS. Roda em cron diário e grava em `risco_evasao`.

- **Fonte canônica de leitura: `vw_risco_evasao_atual`** — não ler `risco_evasao` bruta (é histórico por dia).
- 12 features numéricas + 10 categóricas por aluno ativo não arquivado.
- "Fatores" exibidos **não são SHAP** — são importância global do modelo cruzada com o valor cru do aluno, e cobrem só 5 das 22 features.
- ⚠️ **Gaps conhecidos:** não separa evasão voluntária de involuntária (inadimplência); sem matriz de custo-benefício nas ações de retenção; sem survival analysis (LTV é média, não curva).

---

## 10. Relatórios e fechamento mensal

### 10.1 Fonte de uma competência encerrada ✅

**Ao ler mês passado, a fonte canônica é `fechamento_mensal_snapshots` (status `fechado`), nunca o cálculo vivo.**

As RPCs operacionais leem o estado **atual** do banco — recalcular uma competência encerrada devolve o número de hoje, não o do fechamento.

> Divergência real medida em 31/07/2026 para junho/CG: snapshot **462** alunos ativos vs. recalculado ao vivo **422**. Os 40 de diferença são regra nova do Emusys v1.3.1 (trancamento vigente saiu de "ativa") somada a evasão real de julho. **Junho e julho não são comparáveis** em alunos ativos sem essa nota.

- **`dados_mensais` deixou de ser fonte de verdade** — virou camada de compatibilidade para telas antigas.
- Matrícula lançada depois do corte só entra em competência fechada por **retificação append-only**, com aluno, matrícula Emusys, data de negócio e hash validados. O snapshot permanece intacto.
- O nome do gerente é responsabilidade operacional vigente e vem do cadastro atual — não reescreve o fechamento histórico.

### 10.2 Fluxo oficial de fechamento ✅

1. `preview_fechamento_mensal(...)` — **read-only**, junta domínios, aponta bloqueios e alertas. Não grava.
2. `gravar_snapshot_fechamento_mensal(...)` — grava o retrato com **hash + auditoria**; só `service_role`; bloqueia se houver bloqueios; exige confirmação se houver alertas; **não sobrescreve snapshot fechado**.
3. `atualizar_dados_mensais_por_snapshot(...)` — atualiza `dados_mensais` por compatibilidade (`dry_run` por padrão).

**Writers legados bloqueados** para `anon`/`authenticated`: `snapshot_dados_mensais`, `fechar_dados_mensais`, `recalcular_dados_mensais`, `upsert_dados_mensais`.

### 10.3 Relatórios mensais 📋

- **Comercial:** `get_relatorio_mensal_canonico_v1`.
- **Administrativo:** `get_relatorio_admin_mensal_rico_v1`, que parte do documento mensal **fechado** e usa exclusivamente as referências congeladas nele (`alunos_admin` e `relatorio_gerencial`), validando unidade, competência, status e **hash** antes de montar o texto.
- **Gerencial:** `get_relatorio_gerencial_canonico_v1` é o **produtor único no servidor**. Não aceita KPIs montados no navegador. Compõe os documentos Administrativo e Comercial fechados da mesma unidade/competência.
  - **A IA redige exclusivamente os cinco blocos qualitativos.** Todos os números e frações são formatados deterministicamente pela edge.
  - Os **três tickets permanecem separados**: ticket da base ativa (Administrativo), ticket das novas parcelas e ticket dos passaportes (Comercial).
  - **Ausência de venda da lojinha nunca é publicada como zero.**
  - **Metas de experimentais agendadas não são comparadas com experimentais realizadas.**
  - A meta `ticket_parcela` acompanha **só** o ticket das novas parcelas comerciais, nunca o ticket financeiro da base ativa.
  - Comparativos ficam indisponíveis enquanto não houver competências fechadas com as mesmas definições.

### 10.4 Relatório comercial diário 📋

- A tela **não recalcula métricas** — publica exatamente o texto devolvido pela edge.
- A geração é **interrompida** se o snapshot de experimentais não confirmar `snapshot_status = 'completo'`. **Não existe fallback para zero nem para base transacional parcial.**
- Havendo denominador, publica sempre a taxa e a fração; pendências aparecem como aviso. Sem denominador, publica `SEM BASE`. **O texto nunca usa `BLOQUEADA`.**
- Próximas experimentais: só do snapshot vigente, `situacao = 'agendada'`, não cancelada, início estritamente futuro e ≤ D+7; limite de 10, com total excedente informado.
- Chave diária de idempotência: `tipo_relatorio + unidade_id + jid + data_dia`.

### 10.5 Integridade do relatório gerencial e do espelho Emusys ✅

`get_relatorio_gerencial_canonico_v1` é montado no servidor a partir dos dois
documentos mensais fechados. A Edge `gemini-relatorio-gerencial` não consulta o
Emusys diretamente e não aceita KPIs enviados pelo navegador.

- **Metas:** Gestão e Comercial usam `metas.operacionais`, cuja fonte é
  `metas_kpi` para a unidade e competência. Fideliza+ usa somente
  `programa_fideliza_config`; Matriculador+ usa somente
  `programa_matriculador_config`. Meta ausente é `meta não cadastrada`, nunca
  zero. Os três blocos não podem ser misturados.
- **Cobertura de curso de interesse:** no fechamento Recreio/julho/2026, os
  denominadores são `297` leads totais, `296` com detalhamento disponível, `1`
  com detalhamento histórico indisponível, `120` com curso declarado e `176`
  sem curso declarado. O item indisponível não é inferido como "sem curso" e
  não é preenchido pelo curso da matrícula ou da experimental.
- **Distribuições:** `leads_por_canal` e `matriculas_por_curso` são listas
  próprias do documento, com seu grão e total; não precisam somar ao total de
  pessoas ou linhas de matrícula de outro bloco.
- **Comparativos:** só ficam disponíveis quando os dois lados são snapshots
  `fechado` da mesma unidade, domínio, grão, população, regra, semântica de
  competência e cobertura mínima. A política `fechamento-equivalente-v1` e o
  `fingerprint_atual` ficam no contrato; sem fechamento anterior equivalente,
  o motivo publicado é `fechamento_anterior_incompativel` e a narrativa não
  pode afirmar aumento, queda, crescimento, redução ou proximidade ao previsto.
- **Professores:** o modelo híbrido separa `rankings.oficiais` (ciclo fechado,
  oficial, habilitado e publicável) de `destaques_mensais_parciais` (evidência
  mensal identificada, sem ordinalidade, medalha ou premiação). Ausência de
  base continua ausente, não zero.
- **Lead ID:** `alunos.emusys_lead_id` é identidade externa escopada por
  `(unidade_id, emusys_matricula_id)` ou por aluno Emusys unívoco. O sync
  preenche somente campo local nulo, mantém valor idêntico e abre
  `matriculas_divergencias` em caso de conflito; nome nunca resolve identidade.
- **Experimentais e histórico:** `(unidade_id, emusys_aula_id)` é a chave mais
  forte. Diferença de horário não veta uma aula com ID exato; fallback sem ID
  exige Lead/Aluno + data e tolerância limitada. Ausência na fotografia corrente
  do `/aulas` não autoriza apagar `aulas_emusys`, `aula_alunos_emusys` ou
  `aluno_presenca`; o estado é classificado como ausente, movido, cancelado,
  visto ou histórico preservado.

---

## 11. Programas gamificados

### 11.1 Matriculador+ (Hunters) 📋

Critérios: `taxa_showup_exp`, `taxa_exp_mat`, `taxa_lead_matricula`, volume, `ticket_medio`.

### 11.2 Fideliza+ (Farmers) ✅

**O programa é TRIMESTRAL, não mensal.**

Recortes oficiais: **Q1** = Jan/Fev/Mar · **Q2** = Abr/Mai/Jun · **Q3** = Jul/Ago/Set · **Q4** = Out/Nov/Dez.

5 critérios: churn, inadimplência, renovação, reajuste, vendas da lojinha.

- O painel deve deixar claro qual trimestre está sendo calculado.
- Com a página filtrada em Mai/2026, o Fideliza+ deve se apresentar como **"Q2 — Abr/Mai/Jun"**, nunca como maio isolado.
- Todas as métricas do Fideliza+ usam o **recorte trimestral**, não o mês da tela.
- Transferência interna não conta como evasão/churn também no Fideliza+.

---

## 12. Referência de aceite (2026-08-08)

Números medidos ao vivo no banco de produção. Servem para validar qualquer reimplementação das fórmulas acima.

### Alunos ativos (pessoas, regra §3.2)

| Unidade | Alunos ativos | Só banda/coral (excluídos) |
|---|---:|---:|
| Campo Grande | 429 | 4 |
| Recreio | 330 | 0 |
| Barra | 245 | 0 |
| **Total** | **1.004** | **4** |

### Financeiro (`get_kpis_alunos_financeiro_vivo_canonico`)

| Unidade | Pagantes | MRR | Ticket médio | Inadimplentes | Inadimpl. % | Fat. realizado |
|---|---:|---:|---:|---:|---:|---:|
| Campo Grande | 398 | R$ 157.757,58 | R$ 396,38 | 13 | 3,27% | R$ 152.986,58 |
| Recreio | 321 | R$ 145.677,56 | R$ 453,82 | 3 | 0,93% | R$ 144.450,32 |
| Barra | 243 | R$ 109.321,65 | R$ 449,88 | 3 | 1,23% | R$ 107.934,65 |

> Ticket médio calculado como `MRR / alunos_pagantes` (§4.4). Note que **alunos pagantes < alunos ativos** em todas as unidades — a diferença são bolsistas, não pagantes e quem está sem parcela.

---

## 13. Divergências resolvidas nesta consolidação

Todas foram verificadas no banco ao vivo em 2026-08-08.

| # | Divergência | Decisão | Ação nos documentos |
|---|---|---|---|
| 1 | **Alunos ativos incluem quem só faz banda/coral?** Docs diziam que sim (marcado como validado pelo Alf em 2026-06-08); o banco exclui. | **Não incluem.** Banda e coral são atividades extras — exigem curso regular. Regra viva está correta. | Corrigir `regras-negocio-canonicas.md` §2.1 e a skill da Sol |
| 2 | **Aviso prévio: 2 ou 3 meses?** A skill da Sol diz "aviso em maio → cumpre maio, junho e julho" (3 meses). | **2 meses:** mês vigente do aviso + o seguinte. | Corrigir a skill da Sol |
| 3 | **Aviso prévio entra no denominador da renovação?** `metricas.md` dizia que sim. | **Não entra.** Aviso prévio e taxa de renovação são indicadores distintos. | Corrigir `metricas.md`; remover a pendência dos 3 docs |
| 4 | **Churn:** `metricas.md` e `regras-negocio.md` usavam `evasoes / (alunos_inicio + novas)`. | `evasoes / alunos_pagantes × 100` (Alf P1, confirmado no banco). | Corrigir os dois arquivos |
| 5 | **Ticket médio × 2º curso:** 2 docs diziam "2º curso excluído do ticket". | **2º curso ENTRA no numerador** e eleva o ticket; a pessoa conta 1× no denominador. Confirmado por `SEGUNDO_CURSO.entra_ticket_medio = true`. | Corrigir `regras-negocio-canonicas.md` e a skill `regras-negocio-la` |
| 6 | **`vw_kpis_retencao_mensal` "ainda lê `evasoes_v2`"** — documentado como bug ativo. | **Falso hoje** — a view já usa `movimentacoes_admin`. | Remover o alerta obsoleto |
| 7 | **"Experimental contada por `data_contato`"** — pendência aberta em 3 documentos. | **Resolvida** — `get_kpis_comercial_canonicos_v2` conta por `data_experimental`. | Remover a pendência |
| 8 | **Tabelas `evasoes` e `renovacoes`** documentadas como fonte/legado ativo. | **Não existem mais** no banco. | Corrigir `metricas.md` e `METRICAS.md` |
| 9 | **`is_atividade_extra_curso`** — função canônica viva que filtra toda a retenção. | Documentada agora em §3.5. | Adicionar aos docs de domínio |
| 10 | **Bolsista parcial é pagante?** `METRICAS.md` dizia "conta conforme `conta_como_pagante`" (ambíguo). | **Não é pagante** — `conta_como_pagante = false` no banco. | Tornar explícito |

---

## 14. Pendências abertas

Itens que **não** devem ser fechados como canônicos sem nova decisão.

### P1 — Critério técnico de "Canto Coral" ⚠️

A regra de negócio é clara (coral = atividade extra, não cobrada, não pagante — igual banda). **A implementação não é.** Hoje existem 4 critérios rodando:

| Onde | Critério |
|---|---|
| `cursos.is_coral` (decisão P4 do Alf) | **A coluna nunca foi criada** |
| KPI de alunos (`..._impl_v2`) | `nome LIKE '%coral%'` |
| Retenção (`is_atividade_extra_curso`) | `nome ILIKE '%canto coral%'` |
| `vw_kpis_gestao_mensal` | `nome ILIKE '%canto coral%'` |
| Frontend (8 arquivos) | `includes('canto coral')` |

**Efeito:** um curso chamado "Coral Infantil" **sai** da contagem de alunos e **entra** na de retenção.

**Opções:** (a) criar `cursos.is_coral` e migrar as 4 implementações + 8 arquivos; (b) padronizar todos em `'%coral%'`. Requer migration → aprovação do Alf.

### P2 — Ticket médio pela fatura da competência ⚠️

A regra final (Alf, 2026-07-07) exige que o numerador venha da **fatura da competência**, não de `alunos.valor_parcela`. A RPC `get_financeiro_faturas_emusys` e o relatório administrativo aberto já foram migrados para o snapshot imutável; ainda faltam os cálculos legados de Ticket Médio/LTV fora desse caminho. O denominador por pessoa não muda e fechamentos antigos permanecem imutáveis.

### P3 — Taxa de conversão geral do funil ⚠️

`novas / total_leads` (código atual) vs. `novas / leads_com_experimental`. Não fechar sem validação.

### P4 — Irmãos colapsando em 1 lead ⚠️

O UNIQUE de telefone por unidade faz irmãos virarem 1 lead; filhos extras ficam órfãos e somem do funil. Duas abordagens: (a) cada pessoa tem seu lead, relaxando o unique para leads sem `emusys_lead_id`; (b) 1 lead-família → N alunos, com nova coluna `alunos.lead_id`.

### P5 — Peso de "Número de alunos" no Health Score ⚠️

`docs/METRICAS.md` afirma peso efetivo **0** (diagnóstico de carga, não pontua). A configuração ativa no banco tem peso **10**. **Assunto ainda não tratado** — fica registrado, sem decisão.

### P6 — Duas configurações de Health Score V3 ativas ⚠️

Existem **2 versões com `status = 'ativa'`** simultaneamente (2026-07-20 e 2026-07-27). Os pesos são idênticos, então não há impacto numérico hoje, mas o desenho pressupõe uma configuração ativa única e imutável.

### P7 — Duas identidades de pessoa ⚠️

O relatório financeiro e a inadimplência agora conciliam por `(unidade_id, emusys_matricula_id)`. KPIs financeiros legados que ainda usam `nome + unidade` podem divergir para homônimos ou identidade ausente e continuam pendentes. Ver §2.2.

### P8 — Governança de `dados_mensais` ⚠️

Congelamento (`congelado`, `congelado_em`) e audit trail (`dados_mensais_historico`) foram aprovados como **desenho técnico**. **Produção travada** — nenhum ALTER, CREATE, UPDATE, DELETE, INSERT, cron ou migration sem aprovação.

### P9 — Campo Grande / Maio 2026 ⚠️

Fechamento histórico validado em **470 pagantes**. É âncora histórica, não bug automático. **Não substituir pelo cálculo vivo atual** sem auditoria forense e aprovação explícita.

---

## 15. Governança e travas de segurança

### 15.1 Bug aberto a corrigir 🐛

**`src/hooks/useEvasoesData.ts:30` consulta `.from('evasoes')` — tabela que não existe mais no banco.**

- Alimenta **8 componentes** do módulo Retenção: `RetencaoVisaoGeral`, `RetencaoAlertas`, `RetencaoMotivos`, `RetencaoTendencias`, `RetencaoSazonalidade`, `RetencaoComparativo`, `RetencaoAcoes`, `RetencaoInicio`. Todos ficam sem dado.
- O mesmo hook tem **`churnMedio: 4.86` e `taxaRenovacao: 80` chumbados** — não são calculados.
- `RetencaoInicio` chama com **`ano = 2025` fixo**.
- `src/components/App/Entrada/FormEvasao.tsx:187` grava na mesma tabela inexistente.

**Correção:** migrar o hook para `movimentacoes_admin` com as regras de §5.1 e §5.8, removendo os valores chumbados.

### 15.2 Ações proibidas sem aprovação explícita do Alf 🚫

- Executar migration, `ALTER`, `CREATE`, `DROP`, `UPDATE`, `DELETE`, `INSERT`
- Rodar backfill
- Criar ou substituir view/RPC
- Ativar cron
- Apagar dados
- Arquivar aluno (inclui `DELETE FROM alunos`)

Quando a tarefa envolver banco: gerar e rodar **SELECT-only** primeiro, revisar resultados, depois pedir aprovação.

### 15.3 Comportamento esperado diante de divergência

1. Classificar como `validada`, `inferida`, `pendente` ou `legado/bug`
2. Apontar a evidência
3. Propor SELECT-only para validar
4. **Não corrigir automaticamente**
5. Pedir aprovação antes de qualquer alteração destrutiva ou produtiva

### 15.4 Armadilhas técnicas com efeito em número

- **Deploy de edge via MCP reseta `verify_jwt` para `true`** e o `pg_cron` marca `succeeded` mesmo com 401 — a falha fica invisível. Conferir o cron pelo **log**, não pelo status do job.
- **RLS não alcança RPC `SECURITY DEFINER`** — e quase toda RPC de KPI é. Elas confiam no argumento `p_unidade_id`.
- **"Consolidado" (`p_unidade_id = null`) é só de admin** — 213 das 246 funções que recebem esse parâmetro são `SECURITY DEFINER`; um não-admin multi-unidade veria unidades que não são dele.
- **Chamada de função solta em policy RLS roda uma vez por linha.** Envolver em `(select fn())` vira `InitPlan` com semântica idêntica.

---

## Manutenção deste documento

Ao mudar a regra de cálculo de qualquer métrica: **atualizar este documento no mesmo commit** da mudança de código.

**Documentos relacionados:**
- [`docs/MAPA-SISTEMA.md`](./MAPA-SISTEMA.md) — por página: rota, componentes, hooks, RPCs e edges
- [`docs/METRICAS.md`](./METRICAS.md) — detalhamento técnico de onde cada métrica é calculada
- [`docs/MAPA-INTEGRACAO-EMUSYS.md`](./MAPA-INTEGRACAO-EMUSYS.md) — ciclo de integração Emusys
- [`docs/HEALTH_SCORE_PROFESSOR_V3.md`](./HEALTH_SCORE_PROFESSOR_V3.md) — detalhamento do Health Score V3

🚫 **Legados — não usar como fonte:** `docs/KPIs_LA_MUSIC_PERFORMANCE_REPORT.md`, `docs/METAS_RELACOES_MATEMATICAS.md`.

---

### Aula operacional no espelho Emusys (12/08/2026)

`aulas_emusys` é evidência bruta e pode conter mais de um evento do mesmo
professor/unidade/curso/horário. Nenhuma leitura operacional deve escolher
“turma primeiro” sem olhar o roster. `fn_aula_operacional_id(aula_id)` resolve
o evento com maior roster; em empate prefere turma e depois o ID local mais
recente. Evento vazio único continua visível como falha de sincronização. Um
evento vazio concorrente é preservado no raw, mas não vira agenda, pendência ou
destino de áudio.

*Documento antigo divergente = legado. Código divergente = possível bug. Regra validada pelo Alf = canônica.*
