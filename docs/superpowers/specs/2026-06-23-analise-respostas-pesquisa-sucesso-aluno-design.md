# Design — Aba "Respostas": registro + análise da pesquisa pós-1ª aula

**Data:** 2026-06-23
**Contexto:** Sucesso do Aluno / pesquisa pós-primeira-aula (NPS)
**Status:** aprovado pelo usuário, pendente implementação

## Problema

A aba "Pós-1ª Aula" (`PesquisaPrimeiraAulaTab`) hoje só lista os candidatos a receber a
pesquisa e permite enviá-la. As respostas dos alunos são gravadas em `pesquisas_whatsapp`
(campo `nota` 1–5, via `processar-resposta-pesquisa`), mas **não existe nenhuma tela que
mostre essas respostas nem uma análise agregada**. A coordenação não tem visão de:

- quantas pesquisas foram respondidas (taxa de resposta);
- nota média e distribuição das notas;
- quais professores/unidades/cursos estão encantando (ou não) os calouros na 1ª aula;
- evolução da satisfação ao longo do tempo;
- quais alunos deram nota baixa (alerta de risco de evasão precoce).

## Escopo

Criar uma **nova sub-aba "Respostas"** dentro de `PesquisasTab.tsx`, ao lado das sub-abas
"Pós-1ª Aula" e "Evasão" (estado local `subAba`, **não** são tabs de página/`PageTabs`),
contendo:

1. **KPIs gerais** — enviadas, taxa de resposta, nota média, distribuição por estrela.
2. **Recortes** — nota média + quantidade por professor, por unidade e por curso.
3. **Evolução no tempo** — nota média / volume por semana.
4. **Registro de respostas** — lista individual (aluno, nota, curso, professor, unidade,
   data), com notas baixas (1–2★) destacadas em vermelho e botão "abrir conversa" que leva
   o aluno à Caixa de Entrada do departamento Sucesso do Aluno.

### Fora de escopo (YAGNI)

- **Status "tratado/pendente"** das notas baixas — decidido começar sem. O alerta a cada
  resposta já existe (a edge `processar-resposta-pesquisa` notifica o gerente). Adicionar
  acompanhamento de tratamento depois, se a Fabi sentir falta. **Sem migration neste MVP.**
- **Feedback textual** do aluno — a lista nativa de WhatsApp não tem campo de texto e a
  tabela não tem coluna de comentário. Tratado em pendência separada.
- **Marcos de 1 mês / 3 meses** — só existe `tipo='pos_primeira_aula'` hoje. A aba já filtra
  por tipo, então é extensível, mas os outros marcos não fazem parte deste design.
- **Snapshot de professor/curso no envio** — ver "Limitação conhecida".

## Arquitetura

Padrão do projeto: agregação no banco via RPC, consumo via hook customizado + Supabase
client direto (sem React Query). Cálculo de BI fica no Postgres, front fica fino.

### Camada de dados (sem migration)

Duas RPCs novas, ambas `STABLE`, filtrando `tipo = 'pos_primeira_aula'`. O período é aplicado
sobre `enviado_em` (a taxa de resposta compara enviadas × respondidas da mesma janela de envio).
Os recortes professor/curso/unidade saem do vínculo atual do aluno, exatamente como a RPC
`get_candidatos_pesquisa_primeira_aula` já resolve:

- `alunos.curso_id → cursos.nome`
- `alunos.professor_atual_id → professores.nome`
- `alunos.unidade_id → unidades.nome`

#### `get_analise_pesquisas(p_unidade_id uuid, p_data_inicio date, p_data_fim date)`

Retorna um único objeto JSON:

```jsonc
{
  "kpis": {
    "enviadas": 42,
    "respondidas": 27,
    "taxa_resposta": 64.3,        // respondidas / enviadas * 100
    "nota_media": 4.2,
    "distribuicao": { "1": 2, "2": 1, "3": 4, "4": 11, "5": 18 }
  },
  "por_professor": [ { "professor_nome": "Israel", "qtd": 9, "nota_media": 4.8 } ],
  "por_unidade":   [ { "unidade_nome": "Campo Grande", "qtd": 20, "nota_media": 4.3 } ],
  "por_curso":     [ { "curso_nome": "Guitarra", "qtd": 12, "nota_media": 4.0 } ],
  "evolucao":      [ { "periodo": "2026-06-15", "qtd": 8, "nota_media": 4.1 } ]  // por semana (date_trunc)
}
```

