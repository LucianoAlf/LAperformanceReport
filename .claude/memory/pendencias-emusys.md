# Pendências do lado do Emusys

Problemas/limitações **do lado do Emusys** (API ou plataforma) que afetam nosso sistema mas **só podem ser resolvidos no Emusys** — mudança na API ou correção de cadastro pelo time/Emusys.

> Foco: só o problema do Emusys + evidência + o que pedir a eles. Workarounds, impactos e soluções no nosso código ficam em `integracao-infra.md`.

> **Revisão geral em 2026-08-10.** Changelog conferido de 21/06 a 04/08 (v1.4.1): **nenhum** item
> deste arquivo foi corrigido pelo Emusys no período. O que mudou foi o **valor** de alguns pedidos,
> pela evolução do nosso lado — reavaliados abaixo, com medição.

> **Revisão em 2026-10-05.** Changelog conferido até **v1.8.3 (05/10/2026)**: **três** itens atendidos —
> `aula.id` nos webhooks de experimental (v1.8.1, como `aula.aula_id`), presença "não registrada"
> (v1.8.2, campo `registro_presenca`) e listagem de leads (v1.6.0, `GET /leads`). Itens marcados
> inline abaixo. Novos webhooks de contrato (`enviado_para_assinatura`/`assinado`, v1.8.0) e de
> exclusão (`matricula_excluida`/`contrato_excluido`, v1.8.2) não eram pedidos nossos — são
> oportunidades novas, detalhadas no `emusys-api` SKILL.

---

## ✅ [Webhook] `aula.id` NÃO vem nos 3 webhooks de aula experimental — ~~PRIORIDADE MÁXIMA~~ RESOLVIDO v1.8.1

> ✅ **Atendido pelo Emusys em 04/10/2026 (v1.8.1):** os 3 webhooks de experimental passaram a trazer
> `aula.aula_id` (o id real da aula, o mesmo de `GET /aulas`, **estável no reagendamento**) e
> `aula.data_hora_inicio_original`. O `id` da raiz do payload continua sendo o id do evento.
> Permite gravar o vínculo certo desde a chegada — o trigger `fn_experimental_recebe_id_da_aula` e as
> reconciliações passam a ser rede de segurança. ⚠️ Mexe no n8n das experimentais, não no app —
> adoção pendente do nosso lado.

**Identificado em:** 2026-08-10

**Descrição:** Os webhooks `aula_experimental_criada`, `_reagendada` e `_cancelada` **não informam o
id da aula**. O `id` do topo do payload é id de **evento**, não de aula.

