# Spec — Avaliações de Onboarding do Aluno (estrelas)

**Data:** 2026-06-19
**Módulo:** Sucesso do Aluno → nova sub-aba "Avaliações"
**Autor:** Luciano / Fabíola

---

## Contexto

A Fabíola (Sucesso do Aluno) quer um lugar para **ver e registrar as avaliações em estrelas** dos alunos ao longo do onboarding (1ª aula, e futuramente 1 mês / 3 meses). Hoje, quando o aluno responde a pesquisa pós-1ª aula clicando num botão no WhatsApp, a nota (1–5) já cai automaticamente na tabela `pesquisas_whatsapp` — mas **não existe tela para visualizar essas notas**, nem como **lançar uma avaliação manualmente** quando o aluno responde por fora do botão (áudio, conversa direta com a Fabi).

Esta é a **Demanda 2** das pendências da Fabíola (P3 em `pendencias-2026-06-17-sucesso-aluno-fabiola.md`). A Demanda 1 (notificação proativa "ontem o aluno X teve a 1ª aula") foi **adiada** — registrada como P4, aguardando decisão de canal.

---

## Escopo

**Inclui:**
- 3 colunas novas em `pesquisas_whatsapp`: `comentario`, `origem`, `registrado_por`
- RPC de listagem `get_avaliacoes_alunos`
- RPC de registro manual `registrar_avaliacao_manual`
- Nova sub-aba "Avaliações" em `TabSucessoAluno` (ícone estrela)
- Componente `AvaliacoesTab` (tabela + filtros + botão registrar)
- Modal `ModalRegistrarAvaliacao` (busca aluno + estrelas + comentário)
- Componente reutilizável `StarRating` (leitura e input)
- Hook `useAvaliacoes`

**Não inclui (futuro):**
- Disparo automático das pesquisas de 1 mês e 3 meses (só lançamento manual por ora)
- Seção de avaliações na ficha do aluno (`ModalFichaAluno`) — a Fabi quer ver primeiro como fica na aba dedicada antes de levar para a ficha
- Notificação proativa de 1ª aula (P4, adiada)
- Alterar a aba "Pesquisas" (disparo) ou "Evasão" — permanecem como estão

---

## Estado atual (já implementado, dias atrás)

- Tabela `pesquisas_whatsapp` (aluno_id `integer`, unidade_id, tipo, data_matricula, remote_jid, enviado_ok, nota `int` 1–5, respondido_em, ...). **0 registros** — ninguém disparou ainda.
- `tipo` aceita `pos_primeira_aula`, `pos_um_mes`, `pos_tres_meses`, `evasao` (CHECK).
- UNIQUE `(aluno_id, tipo, data_matricula)`.
- Edge `enviar-pesquisa-pos-primeira-aula` (v3) — disparo semi-automático (Fabi revisa e clica enviar).
- Edge `processar-resposta-pesquisa` (v1) — captura o clique do botão (ruim=1/regular=3/gostei=5), grava `nota` + `respondido_em`. **Já é 100% automático.**
- Sub-aba "Pesquisas" (`PesquisasTab`) em `TabSucessoAluno` com sub-navegação Pós-1ª Aula / Evasão.

---

## Banco de Dados

### Migration — colunas novas em `pesquisas_whatsapp`

```sql
ALTER TABLE pesquisas_whatsapp
  ADD COLUMN comentario     text,
  ADD COLUMN origem         text NOT NULL DEFAULT 'whatsapp_botao'
    CHECK (origem IN ('whatsapp_botao', 'manual')),
  ADD COLUMN registrado_por text;   -- email de quem lançou manual; NULL no automático
```

- `origem` distingue resposta capturada pelo botão (`whatsapp_botao`, default) de lançamento manual (`manual`).
- `registrado_por` só preenchido no manual (auditoria de quem digitou).
- 0 linhas existentes → backfill desnecessário.
- A edge `processar-resposta-pesquisa` **não precisa mudar**: o default `whatsapp_botao` já cobre o caso automático.

