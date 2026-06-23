# Sync de Matrículas Emusys × Banco — Design

**Data:** 2026-06-22
**Autor:** Hugo + Claude
**Status:** Aprovado (design) — pendente implementação

## Problema

O webhook de matrícula do Emusys é a única fonte de contrato hoje, e ele tem buracos:

1. **Desconto não vem no webhook.** `matricula_nova` manda o `valor` **cheio** (ex.: João Felipe 22/06 — webhook mandou 480, mas a API tem desconto condicional de 44, líquido 436). O colaborador (Cleiton) tem que **corrigir o valor na mão**. Prova: `automacao_log` id 7107 (`raw_valor:"480"`) vs `alunos.valor_parcela=436` editado depois.
2. **Troca de professor e troca de curso não disparam webhook nenhum.** O aluno muda de professor/curso no Emusys e o nosso banco fica defasado indefinidamente. Isso distorce o score do professor (atribuído por `professor_atual_id`).
3. **Status defasado.** Finalizações/trancamentos/destrancamentos se perdem no webhook → ~31 "ativos fantasma" que já saíram no Emusys continuam ativos no nosso (inflam base de ativos, retenção, score).
4. **`data_fim_contrato` furada** (8% preenchida antes do backfill de 22/06).

A API v1.2.0 (`GET /matriculas`, lançada 21/06) é o primeiro endpoint de **pull de contrato** — permite complementar o que o webhook não entrega.

## Objetivo

Manter `alunos` espelhado com o estado real do Emusys, **sem ninguém corrigir na mão**, via duas frentes que compartilham o mesmo motor de reconciliação:

- **Complemento pontual (event-driven):** na matrícula nova/renovação, buscar 1 aluno na API e aplicar desconto/valor na hora.
- **Sync de varredura (de hora em hora):** detectar trocas silenciosas (professor, curso, status) que não geram webhook.

O que a API decide deterministicamente é aplicado automático; o que é ambíguo vai pra uma **fila de conciliação** na página de Alunos (mesma mecânica da conciliação de experimentais em Comercial).

## Não-objetivos

- **Renovações (`numero_renovacoes`)** — fora do escopo. `qtd_contratos` da API é semanticamente ambíguo (relação dispersa, ver `pendencias-2026-06-22`). Precisa esclarecimento do Emusys.
- Reescrever a lógica de evasão/LTV existente. O sync **usa** os mesmos efeitos (data_saida, passagem LTV) que o edge já faz.
- Push de volta pro Emusys. A API não tem endpoint de escrita de contrato/desconto — a edição manual no LA Report é local (ver "campo fixado").

---

## Arquitetura

```
┌─ FRENTE 1: COMPLEMENTO PONTUAL (event-driven) ──────────────┐
│ webhook matricula_nova / matricula_renovada                  │
│   → processar-matricula-emusys (edge existente)              │
│   → no fim do handler: GET /matriculas?aluno_id=X            │
│   → calcula valor líquido + grava desconto                   │
│   → reconciliarAluno(aluno, matriculaApi)  ◄── motor comum   │
└──────────────────────────────────────────────────────────────┘

┌─ FRENTE 2: SYNC DE VARREDURA (pg_cron, de hora em hora) ─────┐
│ sync-matriculas-emusys (edge nova)                           │
│   → GET /matriculas?status=ativa (3 unidades, paginado)      │
│   → para cada ativo nosso: reconciliarAluno(...)  ◄── motor  │
│   → quem está ativo no nosso e sumiu da API: busca finalizada│
└──────────────────────────────────────────────────────────────┘

         motor comum: reconciliarAluno()
           ├─ casa por emusys_matricula_id → nome → pessoa+curso
           ├─ AUTO: aplica campos determinísticos + loga
           └─ FILA: insere/atualiza matriculas_divergencias
```

### Motor comum: `reconciliarAluno(alunoNosso, matriculasApi[])`

