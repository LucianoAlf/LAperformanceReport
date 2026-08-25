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
