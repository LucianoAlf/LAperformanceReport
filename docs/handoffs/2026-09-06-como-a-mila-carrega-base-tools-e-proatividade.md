# Como a Mila carrega base de conhecimento, tools e proatividade

**Para:** Fábio (agente pedagógico) · **De:** frente Mila · **Data:** 06/09/2026
**Estado:** medido na fonte hoje — código vivo na la-hq e funções vivas no Postgres, não de memória.

---

## 0. A correção de modelo mental, antes de tudo

A pergunta veio como *"os 12 `.md`, como eles são segmentados e o que dispara o carregamento"*.

**Os 12 documentos não são lidos pelo agente.** Não existe um carregador de arquivos. Os `.md` em `docs/base-conhecimento-comercial/` são a **fonte de autoria** — onde o Alf escreve e aprova. Um gerador (`scripts/gerar-carga-base-comercial.mjs`) transforma esses arquivos numa migration, e o conteúdo passa a viver como **linhas no Postgres**, na tabela `base_conhecimento_blocos`.

O agente alcança esse conteúdo **chamando uma tool**, como chamaria qualquer outra. A base de conhecimento não é contexto: é dado.

Isso importa para o Fábio porque muda o problema. "Como decido qual dos 12 docs carregar no prompt" é uma pergunta difícil e frágil. "Como escrevo uma consulta que devolve os 3 blocos mais relevantes, já filtrados por quem perguntou" é uma pergunta de banco, com resposta conhecida.

**Por que não dava para colocar no prompt** — os números de hoje:

| público | blocos aprovados | tamanho |
|---|---|---|
| consultor comercial | 7 | 47.443 chars (~12k tokens) |
| liderança (vê os 7 acima **+** 5 próprios) | 12 | 82.482 chars (~21k tokens) |
| lead (Mila SDR — intocada) | 4 | 1.322 chars |

21 mil tokens de material que é usado em talvez 1 mensagem em 5. A tool devolve no máximo **3 blocos** por chamada.

---

## 1. As quatro camadas: o que está sempre no prompt e o que não está

```
  SEMPRE NO PROMPT                          SOB DEMANDA
  ────────────────────────                  ───────────────────────────
  SOUL.md                 6,6 KB
  descrição das 90 skills  1 linha cada ──▶  corpo do SKILL.md   18 KB
  lista de tools visíveis  ~30 nomes   ──▶  resultado da tool
                                              └─▶ RPC ──▶ até 3 blocos  ~20 KB
```

**Camada 1 — `SOUL.md` (6,6 KB, sempre carregado).** Quem ela é, como fala, o que nunca faz. É aqui que mora a **obrigação** de consultar a base. Trecho literal, linhas 90-98 do arquivo vivo:

> Antes de orientar **COMO fazer** qualquer coisa (responder preço, tratar objeção, conduzir experimental, pedir indicação, retomar quem sumiu, chamar ex-aluno), eu **abro a base com `consultar_base_comercial`** e respondo com o que está escrito, citando o bloco.
>
> 🔴 **Isto não é opcional.** Responder de cabeça uma pergunta de método é o mesmo erro de opinar onde existe medição: o time recebe a minha intuição no lugar do que a casa decidiu. Se a base não cobre, eu digo que não cobre, rotulo como opinião minha e registro com `registrar_lacuna_base`.

**Camada 2 — `SKILL.md` (18 KB, corpo carregado sob demanda).** O que está permanentemente no prompt é só o `description` do frontmatter — uma linha por skill, 90 skills. O corpo entra quando o modelo decide que aquela skill se aplica. O `description` da `mila-gestao`, literal:

```yaml
---
name: mila-gestao
description: "Use quando quem fala com você é DO TIME da LA Music — consultora
  comercial (Vitória/CG, Kailane/Barra, Daiana/Recreio), gerente ou diretoria
  (Luciano, Hugo) — pedindo pauta do dia, situação de um lead, pendências
  cadastrais, o programa MATRICULADOR + LA, relatórios, tráfego pago, ou pedindo
  para REGISTRAR algo no cadastro (curso, motivo de perda, canal, anotação,
  fechar um item). Não usar para lead de fora (isso é o atendimento SDR)."
---
```

🔴 **O `description` é o carregador.** Ele não descreve a skill — ele descreve **quando usá-la**, com os nomes das pessoas e os pedidos literais que a disparam. Skill cujo `description` diz "conhecimento sobre X" nunca carrega, porque o modelo não tem como saber que a mensagem de agora é sobre X. É por isso que a Maria tem 30 skills e zero habilitadas: o gate existe e está vazio.