Recebe um aluno do nosso banco e as matrículas dele na API. Classifica e age:

**Casamento** (3 camadas, já provadas no backfill de 22/06):
1. `emusys_matricula_id` exato
2. nome normalizado 1:1
3. pessoa + base do curso (desambigua 2º curso)

**Trilha AUTO** — aplica direto quando há **1 matrícula ativa determinável** e o campo não está fixado (ver abaixo):

| Campo nosso | Fonte na API | Regra |
|---|---|---|
| `valor_parcela` | `contrato_atual` | `valor_mensalidade − desconto_fixo − desconto_condicional` (líquido) |
| `desconto_fixo` (nova col.) | `contrato_atual.desconto_fixo` | cópia |
| `desconto_condicional` (nova col.) | `contrato_atual.desconto_condicional` | cópia |
| `valor_cheio` (nova col.) | `contrato_atual.valor_mensalidade` | cópia |
| `professor_atual_id` | `disciplinas[].id_professor` | casa por ID em `professores.emusys_id` |
| `curso_id` | `disciplinas[].disciplina_id` | de-para `(unidade, disciplina_id)` |
| `data_fim_contrato` | `contrato_atual.data_original_ultima_aula` | cópia |
| `status` | `status` da matrícula | `ativa→ativo`, `trancada→trancado`, `finalizada→evadido` |
| `data_saida` | `data_original_ultima_aula` | só quando vira evadido |
| `emusys_matricula_id` | `id` da matrícula | popula se nulo |

**Convergência:** como a fonte é o estado atual da API, o status segue a API nos dois sentidos. Se um aluno foi evadido por engano (webhook de destrancamento atrasado) e a API depois mostra `ativa`, o sync **re-ativa** no ciclo seguinte. O falso positivo se auto-corrige.

**Salvaguardas:**
- Evadir/trancar é **por matrícula** (`emusys_matricula_id`), nunca por pessoa — preserva 2º curso ativo.
- `data_saida` = data real da API, nunca `now()`.
- Toda mudança AUTO grava 1 linha em `automacao_log` (`evento='sync_matricula_reconciliacao'`, `acao`, `detalhes` com valor_antes/valor_depois por campo).
- **Modo dry-run** (`MODO_TESTE=true` no início): detecta e popula `matriculas_divergencias`, **não aplica** nada. Hugo revisa, depois liga.

**Trilha FILA** — vai pra `matriculas_divergencias` (precisa de humano):

| `tipo_divergencia` | Quando | Ex. dos 28 |
|---|---|---|
| `ambiguo` | várias ativas na API, nenhuma casa o curso nosso | Natan, Biancamano, Débora, Miguel Antunes |
| `ausente_api` | ativo no nosso, não existe na API | Maria Eduarda Pery |
| `duas_matriculas` | 2 ativas mesmo curso (2×/semana) | Lorenzo, Vitória |
| `disciplina_nao_mapeada` | `disciplina_id` da API sem entrada no de-para | curso novo no Emusys |
| `professor_nao_mapeado` | `id_professor` da API sem `emusys_id` casado | professor novo no Emusys |
| `valor_fixado_divergente` | campo fixado manualmente difere da API | (escape hatch) |

> Os 15 "status defasado" e os 5 "curso divergente determinável" dos 28 **saem na trilha AUTO** — não entram na fila. A fila final fica em ~6-8 casos.

---

## Edição manual + "campo fixado"

Os componentes de desconto/valor ficam **visíveis e editáveis** na tela de Alunos (edição inline, padrão do projeto). Comportamento:

- **Padrão:** o sync manda. Mantém tudo atualizado sozinho.
- **Ao editar manualmente** um campo (ex. `valor_parcela`, `desconto_*`): grava em `matriculas_campos_fixados` (aluno_id + campo + valor + quem + quando). O sync **deixa de sobrescrever aquele campo daquele aluno**.
- A tela mostra indicador "editado manualmente" + botão **"voltar a seguir a API"** (remove o fixado → sync volta a mandar).
- Se o valor fixado **diverge** da API → item `valor_fixado_divergente` na fila (transparência: "você pôs X, API diz Y").