### RPC `get_avaliacoes_alunos`

**Parâmetros:** `p_unidade_id uuid DEFAULT NULL`, `p_tipo text DEFAULT NULL`, `p_data_inicio date DEFAULT NULL`, `p_data_fim date DEFAULT NULL`

**Retorna** apenas avaliações **respondidas** (`nota IS NOT NULL`), com join em aluno/curso/professor/unidade:

| Coluna | Origem |
|--------|--------|
| `pesquisa_id` | `pesquisas_whatsapp.id` |
| `aluno_id` | `pesquisas_whatsapp.aluno_id` |
| `nome` | `alunos.nome` |
| `unidade_id` / `unidade_nome` | `unidades` |
| `curso_nome` | `cursos.nome` via `alunos.curso_id` |
| `professor_nome` | `professores.nome` via `alunos.professor_atual_id` |
| `tipo` | `pesquisas_whatsapp.tipo` |
| `nota` | `pesquisas_whatsapp.nota` |
| `comentario` | `pesquisas_whatsapp.comentario` |
| `origem` | `pesquisas_whatsapp.origem` |
| `respondido_em` | `pesquisas_whatsapp.respondido_em` |
| `registrado_por` | `pesquisas_whatsapp.registrado_por` |

Filtra por `p_unidade_id` (quando não-NULL), `p_tipo`, e faixa `respondido_em` (BRT) quando datas informadas. Ordena por `respondido_em DESC`.

### RPC `registrar_avaliacao_manual`

**Parâmetros:** `p_aluno_id integer`, `p_tipo text`, `p_nota integer`, `p_comentario text`, `p_registrado_por text`

**Lógica:**
1. Resolve `unidade_id` e `data_matricula` a partir de `alunos` (pelo `p_aluno_id`).
2. Valida `p_nota BETWEEN 1 AND 5` e `p_tipo IN ('pos_primeira_aula','pos_um_mes','pos_tres_meses')`.
3. `INSERT ... ON CONFLICT (aluno_id, tipo, data_matricula) DO UPDATE` setando `nota`, `comentario`, `respondido_em = now()`, `origem = 'manual'`, `registrado_por = p_registrado_por`, `enviado_ok = true` (não houve envio pela edge, mas a linha representa uma avaliação válida).
4. Retorna a linha gravada.

Respeita o UNIQUE existente: lançar manual sobre uma pesquisa já enviada apenas atualiza a mesma linha (não duplica).

---

## Frontend

### Nova sub-aba "Avaliações" em `TabSucessoAluno`

- Adicionar `'avaliacoes'` ao union de `subAba` e um botão (ícone `Star` do Lucide) na barra de sub-abas, no mesmo padrão visual das existentes.
- Renderiza `<AvaliacoesTab unidadeAtual={unidadeAtual} />`.

### `AvaliacoesTab.tsx`

**Cabeçalho/filtros:**
- Filtro de período (date range; default últimos 30 dias) → `p_data_inicio`/`p_data_fim`.
- Filtro de marco (`tipo`): "Todos / 1ª Aula / 1 Mês / 3 Meses" (default Todos). Hoje só 1ª aula terá dados automáticos; 1m/3m aparecem só se lançados manualmente.
- Busca por nome (client-side).
- Botão "Registrar avaliação" → abre `ModalRegistrarAvaliacao`.

**Tabela:**

| Coluna | Conteúdo |
|--------|----------|
| Aluno | nome + curso (subtítulo) |
| Unidade | `unidade_nome` |
| Professor | `professor_nome` |
| Marco | label do `tipo` (1ª Aula / 1 Mês / 3 Meses) |
| Avaliação | `<StarRating value={nota} readOnly />` (★ preenchidas conforme nota) |
| Comentário | texto truncado + tooltip se longo |
| Origem | selo: 📱 "WhatsApp" (`whatsapp_botao`) ou ✍️ "Manual" (`manual`) |
| Data | `respondido_em` (DD/MM/YYYY HH:mm) |

