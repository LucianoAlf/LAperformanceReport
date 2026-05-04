# Pendências do lado do Emusys

Problemas/limitações **do lado do Emusys** (API ou plataforma) que afetam nosso sistema mas **não podem ser resolvidos no código local** — exigem mudança no Emusys, configuração externa, ou cadastro pelo time operacional.

---

## 🚨 [API] Endpoint `/v1/aulas/` não retorna `professor_id`

**Identificado em:** 2026-05-04

**Descrição:** O endpoint `GET /v1/aulas/` retorna o array `professores` apenas com `{ nome, telefone, email, presenca, horario_presenca }` — **sem o `id`**. Para resolver `professor_id` na nossa tabela `aulas_emusys`, o sync precisa fazer matching por nome (ILIKE com fallbacks).

**Workaround atual:** sync usa matching exato → prefixo → primeiro+último nome (função `matchProfessor` em `sync-presenca-emusys/index.ts`).

**Workaround proposto (não implementado):** chamar `GET /v1/professores/` no início do sync, construir map `{ nome → emusys_id }`, e cruzar com `professores_unidades` por `(emusys_id, unidade_id)` → resolve matching de forma determinística (~226 das ~1.005 aulas com NULL atualmente).

**Solicitação ideal (Emusys):** incluir `id` no objeto `professores[]` do endpoint `/aulas/`, da mesma forma que já vem no webhook `processar-matricula-emusys` (campo `id_professor`). Inconsistência da API: o ID existe nos webhooks mas não no GET.

---

## 🚨 [API] Aulas tipo "turma" não vêm com professor no payload

**Identificado em:** 2026-05-04

**Descrição:** Quando uma aula é tipo `turma` (em grupo) com categoria `normal`, o campo `professores` retorna **array vazio `[]`**, mesmo com aula real acontecendo e professor designado. Aulas tipo `individual` retornam o professor corretamente.

**Exemplo concreto:**
- Aula `MpB_Sá_08` em 02/05/2026 às 08h tem 5 registros no Emusys:
  - 1 aula tipo `turma` (id 457226): `professores: []` ❌
  - 4 aulas tipo `individual` (1 por aluno): `professores: [{ nome: "Pedro Sérgio Figueiredo da Glória", ... }]` ✅

**Conceitos diferentes (não são duplicatas):**
- `tipo: turma` = registro do **encontro coletivo** (todos os alunos juntos, status = compareceu fisicamente)
- `tipo: individual` = registro do **contrato individual de cada aluno** (consumo do plano dele, status = aula contabilizada)

**Impacto (cobertura de `professor_id` em `aluno_presenca`, últimos 7 dias):**

| Tipo de aula | Total presenças | Com `professor_id` | % OK |
|--------------|-----------------|--------------------|------|
| `individual` | 1.017 | 1.004 | **98.7%** ✅ |
| `turma` | 992 | 0 | **0%** ❌ |

A info do professor existe e funciona perfeitamente nas aulas `individual` — só não vem na visão `turma`. Distribuição de status (presente vs ausente) é praticamente igual entre os dois tipos (~64% presente), então a presença em si está consistente.

O status entre as duas visões pode divergir pontualmente (3 dos 4 alunos da turma exemplo tinham status diferente entre turma e individual).

**Solicitação ideal (Emusys):** preencher `professores[]` também em aulas tipo `turma`, já que internamente o Emusys associa um professor à turma (visível na visão individual).

**Workaround possível (no nosso código):** para aulas tipo `turma`, derivar professor pela aula `individual` correspondente (mesma `turma_nome + data + horário`). Resolve no banco mas mantém divergência de status.

---

## ⚠️ [API] IDs de professores são por unidade, não globais

**Identificado em:** 2026-05-04