**Camada 3 — a lista de tools.** Filtrada por quem fala, antes de o modelo ver.

**Camada 4 — a RPC.** O gate de verdade.

---

## 2. Onde a decisão de carregar é tomada — os três trechos

A resposta curta à sua pergunta ("é o modelo, é regex, é o papel de quem fala, ou é cascata?") é: **é o modelo que decide, cercado por dois gates que ele não controla.** Nenhum regex.

### 2.1 — O que o modelo pode nem enxergar (`mila-gestao-tools-mcp.mjs`, linhas 285-293)

```js
const veBaseComercial = () => !!QUEM
  && (String(QUEM.departamento || '').toLowerCase() === 'comercial'
      || String(QUEM.nivel || '').toLowerCase() === 'diretoria');

function toolsVisiveis() {
  if (!QUEM) return [];
  return [...LEITURA, ...(veBaseComercial() ? BASE_COMERCIAL : []),
          ...(veTudo() ? TRAFEGO : []), ...ESCRITA];
}
```

Quem não é do comercial nem da diretoria **não vê a tool na lista**. Não é que ela recuse — ela não existe para aquela pessoa. `QUEM` vem do carimbo do telefone, resolvido no servidor.

### 2.2 — O que ensina o modelo a chamar (a `description` da tool, no mesmo arquivo)

A declaração da tool não descreve o retorno; descreve o **gatilho** e a **obrigação**:

> Use SEMPRE que for orientar COMO fazer: conduzir conversa com lead, passar preço, tratar objeção, conduzir experimental e Tour, pedir indicação, retomar quem sumiu, chamar ex-aluno de volta. E também quando ela perguntar "como eu faço isso?", "o que eu falo?", "qual a melhor forma?". 🔴 **CITE O BLOCO E A VERSÃO** ("no bloco 1, Bumerangue v0.4, a régua de preço diz...") — orientação sem fonte é opinião, e opinião não é o que ela pediu.

⚠️ **Tool nova não basta — tem que ensinar quando usar.** Essa lição custou caro em 05/09: a Mila tinha a tool `o_que_aprendemos` disponível e mesmo assim respondeu de intuição ("porque já mostrou interesse real"). A tool estava lá; ninguém tinha dito quando puxá-la.

### 2.3 — O gate que vale (`mila_base_comercial_v1`, Postgres)

```sql
select * into v_quem
from governanca.quem_eh(regexp_replace(coalesce(p_solicitante_telefone,''), '\D', '', 'g'));
if v_quem.nome is null then
  return jsonb_build_object('ok', false, 'motivo', 'solicitante_desconhecido', ...);
end if;

v_publico := case
  when v_niv = 'diretoria' or (v_dep = 'comercial' and v_niv = 'lider') then 'lideranca'
  when v_dep = 'comercial' then 'comercial'
  else null end;
```

E a leitura hierárquica: `lideranca` enxerga também `comercial`, nunca o contrário.

```sql
where b.ativo and b.estado = 'aprovado'
  and (b.publico = v_publico or (v_publico = 'lideranca' and b.publico = 'comercial'))
```

🔴 **O público não é argumento da tool.** O modelo não escolhe para quem está respondendo — ele manda o telefone, e o servidor decide. Se o modelo fosse persuadido a pedir "material de liderança", a RPC devolveria o mesmo conjunto de sempre.

⚠️ **A primeira versão desse gate estava errada e foi pega em teste**, não em produção: eu tinha escrito `nivel in ('lider','diretoria')`, o que exporia mídia paga ao financeiro, ao marketing, ao pedagógico e ao administrativo — qualquer líder de qualquer área. O gate correto exige **departamento E nível**. Vale a pena copiar o teste junto com o padrão: rodar a consulta com o telefone de alguém que **não** deveria ver.

### 2.4 — Como o bloco é escolhido dentro do público

```sql
select to_tsquery('portuguese', string_agg(lexeme, ' | ')) into v_q
from unnest(to_tsvector('portuguese', p_situacao));
```

Full-text search do Postgres, ranqueado por `ts_rank`, top 3.

⚠️ **O `|` é o detalhe que faz funcionar.** A forma óbvia é `websearch_to_tsquery`, que monta um **E** entre os termos — e com uma pergunta em linguagem natural ("como eu faço quando o pai quer parcelar em 18 vezes no boleto?") o E nunca casa com nada. Quebrar em lexemas e juntar com OR é o que transforma pergunta de gente em consulta que devolve algo.

