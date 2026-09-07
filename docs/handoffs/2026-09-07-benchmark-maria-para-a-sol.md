# Benchmark da Maria — o que a Sol copia, o que não copia

**Data:** 07/09/2026 · **Frente 2, insumo de arquitetura** · Fontes: `openclaw.json`, `private/mcp/maria-db-mcp.mjs`, `logs/maria-uazapi-bridge.log` (lidos por mim, root em 187.127.9.25), banco Superfolha (Management API), e as duas respostas do agente da Maria (Sol e TOM, 07/09).

**Regra do Alf que segui:** *"não é só te mandar a resposta do agente da Maria — você tem que ver com seus próprios olhos."* Tudo abaixo está marcado como **verificado** (eu li) ou **relatado** (o agente dela mediu e eu não repeti).

---

## 1. O que eu verifiquei — e bateu exato

| afirmação do agente da Maria | eu li | resultado |
|---|---|---|
| 208 funções `maria_*`, 332 no total, 145 tabelas | Management API no Superfolha | **208 · 332 · 145 · 25 views `vw_maria_*` · 2 papéis** ✅ |
| 2.883 decisões de rota, 2.717 em 30 dias | `maria-uazapi-bridge.log` | **2.883 · 2.717** ✅ |
| atalhos: `contas_dia` 116 · `email_ingest` 57 · `contas_abertas_mes` 29 | idem | **116 · 57 · 29** ✅, e o resto (10, 9, 5, 5, 2, 2) |
| 13 descrições com NÃO/NUNCA; a maior com 732 chars | `maria-db-mcp.mjs` | **13 · 732** ✅ |
| a cerca do `select` recusa tabela crua | `maria-db-mcp.mjs` L300–311 | ✅ `if (!(obj.startsWith('vw_maria_') \|\| obj.startsWith('maria_'))) throw 'Consulta bloqueada'` |
| 30 skills, 0 habilitadas | `openclaw.json` | **30 · 0** ✅ |
| `maria-rose` = `maria-ana` = 90 tools; `owner` 97; `leitura`/`laudo` 49; `operacional` 9 | `openclaw.json` | ✅ exato |

**Não verifiquei** (relatado): custo, latência por turno, o incidente do ✅ (8 de 9 falsas), o `x-opencode-session`.

## 2. A arquitetura, em oito peças

**1. Um agente por papel, allow-list dura de nomes.** Não é skill, não é descrição — é `tools.allow` explícito. `main` 17 · `owner` 97 · `rose`/`ana` 90 · `leitura`/`laudo` 49 · `operacional` 9. E `tools.deny` com 17 entradas, entre elas **`message`, `whatsapp`, `exec`, `write`**: *o agente produz texto; quem entrega é a ponte.*

**2. O perfil vem do remetente, resolvido no bridge antes do modelo.** `bridge.js:8783` — telefone → `agentId`. Quem não é mapeado cai em `maria-leitura` (só leitura). O modelo **nunca escolhe** com que poder está falando.

**3. Contenção no `GRANT`, não na lista.** O mesmo `maria-db-mcp.mjs` roda quatro vezes com papéis de banco diferentes. **A lista esconde; o `GRANT` recusa.** Duas travas, e a de fora não substitui a de dentro. (É o mesmo desenho que já pusemos na base comercial da Mila.)

**4. O nome da ferramenta é a RPC, e são poucas.** 65 tools nomeadas por trabalho — `maria_contas_dar_baixa`, `maria_agenda_remarcar`. Não 424 endpoints; verbos que uma pessoa reconheceria.

**5. Descrição com caso, não com especificação.** Média ~250 chars. O que discrimina não é "quando usar" — é **"quando NÃO, e é a irmã tal"**, com data, pessoa, a frase dela e o número do erro. Exemplo real, verificado:

> *"NUNCA repita o mesmo item nos dois: conta a pagar só entra no bloco de contas — a Rose pediu isso em 02/09/2026 ('se a conta virar tarefa pode confundir')."*

E o próprio agente da Maria diz: *quando ela erra, o conserto quase nunca é no prompt — é na descrição da ferramenta que ela deveria ter escolhido.*

**6. O `select` cru existe e é cercado.** Só enxerga `vw_maria_*` e `maria_*`. Tabela de produção não existe para ele. Resultado medido por eles: a Maria **respeitou a cerca sem ninguém pedir** e recusou montar lista por SELECT próprio, citando a regra.

**7. Confirmação humana em três formas:** preview/apply separados amarrados por `p_source_hash_esperado` (fonte mudou → apply recusa); **`p_texto_original`** em toda RPC de escrita (a frase humana fica no registro); e o agente não consegue mandar mensagem.

**8. Governança em cron, com canário.** Sonda de 58 perguntas congeladas com **negativo plantado que precisa reprovar** — se passa, a rodada não tem garantia. Foi ela que pegou a queda silenciosa para o fallback (92% → 10% de verdes).

## 2b. ⚠️ Correção, vinda do agente do TOM (mesmo dia)

A peça 5 acima diz que a fluidez da Maria *"vem da descrição com caso"*. O agente do TOM pôs o TOM na mesma régua e **a hipótese não sobrevive**:

| | Maria | TOM |
|---|---|---|
| tamanho médio da descrição | 253 chars | **6.613** (26×) |
| fronteira negativa (NUNCA) | 20% | **64%** |
| cita a irmã | 14% | **53%** |
| data/procedência | 8% | **36%** |

O TOM tem **mais** de tudo isso — e "vive quebrando". Se descrição rica explicasse a fluidez, explicaria o contrário.

**O que explica está no código do TOM:** `// BLOCK 4 — SKILL ATIVA (conditional, max 1)`. Uma cascata de regex escolhe **uma** de 64 competências antes de o modelo abrir a boca. A Maria tem 66 ferramentas, **17 KB, todas visíveis em todo turno**, e o modelo escolhe.

