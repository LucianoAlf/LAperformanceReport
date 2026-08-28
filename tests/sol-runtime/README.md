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
