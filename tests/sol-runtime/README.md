# Testes E2E do runtime da Sol (caixa)

Rodam contra o runtime VIVO na la-hq (`/home/sol/.hermes/profiles/sol/caixa-ingestao/`),
com `sendFn` e `lancarFn` fakes: **não** mandam WhatsApp e **não** gravam no caixa.

```bash
scp tests/sol-runtime/*.cjs lahq:/tmp/
ssh lahq 'cd /home/sol/.hermes/profiles/sol/caixa-ingestao && \
  export SOL_CAIXA_V3_LEDGER_MODE=production SOL_CAIXA_V3_LEDGER_STRICT=0 && \
  for t in detector-multi-aluno.test gate-regressao-e2e forma-incerta-e2e \
           aluno-novo-passaporte-e2e vinculo-lancamento-e2e; do \
    echo "## $t"; node /tmp/$t.cjs || echo "FALHOU: $t"; done'
```

⚠️ **O runtime vive num processo de longa duração.** A bridge do WhatsApp
(`whatsapp-bridge/bridge.js`, porta 3000) faz `require` do módulo **no start**,
então editar o arquivo não muda o comportamento até ela reiniciar. Os crons de
abrir/fechar (`caixa-cron.cjs`) são processos novos a cada execução e pegam a
mudança na hora — daí a assimetria enganosa "o cron já usa o código novo e o
grupo não". Reiniciar: `kill <pid da bridge>`; o `hermes-gateway-sol.service`
(supervisor, `Restart=always`) respawna em ~5s. Conferir depois:
`✅ WhatsApp connected!` no `bridge.log` e **zero** linhas
`[caixa-financeiro] init falhou`.

⚠️ **Rodar sempre com `SOL_CAIXA_V3_LEDGER_MODE=production`.** Sem isso o ledger V3
fica desligado e o teste passa por um caminho que não existe em produção — foi assim
que a 1ª execução escondeu o bug do preview incompleto (24/08/2026).

⚠️ `criarHandlerFinanceiro` devolve `{handle, temPendencia, _pendentes}` e `grupos` é
**mapa por chatId**, não array.

## forma-incerta-e2e.cjs
Caso Giovanna/Recreio (24/08): cupom de maquininha ilegível (OCR timeout + visão falha)
→ Sol pede a forma → humano responde `pode, cartão` → lança. Confere o payload final
(valor 400, forma cartao, categoria passaporte).

## gate-regressao-e2e.cjs
Prova que o gate não afrouxou: (1) `pode` seco sem forma NÃO lança; (2) preview completo
com falha real de V3 continua bloqueado com aviso de preview inseguro.

## aluno-novo-passaporte-e2e.cjs
Caso Giovanna/Recreio (24/08): passaporte de aluno NOVO com cupom ilegível.
Prova que o card **identifica pelo funil** (experimental/lead) em vez de duvidar,
e que o lançamento sai certo depois do `pode, cartão`.
⚠️ Este teste consulta o BANCO REAL na identificação do aluno (RPC
`sol_caixa_identificar_aluno_novo_v1`) — depende da Giovanna existir em
`lead_experimentais` do Recreio.

## detector-multi-aluno.test.cjs
18 legendas REAIS (extraídas dos lançamentos do caixa) contra
`detectarContextoMultiAluno`. 9 devem rotear para o fluxo multi-aluno, 9 NÃO podem.
Armadilhas cobertas: `12 parcelas aluna Luiza` (plural de PARCELA, 1 aluno) e
`Parcela 07/26 + 08/26 aluno Arthur` (o `+` liga DATAS, não nomes).
Baseline em 24/08: **5 dos 9 casos multi passavam batido** — inclusive
`Passaporte aluno Thiago Fernandes E Matheus Fernandes 350,00 cada`.

## vinculo-lancamento-e2e.cjs
Prova que o lançamento SIMPLES grava `aluno_id`/`fatura_id` — e que o `aluno_id` sai
da **fatura**, não do match por nome. 3 casos contra o banco real:
1. **Parcela de aluna com 3 cursos** (Valentina/Recreio: 697 Canto, 1099 Teclado,
   1542 Power Kids). O teste **falha explicitamente** se o vínculo vier 1542 — o id
   que `sol_caixa_casar_parcela` devolve no topo, de um curso sem fatura nenhuma.
2. **Passaporte de matrícula única** → vincula.
3. **Composto Canto+Teclado** → não vincula nada: são matrículas diferentes, e um
   movimento não pode apontar duas.

⚠️ Este é o único que **não** stuba `canonicaFn` — é o ponto do teste. Ele stuba
`duplicataFn` porque a Valentina já foi lançada de verdade hoje e a trava mataria
o teste por um motivo que não é o medido.

## saida-operacional-e2e.cjs
Caso Mayra/CG (25/08): "Sol, teve uma saída em dinheiro - PG segurança semana 25/08
R$100,00" virou **RECEBIMENTO** pedindo aluno; a correção dela ("Sol, foi saída") foi
gravada como **nome do aluno**.