---

## 3. "E quando ele escolhe o documento errado — alguém percebe, ou passa?"

**Passa.** Vou ser direto porque é a parte que mais importa e a que menos tem defesa.

O que existe hoje:

| sinal | pega o quê | honestamente |
|---|---|---|
| `motivo_vazio = 'nenhum_bloco_casou_com_a_situacao'` | nada casou | ⚠️ com busca OR isso quase nunca acontece — qualquer palavra de conteúdo casa com algum bloco. **O sinal está praticamente morto**, e é uma regressão que eu mesmo introduzi ao trocar E por OR |
| `registrar_lacuna_base` | o modelo achou que a base não cobre | depende de o modelo se auto-denunciar |
| `registrar_eficacia` | a orientação funcionou? | mede o desfecho, não a escolha |
| **citação obrigatória do bloco + versão** | tudo | ✅ **é o que de fato funciona** |

A detecção real é **humana e vem da citação**. Como a Mila é obrigada a dizer *"no bloco 1, Bumerangue v0.4, a régua de preço diz..."*, a consultora que recebe a resposta vê imediatamente que ela abriu o bloco de preço para uma pergunta de reposição de falta. Sem a citação, o erro seria indistinguível de uma resposta boa.

O segundo amortecedor: a RPC devolve, junto com os 3 blocos, **o catálogo completo dos títulos que aquela pessoa pode ver** (`catalogo`, com `blocos_no_publico`). O modelo enxerga "peguei estes 3, existem estes 7" e pode perceber sozinho que pegou o errado. Não é garantia — é a diferença entre escolher no escuro e escolher vendo a prateleira.

### 3.1 — A correção óbvia NÃO funciona, e eu medi antes de escrevê-la

Eu ia fechar isso com um **piso de relevância**: `ts_rank` abaixo de X = "não cobre". Medi primeiro, com o público do consultor:

| pergunta | `ts_rank` | a base cobre? |
|---|---|---|
| lead pediu preço e sumiu | 0,0812 | sim |
| devolutiva pós-experimental | 0,0628 | sim |
| **meu carro quebrou na estrada** | **0,0497** | **não — é absurda** |
| parcelar em 18x no boleto | 0,0427 | sim (bloco 4, "prazo de pagamento") |
| reposição de falta | 0,0393 | não |

A pergunta sem sentido pontua **acima** de duas perguntas legítimas. Nenhum piso separa. Testei também **cobertura lexical** (fração dos lexemas da pergunta que aparecem no melhor bloco) e também não separa: "trocar de professor de bateria" (não coberta) dá 0,80 contra 0,67 de "devolutiva pós-experimental" (coberta).

**Por quê:** os blocos são prosa de 6-7 KB. Palavras comuns — *aluno, professor, escola, filho, falta* — aparecem em todos. Ranking lexical mede sobreposição de vocabulário, e assunto não é vocabulário.

**O que funciona é o modelo lendo o que voltou.** Rastro real do ensaio de hoje, no `agent.log`:

```
tool skill_view                    completed (15.467 chars)   ← corpo da skill sob demanda
tool consultar_base_comercial      completed (30.781 chars)   ← 3 blocos
tool consultar_base_comercial      completed (30.781 chars)   ← reformulou e buscou de novo
tool consultar_base_comercial      completed (30.781 chars)
tool registrar_lacuna_base         completed                  ← concluiu que faltava material
```

Pergunta: *"a mãe quer trancar a matrícula por 3 meses por causa de uma cirurgia"* — trancamento aparece em **0 dos 12 blocos**. Ela leu, concluiu certo e registrou a lacuna. O julgamento é bom; o mecanismo é o modelo, não a query.

### 3.2 — O defeito real que isso revelou: **lacuna registrada em silêncio**

Na primeira rodada ela registrou a lacuna e respondeu assim: *"Pelo método da LA, o ponto é: acolher sem bater de frente; devolver uma pergunta..."* — **sem dizer que a base não cobre trancamento**.

Não era invenção: o princípio existe (bloco 4). O defeito é que ela **esticou um princípio geral para um assunto que o bloco não trata e entregou com a etiqueta "o método da LA"**. Quem recebe vai embora achando que a casa decidiu algo que a casa nunca decidiu.

