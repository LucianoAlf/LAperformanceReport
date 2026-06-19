# Extracurriculares em Renovação e Cancelamento

**Data:** 2026-06-16
**Origem:** pedido do Arthur (Barra) — atividades extracurriculares contaminando métricas
**Status:** diagnóstico (nada alterado ainda)

## O pedido

Separar atividades extracurriculares (Canto Coral, Minha Banda Para Sempre, Power Kids) para que **não contabilizem** nas métricas de renovação e cancelamento da escola. Na Barra, o Canto Coral acabou e gerou 7 "cancelamentos" que entraram nas métricas indevidamente; renovações do Coral/Power Kids aparecem como "pendentes" sem precisar.

## O que já existe

- Flag `is_projeto_banda` na tabela `cursos`.
- Cursos do Arthur **já marcados** como `is_projeto_banda = true`:
  - Canto Coral (id 39)
  - Minha Banda Para Sempre (id 33)
  - Power Kids (id 25)
  - (também: GarageBand, Percussion Kids, Teoria Musical, Circuito de Férias 1/2)
- Na **contagem de alunos pagantes/ativos** essas atividades **já são excluídas** — ver `src/lib/kpisAlunosVivosCanonicos.ts:180` (`isBanda` / `isCoral`).

## O furo (causa do problema)

No cálculo de **retenção** (evasões, não-renovações, renovações pendentes, taxa de evasão, taxa de renovação) o filtro `is_projeto_banda` **NÃO é aplicado**.

- Arquivo: `src/lib/retencaoOperacionalCanonica.ts`
- A flag só é usada em `isCursoExcluidoReajuste` (linha ~222), exclusivamente para o cálculo de **reajuste médio** (`percentualReajusteMedioCanonico`).
- A função principal `calcularRetencaoOperacionalCanonica` **não filtra** projeto-banda/coral das movimentações de evasão/não-renovação/renovação.

Confirmado também no `relatorio_tecnico_handolf_hugo_fontes_canonicas_alunos_2026-06-10.md`: o Coral é excluído apenas no reajuste médio; nas regras saneadas de evasão/não-renovação/MRR perdido (seção 4.5) não há exclusão de extracurricular.

### Inconsistência resultante

- **Denominador** (alunos pagantes) → já exclui Coral/Power Kids/Banda.
- **Numerador** (cancelamentos, renovações pendentes) → ainda inclui Coral/Power Kids/Banda.

Isso infla a taxa de evasão e distorce a renovação — exatamente o que o Arthur relatou.

## Correção proposta

Aplicar o mesmo filtro `is_projeto_banda` (e o caso textual "canto coral") na função `calcularRetencaoOperacionalCanonica`, descartando movimentações de cursos extracurriculares antes de contar evasões, não-renovações e renovações — tornando numerador e denominador consistentes.

Pontos a confirmar antes de mexer:
- Origem das movimentações (`movimentacoes_admin` / hook `useKPIsRetencao`) precisa trazer o vínculo do curso (`cursos:curso_id(is_projeto_banda, nome)`) para o filtro funcionar no front.
- Decidir se a exclusão vale para todas as telas de retenção (Dashboard, Gestão, Administrativo) — provavelmente sim, para consistência.

**Risco:** baixo. A infraestrutura (flag + cursos marcados + padrão de exclusão já usado na base de pagantes) já existe.