⚠️ A lógica sempre acertou — o log já dizia `saida_texto_preview_enviado`. Quem errava era
o CARD: `montarPreview` só sabia escrever recebimento. Ao pedir aluno numa saída, induziu
a correção que o fluxo de nome-tardio engoliu.

Cobre: card diz "Saída de caixa"/"PAGAMENTO (saída)", **não** mostra seção ALUNO, a frase
de correção não vira nome, e o `pode` cai em `lancarSaidaFn` (nunca em `lancarFn`).

## rotulo-humano-e2e.cjs
Caso Jhon/CG (25/08): legenda rotulava `aluno: Rafael Magalhães Barbosa`, a Sol montou o
card com **Marcos Gabriel Fonseca Santo** (deduzido do pagador do PIX), e a correção do
humano vazou para o LLM — que respondeu **"R$ 53,00"**, valor que não existe em lugar nenhum.

Cobre: (1) rótulo humano ganha do pagador mesmo quando a fatura canônica não confirma o
nome (aluno novo não TEM fatura); (2) correção **citando** o card alcança pendência cujo
aluno está errado mas é um nome plausível.

⚠️ A trava que impede o vazamento mora na **bridge**, não aqui:
`_patch-bridge-caixa-nao-vaza-pro-llm.cjs`. Com pendência aberta, `acao: 'nada'` vira
"não entendi" em vez de virar conversa livre sobre dinheiro.

## descarte-e-conversa-e2e.cjs
Cascata de 25/08 no grupo de CG. 🔴 A causa foi um **texto meu**: a guarda de pendência
oferecia "*não* para descartar" e o runtime **nunca tratou "não"** — só existia `casarPode`.
A pendência ficava órfã, e a legenda seguinte era lida como correção dela (o card da Aurora
saiu com o valor do comprovante do Rafael, R$ 300,00).

Cobre: `casarNao` descarta de fato; **"nao e a parcela" NÃO é descarte** (é correção, e quem
trata é o fluxo de nome/valor); `ehConversaSemComando` reconhece "Certinho"/"valeu" e a
guarda segue calada, sem mandar pro LLM.

## multi-aluno-reenvio-e2e.cjs
Caso Arthur/Barra (26/08 13:34-13:49): OCR travou 45s duas vezes, ele reenviou o MESMO
comprovante, e isso criou **duas** pendências `manual_review_multi_student` com o mesmo
valor. Quando ele mandou a correção EXATA que a Sol pediu ("Nome — R$ valor" para os dois
alunos), o código só resolve correção quando há **uma** candidata ambígua — com duas, a
mensagem caía em silêncio (`acao: 'nada'`), sem sequer chamar o interpretador de nomes.