O SOUL já dizia "se a base não cobre, eu digo que não cobre". Não bastava, porque **do ponto de vista dela a base cobriu** — ela achou algo aplicável. Faltava nomear este caso, e existe um sinal duro que dispensa julgamento:

> 🔴 **Se eu chamei `registrar_lacuna_base`, eu tenho que ter dito à pessoa, na mesma mensagem, que a base não cobre.** Registrar em silêncio é o pior dos dois mundos: a fila de escrita cresce e quem perguntou nunca soube que estava recebendo a minha leitura em vez do material aprovado.

Depois disso, a mesma pergunta: *"Base não traz um procedimento específico pra trancamento temporário, só a orientação geral de objeção/retomada, então eu fui no que dá pra fazer sem prometer o que não é nosso."* ✅

### 3.3 — Uma armadilha de teste que custou caro três vezes

O cenário que verifica esse comportamento reprovou **três respostas certas seguidas**:

1. ela disse *"não tem um bloco específico sobre isso"* → ❌ porque o regex exigia outra frase;
2. o **assunto** do cenário estava errado (18x **é** coberto) → o teste exigia que ela mentisse;
3. ela disse *"a base não **traz**"* → ❌ porque `traz` não estava na lista de verbos.

Nas duas primeiras eu quase mexi no comportamento dela por causa do meu próprio predicado. **Predicado de teste de agente tem que checar FORMA, não vocabulário** — aqui virou "uma negação perto de *base/material/bloco*, em qualquer ordem", provado contra as 3 respostas certas e contra 2 respostas ruins que devem continuar reprovando.

---

## 4. Como as tools chegam ao modelo

Servidor MCP em Node (`mila-gestao-tools-mcp.mjs`, ~30 tools) separado em arrays por natureza: `LEITURA`, `BASE_COMERCIAL`, `TRAFEGO`, `ESCRITA`. `toolsVisiveis()` monta a lista por pessoa, na hora.

Três coisas que valeram a pena:

1. **Array próprio por sensibilidade, não uma lista só com `if` dentro.** Material de mídia paga é outra categoria de segredo que "quantos leads eu tenho hoje" — e a separação em array torna isso legível de relance, em vez de enterrado numa condição.
2. **Duas travas, e a de fora não substitui a de dentro.** O filtro no cliente esconde a tool; a RPC recusa o conteúdo. Se divergirem, vale a de dentro. O filtro do cliente existe só para o modelo não ficar oferecendo o que não pode entregar.
3. **`DRY` respeitado no despacho de escrita.** O perfil de sombra chama as mesmas tools e não grava:
   ```js
   if (DRY) return j({ ok: true, dry_run: true, recado: 'ensaio: lacuna nao gravada' });
   ```

---

## 5. Como a proatividade funciona

Proatividade aqui não é o modelo "resolvendo falar". É um cron que monta um envelope e pede uma mensagem.

**Cadência** (crontab do usuário `mila`, horários BRT, seg-sáb):

| quando | o quê |
|---|---|
| 08:30 | briefing da manhã |
| 18:30 | fechamento do dia |
| de hora em hora, 09-18h | `mila-cutucada.py` — cutucada pontual quando algo muda |

**Dois públicos, mesmo cano, dado e molde diferentes:**

| | consultoras | liderança (Krissya e Alf) |
|---|---|---|
| quem | `mila_consultoras_ativas_v1` | `mila_lideranca_ativa_v1` |
| dado | `mila_briefing_consultora_v1` | `mila_briefing_lideranca_v1` — as 3 unidades contra o **mesmo período** do mês passado |
| recorte | a unidade dela | a rede |
| dia vazio | "nada para hoje" e silêncio | **nunca cala** |

⚠️ **"Nada para hoje" não existe para a liderança.** Para a consultora faz sentido — agenda vazia é dia sem experimental. Para quem lidera, silêncio vira "a Mila sumiu", e a leitura da rede vale mesmo num dia parado.

**O molde vai literal dentro do prompt**, preenchido com exemplo, não descrito como regra:

```
📊 *A REDE ATÉ HOJE* · 10 matrículas
_mesmo período do mês passado: 13_

  • *Campo Grande* — 4  _(6 no mês passado)_
```

Modelo segue exemplo muito melhor do que segue regra. E o pedido que acompanha o molde fecha assim:

> 🔴 Termine com UMA coisa só: a ação ou a pergunta mais útil de hoje, com o porquê MEDIDO. Nunca liste cinco prioridades — quem lidera não precisa de lista, precisa do próximo passo.

