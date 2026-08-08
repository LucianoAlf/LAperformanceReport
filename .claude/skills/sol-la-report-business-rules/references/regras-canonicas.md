# Regras Canônicas — LA Music Performance Report

## Status

Este arquivo resume as regras validadas para Sol e outros agentes.

Classificação:

- ✅ Validada pelo Alf
- 📋 Inferida do código atual
- ❓ Pendente de validação
- 🚫 Legado / não usar / possível bug

---

## Pessoa, matrícula e alunos

- 📋 `alunos` armazena matrículas, não pessoas.
- 📋 Identidade operacional: `LOWER(TRIM(nome)) + unidade_id`.
- 📋 Nome sozinho pode colidir; dois nomes iguais na mesma unidade exigem checagem humana.
- 📋 Segundo curso = matrícula adicional de outro curso.
- 📋 Mesmo `curso_id` duplicado para a mesma pessoa geralmente é duplicata, não segundo curso.
- ✅ Exceção validada pelo Alf em 2026-06-07: quando o aluno faz dois horários/tempos reais do mesmo curso, especialmente aula individual seguida, e paga separadamente por cada tempo, os dois vínculos são legítimos. Ex.: Vitória da Silva Nobre faz dois tempos individuais seguidos e paga R$650 por cada; não arquivar como duplicata automática.

### Total alunos ativos

✅ Regra validada pelo Alf em 2026-06-08:

- Base = **pessoas/alunos únicos**, não matrículas/vínculos.
- Inclui pagantes, bolsistas integrais e bolsistas parciais.
- ✅ **Correção validada em 2026-08-08:** quem tem **apenas banda ou apenas coral NÃO conta como aluno ativo**. Banda e coral são atividades extras — para fazê-las o aluno precisa ser aluno de um curso regular. Eles contam em cards próprios (`matriculas_banda`, `matriculas_coral`). O texto anterior ("inclui alunos que estão só em banda/projeto") contrariava a implementação viva e foi retirado.
- ⚠️ **Trancado NÃO conta como ativo.** A regra viva (`vw_alunos_estado_operacional_v131`) tira trancado da base ativa; o texto anterior incluía `status = 'trancado'` e está superado desde a v1.3.1 do Emusys (29/07/2026).
- Segundo curso e múltiplas matrículas do mesmo aluno **não duplicam** aluno ativo.
- Kids/School deve usar a mesma base de alunos ativos; `Kids + School + Sem classificação` deve fechar com `alunos_ativos`.
- 🚫 `COUNT(*)` sobre linhas de `alunos` para ativos/pagantes é bug quando duplica pessoa por matrícula, segundo curso ou vínculo adicional.

### Matrículas ativas

✅ Regra validada pelo Alf em 2026-06-08:

- Base = **registros/vínculos/matrículas**, não pessoas únicas.
- Inclui curso regular, segundo curso, banda/projeto, coral, bolsistas integrais/parciais e pagantes.
- Pode ser maior que `alunos_ativos`, porque um aluno pode ter mais de uma matrícula/vínculo.

---

## Pagantes, MRR e ticket

### Pagantes

✅ Regra validada pelo Alf em 2026-06-06:

- `alunos_pagantes` é por pessoa/aluno, não por matrícula/curso;
- bolsista integral não conta como pagante;
- bolsista parcial não conta como pagante;
- segundo curso não duplica a pessoa no denominador;
- aluno com múltiplos cursos continua contando como **1 aluno pagante**, se for pagante.

### Ticket médio

✅ Regra canônica validada pelo Alf em 2026-06-06:

```text
Ticket médio = faturamento total dos cursos dos alunos pagantes / alunos pagantes
```

Interpretação operacional:

- Numerador: somar o valor/faturamento de **todos os cursos** do aluno pagante, incluindo segundo curso.
- Denominador: contar cada aluno/pessoa pagante **uma única vez**.
- Excluir bolsistas integrais e bolsistas parciais do numerador e do denominador.
- Não calcular ticket médio como `AVG(valor_parcela)` por matrícula/linha, porque isso duplica aluno com múltiplos cursos e distorce o KPI.

Exemplo: se um aluno pagante tem 4 cursos de R$380 + R$355 + R$367 + R$127, o numerador recebe R$1.229 e o denominador recebe 1 pessoa.

✅ **Refinamento validado em 2026-07-07 (Alf, resolvendo divergência com o Financeiro Emusys/ADM):** o denominador "por pessoa" acima **está correto e não muda**. O que estava incompleto era a fonte do valor de cada parcela no numerador — não é o campo cadastral estático `alunos.valor_parcela`, é a **fatura da competência** no Emusys (`GET /faturas`). Regra final:

