# Sol — núcleo do caixa fechado, resposta ao Alfredo (09/09/2026)

**Branch:** `feat/sol-agent-first-v4` · **SHA:** `4046fa1b` · **PR** #410
**Nada foi aplicado em produção.** Duas migrations e a promoção do runtime
seguem sob gate.

---

## 1. O que você achou, e o que era maior do que parecia

Você apontou que no `02b849eb` o teste da guarda falha em checkout limpo,
porque a guarda vivia só no script de patch. Estava certo, e a raiz era pior:

| | antes | agora |
|---|---|---|
| suíte em checkout limpo | **2 verdes** de 38 | **34 verdes, 4 pulados, 0 vermelhos** |
| testes que liam o runtime da VPS | 35 | 0 |
| artefatos do runtime versionados | 1 | 3 |

**35 dos 38 testes faziam `require('/home/sol/...')`** — o caminho do runtime.
Em qualquer máquina sem a VPS montada eles nem carregavam; quando carregavam,
testavam o arquivo **vivo**, inclusive patch aplicado à mão e nunca versionado.
Teste que lê o runtime não pode reprovar o runtime. Um comando agora:

```
tests/sol-runtime/rodar-suite.sh     # 34 verdes · 4 pulados · 0 vermelhos
```

Os 4 pulados chamam as RPCs de verdade e precisam de credencial (rodam na
la-hq). **Pular é honesto; reprovar por falta de credencial ensina a ignorar a
suíte** — era o que fazia "esperava 697, veio undefined" parecer defeito.

Vieram junto dois artefatos que nenhum lugar versionava,
`caixa-abertura-fechamento.cjs` e `group-engagement.cjs`, byte a byte iguais ao
que roda. O `paridade.sh` cobre os três com manifesto e três estados: **igual**,
**Git à frente** (normal durante o trabalho) e **🔴 runtime fora do Git** (alguém
aplicou patch sem versionar). Era a confusão de papel que criou o paradoxo: o
canônico não é foto do runtime, é o estado desejado.

---

## 2. O núcleo (seu item 7): estava quebrado, e não do jeito que eu disse

Rodei o caso da Mayra contra `sol_caixa_resolver_pagamento_v1` **em produção,
leitura pura**:

```
entrada : [{"aluno_nome":"Davi","valor":1290}]
saída   : ok=TRUE · via=canonica · UMA fatura "Teclado" R$ 367,00
          soma_resolvida=367 · soma_confere=false · diferença=923
```

Três defeitos encadeados:

1. **Ambiguidade virava sorteio.** A composta recusou com `aluno_ambiguo` — há
   **10 alunos "Davi" em CG** — e a cascata tratou a recusa como "não é um caso
   composto", descendo de ramo. Com o nome cheio ela acerta os 4 cursos e fecha
   1.290 no centavo: a ferramenta certa existe, quem a atropela é a ordem.
2. **O valor declarado não era contrato**, era sugestão: o ramo seguinte
   escolheu uma fatura qualquer.
3. **`ok:true` com a soma errada.** A divergência ficou em `soma_confere`, um
   campo ao lado — e campo ao lado é campo que ninguém lê. Foi assim que a Sol
   escreveu "soma confere" com R$ 1.290 de um comprovante de R$ 1.722.

Mesma lição de 29/08: ambiguidade é recusa, nunca sorteio. A conferência do
valor declarado é feita **sobre a saída, uma vez**, não repetida nos três
ramos — assim ramo novo nasce coberto.

`sol_caixa_resolver_pagamento_itens_v1` projeta o resultado na lista **plana**
que o lote grava. **O caminho de aprovação não precisou mudar** — conferi no
texto vivo: o validador do snapshot já valida item a item pelo próprio
`canonical_fatura_id`, sem exigir um aluno por linha. Medido em produção:

```
2 alunos declarados → 5 linhas · 5 faturas distintas · soma 1.722,00 exata
```

### Como provei sem aplicar nada
Recriei as funções corrigidas em **`pg_temp`** (schema de sessão, invisível,
descartado ao desconectar) e rodei contra os dados reais. As asserções estão
versionadas em `tests/sol-caixa/ensaio-pagamento-inteiro.sql` — só as
perguntas; o corpo das funções **não** foi copiado para lá, porque guardar uma
terceira versão da regra é a doença que o ensaio testa.