- Estado vazio: "Nenhuma avaliação no período."
- Unidade da linha respeita o `unidadeAtual` global (passado à RPC).

### `ModalRegistrarAvaliacao.tsx`

- Busca de aluno por nome (autocomplete sobre `alunos` ativos da unidade atual; reaproveitar padrão de busca já usado no módulo).
- Seletor de marco (`tipo`): os três marcos disponíveis, default "1ª Aula". (Atende "estrutura p/ 1m/3m" sem custo extra.)
- `<StarRating>` editável (1–5, obrigatório).
- Campo de comentário (textarea, opcional).
- Salvar → chama `registrar_avaliacao_manual` com `registrado_por = user.email`. Toast de sucesso + refresh da lista.
- Validação: aluno e nota obrigatórios.

### `StarRating.tsx` (componente reutilizável)

- Props: `value` (0–5), `onChange?` (ausente = read-only), `size?`.
- Read-only: renderiza ★ cheias/vazias conforme `value`.
- Editável: hover + clique para setar nota. Usado no modal e (read-only) na tabela.

### `useAvaliacoes.ts`

- `listar(filtros)` → chama `get_avaliacoes_alunos`.
- `registrarManual(payload)` → chama `registrar_avaliacao_manual`, retorna ok/erro.
- Expõe: `avaliacoes`, `loading`, `salvando`, `listar`, `registrarManual`.

---

## Fluxo Completo

```
[Automático — já funciona]
Aluno toca botão no WhatsApp (pós-1ª aula)
    ↓ edge processar-resposta-pesquisa grava nota + respondido_em (origem='whatsapp_botao')
    ↓ aparece sozinho na aba Avaliações

[Manual — novo]
Aluno responde por fora (áudio / conversa direta)
    ↓ Fabi abre Sucesso do Aluno > Avaliações > "Registrar avaliação"
    ↓ busca aluno, escolhe marco, clica estrelas, comenta
    ↓ RPC registrar_avaliacao_manual (upsert, origem='manual', registrado_por)
    ↓ aparece na lista com selo ✍️ Manual
```

---

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `supabase/migrations/YYYYMMDD_avaliacoes_onboarding.sql` | 3 colunas + 2 RPCs |
| `src/components/App/SucessoCliente/AvaliacoesTab.tsx` | Novo |
| `src/components/App/SucessoCliente/ModalRegistrarAvaliacao.tsx` | Novo |
| `src/components/App/SucessoCliente/hooks/useAvaliacoes.ts` | Novo |
| `src/components/ui/StarRating.tsx` | Novo (reutilizável) |
| `src/components/App/SucessoCliente/TabSucessoAluno.tsx` | + sub-aba "Avaliações" |

---

## Decisões de Design

- **Aba dedicada, não ficha do aluno:** decisão explícita da Fabi — quer ver como fica antes de levar à ficha.
- **Reusar `pesquisas_whatsapp`:** a captura automática já grava aqui; manual e automático convivem na mesma tabela, distinguidos por `origem`. Sem tabela nova.
- **Upsert no manual respeita UNIQUE:** lançar manual sobre pesquisa enviada atualiza a linha — não duplica.
- **`enviado_ok=true` no manual:** a linha representa avaliação válida mesmo sem envio pela edge; mantém consistência do guard de reenvio.
- **Só 1ª aula com dado automático:** 1m/3m existem na estrutura e no seletor manual, mas sem disparo automático ainda (pendência futura).
- **Comentário opcional:** suporta o acompanhamento de "clima/saúde do aluno" que a Fabi descreveu.

## Itens a Confirmar na Implementação

1. Padrão de busca/autocomplete de aluno já usado no módulo (reaproveitar componente existente se houver).
2. Componente de date-range já usado em outras abas de Sucesso do Aluno (`MarcosJornadaSection` usa DatePickers) — reaproveitar.
3. Permissão: a aba deve respeitar as mesmas permissões de Sucesso do Aluno (sem novo código de permissão esperado).
