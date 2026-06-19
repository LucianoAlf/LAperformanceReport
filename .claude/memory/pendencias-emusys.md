# Pendências do lado do Emusys

Problemas/limitações **do lado do Emusys** (API ou plataforma) que afetam nosso sistema mas **só podem ser resolvidos no Emusys** — mudança na API ou correção de cadastro pelo time/Emusys.

> Foco: só o problema do Emusys + evidência + o que pedir a eles. Workarounds, impactos e soluções no nosso código ficam em `integracao-infra.md`.

---

## 🚨 [API] Endpoint `/aulas` não retorna `professor_id`

**Identificado em:** 2026-05-04

**Descrição:** O array `professores[]` vem só com `{ nome, telefone, email, presenca, horario_presenca }` — **sem `id`**. Inconsistência da própria API: o ID existe no webhook (`processar-matricula-emusys`, campo `id_professor`), mas não no GET.

**Solicitação ideal (Emusys):** incluir `id` no objeto `professores[]` do `/aulas`.

---

## 🚨 [API] Aulas tipo "turma" não vêm com professor

**Identificado em:** 2026-05-04

**Descrição:** Aula tipo `turma` (grupo) com categoria `normal` retorna `professores: []` (vazio), mesmo com professor designado. Aulas tipo `individual` retornam o professor corretamente.

**Evidência:** turma `MpB_Sá_08` em 02/05/2026 08h — 1 registro `turma` (id 457226) com `professores: []` ❌ + 4 registros `individual` com `professores: [{ nome: "Pedro Sérgio Figueiredo da Glória", ... }]` ✅. (`turma` = encontro coletivo; `individual` = contrato de cada aluno. Não são duplicatas.)

**Solicitação ideal (Emusys):** preencher `professores[]` também nas aulas tipo `turma`, já que internamente o Emusys associa um professor à turma.

---

## ⚠️ [API] Status de presença divergente entre aula "turma" e "individual"

**Identificado em:** 2026-05-04

**Descrição:** Uma aula de turma **com alunos** gera, para o mesmo encontro, 2 tipos de registro: 1 tipo `turma` (o encontro coletivo) + 1 tipo `individual` por aluno (o consumo do contrato dele — `individual` aqui **não** é aula particular). O mesmo aluno pode ter **status diferente** entre esses dois registros.

⚠️ **Nem toda aula gera os dois** (regra confirmada 2026-06-12, amostra Barra 2 dias): só aulas de **turma com alunos** têm `turma` + N `individual`. **Experimental** gera só `individual` (1 aluno, sem turma); **turma sem aluno** (`nAlunos=0`) gera só `turma`. A divergência de status só existe quando os dois registros coexistem.

**Evidência:** turma `MpB_Sá_08` em 02/05/2026 — Laura, Aurora e Vicente = `presente` na visão `turma` mas `ausente` na `individual`; Olívia = `presente` nas duas.

**Hipótese:** são 2 sistemas de marcação independentes — `turma` = comparecimento físico ("o aluno apareceu na sala?"), `individual` = consumo do contrato ("a aula dele foi contabilizada?").

**Magnitude (medida 2026-06-15, mês 05/2026, todas as unidades):** dos 9.924 registros de presença gravados, só **4.638 aluno+dia reais** — **4.854 pares** `(aluno+dia+curso)` coexistem como `turma` + `individual` (mesma aula 2×). Destes, **920 (19%) têm status divergente** entre as duas visões: 528 com `turma=ausente`/`individual=presente` e 392 com `turma=presente`/`individual=ausente` (≈50/50 — confirma que **nenhuma das visões é a "default ausente"**, a contradição é real dos dois lados). Prova de que nasce na API e não no sync: a mesma aula vem com `emusys_id` distintos (ex. Adriana 02/05: `618137` individual + `515497` turma), e o `sync-presenca-emusys` v31 grava `status` direto de `aluno.presenca` por `emusys_id` — não há lógica que duplique.

**Impacto:** qualquer contagem absoluta (nº de faltas, nº de aulas) sai **dobrada** se ler `aluno_presenca` cru. Workaround no nosso lado: deduplicar por `(aluno_id, data_aula, curso_nome)` adotando a visão `individual` como canônica.

**Solicitação ideal (Emusys):** sincronizar os 2 sistemas de marcação OU manter só um (turma ou individual).

---

## 🚨 [API] Filtro `pessoa_id` no `/aulas` não cobre professor (só aluno)

**Identificado em:** 2026-06-12

**Descrição:** O `/aulas` ganhou `pessoa_id` (v1.1.6) e a doc diz que filtra "Pessoa_ID do aluno **ou professor**". Na prática, só casa o papel de **aluno** — passar o `pessoa_id` de um professor retorna vazio.

**Evidência:** 18/18 professores da Barra → **0 aulas** via `pessoa_id`, tendo de 2 a 72 aulas reais ministradas. Leonardo Castro (`pessoa_id` 881): 32 aulas como professor → 0 retornadas; mas as 2 aulas em que ele é **aluno** → essas vieram. Confirma que o filtro casa só o papel aluno.

**Solicitação ideal (Emusys):** fazer `pessoa_id` casar também `professores[]`, conforme está documentado.