No fluxo normal de matrícula nova isso **não acontece** — o complemento pontual já grava o valor certo, ninguém edita. O fixado é escape hatch pra API errada/desatualizada.

---

## Schema

### De-para de curso e professor (casamento por ID, não por nome)

**Por que não por nome:** o nome do curso/professor pode mudar (renomeação) e quebra o casamento silenciosamente. O `disciplina_id` da API é estável e vem 100% preenchido. Mas é **por unidade** — id `4` = "Canto T" na Barra, "Musicalização Infantil T" em CG. Por isso o de-para é `(unidade, disciplina_id)`. O `cursos.emusys_ids` (array global) atual está furado (mistura as 3 unidades → colisões, metade nulo) e será **substituído**.

**Fonte canônica:** `GET /disciplinas` e `GET /professores` por unidade (lista completa, não só as com matrícula ativa). Populados uma vez; o sync re-sincroniza o de-para a cada rodada e enfileira o que for novo.

```sql
CREATE TABLE curso_emusys_depara (
  unidade_id           uuid NOT NULL,
  emusys_disciplina_id integer NOT NULL,
  curso_id             integer REFERENCES cursos(id),  -- null = ainda não mapeado (vai pra fila)
  emusys_nome          text,           -- nome atual no Emusys (referência; não usado no casamento)
  PRIMARY KEY (unidade_id, emusys_disciplina_id)
);

ALTER TABLE professores ADD COLUMN emusys_id integer;  -- id_professor da API (pessoa); casa por ID
```
> `cursos.emusys_ids` (array) fica **deprecado** — migrar consumidores pro de-para e remover depois.

### Colunas novas em `alunos`
```sql
ALTER TABLE alunos
  ADD COLUMN valor_cheio numeric,           -- valor_mensalidade da API (sem desconto)
  ADD COLUMN desconto_fixo numeric,         -- desconto_fixo da API
  ADD COLUMN desconto_condicional numeric;  -- desconto_condicional (pontualidade)
-- valor_parcela (já existe) = valor_cheio - desconto_fixo - desconto_condicional
```

### `matriculas_divergencias` (estado detectado pelo sync)
```sql
CREATE TABLE matriculas_divergencias (
  id              bigserial PRIMARY KEY,
  aluno_id        integer REFERENCES alunos(id),
  emusys_matricula_id text,
  unidade_id      uuid,
  tipo_divergencia text NOT NULL,   -- ambiguo|ausente_api|duas_matriculas|valor_fixado_divergente
  campo           text,             -- campo afetado (quando aplicável)
  valor_nosso     jsonb,            -- snapshot do nosso lado
  valor_api       jsonb,            -- snapshot da API (candidatos)
  sugestao        jsonb,            -- proposta do sync
  severidade      text,             -- alta|media|baixa
  resolvido       boolean DEFAULT false,
  detectado_em    timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (aluno_id, tipo_divergencia, campo)
);
```

### `matriculas_divergencias_decisoes` (decisão humana — espelha `lead_experimentais_decisoes_humanas`)
```sql
CREATE TABLE matriculas_divergencias_decisoes (
  id            bigserial PRIMARY KEY,
  divergencia_id bigint REFERENCES matriculas_divergencias(id),
  aluno_id      integer,
  decisao       text NOT NULL,      -- aceitar_api|manter_nosso|escolher|ignorar
  valor_escolhido jsonb,            -- quando decisao=escolher
  motivo        text NOT NULL,
  decidido_por  text NOT NULL,
  decidido_em   timestamptz DEFAULT now(),
  metadata      jsonb DEFAULT '{}'::jsonb,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (divergencia_id)
);
```