### Um teto que você vai querer ver
`explain analyze`, produção: **2 alunos 4,1 s · 4 alunos 10,0 s**. Cada ramo
reconstrói `sol_faturas_alunos_v1` (~1,25 s), e o `authenticator` impõe 8 s a
todo acesso por PostgREST, inclusive `service_role`. Uso real até hoje: 13 lotes
de 2 itens e 1 de 3 — **o teto morde na borda do que a equipe já faz.**
Pus `statement_timeout` de 60 s por função (remédio do incidente de 28/08) e
subi o timeout do bridge de 15 s para 45 s. **Isso compra tempo, não resolve.**
O envelope repetido é trabalho duplicado, mesma assinatura de
`get_kpis_alunos_canonicos`, e a saída é transformar composta/canônica/casador
em casca fina sobre uma variante que **recebe** o envelope. Não coloquei na
mesma rodada que mexe em dinheiro.

---

## 3. Replay — e uma correção de um número meu

Rodei o replay da guarda e a primeira leitura dizia **19 `aprovacao_sem_pode`**.
Estava errada, e o erro é meu: o campo `texto` **só passou a ser gravado no
shadow em 08/09**. De 31/08 a 05/09 são 366 decisões com **zero** texto — e
texto vazio nunca casa "pode", então toda aprovação antiga aparecia como
barrada. Prova que roda sobre o vazio não é prova.

O script agora recusa julgar o que não vê e declara a cegueira. Janela honesta:

```
decisões do shadow ........ 174   (08-09/09)
intenções FINANCEIRAS ..... 83
  passariam ............... 77
  BARRADAS ................. 6     3 aprovacao_sem_pode · 3 relatorio_colado
```

As 6, conferidas uma a uma, são todas defensáveis — inclusive **o próprio
relatório de recebimentos da Mayra colado no grupo**, que a V4 queria lançar
como `lancamento_multi_aluno` (0,92).

**Um dado para o flip:** *"Sol, foi pix"* — correção de forma — foi classificado
como `aprovar` com 0,65. A guarda pegou; o roteador errou.

**Limite do shadow que isso expõe:** só há corpus com texto desde 08/09. Qualquer
placar da V4 anterior a essa data não pode ser reconstruído.

---

## 4. Seus outros itens

| # | item | estado |
|---|---|---|
| 1 | manter `tool_search: auto` | **aceito.** 480 tools / ~72,8k tokens; carregar tudo não é opção. |
| 2 | nomear portas = saliência, não causa | **aceito e corrigido no repo.** O cabeçalho do script afirmava que as portas "não estão no array visível" — sua medição refuta. Reescrevi dizendo isso e rebaixando a alegação. Continua dry-run. |
| 3 | reduzir superfície do `mcp-hugo` (424 de 480) | **concordo e não executo.** É a frente do Hugo, e a regra do Luciano é que eu não mexo nela. Precisa ser pedido a ele. |
| 4 | tirar `sol-acesso-restrito/query` da superfície operacional | **concordo.** Não fiz nesta rodada: mexe no perfil da Sol em produção e não cabia junto do caixa. É a primeira da próxima. |
| 5 | reprodutibilidade | **feito** (seção 1). |
| 6 | provar em sombra com fala natural | **parcial** (seção 3). Portas: sem novo dado — depende de 4. |
| 7 | núcleo `itens[]` ponta a ponta | **feito** (seção 2). |
| 8 | bootstrap/skills | **não começado**, como você pediu: depois do núcleo. |
| 9 | kill-switch em dois gates | **feito.** `_PENDENTE_..._kill_switch...` só CRIA a chave (ligada, efeito zero); `_PENDENTE_..._GATE2_desligar...` é o ato de desligar, e **recusa rodar** se o gate 1 não passou. |
| 10 | voltar uma vez | é este documento. |

---

## 5. Gate consolidado — o que peço autorização para fazer

Nesta ordem, e só toda ela junta faz sentido:

1. `supabase/migrations/20260909193000_ambiguidade_recusa_e_o_declarado_e_contrato.sql`
2. `supabase/migrations/20260909193500_a_lista_plana_que_o_lote_ja_sabe_consumir.sql`
3. `psql -f tests/sol-caixa/ensaio-pagamento-inteiro.sql` — 9 asserções contra dados reais
4. `scp vps/la-hq/sol/runtime/caixa-financeiro.cjs lahq:<runtime>` + restart do gateway
5. `paridade.sh` deve voltar **IGUAL**; atualizar o manifesto e commitar

**Rollback, por camada:**
- runtime → `scp` do `.bak-*` mais recente (174 preservados) + restart;
- migration 2 → `drop function sol_caixa_resolver_pagamento_itens_v1`; o bridge
  volta ao resolver antigo trocando `resolverMultiFn` — **é injeção, não deploy**;
- migration 1 → reaplicar `20260909163318` e `20260909170500`, nesta ordem, e
  `alter function ... reset statement_timeout`.