- `enviadas` = linhas com `enviado_ok = true` no período.
- `respondidas` = subconjunto com `nota IS NOT NULL`.
- Médias e distribuição calculadas só sobre respondidas.
- `evolucao` agrupa por `date_trunc('week', respondido_em)` (ou `enviado_em`; ver decisão na
  fase de plano), retornando volume e nota média por semana.
- `p_unidade_id NULL` = consolidado (todas as unidades).

#### `get_respostas_pesquisa(p_unidade_id uuid, p_data_inicio date, p_data_fim date)`

Lista individual das respostas (apenas `nota IS NOT NULL`), ordenada por `respondido_em` desc:

```
aluno_id, nome, nota, curso_nome, professor_nome, unidade_nome, enviado_em, respondido_em
```

### Frontend

- **Aba**: nova sub-aba `subAba='respostas'` em `src/components/App/SucessoCliente/PesquisasTab.tsx`
  (junto de "Pós-1ª Aula" e "Evasão"). Componente `RespostasPesquisaTab`.
- **Hook**: `useAnalisePesquisas(unidadeAtual, dataInicio, dataFim)` — chama as duas RPCs,
  expõe `{ analise, respostas, loading, recarregar }`.
- **Layout** (de cima para baixo):
  1. Seletor de **mês** (default: mês atual). Respeita o filtro de unidade global da página.
  2. Linha de **cards KPI**: Enviadas, Taxa de resposta (%), Nota média (★), Distribuição
     (mini barras 1★…5★).
  3. **Evolução** (gráfico de linha, Recharts) + **Por professor** (barras ou tabela com ⚠ em
     médias baixas), lado a lado.
  4. **Por unidade** e **Por curso** (tabelinhas lado a lado).
  5. **Registro de respostas** (tabela): Nome, Nota (estrelas), Curso, Professor, Unidade,
     Data. Linhas com nota 1–2★ destacadas em vermelho; coluna de ação com botão
     "Abrir conversa".
- **Estado vazio**: sem respostas no período → mensagem amigável ("Nenhuma resposta ainda
  neste período"). Relevante porque `pesquisas_whatsapp` está zerada hoje.
- **"Abrir conversa"**: navega para a Caixa de Entrada (departamento `sucesso_aluno`) com o
  aluno selecionado. Mecanismo exato de navegação a confirmar na fase de plano.
- **Charts**: Recharts (já no projeto). `cn()` + Tailwind, dark mode, padrão visual das
  outras abas.

## Permissões

Segue o modelo existente: usuário de unidade vê apenas a própria unidade (RPC recebe a
`unidade_id` correspondente); admin/consolidado (`canViewConsolidated()`) recebe `NULL` e vê
todas. Sem RLS adicional — as RPCs respeitam o `p_unidade_id` recebido do front, como as
demais RPCs de KPI do projeto.

## Limitação conhecida

O professor/curso/unidade dos recortes vêm do **vínculo atual** do aluno
(`professor_atual_id`, `curso_id`), não de um snapshot do dia da 1ª aula. Para um calouro
recém-matriculado isso quase nunca diverge. Caso no futuro se queira precisão histórica
(aluno que trocou de professor), a evolução seria gravar `professor_id`/`curso_id` em
`pesquisas_whatsapp` no momento do envio. Fora de escopo agora.

## Critérios de aceite

- Aba "Respostas" visível na página de Sucesso do Aluno.
- KPIs corretos para um período/unidade com dados de teste.
- Recortes por professor, unidade e curso exibem nota média e quantidade.
- Gráfico de evolução por semana.
- Lista de respostas com notas baixas destacadas e botão "abrir conversa" funcional.
- Estado vazio tratado.
- Respeita o filtro de unidade / permissão consolidada.
- Nenhuma alteração de schema (sem migration).

## Componentes e arquivos previstos

- `supabase/migrations/` — **nenhuma** (sem schema novo).
- RPCs `get_analise_pesquisas` e `get_respostas_pesquisa` (via MCP `apply_migration` apenas
  para criar as funções, sem DDL de tabela).
- `src/components/App/SucessoCliente/RespostasPesquisaTab.tsx` (novo).
- `src/components/App/SucessoCliente/hooks/useAnalisePesquisas.ts` (novo).
- `src/components/App/SucessoCliente/PesquisasTab.tsx` — adicionar a sub-aba `respostas`
  (botão de sub-aba + render condicional do `RespostasPesquisaTab`).