E a guarda "não vaza pro LLM" (25/08) interceptava esse `nada` sem checar se a mensagem
tinha qualquer relação com a Sol — inclusive um aside do Luciano ("Vou ver o que
aconteceu ok?") levou "Não entendi essa..." minutos depois.

Cobre: (1) reenviar o mesmo comprovante (mesmo valor, janela de 15 min) substitui a
pendência em vez de empilhar; (2) a correção "Nome — R$ valor" citada corretamente chega
ao interpretador e abre o preview; (3) `pareceChamarSol`/`citaAlgumaPendencia` continuam
falsos para mensagem não-relacionada, e verdadeiros quando a mensagem menciona "Sol".

⚠️ Depende de `ocrFn` devolver `{ text, status }` (chave em inglês) e do evento carregar
`mediaUrls: [...]` — sem isso o runtime nunca aciona OCR/visão e `valor` fica null,
mascarando o cenário real (motivo vira `itens_incompletos` em vez de
`alocacao_nao_derivavel`, que é o que a Sol respondeu de verdade).

## ocr-concorrencia-e2e.cjs
A raiz do que deixava a Sol 1-2 minutos calada depois de um comprovante (caso Arthur/Barra
26/08, mas sistêmico — vinha degradando desde 21/08: 0% de timeout de OCR até 20/08, 100%
em 26/08, nas três unidades).

CAUSA: tesseract 5.x usa OpenMP e, sem limite, cada processo tenta usar TODAS as CPUs
visíveis (4 nesta máquina). `ocrLocal` já roda PSM 6 e PSM 4 **em paralelo** por imagem —
e essa paralelização, sem limite de thread, faz os dois processos disputarem as CPUs e
**travarem de verdade** (deadlock, não lentidão): nem depois de 50s nenhum dos dois fecha
o stdout, o timeout de 45s do Node mata os dois, e o fallback de visão assume — daí a
demora de 1-2 minutos por comprovante, todo santo dia.

Prova isolada (26/08, fora do bridge e do Node): tesseract via bash na imagem real do
Arthur, 1,07s. 2 tesseract concorrentes sem limite, via Node: **nunca fecham** (>50s). Os
mesmos 2, com `OMP_THREAD_LIMIT=1`: <1s cada.

Roda a função REAL `ocrLocal` (gera a própria imagem de teste via `python3`/PIL — pula se
indisponível) sozinha e depois em 2 chamadas concorrentes (4 processos tesseract ao mesmo
tempo). Falha se qualquer uma passar de 10s (bem abaixo do timeout de 45s) ou der timeout —
sinal de que o oversubscription do OpenMP voltou.

⚠️ Roda fora do padrão dos outros testes desta pasta: não simula mensagem/handler, mede
tempo de execução da função de OCR isolada. É teste de infraestrutura, não de fluxo.

## saida-despesa-compra-e2e.cjs
Caso Rose+Vitória/Recreio (28/08, R$ 34,00 de 2 refrigerantes). Três tentativas, nenhuma
funcionou — e não era falta de jeito da equipe: **não existia palavra que resolvesse**.

🔴 CAUSA: nenhuma categoria de saída além de `seguranca` era alcançável pela legenda.
`_categoriaFromCaption` e `_categoriaExplicitaFromCaption` não tinham **uma única regra**
que devolvesse `despesa`/`retirada`/`troco` — e a primeira ainda cai em `parcela` por
padrão. `categoriaEhSaida` aceita os quatro valores, mas ninguém produzia três deles.
Comprar refrigerante, material, lanche ou pagar um Uber era impossível de lançar.

Agravante: a categoria do LLM (`lojinha` na 1ª tentativa, `outro` na 3ª) era o valor
inicial e a legenda humana só entrava como **fallback**, então mesmo escrevendo
"Despesa (saída)" o palpite do modelo vencia. Agora a legenda é override.

⚠️ A detecção sai da **legenda**, nunca do OCR: o cupom fiscal tem "COMPRA", "PAGAMENTO"
e "TROCO" no corpo (o teste prova que o cupom sozinho classificaria como saída). Mesma
armadilha do "Chave de segurança" no rodapé do PDF do Santander (24/08).

Cobre: legenda de compra vira "Saída de caixa"/"PAGAMENTO (saída)"; não mostra ALUNO; o
`pode` cai em `lancarSaidaFn` com `categoria: despesa`; parcela normal **continua**
recebimento; e o nome tardio recusa frase de comando ("descrição é refrigerantes Pode"
virava nome de aluno no caso real).

## Dois bugs achados enquanto se testava isto

**`nsu` sem fronteira em `SINAL_CARTAO`.** "Nota Fiscal de Co**nsu**midor Eletronica" —
que está em TODO cupom de NFC-e — casava, e `extrairCartao` **sobrescreve** a forma. O
cupom dizia "FORMA DE PAGAMENTO DINHEIRO" e a Sol registrava **cartão crédito**.
"consumo" e "re**visa**o" idem. Grave porque saída de cofre exige dinheiro.

**Correção tardia de TIPO não existia.** Dava para corrigir nome, valor e forma, mas não
para dizer "isso é saída, não recebimento" — a Vitória escreveu a frase mais explícita
possível e levou "Não entendi essa". Agora converte a pendência e zera o aluno, que era
justamente o campo que vinha recebendo lixo.

⚠️ Ao ensinar o fluxo de texto puro a reconhecer despesa, ele passou a capturar a **frase
de correção** que vem depois de um card e reabria um caso sem valor — regressão real,
pega pelo `saida-operacional-e2e`. Por isso o fluxo de texto só abre caso novo **quando
não há pendência aberta**. Com card na mesa, frase de saída é correção.

⚠️ `saida-operacional-e2e.cjs` **não tem asserção e nunca envia "pode"** — é diagnóstico.
A última linha dele é sempre `lancou SAIDA? nao`. Julgar a suíte por **exit code**.

## multi-aluno-falso-positivo-ocr-e2e.cjs
Caso Mayra/CG (28/08 16:43): PIX de R$ 380,00 com a legenda `PG pix parcela 08/2026
aluno Arthur de Jesus Lindo Braga - Kids CG R$380,00` — **um** aluno, rotulado com
todas as letras. A Sol respondeu *"Entendi que este comprovante é de mais de um
aluno... Manda cada aluno com seu valor"* e ficou presa repetindo o pedido.

CAUSA: `detectarContextoMultiAluno` roda sobre **legenda + OCR**. A regra NOMES_LIGADOS
procura dois grupos de nomes próprios unidos por "e"/"+"/"&" — e **todo comprovante PIX
traz o nome do PAGADOR**, que quase nunca é o do aluno. Basta uma linha do recibo casar
(medido: `"SELMA DE MATTOS LINDO BRAGA e LA MUSIK KIDS"` → `true`) para o comprovante
inteiro virar multi-aluno. A legenda sozinha dá `false`.

⚠️ **Não era regressão das mudanças de 28/08** — `detectarContextoMultiAluno` estava
byte a byte idêntico antes e depois (md5 conferido nas duas versões). Defeito antigo,
exposto naquele dia.

CORREÇÃO: quando a legenda rotula UM aluno e ela própria não tem sinal de multi, o
humano já respondeu — o OCR não contradiz. Mesma doutrina da categoria de saída ("só
pode nascer do que a PESSOA escreveu, nunca do OCR") e do rótulo humano do #230.

⚠️ O que **não** muda: legenda com multi de verdade ("Thiago e Matheus", "350 cada",
"2 alunos") continua roteando para revisão; **sem rótulo na legenda, o OCR ainda
protege** (o teste cobre os dois). A trava contra dividir dinheiro sozinha fica
intacta — ela só deixa de ser acionada por nome de terceiro impresso no recibo.

## legenda-reenvio-e-valor-ocr-e2e.cjs
Round 2 dos refrigerantes (Recreio, 28/08 16:48-16:50) — três bugs encadeados:

1. **R$ 5,01 no lugar de R$ 34.** `extrairValorOcr` delegava a `extrairValor`, que pega
   o primeiro "R$ <número>" do texto. No OCR real: "Subtotal R$ **y** 34,00" (ruído),
   "Valor Total R$" (número perdido na quebra de linha) — e o primeiro R$ LIMPO era
   **"Federal R$ 5,01"**, a linha de tributos da Lei da Transparência, presente em TODO
   cupom fiscal do país. Agora: linhas de tributo saem antes, e o total rotulado é
   procurado com tolerância a ruído entre o rótulo e o número.
2. **Sequestro da legenda.** `anexarTextoAoLote` é o ÚLTIMO recurso do handler; a
   correção-de-tipo rodava antes e roubava a legenda do reenvio (imagem e texto chegam
   como DOIS eventos, 260ms). Agora a correção respeita lote de mídia aberto.
3. **Correção mantinha valor/forma velhos.** "2 refrigerantes R$34 ... dinheiro"
   convertia a pendência mas ficava com o 5,01 herdado. Agora a frase corrige os dois.

⚠️ **A lição de teste que este arquivo carrega:** o teste anterior mandava UM evento
fundido (imagem+legenda juntas) — e a bridge real entrega DOIS handle() concorrentes.
Este teste reproduz a entrega real (media sem await + texto 250ms depois) e é por isso
que pega o que o outro não pegava. Simular o formato real da entrega não é opcional.

## vinculo-lancamento-e2e — SKIP declarado quando a fonte canônica está stale
Os casos 2/3 dependem do frescor do sync de faturas EM TEMPO REAL. Com o sync caído
(28/08: `statement timeout` em série na competência de agosto), o V3 **corretamente**
recusa o "pode" ("fonte oficial indisponível" / "não vou lançar com pode") — runtime
certo, ambiente quebrado. O teste agora imprime `⚠️ SKIP` com o motivo em vez de falhar:
vermelho por dependência externa ensina a equipe a ignorar a suíte.

## colisao-dois-comprovantes-e2e.cjs
Replay da manhã de 29/08 no Recreio: Fernanda mandou o comprovante da Lívia (R$100,
legenda chegando ANTES do documento), Daiana o do Vicente (R$400). Resultado real:
**4 pendências abertas, ZERO lançamentos** — a equipe desistiu.

Quatro defeitos, um por cena:
1. **"valor não identificado" com o valor escrito na legenda.** A legenda-irmã chegou
   43ms antes do documento; o fluxo gastou 45s em OCR+visão procurando valor e SÓ
   DEPOIS anexou a legenda — que alimentou aluno/categoria mas nunca o valor. Fix:
   backfill de valor/forma no momento do anexo.
2. **Citar a resposta da Sol não valia.** Fernanda citou "Beleza, Fê: R$100 em pix.
   Posso lançar? Responde pode" — a mensagem que a própria Sol mandou — e caiu na
   guarda de ambiguidade, porque só o card (previewId) contava. Fix: `msgIds` na
   pendência — toda mensagem da Sol sobre ela vale como citação (e o comprovante
   original também).
3. **"Pode" seco com 2 cards era enigma.** Fix (pedido explícito do Luciano):
   resolve por QUEM fala — autor do comprovante ou último a interagir com o card
   (telefone/lid), toque mais recente ganha. Quem não tem card próprio recebe a
   lista numerada em vez de "responde no comprovante certo".
4. **Reenviar o mesmo arquivo empilhava card novo.** Fix: `file_bytes` idêntico no
   mesmo grupo substitui a pendência antiga (log `pendencia_substituida_reenvio`).

E o F6: depois de lançar com card ainda aberto, a Sol avisa o que falta — "antes de
lançar veja se tem algum sem lançar" vira trabalho dela, não da equipe.

⚠️ A resolução por autor pode lançar o card do PRÓPRIO autor quando a intenção era
o do colega — trade-off aceito conscientemente: a confirmação é explícita e existe
fluxo de correção/estorno. O caso salvo (cada um aprova o seu) é o cotidiano.

## camisa-um-aluno-multi-trap-e2e.cjs
Caso Arthur/Barra (29/08 10:33-10:39): venda de UMA camisa (R$65, cartão) virou
"comprovante de mais de um aluno" — e quando ele explicou com todas as letras
("venda de camisa para o aluno Theo de bem, 65 reais"), o fluxo multi exigiu
"manda os dois" **para sempre**. Não existia saída da armadilha. O log mostra o
interpretador acertando lojinha e nada disso importando.

Três correções:
- **E1: multi-aluno só nasce da LEGENDA, nunca do OCR.** Terceiro falso positivo
  do OCR em dois dias (PIX 28/08, PagBank 29/08) — recibo carrega pagador,
  estabelecimento e conectivos "e"; não é lista de alunos. A guarda de 28/08
  (rótulo único na legenda) era estreita demais: legenda de lojinha nem tem aluno.
  ⚠️ Isso REVERTEU a cena 4 do `multi-aluno-falso-positivo-ocr-e2e` de propósito:
  sem legenda útil, o fluxo single cuida (card sem aluno pergunta o nome), que é
  UX melhor que exigir uma divisão que não existe.
- **E2: "é um aluno só" tem saída.** Correção que declara UM aluno converte a
  revisão multi em lançamento single (`multi_convertido_para_single`) — o humano
  manda.
- **E3: "camisa" é produto de lojinha** (só havia "camiseta" no vocabulário).

⚠️ Artefato de mock aprendido na 1ª rodada: a cena dos irmãos (R$700) não pode
reusar o OCR da camisa (R$65) — a validação de soma (350+350≠65) recusa
CORRETAMENTE e o teste acusa regressão falsa. O `ocrFn` do teste é sensível à URL.

## vendedor-nao-e-aluno-e2e.cjs
Caso Arthur/Barra (29/08 11:27): legenda `Venda camisa LA Music Kids Preta 4 anos /
Venda: Arthur` produziu card com **ALUNO = Arthur** e *"Resp. financeiro: Joice Pedro
Palmerini Lomba"* — uma família sem nenhuma relação com a compra. Arthur é o **ADM que
fez a venda e mandou a mensagem**; o aluno era o Theo de Bem.

⚠️ Pior que card feio: lojinha lançada no aluno errado **polui a carteira de outra
família**. E o nome veio do **LLM** — `_alunoRotulado` dá `null` nessa legenda (medido),
então não havia regex a consertar: faltava uma REGRA.

Três guardas, da mais forte para a mais fraca:
- **V1 — quem ENVIA não é o aluno.** A Sol já identifica o remetente (para carimbar
  "autorizou"); se o "aluno" bate com quem enviou, é assinatura, não aluno. Vale para
  o grupo inteiro sem lista de nomes a manter. Exigiu mover `identidadeFn` para **antes**
  de montar o card (antes rodava depois, só para o carimbo).
- **V2 — rótulo de vendedor**: `Venda:`, `Vendedor:`, `Vendido por:`, `Atendente:`.
- **V3 — lojinha sem comprador PERGUNTA** o nome, em vez de esconder a seção (o #232
  escondia; esconder limpava o card mas deixava a venda sem dono e ninguém reparava).

⚠️ `_mesmaPessoa` usa `_normConf` — o arquivo não tem `normalizarTexto` (a 1ª versão do
patch quebrou nisso). Casa "Arthur" com "Arthur Ferreira", mas **não** "Maria Silva" com
"Maria Souza".

## visao-por-forma-ausente-e2e.cjs
Caso Arthur/Barra (29/08 12:08): cupom PagBank **"VENDA CREDITO MASTERCARD"**
fotografado torto num sofá escuro. Card saiu `R$ 65,00 · ❓ forma não identificada`,
travado pedindo "pode, pix / pode, dinheiro / pode, cartão".

CAUSA: o gate da visão era `!valor || ocrText.length < 20`. O OCR da foto ruim
devolve **452 chars de ruído** (medido: `DAR o ple ias CAE / th És Pisa Eidos...`) —
passa do limiar de 20 sem ter **um** sinal de cartão. E a legenda trazia
`Valor: R$ 65,00`, então `!valor` era falso. A visão — que **sabe ler a forma**
(`if (!forma && visao.forma)`) — nunca foi chamada.

⚠️ **Incentivo invertido, que é o pior deste bug:** às 11:27 a MESMA foto, com legenda
SEM valor, disparou a visão e saiu "cartão crédito" certinho. Às 12:08 o Arthur
caprichou e escreveu o valor — e a Sol soube MENOS. O teste trava esse par: dar mais
informação não pode piorar o resultado.

FIX: a visão passa a rodar também por `!forma`. ⚠️ **Não** passa a rodar sempre — o
teste prova que OCR completo (valor + forma) gasta **zero** chamadas de visão.

## rotulo-vence-casamento-fuzzy-e2e.cjs
Caso Mayra/CG (29/08 14:38-14:40): legenda `PG Parcelas 02/2026 e 05/2026 - Aluna
Soraia da Silveira Duarte - LA CG - R$976,00` produziu card de **outra pessoa** —
Laura Sobreira da Silveira, com fatura (09/2026, R$377, Musicalização Infantil) e
responsável financeiro de outra família. O word_similarity casou
Silveira~Sobreira~Silveira. E a correção da Mayra ("Sol, a aluna é Soraia...")
levou "Não entendi essa".

RAIZ: a flag `_alunoVeioDoRotulo` (#230) protegia o rótulo humano **apenas contra o
bloco do pagador**. Casador fuzzy, canônica e composto sobrescreviam sem checar
(`if (m.aluno_nome) aluno = m.aluno_nome`). E a correção sem citação exigia card com
aluno vazio/suspeito — "Laura" era plausível, então caía em `nada` → guarda.

Sete guardas (R1-R7), todas a mesma doutrina — **pessoa diferente no retorno =
enriquecimento rejeitado por inteiro** (nem nome, nem fatura, nem responsável):
- R1 casador fuzzy · R2 canônica · R3 composto (fluxo de mídia, exige `_alunoVeioDoRotulo`)
- R4 correção com **rótulo explícito** + card único corrige **sem citação**
- R5 citação do nome-tardio aceita qualquer mensagem da Sol (msgIds/origem)
- R6 pagador **ambíguo** não zera o rótulo (o ramo não-ambíguo já respeitava; o
  ambíguo fazia `aluno = null` + candidatos — descoberto pelo próprio teste)
- R7 nome-tardio: canônica/casador/composto não trocam o nome que o humano DITOU

⚠️ Descobertas de teste que viraram doutrina do arquivo:
- O `if` do composto é idêntico em 3 lugares — âncora de patch precisa da linha
  vizinha (`faturasMesFn(grp...)`) para não abortar com "achei 3".
- Mock da canônica precisa do shape `fatura` (o preview lê `canonica.fatura`, não
  `.parcela`) — shape errado acusou falha falsa na cena 2.
- `pagadorFn` deve ser mockado — sem isso a cena 1 bate no banco real e o resultado
  depende do cadastro do dia.

## auditoria-rabiolas-29ago.test.cjs
Auditoria pós-fluxo Soraia + fechamento de CG (29/08 15:00-15:03). O fluxo principal
funcionou (guardas R1-R7 confirmadas no log: 3 rejeições da Laura, pagador ambíguo
ignorado, Soraia via lead do funil; fechamento preview→pode→final com soma conferida:
476+200+200+100+976 = 1.952). Duas rabiolas ficaram:

**R8 — responsável da família errada.** O card saiu com "Resp. financeiro: Rayanne do
Nascimento Sobreira" — responsável da **Laura** (conferido no banco; a Soraia está SEM
responsável). A RPC `sol_caixa_responsavel_aluno` busca por word_similarity **só entre
ativos** (a Soraia é lead → melhor ativo parecido = Laura), e o runtime usava o
responsável **ignorando o campo `aluno_nome` que a própria RPC devolve** dizendo com
quem casou. O dado sujo foi até o lançamento ("resp. Rayanne" no fechamento). Fix nos
2 pontos que chamam `responsavelFn`: `aluno_nome` divergente ⇒ responsável rejeitado.

**G1+G2 — "(Response formatting failed, plain text:)" ×2 no grupo.** Cadeia: "Fechado
pessoal"/"Bom final de semana" → LLM → resposta VAZIA → bridge recusa ("chatId and
message are required") → fallback do gateway posta o prefixo de erro cru. Dois fixes:
- G1 (`gateway/platforms/base.py`, `_send_with_retry`): content vazio ⇒ suprime o
  envio (vazio = silêncio do agente) e o fallback nunca posta artefato sem conteúdo.
  ⚠️ base.py é o gateway PYTHON — só recarrega com restart do serviço
  (`systemctl --user restart hermes-gateway-sol`, como o user `sol`; derruba e
  respawna a bridge junto, ~45s).
- G2 (`group-engagement.cjs`): despedidas ("bom final/fim de semana", "boa semana",
  "bom descanso", "até segunda", "até amanhã", "bom feriado") entram em
  `encerraTurnoDaSol` — nem chegam ao LLM.

⚠️ Dado sujo já gravado: o movimento da Soraia no caixa de 29/08 carrega
"resp. Rayanne do Nascimento Sobreira" no descritivo. Valor/aluno corretos; só o
rótulo de responsável está errado. Correção é decisão humana (não mexemos em
lançamento feito).

## aluno-rotulado-e-nome-tardio-e2e.cjs  (31/08)
Caso Arthur/Barra 14:02-14:05: "Venda capotraste para o aluno Arthur Vargas" com o
REMETENTE também chamado Arthur (ADM homônimo). Duas raízes, um cascata:
- **R-a** — a guarda V1 (`e_quem_enviou`) descartou o aluno DECLARADO na legenda.
  Rótulo humano explícito de aluno agora imuniza contra a heurística de remetente
  (ela existe para nome inferido; contra declaração, mente). Regressão coberta: o
  vendedor rotulado ("Venda: Arthur") continua descartado.
- **R-b** — a correção "Aluno foi Arthur Vargas Caldas" extraía "**foi** Arthur
  Vargas Caldas": o prefixo derrubava a guarda de nome-diverge (rejeitava a
  canônica que casou a pessoa CERTA — log `canonica_tardia_rejeitada_nome_diverge`
  com ditado="foi Arthur..." casado="Arthur..."), sujava a descrição e matava o
  vínculo (lançou com `aluno_id null`). `_limparAlunoRotulado` ganhou strip
  iterativo de lixo verbal (foi/é/e/o/a/do/da/nome/aluno) e o rótulo com
  dois-pontos ("aluno: Starline") aceita nome de 1 token (ditado deliberado).
Patch: `_patch-raiz-31ago.cjs`. Dado corrigido: migration `20260831190000`.

## banda-sem-aluno-e-pode-condicional-e2e.cjs  (31/08)
Caso Ana Paula/CG 14:12-14:26 (evento "Bora Gravar - Julina Rock Fest", bandas
StarLine R$633 e Pareidolia R$300):
- **R-c** — "Sol,é de Banda, nome Starline , não tem aluno específico" citando o
  card levou "Não entendi essa": não existia gramática de SEM ALUNO. Agora
  `_semAlunoDeclarado` limpa a exigência de aluno, guarda a entidade ("Banda
  Starline") na descrição e vira categoria venda. O card mostra "Banda Starline —
  sem aluno específico _(banda/evento)_ ✓". Guarda anti-falso-positivo: "é o
  adicional de banda do Rafael" NÃO dispara (tem aluno).
- **R-d** — "pode , mas coloca a categoria como venda" caía em SILÊNCIO (result
  `nada`, nenhuma resposta) e o "pode" seco de 5 min depois lançava com categoria
  errada ("outro"). `casarPode` agora extrai a correção de categoria, corta a
  cláusula e avalia o resto como confirmação; no lançar, a categoria corrigida é
  aplicada e o preview V3 é **re-registrado** — o validador exige categoria
  idêntica entre preview e aprovação (`categoria_divergente_v3`), então derrubar
  `v3PreviewId` e deixar o bloco "completado no pode" re-registrar é o caminho
  que preserva a invariante. Correção de categoria SEM "pode" também remonta o
  card (`preview_categoria_corrigida`).
Regressões travadas: "pode ser" não aprova; "pode" no meio de frase não aprova.

## _patch-v3-fake-ledger.cjs — 🔴 A SUITE ESCREVIA NO LEDGER V3 DE PRODUÇÃO
Achado da auditoria de 31/08: os testes rodavam com
`SOL_CAIXA_V3_LEDGER_MODE=production` (para exercitar a fiação V3) sem mockar
`registrarPreviewV3Fn`/`registrarApprovalV3Fn` — cujo default é a RPC REAL.
Medido: **499 dos 807 previews de 24-31/08 (62%) eram artefato de teste**
(`preview_message_id ~ '^MSG\d+$'`, o id do sendFn mockado), com `unidade_id`
real, mais 13 approvals sintéticos. Fix NA RAIZ (ponto de injeção, não teste a
teste): `SOL_CAIXA_V3_LEDGER_FAKE=1` troca os dois registradores por fakes em
memória — fiação V3 100% ativa, banco intacto; teste novo nasce protegido.
⚠️ Só substitui o DEFAULT: mock explícito do teste (inclusive mock que FALHA,
gate-regressao caso 2) continua valendo.
**Rodar a suíte SEMPRE com:**
```
SOL_CAIXA_V3_LEDGER_MODE=production SOL_CAIXA_V3_LEDGER_STRICT=0 SOL_CAIXA_V3_LEDGER_FAKE=1 node <teste>
```
Prova de estanqueidade em 31/08: contagem do ledger idêntica (958 previews / 86
approvals) antes e depois da suíte inteira. As linhas sintéticas ficaram no
ledger (append-only; discriminador documentado) — expurgo é decisão Hugo/Alfredo.

⚠️ Fixture da VPS `v3-ledger-production.test.cjs` usava o nome-mock "Aluno
Teste" — com o strip de lixo verbal, "Aluno" (rótulo) é removido e sobra 1 token.
Nome real nunca começa com "Aluno"; o fixture virou "Mariana Teste" (intenção do
teste — fiação V3 da correção de aluno — preservada).

⚠️ A VPS tem uma suíte LEGADA em `/home/sol/.hermes/profiles/sol/caixa-ingestao/*.test.cjs`
(34 arquivos, 21 falhas pré-existentes em 31/08 — escritos contra gerações
antigas do módulo e não mantidos). A suíte canônica é ESTA (`tests/sol-runtime/`),
espelhada na VPS em `caixa-ingestao/tests-sol-runtime/`. Ao validar patch, medir
o BASELINE da legada antes de culpar o patch — em 31/08 o delta real era 1
arquivo (o fixture acima), não 22.

## prosa-e-sim-nao-aprovam-e2e.cjs  (31/08, incidente 16:12)
🔴 **O resumo da auditoria colado no grupo pelo Luciano virou um lançamento.**
Cadeia: "vale confirmar" casou `SAIDA_TERMO_RE` (que aceitava "vale" como verbo),
o primeiro `R$` da prosa virou valor (633) e "dinheiro de evento" virou forma →
card "Saída de caixa — R$633 dinheiro/despesa". Em seguida, a resposta do Jhon a
uma pergunta **humana** — "Foi de propósito **sim**, Luciano" — aprovou: o token
frouxo aceitava `sim`/`ok`/`isso` em **qualquer posição** da frase quando a
mensagem citava a pendência. Despesa falsa gravada (apagada pelo Jhon 2 min
depois — e o trigger de `audit_log` do mesmo dia registrou autor e hora, primeiro
uso real do rastro).
- **R-e** prosa não é ditado. `_ehDitadoDeCaixa` (≤220 chars, UM valor, sem
  vocabulário de auditoria/relato) + "vale" só como substantivo com complemento.
  ⚠️ O gate precisou de **três** pontos, não um: a mesma prosa caiu em seguida no
  comando de movimento (`apagados`/`excluir` + valor → preview de estorno) e na
  correção de forma ("foi" + "dinheiro"). Discriminador nesses dois é tamanho
  (>250 chars), porque vetar o vocabulário mataria o comando legítimo.
- **R-f** token frouxo agora exige mensagem curta (≤40) **e** afirmação que ABRE
  a mensagem (`^`). "sim"/"ok"/"pode fazer" secos continuam aprovando.

## reidratacao-e-fallback-llm-e2e.cjs  (31/08 — A3 + fallback, OK do Luciano)
**A3 — reidratação.** Pendências viviam só na memória do bridge; restart engolia
preview aberto (caso Arthur 17:58: a correção dele morreu no restart do deploy e
o "pode" cairia em `pode_sem_pendencia` em silêncio). `reidratarPendencias()` lê
do ledger V3 os previews `public_preview_sent` sem consumo na janela, casa o chat
pelo `chat_id_hash` e restaura `preview_json.pending` com `v3PreviewId`/`Hash`.
- ⚠️ **`await`, não `.then()`**: o handler do caixa é **lazy** (nasce na 1ª
  mensagem do grupo financeiro), então com `.then()` a própria mensagem que criou
  o handler seria processada em paralelo com a reidratação — se fosse o "pode",
  perderia de novo. Custa 3 GETs uma vez por vida do processo.
- ⚠️ Dedup por `chatId::origem`, ficando o preview **mais recente** (remontagem
  gera vários previews da mesma origem). Validado contra produção: 5 previews
  abertos → 2 pendências corretas, 256 ms.

**Fallback LLM.** Mensagem com pendência aberta que a gramática não entendeu vai
ao classificador de saída restrita `{intencao, aluno_nome, categoria, valor,
forma, entidade}`; a intenção vira uma frase **canônica** da gramática existente
e re-passa pelo `handle()`. O LLM **nunca escreve, nunca escolhe fatura e nunca
aprova dinheiro** — `aprovar` responde pedindo o *pode* explícito. Qualquer falha
⇒ `null` ⇒ o "Não entendi" de sempre.
- ⚠️ **timeout 35s, não 20s**: medido em produção, o classificador leva 11-22s; a
  20s o caso "esquece esse ai" estourava e virava `null`.
- Medição com o LLM **real** (não mock), 6/6: sem_aluno, corrigir_categoria,
  corrigir_aluno, descartar, e 2× `nada` (conversa e despedida).
- ⚠️ `ehConversaSemComando` foi ao `return` do handler: o bridge a chamava desde
  25/08 e ela **nunca esteve exposta** — o guard de "elogio não leva não-entendi"
  estava morto por `undefined`.

⚠️ **`\b` dentro de template string do patcher vira BACKSPACE (0x08)**, não word
boundary — corrompeu o arquivo vivo duas vezes (SINAL_CARTAO em 29/08 e o prefixo
"Banda" hoje). Construir a barra com `String.fromCharCode(92)` e conferir com
`cat -A` depois de aplicar.