```text
Ticket médio = soma das parcelas de mensalidade da competência / alunos pagantes únicos da competência
```

- Entra só fatura de **Parcela/Mensalidade** — passaporte, taxa de matrícula, lojinha, estoque etc. NÃO entram.
- Aluno conta **uma vez só** no denominador (mesma regra de sempre).
- Aluno com 2 cursos e 2 parcelas: as duas entram no numerador, mas ele conta uma vez no denominador.
- **Inadimplente entra no denominador também** — não é "quem pagou no mês", é a base pagante/faturável do mês.
- Valor de cada fatura:
  - fatura **paga** → usar `valor_pago`;
  - fatura **aberta/inadimplente** → usar o valor devido **atualizado**: sem o desconto condicional (pontualidade) perdido, + juros/multa quando aplicável.

Implica buscar a fatura por competência (via `/faturas`, idealmente sincronizado), não usar o snapshot cadastral em `alunos.valor_parcela`. Detalhe/mapeamento técnico: `references/pendencias-bloqueadores.md`.

### MRR

✅ Regra canônica validada pelo Alf:

- MRR = soma das parcelas/mensalidades recorrentes pagantes.
- Segundo curso pagante entra no MRR/faturamento, porque é recorrência real paga pelo aluno.
- Segundo curso **não duplica** a pessoa no denominador de `alunos_pagantes` nem de ticket médio.
- Bolsistas integrais/parciais não entram no MRR/ticket, salvo regra futura explícita em contrário.
- Passaporte não entra no MRR; é receita à parte.

---

## Evasão, churn e renovação

### Evasão

- 📋 Evasão = `evasao` + `nao_renovacao` em `movimentacoes_admin`, desde que represente perda real do aluno.
- ✅ Transferência interna entre unidades **não é evasão/churn global da LA Music**.
- ✅ Quando o aluno sai de uma unidade e continua ativo em outra unidade, classificar como transferência interna, não como perda de aluno.
- 📋 Para análise por unidade, transferência pode aparecer como saída operacional da unidade origem e entrada na unidade destino, mas deve ficar separada de evasão/não renovação.
- 📋 Para análise global LA Music, transferência interna não entra no numerador de churn.
- ✅ Aviso prévio não é evasão na competência em que foi avisado.
- ✅ **Regra corrigida em 2026-08-08 (Alf):** o aviso prévio cobre o **mês vigente do aviso + o mês seguinte** — 2 meses. Exemplo: aviso dado em **agosto** → o aluno estuda **agosto e setembro**; a saída real é no fim de setembro. Para KPI, usar a competência da saída real/encerramento, não a do aviso.
- 🚫 A versão anterior deste arquivo dizia "aviso em maio → cumpre maio, junho e julho" (3 meses). Está **errada** e foi corrigida.
- 📋 Trancamento não é evasão.
- 🚫 Movimentação por nome, sem vínculo confiável por `aluno_id`, `matricula_id` ou `emusys_matricula_id`, não autoriza classificar evasão.
- 🚫 Não usar `evasoes_v2` como fonte viva.

### Churn

✅ Fórmula canônica:

```sql
evasoes / alunos_pagantes * 100
```

### Taxa de renovação

✅ **Resolvida em 2026-08-08 (Alf):**

```sql
renovacoes / (renovacoes + nao_renovacoes) * 100
```

- **Aviso prévio NÃO entra no denominador** — aviso prévio e taxa de renovação são indicadores distintos.
- Confere com a implementação viva (`vw_kpis_gestao_mensal`, `AdministrativoPage`).
- Renovação só conta se **confirmada** (exclui `pendente_validacao`).
- Movimentações de atividade extra (banda/coral) ficam fora, via `is_movimentacao_admin_retencao_valida`.
- Meta: `>= 80%`.

### Renovação antecipada

✅ Regra operacional validada pelo Alf em 2026-06-09:

- Renovação antecipada é uma renovação lançada no Emusys antes da competência efetiva do novo ciclo.
- Exemplo real: webhook/lançamento em junho, mas `matricula.data_primeira_aula` do novo ciclo em julho.
- Não apagar renovação antecipada para “limpar” relatório; o sistema deve preservar o evento e classificar corretamente.
- Para KPI/relatório mensal, renovação antecipada **não deve contar como renovação realizada no mês do lançamento**.
- Deve aparecer em ambiente/lista própria de **Renovações Antecipadas**.
- Deve contar como renovação efetiva na competência da primeira aula/novo ciclo, se continuar válida.
- Campo canônico preferencial no payload Emusys: `payload_bruto.matricula.data_primeira_aula`; fallback: maior `disciplinas[].data_hora_primeira_aula`.
- O Report deve separar: data de lançamento/webhook, data efetiva da renovação, competência efetiva e status operacional (`antecipada`, `efetivada`, `cancelada`, etc.).
- Código atual que grava `renovacoes.data_renovacao` ou `movimentacoes_admin.data` como “hoje” para renovação antecipada é bug operacional, pois suja o mês do lançamento.