---

## 🚨 [API] `/pessoas/buscar` é via de mão única (não aceita id)

**Identificado em:** 2026-06-12

**Descrição:** O `/pessoas/buscar` só aceita `email`/`cpf`/`telefone`. Não há nenhuma forma de resolver `id → pessoa`.

**Evidência:** testado `?id=1026`, `?pessoa_id=1026`, `?id_pessoa=1026` → erro `"Informe email, cpf ou telefone"`; rota REST `/pessoas/1026` → `"Endpoint inválido"`.

**Solicitação ideal (Emusys):** aceitar `id`/`pessoa_id` no `/pessoas/buscar` **ou** criar `GET /pessoas/{id}`.

---

## 🚨 [API] `pessoa_id` do aluno não aparece em nenhum payload

**Identificado em:** 2026-06-12

**Descrição:** O `/aulas` filtra **por** `pessoa_id`, mas o objeto `alunos[]` não traz o `id` (só `nome_aluno`, `data_nascimento_aluno`, dados do responsável). Combinado com o `/pessoas/buscar` ser via de mão única, fica **impossível** mapear aluno → `pessoa_id` de forma determinística. Pior para **menor de idade**: sem CPF/e-mail/telefone próprio, o `/pessoas/buscar` cai sempre no responsável, nunca no aluno.

**Evidência:** Lorenzo Tavares (Barra, menor) só foi localizável por dedução — achar o responsável (Izabelle, `pessoa_id` 1025) e varrer ids vizinhos até bater o nome → aluno em `1026`. Não há caminho limpo.

**Solicitação ideal (Emusys):** incluir `pessoa_id` dentro de `alunos[]` no `/aulas` (resolve esta e a anterior de uma vez).

---

## ⚠️ [Plataforma] Troca de curso no contrato não propaga para a turma/aulas

**Identificado em:** 2026-06-12

**Descrição:** Ao trocar o curso de um contrato (ex: Musicalização → Bateria), o aluno permanece na turma antiga e o `/aulas` continua gerando as aulas — **inclusive futuras** — com o curso **antigo**. A tela de Contratos mostra o curso novo; o endpoint reflete a turma real. As duas fontes do próprio Emusys discordam entre si.

**Evidência:** Lorenzo Tavares (Barra, `pessoa_id` 1026). Tela de Contratos = 2× "Bateria". Mas `/aulas`: a **quinta** segue como Musicalização (turma `MPpi_Qui_15`, `curso_id 1`), ininterrupta de 18/09/2025 a 17/09/2026 — **nunca houve aula de Bateria na quinta**. A **segunda** é Bateria (turma `B_Seg_15`, `curso_id 7`), correta. Ou seja: a troca foi feita no contrato mas o aluno nunca saiu da turma de Musicalização.

**Limite:** a API não expõe o histórico de contratos, então não dá pra ver **quando** a troca ocorreu — só que as aulas seguem com o curso antigo.

**Solicitação ideal (Emusys):** ao trocar o curso de um contrato, repropagar para a turma/aulas futuras — **ou** expor o curso do **contrato** no payload do `/aulas`, não só o da turma.

---

## 🚨 [API] Aluno aparece em `/aulas` com `presenca: presente` mas sem vínculo via `pessoa_id`

**Identificado em:** 2026-06-18

**Descrição:** O endpoint `/aulas` lista um aluno com `presenca: "presente"` no array `alunos[]`, mas ao filtrar o mesmo endpoint com `pessoa_id` do aluno o resultado é **vazio** (`items: []`). Indica que a aula existe e o nome aparece, mas sem vínculo correto com o cadastro de pessoa. A UI do Emusys, por sua vez, mostra a experimental desse aluno como "não realizada" — três fontes (API sem filtro, API com `pessoa_id`, UI) em estados distintos para o mesmo registro.

**Evidência:**
- Aluno: Alexandre Vasconcellos de Medeiros — `pessoa_id: 1206`, `emusys_matricula_id: 807` (Barra)
- Aula: `id: 251901`, `2026-06-17 13:00–14:00`, `categoria: experimental`, `curso: Aula Experimental`, professor Jeyson Gaia Ramos
- `GET /aulas/?data_hora_inicial=2026-06-17T00:00:00&data_hora_final=2026-06-17T23:59:59` → aula retorna com `aluno.presenca: "presente"` ✅
- `GET /aulas/?data_hora_inicial=2026-06-17T10:00&data_hora_final=2026-06-17T21:00&pessoa_id=1206` → `items: []` ❌
- UI Emusys: experimental marcada como "não realizada" ❌
- **Impacto no nosso sistema:** `sync-presenca-emusys` gravou `aluno_presenca` com `status='presente'` para esse aluno (criado às 01:20 UTC de 18/06), fazendo ele aparecer como "calouro com primeira aula hoje" na pesquisa pós-1ª aula quando não havia realizado nenhuma aula regular.

**Solicitação ideal (Emusys):** garantir consistência entre (a) o que aparece em `alunos[]` no `/aulas` sem filtro, (b) o que retorna ao filtrar por `pessoa_id`, e (c) o status exibido na UI.

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