**O que muda para a equipe:** aluno com dois cursos, ou com passaporte + parcela,
passa a fechar. Nome ambíguo passa a **recusar dizendo quantos homônimos existem**
em vez de escolher um em silêncio — mais recusas visíveis, menos lançamento
errado invisível. É a troca certa, mas é uma troca, e quem decide é o Alf.

**Fora deste gate, de propósito:** a superfície de tools (itens 3 e 4), o
refactor do envelope, e a **credencial exposta em argumento de processo** que
você reencontrou — essa merece frente curta e própria, sem se misturar com
dinheiro.

---

## Adendo (10/09): por que o `ensaio-sql` ficava vermelho no Actions e verde na la-hq

O job novo reprovou em três SHAs seguidos. Não era o ensaio: era a **diferença de
um byte por linha** entre os dois ambientes, e três armadilhas de escape minhas
pelo caminho.

**A causa, provada e não suposta.** Os blobs das migrations carregam **4.673
bytes CR** — medidos com `git cat-file`, que não aplica `autocrlf` —
concentrados em cinco migrations de agosto/2026 (1772 + 1246 + 830 + 716 + 108)
mais um byte solto na `20260909210000`. Em Linux isso sai do checkout como está e
chega ao `psql`. A la-hq removia o CR desde sempre, dentro do preparador remoto;
o CI, não.

A prova é um A/B com **uma** variável: mesmos arquivos (os blobs LF exatos do
checkout do CI), mesma imagem `postgres:17`, mesmo bootstrap e mesmo schema base.

| | erros no replay | cadeia |
|---|---|---|
| **sem** `tr -d '\015'` | **2.553** | 3 de 16 |
| **com** `tr -d '\015'` | **2.544** | **16 de 16** |

São exatamente os dois números que o Actions e a la-hq vinham dando. Os 9 de
diferença são um `syntax error at or near "\`"` mais oito consequências dele,
**nas mesmas nove linhas** do log do Actions (343569, 343577, 343588, 343601,
343603, 343606, 343608, 343620, 343623). Mecanismo: migration que patcha função
com `pg_get_functiondef` + `replace` compara **âncora multilinha**; com CR no
meio a âncora não casa e o bloco aborta — os dois `_env_v1` não nascem e as
cascas que os chamam caem atrás.

**O que mudou.** A concatenação virou um script único, `ensaio-montar-todas.sh`,
usado pelo CI e pela la-hq, com a normalização dentro. Era lógica **duplicada**,
e a cópia do YAML tinha `printf '\echo ...'` com uma barra só — o `printf` do
bash lê `\e` como ESCAPE, cada marcador virou `ESC+"cho"` e grudou na **primeira
instrução de cada migration**. Pior: sem o marcador `=== arquivo`, a trava do
replay ficou **cega** e respondeu "nenhuma migration falhou" com 13 das 16
funções fora do banco — um falso-verde dentro da trava que existe para matar
falso-verde. O script agora confere os marcadores contra a contagem de arquivos
e falha alto.

Também entrou `tests/sol-caixa/** text eol=lf` no `.gitattributes`: depois de um
merge o checkout no Windows gravou os scripts com CRLF, o tar levou o CR e o bash
da la-hq respondeu `set: pipefail\r: invalid option name`. É a mesma regra que
`vps/**` já tinha, pelo mesmo motivo.

**E a branch estava atrás da `main`.** O CI de PR testa o **merge**: ele replayava
2.141 migrations e o ensaio local 2.131. Comparar vermelho remoto com verde local
nessas condições não prova nada. Depois do merge os dois leem o mesmo conjunto e
dão o mesmo número.

⚠️ **Três armadilhas de escape na mesma frente, e a terceira foi a cara.**
`printf '\echo'` interpretou o `\e`; `grep -c '^\echo === '` devolveu ZERO no
arquivo certo (conforme o grep, `\` não vira barra literal — virou `[\]`); e o
`\1` do `sed` sumiu duas vezes, deixando `tr -d ''` e `sed 's|...||'` —
sintaticamente válidos, semanticamente vazios. As duas primeiras quebravam alto.
A terceira, `grep -c $'\r'`, **devolveu um número plausível**: o grep recebeu o
padrão `\r` e casou a letra "r", então "linhas com CR" era na verdade "linhas que
contêm a letra r". Foi por causa dela que eu declarei que não havia CRLF nenhum e
fui perseguir a causa errada — e depois tive de me retratar da retratação.
**Onde dá, usar ferramenta que não precisa de barra** (`awk` no lugar de `sed`,
`[\]` no lugar de `\`), e conferir o comando, não o comentário.