**Evidência:** varridas **178 entregas** em `automacao_log`: o objeto `aula` tem 20 chaves
(`lead_id`, `sala_id`, `professor_id`, `curso`, `data`, `horario`…) e **nenhuma é `id``. Que o `id`
do topo é de evento está provado: Rafael Bredoff recebeu `criada`=**77108** e, 14 segundos depois,
`reagendada`=**77113** — mesma aula, ids diferentes.

⭐ **O pedido é PARIDADE, não feature nova:** o webhook **`aula_cancelada` já envia `aula.id`** com o
id real — **203 de 203 entregas**, **0** iguais ao id de evento, **203/203 casando** com a aula em
`aulas_emusys`. O Emusys sabe identificar o objeto; só não manda nos eventos de experimental.
⚠️ O caso mais gritante é o `aula_experimental_cancelada`: é a **mesma operação** do `aula_cancelada`,
no mesmo tipo de objeto, e vem sem o id.

**O que custa hoje:**
- **Fantasma de reagendamento.** O evento traz só o estado novo e não diz o que substituiu.
  Reagendamento é **21% do volume** (37 de 178). O fix que tentou adivinhar
  (`encerrarExperimentaisSubstituidas`) **cancelou 7 aulas reais** em 05/08 e foi desligado em 07/08
  — a regressão segue no ar por decisão consciente. Com `aula.id`, reagendamento vira UPDATE e o
  problema deixa de existir.
- **5 vínculos órfãos** em `lead_experimentais`, 4 deles com o `body.id` do webhook gravado no lugar
  do id de aula. ⚠️ As faixas **se sobrepõem** (evento 65.898+, aula 236.826–831.490) — não dá para
  detectar por magnitude.
- Dedup depende de chave composta (lead+data+horário+curso), que quebra quando um componente muda.
- Aposentaria o trigger `fn_experimental_recebe_id_da_aula`, que só existe para adivinhar o vínculo
  depois, por (lead, data) ou por nome.

**Precedente a citar no pedido:** o `professor_id` nesses mesmos três webhooks estava documentado no
schema e não era preenchido; foi reportado e saiu na **v1.4.1 (04/08/2026)**. Mesmo formato.

**Solicitação ideal (Emusys):** incluir `aula.id` em `aula_experimental_criada`, `_reagendada` e
`_cancelada`, como já ocorre em `aula_cancelada`.

---

## ✅ [API] `presenca` não distingue "não registrada" de "ausente" — RESOLVIDO v1.8.2 (condicional)

> ✅ **Atendido pelo Emusys em 04/10/2026 (v1.8.2):** `alunos[]`/`professores[]` de `GET /aulas`,
> `GET /aula` e os PATCHs de presença ganharam `registro_presenca`: `"registrado"` (houve
> lançamento) | `"pendente"` (nada lançado) | `null` (**a escola não usa o recurso de 3 estados**).
> Falta lançada = `ausente` + `registrado`. ⚠️ **Condicional:** se as unidades LA não têm o recurso
> ligado, tudo vem `null` — medir numa chamada real antes de mudar regra. Aulas anteriores à ativação
> podem vir `pendente` mesmo com falta real; ignorar em `cancelada:true`; professor adicional de
> turma sempre `null`.

**Identificado em:** 2026-08-10

**Descrição:** `alunos[].presenca` e `professores[].presenca` só têm `"presente"` e `"ausente"`. Aula
que **ninguém marcou ainda** vem como `"ausente"` — indistinguível de falta real.

**Evidência:** `professor_presenca` vem `'ausente'` por default em **100% das aulas futuras**
(medido: 10.522). Do lado do aluno, aula terminada e ainda não lançada é lida como falta.

**O que custa:** obriga toda regra nossa a esperar o **status derivado** (que depende do sync) em vez
de ler a API direto. É a raiz do problema que gerou a propagação do professor da experimental
(pendência #16 da auto-memory): a matrícula chega antes de a presença ser lançada e não há como saber
se "ausente" significa falta ou "ainda não marcaram".

**Solicitação ideal (Emusys):** um terceiro valor (`nao_registrada`) ou um booleano
`presenca_registrada`.

---

## ⚠️ [API] Não existe GET de histórico/estágio do lead no CRM — PARCIAL v1.6.0

> 🟡 **Parcialmente coberto em 15/09/2026 (v1.6.0):** `GET /leads/por_id`, `GET /leads/por_telefone`
> e `GET /leads` (com filtro `estagio_id`) trazem o **estágio atual** (`estagio_funil`) e o `status`
> calculado do lead. O que **continua sem endpoint**: o histórico (mudanças de estágio, anotações,
> autor e data) — que é o que arbitra os casos ambíguos abaixo.

**Identificado em:** 2026-08-10

**Descrição:** Os endpoints de CRM são só `POST /crm/leads`, `PATCH`, `anotacao`,
`opcoes_como_conheceu`, `metricas` e `aniversariantes`. Não há como ler o histórico de estágio nem as
anotações de um lead.

**O que custa:** é a fonte que arbitra casos ambíguos de experimental — anotações do tipo
*"Experimental efetivada por Fulano — avaliação das habilidades"*. Hoje só pela tela, um a um: foi
assim que o Alf resolveu 4 experimentais em 10/08 (migration `20260810141049`), com print de cada
caso. Sem endpoint, nenhuma conciliação desse tipo é automatizável.

**Solicitação ideal (Emusys):** `GET /crm/leads/{id}/historico` com estágios, anotações, autor e data.

---

## ⚠️ [API] Aviso prévio de finalização só chega por webhook (sem PULL)

**Identificado em:** 2026-08-10 (a partir da v1.4.0, 03/08)

**Descrição:** Os 3 webhooks de aviso prévio existem, mas **não há endpoint de consulta**: nenhum
campo em `GET /matriculas`, e matrícula com aviso vigente continua vindo como `ativa`.

**O que custa:** evento perdido **não se recupera**. É a janela de retenção — o único momento de agir
antes da evasão consumar — e ela depende inteiramente de o webhook ter chegado e sido processado.

**Solicitação ideal (Emusys):** expor o aviso prévio em `GET /matriculas` (objeto `aviso_previo`,
como já existe `trancamento_ativo`) ou um `status='aviso_previo'`.

---

## ✅ [API] Não existe listagem de leads — RESOLVIDO v1.6.0

> ✅ **Atendido pelo Emusys em 15/09/2026 (v1.6.0):** `GET /leads` lista com paginação por cursor
> (padrão `/faturas`), filtro `status` (`ativo`/`arquivado`/`abandonado`/`todas`) e `estagio_id`
> (lista por vírgula). `GET /leads/por_id` e `GET /leads/por_telefone` completam. Viabiliza a
> conferência periódica "algum lead não chegou?" que faltou no incidente de 11/08 (22 leads).

**Identificado em:** 2026-08-10

**Descrição:** Só dá para criar (`POST`) e atualizar (`PATCH`) lead. Nenhum endpoint lista.

**O que custa:** impede qualquer conferência de completude do nosso funil contra o deles. Quando um
lead não chega (webhook perdido), não há como descobrir senão por acaso.

**Solicitação ideal (Emusys):** `GET /crm/leads` com paginação por cursor, no padrão de `/matriculas`.

---

## ⚠️ [API] `/matriculas` ignora `responsavel_id` em silêncio

**Identificado em:** 2026-08-03

**Descrição:** `responsavel_id` (e variantes) é **ignorado sem erro**: HTTP 200 com a mesma página que
a query sem filtro nenhum — resposta idêntica à de um parâmetro inventado (`xpto_id`). Controle
positivo na mesma bateria: `aluno_id=67` devolveu 1 item, ou seja esse filtro existe.

**O que custa:** achar os alunos de um responsável exige varrer `/matriculas` inteiro e agrupar no
cliente — **2.518 matrículas / 51 páginas** só em CG.

⚠️ **Risco maior que o custo:** a API **não valida parâmetro desconhecido**. Filtro errado parece
funcionar. Nunca concluir que um filtro do Emusys existe só porque veio 200 com dados — comparar
sempre com a query SEM o filtro.

**Solicitação ideal (Emusys):** aceitar `responsavel_id` em `/matriculas` e, no mínimo, **retornar
erro** em parâmetro desconhecido em vez de ignorar.

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

🔁 **Remedido em 2026-08-10 — CONTINUA ABERTO e material.** Em julho/agosto: **3.838 pares** coexistindo,
**581 com status divergente = 15,1%** (era 19% em maio). Caiu um pouco, mas a natureza é a mesma e o
workaround de deduplicação segue obrigatório em qualquer contagem absoluta.

---

## 🚨 [API] Filtro `pessoa_id` no `/aulas` não cobre professor (só aluno)

**Identificado em:** 2026-06-12 · **Reverificado 2026-06-22: AINDA ABERTO** — `/aulas?pessoa_id=415` (Gabriel Antony, com aulas no dia) retornou **0 aulas**.

**Descrição:** O `/aulas` ganhou `pessoa_id` (v1.1.6) e a doc diz que filtra "Pessoa_ID do aluno **ou professor**". Na prática, só casa o papel de **aluno** — passar o `pessoa_id` de um professor retorna vazio.

**Evidência:** 18/18 professores da Barra → **0 aulas** via `pessoa_id`, tendo de 2 a 72 aulas reais ministradas. Leonardo Castro (`pessoa_id` 881): 32 aulas como professor → 0 retornadas; mas as 2 aulas em que ele é **aluno** → essas vieram. Confirma que o filtro casa só o papel aluno.

**Solicitação ideal (Emusys):** fazer `pessoa_id` casar também `professores[]`, conforme está documentado.

---

## ⚠️ [Plataforma] Troca de curso no contrato não propaga para a turma/aulas

**Identificado em:** 2026-06-12

**Descrição:** Ao trocar o curso de um contrato (ex: Musicalização → Bateria), o aluno permanece na turma antiga e o `/aulas` continua gerando as aulas — **inclusive futuras** — com o curso **antigo**. A tela de Contratos mostra o curso novo; o endpoint reflete a turma real. As duas fontes do próprio Emusys discordam entre si.

**Evidência:** Lorenzo Tavares (Barra, `pessoa_id` 1026). Tela de Contratos = 2× "Bateria". Mas `/aulas`: a **quinta** segue como Musicalização (turma `MPpi_Qui_15`, `curso_id 1`), ininterrupta de 18/09/2025 a 17/09/2026 — **nunca houve aula de Bateria na quinta**. A **segunda** é Bateria (turma `B_Seg_15`, `curso_id 7`), correta. Ou seja: a troca foi feita no contrato mas o aluno nunca saiu da turma de Musicalização.

**Limite:** a API não expõe o histórico de contratos, então não dá pra ver **quando** a troca ocorreu — só que as aulas seguem com o curso antigo.

**Régua de detecção (precisa):** comparar a disciplina do `contrato_atual` (`/matriculas`) com as **aulas recentes** (`/aulas`, últimos ~45 dias). Se a disciplina do contrato **não aparece** nas aulas recentes → o contrato está errado. (Não basta comparar com o histórico todo: quem **trocou** acumula aulas dos dois cursos, e aí o contrato está certo — a divergência é só com o nosso cache. O bug é quando o contrato declara um curso que o aluno **não está tendo aula**.)

**Magnitude (2026-06-22):** de 174 divergências de curso, **166 eram trocas reais** (contrato certo, nosso cache atrasado) e **5 são erro do Emusys** (contrato declara curso sem aula recente). ⚠️ Detecção tem que ser **por PESSOA, agregando todas as matrículas/linhas** — a presença não vem separada por linha (aluno multi-curso tem todas as aulas em cada linha). Agregar por linha gera falso positivo (ex. Gabriel Mello e Débora "pareciam" erro, mas fazem o curso do contrato em outra linha).

| Unidade | Aluno | `matricula_id` | `contrato_atual` diz | Aulas recentes reais (`/aulas`) |
|---|---|---|---|---|
| Barra | Bento Cordeiro Sobrinho | 313 | Bateria | **Teclado** (12x, até 16/06) |
| Barra | Davi Barreto Lima | 327 | Mus. Preparatória | **Bateria** (15x, até 16/06) |
| CG | Joaquim Isaac da Cunha Cal | 2434 | Mus. Infantil | **Mus. para Bebês** (10x, até 18/06) |
| CG | Katia Regina Rocha de Siqueira de Azevedo | 2526 | Piano | **Teclado** (12x, até 17/06) |
| CG | Olívia de Rezende Samico | 2421 | Mus. Infantil | **Mus. para Bebês** (12x, até 20/06) |

**Solicitação ideal (Emusys):** garantir que `contrato_atual.disciplinas` reflita a disciplina/turma onde o aluno **efetivamente** tem aula (cruzar com `/aulas`). Hoje o contrato pode apontar um curso que o aluno não frequenta.

🔁 **Remedido em 2026-08-10 — CONTINUA ABERTO.** Aplicando a régua acima ao dado atual (aulas normais
não canceladas dos últimos 45 dias, agregando **por pessoa**): **30 candidatos** em 1.005 pessoas
ativas, contra 5 em 22/06. ⚠️ **São candidatos, não confirmados** — a medição de junho passou por
triagem manual que separou 166 trocas reais de 5 erros do Emusys; esta não passou. Antes de reportar,
refazer a triagem: recesso, trancamento e curso sem `de-para` inflam o número.

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

## ⚠️ [API] `GET /professores` devolve só `id` e `nome` — sem identidade da pessoa

**Identificado em:** 2026-07-27

**Descrição:** O `/professores` retorna exatamente dois campos por professor (verificado ao
vivo: 24/24 no Recreio, só `id` e `nome`). Como o `id` é **escopado por unidade**, não existe
nenhum campo nesse endpoint capaz de dizer que dois cadastros são a mesma pessoa.

**Por que importa:** a mesma pessoa tem nome diferente em cada unidade — Erick é
"Erick Osmy" (Recreio `2109`) e "Erick Cosme da Silva" (Barra `1160`), **mesmo CPF
`16559246728`**. Quem sincroniza professor por esse endpoint é obrigado a casar por nome,
que erra nos dois sentidos (não une a mesma pessoa; une registros distintos de nome parecido).

**Workaround em uso (nosso lado):** colher `telefone`/`email` do objeto `professores[]` do
`GET /aulas`, ou o CPF via `GET /pessoas/buscar?email=`. Ambos funcionam, mas exigem varrer
aulas para montar o cadastro — trabalho que o `/professores` deveria poupar.

**Solicitação ideal (Emusys):** incluir `telefone`, `email` e/ou `cpf` no `/professores`.
Qualquer um dos três resolve.

🔽 **REBAIXADO em 2026-08-10 — o pedido perdeu quase todo o valor.** Não porque o Emusys corrigiu,
mas porque resolvemos por outros caminhos que ele nos deu: `professores[].id` no `/aulas` (v1.2.0,
21/06) e `professor_id` nos webhooks de experimental (v1.4.1, 04/08). Medido hoje: **79 de 83
vínculos em `professores_unidades` já têm `emusys_id` (95%)** — não casamos mais por nome na
prática. Manter na lista como item de baixa prioridade; **não gastar capital de pedido com ele**
enquanto o `aula.id` estiver aberto.

**Impacto e plano do nosso lado:** ver `todos-pendentes.md` →
"Identidade de professor resolvida por NOME".

---

## ⚠️ [API] "Nr. de Aulas Restantes" da tela do Emusys diverge da API (1 a 4 aulas)

**Identificado em:** 2026-07-28

**Descrição:** A tela **Escola → Renovação de Matrículas** ("Matrículas Vencendo") mostra uma coluna *Nr. de Aulas Restantes* que **não bate com nenhum valor obtenível pela API**. A API é internamente consistente — `/matriculas` e `/aulas` concordam entre si — mas a interface mostra sempre **mais** aulas restantes.

**Evidência (Barra, 28/07/2026, janela de 30 dias):**

| Aluno | `/matriculas` → `nr_aulas_futuras` | `/aulas` (contagem direta) | Tela do Emusys |
|---|---|---|---|
| Carlos Vitor Pinheiro da Silva | 1 | — | **2** |
| Isabella Lopes Correa | 1 | — | **3** |
| Natan Pereira Calvo Demidoff (Bateria) | 1 | **1** | **2** |
| Gabriela da Costa | 2 | — | **3** |
| Miguel Sperandio Kevorkian | 3 | — | **4** |
| Caê Leal Santos | 2 | — | **3** |
| Mariana Herd Giglio (Canto) | 2 | — | **6** |
| Rafael Mello dos Santos | 2 | — | **3** |
| Daniel Sampaio Senna Lattari | 1 | — | 1 ✅ |
| Caique Feijó de Lima Vieira | 1 | — | 1 ✅ |

Os dois casos que batem são justamente os sem divergência; nos demais a tela mostra de 1 a 4 aulas a mais.

**Hipóteses testadas e DESCARTADAS** (aprofundado no caso Natan/Bateria, `pessoa_id=408`):

- ❌ **Aulas canceladas contando como restantes:** o contrato tem **0 aulas canceladas** (`GET /aulas` no período do contrato).
- ❌ **Reposição/extra fora da contagem:** as 42 aulas são **todas** `categoria=normal`.
- ❌ **Defasagem do nosso sync:** o tempo só *reduz* aulas restantes; se fosse defasagem, o nosso número seria **maior**, não menor. Além disso a consulta à API foi feita ao vivo, no mesmo momento do print da tela.

**Achado colateral:** os contadores do contrato não batem com a agenda real dentro do próprio Emusys — o contrato do Natan/Bateria declara `nr_aulas_contratadas = 40`, mas `GET /aulas` devolve **42 aulas** normais para o mesmo contrato (41 passadas + 1 futura, contra 40/39/1 declarados no contrato).

**Impacto:** a coluna "Aulas restantes" do nosso módulo **Contratos** (Administrativo) reflete a API e, portanto, diverge da tela do Emusys. A coluna **Última aula** — que é o sinal principal para decidir urgência de renovação — bate 100%, então o recorte de quem está vencendo está correto; só a contagem de aulas difere.

**Decisão (Hugo, 28/07/2026):** manter o valor da API, documentar a divergência, e perguntar ao Emusys. Não há fonte disponível que reproduza o número da tela.

**Solicitação ideal (Emusys):** informar qual é a regra de cálculo de *Nr. de Aulas Restantes* na tela de Renovação de Matrículas e, se possível, expor o mesmo valor na API. Perguntar também por que `nr_aulas_contratadas` do contrato diverge da quantidade real de aulas em `/aulas`.

---

## 🚨 [Webhook] `matricula_alterada` manda a data ANTIGA em `matricula.data_matricula`

**Identificado em:** 2026-08-06 (investigando o fechamento de julho da Barra)

**Descrição:** No evento `matricula_alterada` disparado por uma alteração de **data de matrícula**, o campo estruturado `matricula.data_matricula` vem com o valor **anterior** à alteração. A data nova só existe dentro do HTML de `alteracao.descricao`. Quem consumir o payload (o comportamento óbvio) grava o valor errado — ou, pior, **desfaz** uma correção já aplicada.

**Evidência (matrícula 840, Luíza P Caruso, Barra):** a Kailane alterou no Emusys em 01/08/2026 às 14h01 a data de 01/08 para 31/07. O webhook chegou 15s depois (evento `71590`, em `automacao_log` id 17454):

```
matricula.data_matricula = "2026-08-01"            ← data ANTIGA
alteracao.descricao      = "Data da matrícula alterada de <b>01/08/2026</b> para <b>31/07/2026</b>"
```

Só existe **um** `matricula_alterada` para essa matrícula — não veio um segundo evento com o valor correto.

⚠️ **É específico deste campo.** Testados os outros tipos de alteração (167 eventos desde 07/07/2026): `Curso alterado`, `Alteração de disciplina`, `Turma alterada`, `Aulas alteradas (primeira/última aula, nr de aulas)` — em **todos** o payload traz o valor **NOVO**, coerente com a descrição. A defasagem só foi observada em `data_matricula` (amostra de 1 — é a única ocorrência desse tipo até hoje).

**Hipótese:** o objeto `matricula` do evento é montado a partir de um estado anterior ao commit da alteração, ou a data da matrícula é lida de outra tabela que ainda não havia sido atualizada. Como os demais campos vêm corretos, não parece ser race geral do disparo.

**Impacto:** quando `matricula_alterada` passar a ser aplicado (hoje o handler só loga — ver `integracao-infra.md`), este campo **não pode** ser espelhado do payload: teria gravado 01/08 e jogado a matrícula para a competência de agosto. No caso real, quem consertou foi a própria Kailane, à mão, 1h19 depois (`audit_log`, origem `manual`). Correção de data para o mês anterior é justamente o caso que mexe em fechamento já publicado — foi o que obrigou a retificação manual do relatório de julho da Barra.

**Workaround no nosso lado:** para alteração de data, extrair o valor de `alteracao.descricao` ou reconsultar `GET /matriculas` antes de gravar — nunca confiar em `matricula.data_matricula` nesse evento.

**Solicitação ideal (Emusys):** enviar em `matricula.data_matricula` o valor **já alterado**, coerente com `alteracao.descricao` (como o evento faz com curso, turma, disciplina e datas de aula). Idealmente, expor a alteração também de forma estruturada (`alteracao.campo`, `alteracao.valor_anterior`, `alteracao.valor_novo`) em vez de só o HTML da descrição.

---

## Resolvidos (histórico)

- **✅ 2026-07-21** — Webhook fan-out (mesmo evento → 2+ URLs). Era de 2026-07-07: na época o observador (`debug-webhook-emusys-observador`, grava payload bruto em `automacao_log` `workflow_id='debug-webhook-emusys-observador'`) só recebia `aula_cancelada` — evento sem webhook n8n — porque o Emusys mandava cada evento para uma única URL. **O Emusys resolveu**: verificado ao vivo 21/07, o observador agora recebe `lead_criado`/`lead_editado`/`boleto_pix_pago` **em paralelo** ao n8n (69 eventos só no dia 21/07). Fan-out do mesmo evento p/ múltiplos destinos agora funciona → dá pra observar/testar um novo destino sem cutover.

- **✅ 2026-06-22** — `professores[].id` no `/aulas` (era de 2026-05-04). Corrigido na v1.2.0/21-06; na época valia só para aulas `individual`.
- **✅ 2026-06-22** — `id_aluno`/`id_lead` em `alunos[]` no `/aulas` (era de 2026-06-12). Corrigido na v1.2.0/21-06; tornou o `/pessoas/buscar` por id desnecessário para mapear aluno.
- **✅ 2026-07-07** — Aulas tipo `turma` agora vêm com `professores[]` preenchido (era de 2026-05-04, reaberto e reverificado 2026-06-22). Testado ao vivo (GET real) nas 3 unidades: CG 24/24 turmas com professor, Barra 27/27, Recreio 25/25 — 0 casos vazios. Provavelmente corrigido junto com a v1.2.2 (mesma leva que trouxe `/faturas`).

- **✅ 2026-08-10 — SUPERADO (não corrigido pelo Emusys): `/pessoas/buscar` não aceita `id`.** Era de
  2026-06-12. O endpoint segue só aceitando email/cpf/telefone, mas **o problema raiz desapareceu**:
  `id_aluno`/`id_lead` passaram a vir direto no `/aulas` (v1.2.0, 21/06) e não precisamos mais
  resolver `id → pessoa`. Removido da lista de pedidos — não vale gastar capital com ele.

### Estado da revisão de 2026-10-05

Changelog conferido até **v1.8.3 (05/10/2026)** — 3 itens atendidos + 1 parcial:

| Item | Como está |
|---|---|
| `aula.id` nos webhooks de experimental | ✅ **v1.8.1** — `aula.aula_id` estável no reagendamento + `aula.data_hora_inicio_original`. Adoção no n8n pendente |
| `presenca` sem "não registrada" | ✅ **v1.8.2** — `registro_presenca` (`registrado`/`pendente`/`null`). ⚠️ Medir se as unidades LA retornam não-`null` |
| Listagem de leads | ✅ **v1.6.0** — `GET /leads` + `/por_id` + `/por_telefone`, filtro `estagio_id` |
| GET histórico do lead | 🟡 **Parcial** — v1.6.0 traz estágio ATUAL e `status`; histórico/anotações segue sem endpoint |
| PULL do aviso prévio | Aberto — webhook existe, consulta não |
| `responsavel_id` ignorado em silêncio | Aberto, não reverificado |
| Status turma × individual | Aberto — workaround de dedup segue obrigatório |
| Troca de curso não propaga | Aberto — exige triagem antes de reportar |
| `/professores` só id+nome | Aberto (rebaixado) — 95% dos vínculos já têm `emusys_id` |
| `pessoa_id` não filtra professor | Aberto, não reverificado |
| Presença sem vínculo `pessoa_id` | Aberto, não reverificado |
| Nr. Aulas Restantes diverge da tela | Aberto (baixa prioridade) |
| `matricula_alterada` manda data antiga | Aberto (amostra de 1) |

**Oportunidades novas (não eram pedidos):** webhooks `contrato_enviado_para_assinatura`/
`contrato_assinado` (v1.8.0) e `matricula_excluida`/`contrato_excluido` (v1.8.2) — ⚠️ precisam ser
**assinados no cadastro de webhooks de cada unidade** para chegar (foi o que travou o aviso prévio
até 30/09). Params de agendamento de experimental: `forcar_individual` (v1.2.5),
`contar_alunos_experimentais` (v1.2.7), `aula_online` (v1.4.3), `filtrar_sala_por_instrumento`
(v1.8.3) — úteis se a Mila agendar pela API.

**Correções nossas do mesmo dia (05/10, medição do agente do LA Teacher/Fábio):**
12 das 14 cobranças de chamada do painel eram fantasmas — aula apagada ou aluno removido no Emusys
seguia na fila. Resolvido em produção (migration `20261005140000`): (a) `vw_presenca_pendencia`
passou a exigir `aula_alunos_emusys.ativo_operacional` (tirou ~263 linhas mortas: 482→~190);
(b) `reconciliar_grade_snapshot_emusys_core_v3` deixou de ser só-futuro no cancelamento lógico —
aula ausente do Emusys dentro da janela de cobrança (45d) é tombada `sync_ausente_emusys`.
Backfill: 171 aulas mortas tombadas nas 58 datas afetadas das 3 unidades; residual = 0.
**Gap novo descoberto (para o desenho das 3 gavetas):** presença lançada no Emusys *depois* do sync
daquele dia fica velha aqui — a revisita `sync-presenca-backlog` cobre só D-14 em fatias de 3d a
cada 5 dias. Caso medido: Renato, C_Qui_19 01/10 — `presente/registrado` no Emusys, nossa linha
ficou `ausente` neutra do fetch único de 02/10 até o re-fetch manual. `registro_presenca`
confirmado **ativo nas 3 unidades** (medido pelo Fábio 05/10) — é o gancho para re-ler só o que
mudou de `pendente`→`registrado`.

### Estado da revisão de 2026-08-10

Changelog conferido de 21/06 a 04/08 (v1.4.1): **nenhum** item aberto foi corrigido pelo Emusys.

| Item | Como está |
|---|---|
| `aula.id` nos webhooks de experimental | 🚨 **Novo, prioridade máxima** — é pedido de paridade |
| `presenca` sem "não registrada" | ⚠️ Novo |
| GET histórico do lead | ⚠️ Novo |
| PULL do aviso prévio | ⚠️ Novo |
| Listagem de leads | ⚠️ Novo |
| `responsavel_id` ignorado em silêncio | ⚠️ Novo (de 03/08) |
| Status turma × individual | 🔁 Remedido: **15,1%** (era 19%) — aberto e material |
| Troca de curso não propaga | 🔁 Remedido: **30 candidatos** (eram 5) — exige triagem antes de reportar |
| `/professores` só id+nome | 🔽 **Rebaixado** — 95% dos vínculos já têm `emusys_id` |
| `pessoa_id` não filtra professor | Aberto, não reverificado (exige chamada à API de host allowlistado) |
| Presença sem vínculo `pessoa_id` | Aberto, não reverificado (mesmo motivo) |
| Nr. Aulas Restantes diverge da tela | Aberto (baixa prioridade — só a contagem difere, a data bate) |
| `matricula_alterada` manda data antiga | Aberto (de 06/08, amostra de 1) |
| `/pessoas/buscar` por id | ✅ Removido — superado |

⚠️ **Não reverificados ao vivo nesta rodada** os itens que exigem chamar a API: a máquina local é
bloqueada por allowlist de IP (`token invalido!`). Precisam de host permitido — VPS ou edge.

---

## Como reportar ao Emusys

Email do suporte/dev: `dev@emusys.com.br` (ver `emusys-api.md`).

Ao abrir ticket, sempre incluir:
- Endpoint exato (com query params)
- Token usado (mascarado, só primeiros 6 chars + última letra)
- Payload de exemplo retornado vs esperado
- Impacto no nosso fluxo

---

## Geminação turma↔individual + justificada no nível da aula (auditoria 05/10/2026)

**Estrutura (medido, 45d, as 3 unidades):** toda aula de turma gera uma aula
`individual` por aluno no Emusys — mesmo (unidade, professor, inicio, fim,
curso_nome), roster=1, `nr_da_aula=0`, `qtd_aulas_contrato` igual à da turma.
~97% das individuais têm gêmea turma (Barra 1.690/1.749, CG 2.834/2.908,
Recreio 2.434/2.541). Não é bug da nossa base — é o modelo do Emusys (a
"individual" é o registro por aluno da sessão; o professor escreve anotações
de conteúdo nela — medido: 970 individuais com anotações em 45d CG).

**`justificada` na individual:** subset deliberado (não-automático: 240
individuais `ausente` sem justificada vs 548 com). Fenômeno CG-concentrado e
datado: mai 5 / jun 17 / jul 5 / **ago 432 / set 380 / out 0**. Zero correlação
com `presenca_emusys_escrita` (não é eco nosso). Payload `GET /aula`:
categoria `normal`, `reagendada=false`, professor `presente`+`registrado`,
aluno `ausente`, justificada=true — a aula aconteceu; a justificativa é a
ausência do aluno (falta justificada registrada no Emusys). Conferir na tela:
Francisco (Bateria T, 15/09 20h, turma 650327 / indiv 687285, prof Gabriel
Otávio), Neemias (Violino T, 15/09 14h, 537941/653027, prof Joel — com
anotações), Arthur (MI, 19/09 14h, 747323/654989, prof Caio Tenório).

**Onde já é tratado:** `fn_aula_operacional_id` / `fn_aula_operacional_da_sessao`
(maior roster → turma primeiro), agenda professor `canonica_v2` (colapsa por
slot), `vw_registro_pendencia` (âncora turma + lê anotacoes da individual do
aluno — a individual é a superfície de conteúdo por aluno), bom-dia do Fábio
(comentários I3/M7 de fixes de gêmea), Sol `fn_presenca_pendencias_do_dia_v2`
(posicao=1 por slot_key).

**Onde ainda vaza:**
- `vw_presenca_slot_canonica_v1` <= v1.1: `bool_or` de cancelada/justificada
  vetava o slot inteiro → apagou ~487 faltas reais de CG. Corrigido v1.2
  (05/10): vetada ordena por último + resultado = o da linha escolhida.
- `fn_presenca_pendencias_do_dia_v2` (Sol): `not exists(gêmea cancelada ou
  justificada)` ainda suprime pendência da aula viva — ~67 aulas sem chamada
  escondidas da cobrança (Barra 26, CG 19, Recreio 22 em 45d).
- Health Score presença (`_c95`): conta por aula×aluno, não por slot — gêmea
  é "esperado" a mais; gêmea justificada nunca classifica → cobertura
  cai (gate 95%). CG voltou a pontuar: política nova de 05/10 tem
  `exige_revisao_operacional=false` (a v2-19/07 tinha `true` para CG ago+).

**Pendente de decisão (Alf/Fábio):** justificada na individual = falta
justificada do aluno no Emusys → hoje a falta humana do LA Report vence;
alternativa: divergência para a secretaria confirmar justificativa.

## 2026-10-06 — "Furos de lançamento" resolvidos: modelo correto das gavetas

Regra fixada no topo do CLAUDE.md (commit a9518ab3): gaveta da EQUIPE vale;
Emusys `ausente` sozinho nunca é falta. Investigação dos "esperados sem
classificação" de set/2026 (226 esperados-órfãos) mostrou que TODO número de
"aula sem lançamento" é erro de medição até prova. Decomposição:

- 118 resíduo de saida da escola (movimentacoes_admin <= data_aula).
- 21 aula não aconteceu (professor ausente no Emusys + zero lançamento).
- 18 remarcada (lançamento no mesmo dia/curso, outro horário).
- 20 fora da janela da disciplina (data_primeira/ultima_aula da jornada).
- 37 matriculado em outra turma do curso (dia_semana+horario da jornada
  ≠ slot da aula — roster carrega a turma antiga).
- 12 suspeitos → conferidos pelo Fábio no Emusys, um a um: ZERO era furo.

**Duas correções permanentes na medição (validadas pelo Fábio):**

1. **Saída de TURMA ≠ saída da escola.** `aula_alunos_emusys.ativo_operacional`
   = false / `inativado_em` <= data_aula (motivos `ausente_snapshot_completo`,
   `roster_vazio_confirmado`) = aluno fora daquela turma, mesmo matriculado na
   escola. Esperado só conta linha de roster com ativo_operacional. Casos:
   Gustavo (MP_Qua_11, saiu 02/09), Lara (C_Qua_18, 09/09), Maitê (C_Seg_14,
   31/08 e 25/09).
2. **`registro_presenca='registrado'` no Emusys É lançamento da equipe.** A
   equipe também marca direto no Emusys — `respondido_por='emusys'` com
   registro registrado conta como gaveta humana (ex.: C_Seg_17 CG 21/09 —
   Maria/Elisa/Amanda presente+registrado). Só `ausente`+`pendente` é
   "ninguém marcou".

**Sobraram 8 alunos no mês inteiro** (aula aconteceu, colegas marcados,
aluno ausente+pendente sem marca nenhuma). Hipótese do Fábio: a equipe marca
quem VEIO e quem faltou fica ausente-pendente — se o Alf confirmar,
ausente+pendente em aula realizada com chamada fechada = falta. **AGUARDANDO
resposta do Alf antes de qualquer migration.** Sol e HS congelados nesse
ponto — nada muda sem a decisão.

**RESOLVIDO (06/10, auditoria do Fábio no Emusys): os 8 TODOS tinham
lançamento — a conta não lia o lugar certo.** Auditoria de set/2026 fecha com
**ZERO furo de lançamento da equipe**. Terceira correção permanente na
medição:

3. **O esperado tem que ler TAMBÉM a aula INDIVIDUAL gêmea do aluno
   (`aulas_emusys.justificada` / `cancelada`), não só a aula da turma.** A
   equipe lança falta justificada e cancelamento na individual do aluno, e a
   linha da turma fica `ausente+pendente`. Casos verificados no banco:
   - **CG, justificada=true na individual:** Miguel (H_Qua_19 23/09), Pedro
     (B_Qua_19 23/09), Thuanny (C_Seg_17 21/09), Vinícius (PK_Qui_15 10/09 —
     que no mesmo dia também teve C_Qui_16 com `agenda_secretaria`+ausente
     registrado em turma E individual).
   - **Barra, cancelada=true na individual:** Felipe (G_Seg_14 14/09).
   - **Barra 18/09 19h (Eva, Leticia no C_Sex_19; Raquel no MBS_Sex_19):**
     chamada feita DIRETO no Emusys, presentes registrados; os três sem
     marca naquela noite. Nas outras sextas aparecem normalmente (Eva e
     Leticia presentes; Raquel com faltas lançadas — cadastro trancado hoje).

Decomposição final dos 226 órfãos de set/2026: 118 saída da escola + 21 aula
não aconteceu + 18 remarcada + 20 fora da janela da disciplina + 37 outra
turma/slot + 4 saída de turma (ativo_operacional) + 4 justificada na
individual + 1 cancelada na individual + 3 sem marca em chamada fechada
(Eva/Leticia/Raquel). Restam abertas, SEM migration: a semântica de
`ausente+pendente` em aula realizada com chamada fechada (decisão do Alf,
ver item anterior) e as correções 1-3 aplicadas às contas (esperado lê
ativo_operacional da turma + gêmea individual + registrado-como-humano).
