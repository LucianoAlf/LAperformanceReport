# Testes E2E do runtime da Sol (caixa)

Rodam contra o runtime VIVO na la-hq (`/home/sol/.hermes/profiles/sol/caixa-ingestao/`),
com `sendFn` e `lancarFn` fakes: **não** mandam WhatsApp e **não** gravam no caixa.

```bash
scp tests/sol-runtime/*.cjs lahq:/tmp/
ssh lahq 'cd /home/sol/.hermes/profiles/sol/caixa-ingestao && \
  SOL_CAIXA_V3_LEDGER_MODE=production SOL_CAIXA_V3_LEDGER_STRICT=0 \
  node /tmp/forma-incerta-e2e.cjs && node /tmp/gate-regressao-e2e.cjs'
```

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