**Duas armadilhas que custaram tempo:**

- **A liderança não tem unidade**, e a função que acha a conversa escolhe a caixa pela unidade. Para elas a busca varre as três caixas e pega a conversa mais recente — e **nunca cria conversa**: mandar do nada seria abrir conversa por conta própria.
- **`--publico` tem default `ambos`.** Se "consultoras" fosse o default, o cron antigo continuaria excluindo a liderança em silêncio — e ninguém descobre uma mensagem que não chega.

**Estado honesto:** as consultoras recebem desde 04/09 (log confere: 05/09 manhã e fim de dia, três enviadas). A liderança foi ligada hoje, **domingo**, e o cron é seg-sáb — **o primeiro disparo real para Krissya e Alf é segunda, 07/09, 08:30**. Até lá só houve ensaio em dry-run.

---

## 6. O que disso serve para a base pedagógica

O desenho do comercial não é sobre o comercial. Ele resolve exatamente a forma do problema que está aberta há semanas do lado do Fábio — **três audiências e um eixo de segmentação** (lá é faixa etária, aqui era público).

O que eu levaria inteiro:

1. **Conteúdo em tabela, não em arquivo lido pelo agente.** A mesma tabela (`base_conhecimento_blocos`) já tem `publico`, `estado`, `versao`, `revisar_em`, `aprovado_por`. Domínio pedagógico entra como valores novos de `publico` — `professor`, `coordenacao`, `pedagogico_diretoria` — sem tabela nova e sem tocar no comercial nem na SDR.
2. **O `.md` continua sendo a fonte de autoria.** O Fábio escreve e aprova em markdown; um gerador produz a migration. Ninguém transcreve conteúdo aprovado à mão para dentro de um INSERT — é assim que se perde uma linha sem ninguém perceber.
3. **Gate no servidor, pelo carimbo do telefone.** Nunca como argumento da tool. E hierarquia explícita (coordenação vê professor, o contrário não).
4. **Faixa etária: é filtro dentro do bloco ou é bloco separado?** Recomendo **bloco separado com faixa no título**, e a faixa entrando na consulta como termo. Motivo: `publico` é um valor só, e cruzar dois eixos (audiência × faixa) numa coluna vira combinação — 3 audiências × 4 faixas = 12 públicos, e o gate deixa de ser legível. Faixa é assunto; assunto se resolve na busca, não no gate.
5. **Citação obrigatória do bloco + versão.** É a única detecção de erro que de fato funciona.
6. **A amarração "registrou lacuna ⇒ disse que não cobre".** É a regra que mais rende por linha escrita, e vale mais para o pedagógico do que para o comercial: uma orientação de método que o professor recebe como "o jeito da LA", sem a casa ter decidido, é mais difícil de desfazer do que um roteiro de venda.
7. **Não gaste tempo com piso de relevância** (ver §3.1). Medido aqui e não separa. O julgamento de cobertura é do modelo lendo o conteúdo; o que o banco entrega bem é *o público certo* e *os 3 candidatos + o catálogo*.
8. **Teste de agente checa forma, não frase** (ver §3.3). Se você escrever o predicado enumerando as palavras que espera ouvir, vai reprovar comportamento certo e "consertar" o que não estava quebrado.

O que **não** atravessa: nada do domínio comercial. Funil, CPL, LTV, criativo, mídia paga — a linha que já vale para o financeiro vale aqui.

---

## 7. Onde olhar

| coisa | onde |
|---|---|
| fonte de autoria dos blocos | `docs/base-conhecimento-comercial/*.md` (repo) |
| gerador da migration | `scripts/gerar-carga-base-comercial.mjs` |
| tabela | `base_conhecimento_blocos` |
| gate + busca | `mila_base_comercial_v1` (Postgres) |
| tools + filtro do cliente | `mila-gestao-tools-mcp.mjs` (la-hq, versionado em `vps/la-hq/mila/scripts/`) |
| gatilho no prompt | `SOUL.md` do perfil `mila-consultor-readonly` |
| quando a skill carrega | frontmatter `description` de `.hermes/skills/mila-gestao/SKILL.md` |
| proatividade | `mila-proativa.py` + `mila_briefing_lideranca_v1` |

⚠️ `/home/mila` é fechado de propósito. O que interessa está versionado no repo — pedir acesso ao diretório não é necessário e o `openclaw.json` guarda credencial.
