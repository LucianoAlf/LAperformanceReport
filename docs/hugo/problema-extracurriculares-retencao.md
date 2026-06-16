# Atividades extracurriculares contaminando renovação e cancelamento

**Data:** 2026-06-16
**Levantado por:** Arthur (unidade Barra)
**Documentado por:** Hugo (via análise de código + banco)
**Para:** Luciano
**Status:** diagnóstico — **nenhuma alteração foi feita**. Documento para decisão.

---

## 1. O problema, na voz do Arthur

Transcrição literal da mensagem do Arthur:

> Hugo, bom dia, meu mano. Tudo na paz?
>
> Então, tem uma questão aqui que no report tá puxando as paradas automaticamente do Emusys, né? E acabou que teve sete cancelamentos, mas são cancelamentos de matrícula e não de alunos, tá? Porque o Canto Coral daqui da escola acabou. Então o Canto Coral que a gente tinha no sábado, e ele obviamente acaba não entrando nos nossos cálculos de métricas e tudo mais porque é uma atividade extracurricular, né? Só que ela ficava no sistema.
>
> Existe a possibilidade de fazer alguma separação, tipo, colocar essas atividades como Minha Banda Pra Sempre, Power Kids e o Canto Coral como atividades extras que não contabilizassem pros números da escola? Tipo, pô, as taxas de renovação vão ficar ruins por conta de que elas são renovações teoricamente pendentes, né, o Coral e o Power Kids, sendo que eles não têm que contabilizar porque eles funcionam de maneira diferente.
>
> Então todos os cálculos que eu acabo utilizando em base de automação aqui do próprio report, ele não tá puxando porque acaba fazendo uma confusão muito grande. Aí ter que ter aquela atenção direta manualmente de novo fica de boa, até porque eu faço isso, mas se no futuro o objetivo é automatizar tudo, se puder dar uma olhada nisso, por favor.

**Resumo do pedido:** atividades extracurriculares (Canto Coral, Minha Banda Para Sempre, Power Kids) não deveriam contar nas métricas de **renovação** e **cancelamento/evasão** da escola. Na Barra, o Canto Coral acabou e gerou 7 "cancelamentos" que entraram nas métricas; renovações de Coral/Power Kids aparecem como "pendentes" indevidamente, distorcendo as taxas e quebrando as automações que o Arthur monta em cima do report.

---

## 2. O que apuramos (resumo da investigação)

### 2.1 A infraestrutura já existe — e os cursos do Arthur já estão marcados

Existe a flag `is_projeto_banda` na tabela `cursos`. Os cursos citados pelo Arthur já estão marcados como extracurriculares (`is_projeto_banda = true`):

- Canto Coral (id 39)
- Minha Banda Para Sempre (id 33)
- Power Kids (id 25)
- (também: GarageBand, Percussion Kids, Teoria Musical, Circuito de Férias 1/2)

### 2.2 A causa raiz: a exclusão de extracurricular nunca foi centralizada

Não há um único lugar que define "isto é extra, ignore em todos os KPIs". Cada métrica é calculada no seu próprio canto (cada função no banco, cada CTE, cada arquivo no front), e o filtro de banda/coral foi sendo aplicado **um por um, na mão**. Resultado: foi aplicado em algumas métricas e **esquecido** em outras.

| Métrica | Filtra banda/coral? |
|---|---|
| Alunos pagantes, ativos | ✅ Sim |
| Ticket médio | ✅ Sim |
| Novas matrículas | ✅ Sim |
| Reajuste médio | ✅ Sim |
| **Evasão, churn, renovação** | ❌ **Não** |

Pelos relatórios canônicos do Luciano/Hugo/Handolf, o mutirão de saneamento focou em **alunos e financeiro**. A **retenção** (evasão/renovação) foi saneada em outros aspectos (renovação automática Emusys, aviso prévio, competência), mas a exclusão de extracurricular **não entrou no pacote** — ficou no vão.

### 2.3 Onde exatamente o furo acontece (3 pontos)

Todos contam evasão/renovação direto, sem fazer join com `cursos` para olhar a flag:

| # | Onde | O que alimenta |
|---|---|---|
| 1 | **Front** — `src/lib/retencaoOperacionalCanonica.ts` (`calcularRetencaoOperacionalCanonica`) | Tela de retenção detalhada (mês vivo). A flag só é usada no cálculo de **reajuste**, não em evasão/renovação. |
| 2 | **Banco** — `recalcular_dados_mensais` (migration `20260531_recalcular_dados_mensais_v2.sql`) | Histórico fechado em `dados_mensais`. Itens 7 (evasões), 8 (churn) e 11 (taxa de renovação) não filtram banda. |
| 3 | **Banco** — `get_kpis_alunos_canonicos` → base `_p01q` (CTE `evasoes_live`) | Cards de evasão/churn no Dashboard, Gestão, Administrativo **+ relatórios de IA** (`get_dados_relatorio_gerencial`, `get_dados_retencao_ia`). |