---

## Kids / School

✅ Fonte canônica: `idade_atual`.

- LAMK/Kids: `idade_atual <= 11`.
- EMLA/School: `idade_atual >= 12`.

❓ Qualquer uso de `classificacao` textual deve ser tratado como possível fonte desatualizada até alinhamento.

---

## Canto coral e banda

### Banda

- 📋 Canônico operacional: `cursos.is_projeto_banda = true`.
- 🚫 Filtros por nome como `ILIKE '%banda%'` ou `ILIKE '%power kids%'` são legado temporário.

### Canto Coral

✅ **Regra de negócio (Alf, 2026-08-08):** Canto Coral é **atividade extra**, igual banda — não é cobrado e **não conta como aluno pagante**.

⚠️ **A coluna `cursos.is_coral` NUNCA foi criada** (verificado no banco em 2026-08-08). A decisão P4 segue não implementada, e hoje convivem 4 critérios por nome:

| Onde | Critério vigente |
|---|---|
| KPI de alunos (`get_kpis_alunos_admin_operacional_impl_v2`) | `nome LIKE '%coral%'` |
| Retenção (`is_atividade_extra_curso`) | `nome ILIKE '%canto coral%'` |
| `vw_kpis_gestao_mensal` | `nome ILIKE '%canto coral%'` |
| Frontend (8 arquivos) | `includes('canto coral')` |

Efeito: um curso "Coral Infantil" **sai** da contagem de alunos e **entra** na de retenção. Padronização pendente — ver `docs/REGRAS-DE-NEGOCIO.md` §14 (P1).

---

## Fideliza+

✅ Regra validada pelo Alf em 2026-06-07:

O programa Fideliza+ é **trimestral**, não mensal.

Recortes oficiais:

- Q1 = Janeiro, Fevereiro, Março.
- Q2 = Abril, Maio, Junho.
- Q3 = Julho, Agosto, Setembro.
- Q4 = Outubro, Novembro, Dezembro.

Implicações:

- O painel deve deixar claro qual trimestre está sendo calculado.
- Não deve parecer que os números do Fideliza+ são KPIs mensais do mês selecionado na página.
- Se a página estiver filtrada em `Mai/2026`, o Fideliza+ de Q2 deve se apresentar como `Q2 — Abr/Mai/Jun`, não como Maio isolado.
- Churn, inadimplência, renovação, reajuste e demais métricas do Fideliza+ devem usar o recorte trimestral correspondente.
- Transferência interna entre unidades não conta como evasão/churn global também no Fideliza+.

---

## Aulas experimentais e funil

- 📋 A experimental conta quando é realizada, não quando é agendada.
- 📋 `experimentais_realizadas`: status `experimental_realizada` ou `matriculado`.
- 📋 `experimentais_agendadas`: inclui `experimental_agendada`, `experimental_realizada`, `matriculado`.
- ✅ **Resolvido em 2026-08-08:** o caminho canônico `get_kpis_comercial_canonicos_v2` conta pela **`data_experimental`**, não por `data_contato`. A pendência antiga valia para `vw_kpis_gestao_mensal`, que agrupa por `data_contato` e não é o caminho canônico.

### Conversão geral do funil

❓ Pendente:

- `novas / total_leads`; ou
- `novas / leads_com_exp`.

Não fechar sem validação.

---

## Professores

### Carteira professor

- 📋 Conta alunos com `professor_atual_id` e `status = 'ativo'`.
- 📋 Inclui segundo curso como matrícula.
- 📋 Não inclui banda.
- 📋 Não inclui `trancado`.

### Conversão professor

✅ Fórmula canônica:

```sql
matriculas_pos_experimental / experimentais_realizadas * 100
```

✅ Apenas matrículas originadas de experimental realizada por aquele professor entram no numerador.

🚫 Cálculo que permite taxa >100% por matrícula sem experimental é bug/legado.

---

## LTV / permanência

✅ Fórmula LTV:

```sql
ticket_medio * tempo_permanencia_meses
```

📋 Regra “saiu de tudo”: só conta quando aluno encerra todas as matrículas.

📋 Excluir passagens menores que 4 meses.

---

## Arquivamento

📋 Arquivamento técnico: mover para `alunos_arquivados` e remover de `alunos`.

🚫 Ação destrutiva. Nunca executar sem autorização explícita do Alf.