**Descrição:** O mesmo professor cadastrado em múltiplas unidades tem `id` diferente em cada uma:
- Joel de Salles Gouveia Filho: id `31` em Barra, id `591` em Recreio
- Peterson Biancamano: id `36` em Barra, id `48` em CG
- Daiana Pacifico da Silva dos Anjos: id `33` em Barra, id `1641` em CG

**Impacto:** o token usado na request define o "tenant" implicitamente, e os IDs retornados só fazem sentido naquele contexto. Não dá pra ter um cache global de `emusys_id → professor_id` — precisa ser por unidade.

**Status:** **estrutura local já está correta** — `professores_unidades.emusys_id` é por `(professor_id, unidade_id)`. Apenas atenção ao implementar lookups.

---

## ⚠️ [Cadastro] Professores ativos no Emusys mas sem cadastro local

**Identificado em:** 2026-05-04

**Descrição:** 3 professores que aparecem em `aulas_emusys.professor_nome` (texto vindo do payload Emusys) **não existem na nossa tabela `professores`**:
- `Erick Osmy`
- `Fabricio Costa de Oliveira` (Emusys CG `id=1296`)
- `Léo Cabral de Castro`

**Impacto:** mesmo com matching perfeito por nome, o `professor_id` continua NULL porque o registro não existe em `professores`.

**Solução:** cadastrar via UI de configurações de professores OU fazer auto-cadastro no `sync-presenca-emusys` quando vier um nome novo (criar `professores` row + vínculo `professores_unidades`).

---

## ⚠️ [Cadastro] 13 vínculos `professores_unidades` sem `emusys_id`

**Identificado em:** 2026-05-04

**Descrição:** Em `professores_unidades`, alguns vínculos não têm `emusys_id` preenchido:
- BARRA: 2 vínculos sem `emusys_id`
- CG: 8 sem
- REC: 3 sem

**Impacto:** mesmo se a API retornasse `professor_id` no payload `/aulas/`, esses 13 não seriam resolvidos por ID — só por nome. Atrapalha qualquer matching determinístico.

**Solução:** popular `emusys_id` automaticamente via chamada `GET /v1/professores/` por unidade (basta cruzar por nome após normalizar acentos/case). Pode ser feito como migration única.

---

## ⚠️ [API] Status de presença divergente entre aula "turma" e "individual"

**Identificado em:** 2026-05-04

**Descrição:** Para a turma `MpB_Sá_08` em 02/05/2026, o mesmo aluno tem status diferente entre os dois registros:

| Aluno | Status na aula `turma` | Status na aula `individual` |
|-------|------------------------|------------------------------|
| Laura | presente | **ausente** |
| Olívia | presente | presente |
| Aurora | presente | **ausente** |
| Vicente | presente | **ausente** |

**Hipótese:** os 2 sistemas de marcação no Emusys são independentes. A "turma" registra **comparecimento físico** ("o aluno apareceu na sala?"), enquanto a "individual" registra **consumo do contrato** ("a aula individual dele foi contabilizada?"). Eles podem divergir por critério contábil, atraso do aluno, etc.

**Impacto operacional:** reports que misturam as duas visões dão números errados. Há que escolher uma como fonte de verdade.

**Pergunta operacional pendente para o time:** quando o professor marca presença no Emusys, ele entra na visão de turma (marca todos juntos) ou na visão individual (um por um)? Isso define qual visão é "fonte da verdade" para nossos relatórios.

**Solicitação ideal (Emusys):** sincronizar os dois sistemas de marcação OU descontinuar a visão "turma" e deixar só a "individual" (ou vice-versa).

---

## Resolvidos (histórico)

(nenhum ainda — Emusys responde lentamente a feedbacks)

---

## Como reportar ao Emusys

Email do suporte/dev: `dev@emusys.com.br` (ver `emusys-api.md`).

Ao abrir ticket, sempre incluir:
- Endpoint exato (com query params)
- Token usado (mascarado, só primeiros 6 chars + última letra)
- Payload de exemplo retornado vs esperado
- Impacto no nosso fluxo