### `matriculas_campos_fixados` (override manual)
```sql
CREATE TABLE matriculas_campos_fixados (
  id          bigserial PRIMARY KEY,
  aluno_id    integer REFERENCES alunos(id),
  campo       text NOT NULL,        -- valor_parcela|desconto_fixo|curso_id|professor_atual_id|...
  valor       jsonb NOT NULL,
  fixado_por  text NOT NULL,
  fixado_em   timestamptz DEFAULT now(),
  UNIQUE (aluno_id, campo)
);
```

---

## RPC `get_conciliacao_matriculas(p_unidade_id, ...)`

Retorna `{ resumo, items }` (mesmo contrato da conciliação de experimentais):
- `resumo`: contadores por `tipo_divergencia`, total pendente, total resolvido.
- `items`: divergências `resolvido=false` sem decisão, com snapshots `valor_nosso`/`valor_api`/`sugestao` pra UI montar o "antes/depois".
- Item sai da fila quando ganha linha em `matriculas_divergencias_decisoes` (igual `decidido_por` faz hoje).

---

## UI: aba "Conciliação Emusys" em Alunos

Espelha `ComercialConciliacaoExperimentais.tsx`:
- **Cards de resumo** por tipo de divergência.
- **Fila** de itens com snapshot nosso × API.
- **Modal de decisão** com ações: aceitar API / manter nosso / escolher (quando ambíguo, lista as matrículas candidatas) / ignorar. Grava via upsert em `matriculas_divergencias_decisoes` (`onConflict: divergencia_id`), com `decidido_por`, `motivo`, `metadata`.
- **Colunas de desconto** na tabela principal de alunos: `valor_cheio`, `desconto_fixo`, `desconto_condicional`, `valor_parcela` — edição inline; indicador de "campo fixado".

---

## Cron

`pg_cron` chamando `sync-matriculas-emusys` **de hora em hora** (modelo: o cron de `sync-presenca-emusys`). Custo: ~26 requisições/execução (3 unidades, ~1200 ativos, 50/página), bem dentro do rate limit de 60/min. Ajustável pra 6h se quiser mais conservador. Considerar offset BRT no agendamento.

---

## Plano de implementação (ordem)

1. **Migração de schema** — 3 colunas em `alunos` + 3 tabelas novas.
2. **Motor `reconciliarAluno`** (módulo compartilhado) + casamento + classificação AUTO/FILA + log.
3. **Frente 1** — plugar GET pontual por `aluno_id` no fim de `handleMatriculaNova`/`handleRenovacao` do `processar-matricula-emusys`. Aplica desconto/valor na hora.
4. **Frente 2** — edge `sync-matriculas-emusys` (varredura) em **dry-run**; rodar 1×; Hugo revisa `matriculas_divergencias`.
5. Ligar aplicação (dry-run off) + agendar cron horário.
6. **RPC** `get_conciliacao_matriculas`.
7. **UI** — aba de conciliação + colunas de desconto editáveis + campo fixado.
8. Backfill inicial de desconto nos ativos existentes (mesma fórmula, via os dumps já puxados).

## Riscos / pontos de atenção

- **Casamento por ID, não por nome** — curso via de-para `(unidade, disciplina_id)`; professor via `professores.emusys_id`. Imune a renomeação. `disciplina_id`/`id_professor` novos (sem entrada) **não são adivinhados** → vão pra fila (`disciplina_nao_mapeada`/`professor_nao_mapeado`).
- **`cursos.emusys_ids` (array global) deprecado** — está furado (colisão entre unidades). Migrar consumidores pro de-para antes de remover.
- **Re-ativação automática** muda status — é o comportamento desejado (convergência), mas todo flip de status precisa estar no log pra auditoria.
- **Edição manual vs sync** — resolvido pelo `matriculas_campos_fixados`; sem isso, sync sobrescreveria edição.