### 2.4 Impacto real medido (movimentações de extracurricular em 2026)

```
Barra        — renovação: 8   evasão: 4
Campo Grande — renovação: 17
Recreio      — renovação: 1   evasão: 4   trancamento: 1
```

(O bloco da Barra bate com os "7 cancelamentos" citados pelo Arthur.)

### 2.5 Inconsistência que isso gera

- **Denominador** (alunos pagantes) → já exclui banda/coral.
- **Numerador** (cancelamentos, renovações) → ainda inclui banda/coral.

Numerador e denominador medindo coisas diferentes = taxa de evasão inflada e renovação distorcida. É exatamente o que o Arthur sente.

---

## 3. O que eu (Hugo) acho que deve ser feito

**A correção é o certo a fazer** — é apenas terminar de aplicar, na retenção, a mesma regra que o Luciano já adotou em todo o resto dos KPIs (ticket, reajuste, pagantes). Não é regra nova; é coerência.

Escopo recomendado: **corrigir do presente em diante, sem mexer no histórico.** Isso respeita o princípio dos próprios relatórios canônicos:

> "Snapshot histórico fechado: valores oficiais de meses fechados." / "mês fechado não está recalculando pela tabela viva."

Ou seja: **não recalcular `dados_mensais` de meses já fechados** (isso violaria a imutabilidade do mês fechado e é decisão exclusiva do Luciano). O Hugo já confirmou que **não quer recalcular o histórico**.

### Consequência honesta a registrar

Vai existir uma "emenda" na série: meses já fechados seguem contando banda/coral, e do mês atual em diante não. Comparações mês a mês podem parecer uma "melhora" de churn/renovação que na verdade é só a mudança de regra. Não quebra nada, mas Arthur e Luciano devem saber pra não lerem como melhora real.

---

## 4. Como eu acho que deve ser feito

Três frentes, todas aplicando o mesmo critério (`cursos.is_projeto_banda = true` OU nome contendo coral/banda/projeto/garage — o critério já usado hoje na função `isCursoExcluidoReajuste`):

1. **Front** — `retencaoOperacionalCanonica.ts` + `useKPIsRetencao.ts`
   - O hook já precisa trazer `curso_id` (a coluna existe em `movimentacoes_admin`) e enriquecer com `cursos(is_projeto_banda, nome)`.
   - Em `calcularRetencaoOperacionalCanonica`, descartar movimentações de curso extracurricular **antes** de contar evasões/não-renovações/renovações.

2. **Banco — RPC viva** — `get_kpis_alunos_canonicos_base_p01q`
   - Na CTE `evasoes_live` (e equivalente de renovação, se houver), adicionar `JOIN cursos` filtrando extracurricular.

3. **Banco — fechamento futuro** — `recalcular_dados_mensais`
   - Adicionar o mesmo filtro nos itens de evasões, churn e taxa de renovação. Vale só para os próximos fechamentos; **não re-rodar meses passados.**

### Pontos que ainda preciso confirmar antes de implementar

- **Taxa de renovação no caminho canônico (`_p01q`)**: confirmar se ela calcula renovação ou só evasão (pode haver um 4º ajuste).
- **Fideliza+** (`get_programa_fideliza_dados`): segundo o próprio relatório do Luciano ainda é legado com fonte própria — pode contar banda também.

### Decisão de negócio (do Luciano)

- **Lista do que é "extracurricular"**: hoje a flag cobre Coral, Power Kids, Banda, GarageBand etc. Se houver outra atividade que a escola considere extra, precisa ser marcada também.
- **Filtrar como?** o critério atual mistura flag (`is_projeto_banda`) + nome ("coral"). Vale decidir se a flag passa a ser a única fonte de verdade (mais limpo) e garantir que todos os cursos extra estejam marcados.

---

## 5. TL;DR para o Luciano

- Arthur está certo: extracurricular (Coral/Banda/Power Kids) está contando em **evasão, churn e renovação**, distorcendo as taxas da Barra (e das outras unidades).
- A flag `is_projeto_banda` já existe e os cursos já estão marcados; o filtro só não foi aplicado nas métricas de retenção — em todo o resto (ticket, reajuste, pagantes) já é aplicado.
- São **3 pontos de código** (1 front + 2 banco) para corrigir do presente em diante.
- **Não vamos recalcular o histórico** (respeita a regra de mês fechado imutável). Só do mês atual em diante.
- Falta confirmar 2 pontos técnicos (renovação no `_p01q`, Fideliza+) e 1 decisão de negócio (lista de cursos extra + critério do filtro).
- **Nada foi alterado.** Aguardando sua avaliação.