Ou seja: a Maria não tem 9% de determinismo e o TOM 100% no *parse* — o TOM tem **100% dos turnos com regex decidindo o que o modelo tem permissão de saber**. Quando a rota acerta, ele vai muito bem (orientação 26× mais rica); quando erra, o modelo não sabe o que não sabe. Variância alta é essa sensação.

🔑 **A variável que importa não é riqueza da descrição — é "tudo visível E cabe".** A descrição com caso ajuda a escolher entre as opções visíveis; ela não substitui a visibilidade.

**O que isso muda para a Sol** — e é a parte que eu não tinha visto:

- O **TOM** falha em "tudo visível" (max 1). A **Sol** falha em "cabe" (466 ferramentas, 424 delas ruído). A **Maria** acerta os dois: ~65, 17 KB. **São falhas opostas com a mesma cura** — reduzir ao que uma pessoa reconhece e mostrar tudo, sempre.
- O **roteador V4 do caixa já tem a forma certa** neste enquadramento: o prompt enumera **todas** as intenções em todo turno e o modelo escolhe; a gramática só executa. Não é `max 1`.
- A **peça 7** (hash preview/apply) a Sol **já tem** — `sol_caixa_v3_validar_approval_v1` amarra por hash da fonte + janela de 4h, e os lançamentos por `preview_message_id`. O TOM usa só janela de 20 min e quer roubar isto; nós já roubamos em agosto.
- A **conferência afirmação × efeito** — que o agente da Maria disse que copiaria do TOM e o do TOM disse que não pode morrer na migração — a Sol tem para **lote** desde 01/09 (`itens gravados = itens do payload`, senão `raise`). É a camada que **precisa sobreviver ao flip**, e o replay de hoje não a mede.

## 3. O paralelo que decide o flip da Sol

O agente da Maria mediu: **9,2% do tráfego** é decidido por 29 funções `shouldUse*` antes do modelo — e essa fatia produziu **~80% dos defeitos graves**, incluindo um que **engolia a mensagem em silêncio**. A recomendação dele, textual: *"não construir a escada de atalhos. Ela nasceu para economizar token e virou a maior fonte de defeito."*

**O runtime atual da Sol é essa escada, só que maior.** `caixa-financeiro.cjs` tem 5.000+ linhas de gramática determinística na frente, e o histórico deste repo é a lista de defeitos dela: "vale confirmar" abrindo saída de R$ 633, "sim" aprovando dinheiro no meio de uma frase, `\bparcela\b` destruindo categoria. A regra da casa desde 31/08 — *"sem regex nova de diálogo"* — é a mesma conclusão a que a Maria chegou por outro caminho.

**O flip V4 é exatamente o movimento que a Maria já fez.** E ela mediu o espelho da rota divergindo em **18 de 2.883 (0,6%)** — o análogo do nosso shadow.

## 4. O que NÃO copiar

- **A escada de atalhos.** Onde precisar de determinismo, o atalho **declara o que sabe representar e declina o resto** — nunca enumera formas de estar errado.
- **Allow-list mantida à mão.** Hoje mesmo o agente dela criou uma tool e teve de inserir o nome em **5 perfis** manualmente. Já custou *"dias com uma RPC pronta que a Maria 'não tinha'"*. Sem um teste que confronte a lista com a superfície real, ela envelhece calada e o custo aparece como **serviço morto, não como erro**.
- **145 RPCs `maria_*` que o modelo não alcança** — dívida deles, e a mesma que a Sol tem hoje com as 64.

## 5. Três achados fora do escopo, que preciso registrar

1. 🔴 **O repositório `LucianoAlf/maria-backup` está PÚBLICO** neste instante (`gh repo view` → `visibility: PUBLIC`, atualizado 18:21). O documento do agente diz *"privado desde hoje — fechamos às 15h"*. Ou não fechou, ou reabriu. Ele espelha `workspace/` e `bridges/` da VPS.
2. 🔴 **Credenciais transitaram em chat:** service_role e PAT do Superfolha. Usei uma vez, pela VPS, e apaguei o arquivo. **Rotacionar**, como a chave da OpenCode Zen.
3. ⚠️ O agente da Maria não mede chamadas de tool por dia nem taxa de falha — o bridge não loga. A sugestão dele vale para nós também: *ligar log de chamada de tool no bridge resolve três lacunas de uma vez.*

## 6. O desenho da Sol para o time (Frente 2), derivado disto

Na ordem que o próprio agente da Maria recomendou, e que eu subscrevo:

1. **Cercar o `execute_sql` / `query`** para só enxergar view sanitizada. Maior efeito, zero ferramenta nova.
2. **Nomear os verbos do administrativo** — 15 ou 20, por trabalho real: inadimplência da unidade, faturas do aluno, aviso prévio, ocupação, anamnese pendente. As RPCs `sol_inadimplencia_v1`, `sol_kpis_alunos_v1`, `sol_faturas_alunos_v1` já existem; falta a porta com nome.
3. **Descrição com caso** — data, pessoa, frase, número do erro, irmã. É de onde vem a fluidez.
4. **Perfil pelo remetente, contenção no `GRANT`** — operacional / tático / estratégico como três papéis de banco, exatamente como `leitura` / `rose` / `owner`.
5. **Teste que confronta a allow-list com a superfície real.** Nasce junto, não depois.
6. **`p_texto_original` em toda escrita**, desde o dia 1.

⚠️ E a ressalva de escala que o agente dela fez questão de escrever: a Maria fala com **11 pessoas** e **6,5 chats/dia**. A Sol fala com três grupos e o time inteiro. O desenho transfere; os números de volume, não.
