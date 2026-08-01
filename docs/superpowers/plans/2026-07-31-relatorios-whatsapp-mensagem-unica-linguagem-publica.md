# Relatórios WhatsApp em Mensagem Única e Linguagem Pública — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar cada relatório Comercial e cada relatório Administrativo em sua própria mensagem única, com datas brasileiras e sem detalhes técnicos no texto público.

**Architecture:** Os dois formatadores passam por um contrato compartilhado de apresentação pública. Os dois crons e o worker dos botões usam um cliente Python comum que chama uma rota local exclusiva do bridge da Sol; essa rota faz exatamente um `sendMessage`, sem fallback de fragmentação, e mantém o transporte genérico do Hermes inalterado.

**Tech Stack:** Deno/TypeScript, Python 3, Node.js/Express/Baileys, Supabase Edge Functions, unittest, Node test runner e systemd de usuário.

---

## Mapa de arquivos

- Criar `supabase/functions/_shared/relatorio-publico.ts` e seu teste: datas de exibição e bloqueio de termos internos.
- Modificar `supabase/functions/_shared/relatorio-comercial.ts` e seu teste: próximas experimentais e rodapé público.
- Modificar `supabase/functions/relatorio-admin-whatsapp/index.ts`: rodapé Administrativo e guard final dos dois modos.
- Criar `scripts/lareport_whatsapp_single.py` e seu teste: cliente estrito da rota dedicada.
- Modificar os dois `scripts/send-lareport-*-hermes.py`: crons passam ao cliente dedicado.
- Criar `scripts/process-sol-report-queue.py`: versionar o worker dos botões e usar o mesmo cliente.
- Criar `scripts/hermes-whatsapp-bridge/report-single-message.js`: rota testável com uma única chamada.
- Criar `scripts/hermes-whatsapp-bridge/bridge-report-single-message.patch`: integração mínima com o bridge vivo.
- Criar contratos em `tests/` para transporte, workers e bridge.

### Task 1: Contrato compartilhado de apresentação pública

**Files:**
- Create: `supabase/functions/_shared/relatorio-publico.ts`
- Create: `supabase/functions/_shared/relatorio-publico.test.ts`

- [ ] **Step 1: Escrever os testes RED**

```ts
Deno.test("formata data ISO somente para apresentacao", () => {
  assertEquals(formatarDataPublica("2026-08-01"), "01/08/2026");
  assertEquals(
    formatarDataHoraPublica("2026-08-01", "10:00"),
    "01/08/2026 às 10:00",
  );
});

Deno.test("bloqueia nomenclatura interna", () => {
  for (const termo of [
    "get_kpis_comercial_canonicos_v2",
    "snapshot vigente GET /aulas",
    "coorte detalhada",
    "fonte canônica",
    "America/Sao_Paulo",
  ]) {
    assertThrows(
      () => validarTextoPublicoRelatorio(`Relatório ${termo}`),
      Error,
      "RELATORIO_TEXTO_TECNICO",
    );
  }
});
```

- [ ] **Step 2: Comprovar RED**

Run: `deno test supabase/functions/_shared/relatorio-publico.test.ts`

Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar o módulo mínimo**

```ts
const TERMOS_TECNICOS = [
  /\bget_[a-z0-9_]+\b/i,
  /\b(?:GET|POST|PATCH|DELETE)\s+\//i,
  /\bRPC\b/i,
  /\bsnapshot\b/i,
  /\bcoorte\b/i,
  /\bfonte\s+can[oô]nica\b/i,
  /\bcan[oô]nico\s+v\d+\b/i,
  /\bAmerica\/Sao_Paulo\b/i,
];

export function formatarDataPublica(dataIso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataIso);
  if (!match) throw new Error("RELATORIO_DATA_PUBLICA_INVALIDA");
  const [, ano, mes, dia] = match;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  if (
    data.getUTCFullYear() !== Number(ano) ||
    data.getUTCMonth() !== Number(mes) - 1 ||
    data.getUTCDate() !== Number(dia)
  ) throw new Error("RELATORIO_DATA_PUBLICA_INVALIDA");
  return `${dia}/${mes}/${ano}`;
}

export function formatarDataHoraPublica(dataIso: string, hora?: string | null) {
  const data = formatarDataPublica(dataIso);
  return hora ? `${data} às ${hora.slice(0, 5)}` : data;
}

export function validarTextoPublicoRelatorio(texto: string): string {
  if (TERMOS_TECNICOS.some((padrao) => padrao.test(texto))) {
    throw new Error("RELATORIO_TEXTO_TECNICO");
  }
  return texto;
}
```

- [ ] **Step 4: Comprovar GREEN**

Run: `deno test supabase/functions/_shared/relatorio-publico.test.ts`

Expected: PASS.

### Task 2: Formatação pública do Comercial

**Files:**
- Modify: `supabase/functions/_shared/relatorio-comercial.ts:796-922`
- Modify: `supabase/functions/_shared/relatorio-comercial.test.ts:550-805`

- [ ] **Step 1: Atualizar o texto de ouro para o comportamento desejado**

```ts
assertStringIncludes(texto, "• 31/07/2026 às 14:00: Luíza — Canto");
assertStringIncludes(texto, "📅 Informações atualizadas em: 30/07/2026 às 19:50:07");
assertStringIncludes(texto, "📅 Relatório gerado em: 30/07/2026 às 20:05");
for (const proibido of [
  "FONTES E SNAPSHOT", "get_kpis_", "GET /aulas", "coorte detalhada",
  "Snapshot Emusys", "America/Sao_Paulo",
]) assertFalse(texto.includes(proibido), proibido);
```

- [ ] **Step 2: Comprovar RED**

Run: `deno test supabase/functions/_shared/relatorio-comercial.test.ts`

Expected: FAIL nas datas ISO e no rodapé técnico.

- [ ] **Step 3: Aplicar o contrato compartilhado**

Nas próximas experimentais:

```ts
const quando = formatarDataHoraPublica(item.dataAula, horario);
return `• ${quando}: ${textoSeguro(item.alunoNome, "Não informado")} — ${
  textoSeguro(item.cursoNome, "Não informado")
}`;
```

No rodapé, manter apenas atualização e geração em linguagem operacional. Montar `const texto = [...].join("\n")` e retornar `validarTextoPublicoRelatorio(texto)`.

- [ ] **Step 4: Comprovar GREEN**

Run: `deno test supabase/functions/_shared/relatorio-publico.test.ts supabase/functions/_shared/relatorio-comercial.test.ts`

Expected: PASS, inclusive o texto de ouro completo e os dois tickets médios.

### Task 3: Formatação pública do Administrativo e dos botões

**Files:**
- Modify: `supabase/functions/relatorio-admin-whatsapp/index.ts:1-20, 567-981, 1587-1850`
- Modify: `tests/relatorioAdminHermesCronContract.test.mjs`

- [ ] **Step 1: Escrever o contrato RED**

```js
assert.doesNotMatch(edge, /\(fonte canônica\)/i);
assert.match(edge, /validarTextoPublicoRelatorio\(texto\)/);
assert.match(edge, /validarTextoPublicoRelatorio\(formatarRelatorioComercialDiario\(dados\)\)/);
```

- [ ] **Step 2: Comprovar RED**

Run: `node --test tests/relatorioAdminHermesCronContract.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Validar os dois retornos públicos**

Trocar o rodapé por `📅 Relatório gerado em: dd/mm/aaaa às HH:mm`, finalizar o Administrativo com `return validarTextoPublicoRelatorio(texto)` e finalizar o Comercial servido pela mesma Edge Function com `return validarTextoPublicoRelatorio(formatarRelatorioComercialDiario(dados))`.

- [ ] **Step 4: Comprovar GREEN**

Run: `node --test tests/relatorioAdminHermesCronContract.test.mjs`

Run: `deno check supabase/functions/relatorio-admin-whatsapp/index.ts`

Expected: PASS e check sem erro.

### Task 4: Cliente Python estrito de mensagem única

**Files:**
- Create: `scripts/lareport_whatsapp_single.py`
- Create: `tests/test_lareport_whatsapp_single.py`

- [ ] **Step 1: Escrever testes RED**

```py
def test_accepts_exactly_one_message_id(self):
    result = validate_single_response({
        "success": True, "singleMessage": True,
        "messageId": "ABC", "messageIds": ["ABC"],
    })
    self.assertEqual(result["message_id"], "ABC")

def test_rejects_chunked_response(self):
    with self.assertRaisesRegex(RuntimeError, "single_message_not_confirmed"):
        validate_single_response({
            "success": True, "messageId": "B", "messageIds": ["A", "B"],
        })
```

- [ ] **Step 2: Comprovar RED**

Run: `python -m unittest tests/test_lareport_whatsapp_single.py -v`

Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar o cliente local**

```py
BRIDGE_REPORT_URL = os.environ.get(
    'LA_REPORT_WHATSAPP_SINGLE_URL',
    'http://127.0.0.1:3000/send-report',
)
REPORT_MAX_LENGTH = 16_000

def send_single_report(jid, text, timeout=180):
    validate_public_text(text)
    if len(text) > REPORT_MAX_LENGTH:
        raise RuntimeError('report_too_long')
    payload = json.dumps(
        {'chatId': jid, 'message': text}, ensure_ascii=False,
    ).encode('utf-8')
    req = request.Request(
        BRIDGE_REPORT_URL, data=payload,
        headers={'Content-Type': 'application/json'}, method='POST',
    )
    with request.urlopen(req, timeout=timeout) as response:
        data = json.loads(response.read().decode('utf-8'))
    return validate_single_response(data)
```

- [ ] **Step 4: Comprovar GREEN**

Run: `python -m unittest tests/test_lareport_whatsapp_single.py -v`

Expected: PASS.

### Task 5: Migrar os dois crons e o worker dos botões

**Files:**
- Modify: `scripts/send-lareport-comercial-hermes.py`
- Modify: `scripts/send-lareport-adm-hermes.py`
- Create: `scripts/process-sol-report-queue.py`
- Create: `tests/relatorioCronMensagemUnica.test.mjs`
- Modify: `tests/relatorioComercialCronCanonico.test.mjs`
- Modify: `tests/relatorioAdminHermesCronContract.test.mjs`

- [ ] **Step 1: Escrever contratos RED dos três produtores**

```js
for (const source of [comercial, administrativo, filaManual]) {
  assert.match(source, /from lareport_whatsapp_single import send_single_report/);
  assert.match(source, /send_single_report\(/);
  assert.doesNotMatch(source, /hermes_cli\.main/);
  assert.doesNotMatch(source, /subprocess\.run/);
}
```

- [ ] **Step 2: Comprovar RED**

Run: `node --test tests/relatorioCronMensagemUnica.test.mjs tests/relatorioComercialCronCanonico.test.mjs tests/relatorioAdminHermesCronContract.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Trocar apenas o transporte**

```py
from lareport_whatsapp_single import send_single_report

def send_report(target, text):
    try:
        return {'success': True, **send_single_report(target, text)}
    except Exception as exc:
        return {'success': False, 'error': str(exc)[:1000]}
```

Preservar geração canônica, flags, deduplicação, tabelas, fila, auditoria e estados. O worker versionado deve manter `fila_relatorios_sol_hermes`, `sol_pendente`, `sol_enviando`, `enviada` e `erro`.

- [ ] **Step 4: Comprovar GREEN**

Run: `node --test tests/relatorioCronMensagemUnica.test.mjs tests/relatorioComercialCronCanonico.test.mjs tests/relatorioAdminHermesCronContract.test.mjs`

Run: `python -m unittest tests/test_lareport_whatsapp_single.py -v`

Run: `python -m py_compile scripts/lareport_whatsapp_single.py scripts/send-lareport-comercial-hermes.py scripts/send-lareport-adm-hermes.py scripts/process-sol-report-queue.py`

Expected: PASS e compilação sem erro.

### Task 6: Rota dedicada no bridge da Sol

**Files:**
- Create: `scripts/hermes-whatsapp-bridge/report-single-message.js`
- Create: `scripts/hermes-whatsapp-bridge/bridge-report-single-message.patch`
- Create: `tests/hermesWhatsappReportSingleMessage.test.mjs`

- [ ] **Step 1: Escrever testes RED da rota isolada**

Para texto de 7.000 caracteres:

```js
assert.equal(sendCalls.length, 1);
assert.equal(sendCalls[0].payload.text.length, 7000);
assert.deepEqual(response.body, {
  success: true, singleMessage: true,
  messageId: 'MSG-1', messageIds: ['MSG-1'],
});
```

Adicionar casos 413 acima de 16.000, 403 para grupo fora da allowlist, 403 para DM que não seja a própria Sol e 503 quando desconectado.

- [ ] **Step 2: Comprovar RED**

Run: `node --test tests/hermesWhatsappReportSingleMessage.test.mjs`

Expected: FAIL porque o módulo ainda não existe.

- [ ] **Step 3: Implementar uma única chamada**

```js
const sent = await sendWithTimeout(chatId, { text: formatted });
trackSentMessageId(sent);
const messageId = sent?.key?.id;
if (!messageId) throw new Error('message_id_missing');
return res.json({
  success: true, singleMessage: true,
  messageId, messageIds: [messageId],
});
```

O patch deve adicionar somente o import e o registro da rota ao `bridge.js`. Não alterar `/send`, `MAX_MESSAGE_LENGTH` ou `splitLongMessage`.

- [ ] **Step 4: Comprovar GREEN**

Run: `node --test tests/hermesWhatsappReportSingleMessage.test.mjs`

Run: `node --check scripts/hermes-whatsapp-bridge/report-single-message.js`

Expected: PASS. Aplicar o patch em dry-run contra uma cópia do bridge vivo antes do deploy.

### Task 7: Regressão local e commit

**Files:** All files from Tasks 1-6.

- [ ] **Step 1: Executar toda a suíte focada**

```powershell
deno test supabase/functions/_shared/relatorio-publico.test.ts supabase/functions/_shared/relatorio-comercial.test.ts supabase/functions/_shared/relatorio-admin-canonico.test.ts
node --test tests/relatorioCronMensagemUnica.test.mjs tests/hermesWhatsappReportSingleMessage.test.mjs tests/relatorioComercialCronCanonico.test.mjs tests/relatorioAdminHermesCronContract.test.mjs
python -m unittest tests/test_lareport_whatsapp_single.py -v
deno check supabase/functions/relatorio-admin-whatsapp/index.ts
npm run build
git diff --check
```

Expected: todos os comandos com código zero.

- [ ] **Step 2: Revisar escopo e diff**

Confirmar que Comercial e Administrativo continuam separados; cada um gera uma mensagem única; nenhuma consulta ou KPI mudou; o `/send` genérico do Hermes não mudou; e não há arquivos alheios.

- [ ] **Step 3: Commitar explicitamente**

```powershell
git add -- supabase/functions/_shared/relatorio-publico.ts supabase/functions/_shared/relatorio-publico.test.ts supabase/functions/_shared/relatorio-comercial.ts supabase/functions/_shared/relatorio-comercial.test.ts supabase/functions/relatorio-admin-whatsapp/index.ts scripts/lareport_whatsapp_single.py scripts/send-lareport-comercial-hermes.py scripts/send-lareport-adm-hermes.py scripts/process-sol-report-queue.py scripts/hermes-whatsapp-bridge/report-single-message.js scripts/hermes-whatsapp-bridge/bridge-report-single-message.patch tests/test_lareport_whatsapp_single.py tests/relatorioCronMensagemUnica.test.mjs tests/hermesWhatsappReportSingleMessage.test.mjs tests/relatorioComercialCronCanonico.test.mjs tests/relatorioAdminHermesCronContract.test.mjs
git commit -m "fix: enviar relatorios em mensagem unica"
```

Expected: commit apenas com o ajuste aprovado.

### Task 8: Implantação controlada

**Targets:**
- Edge Function `relatorio-admin-whatsapp`
- `/home/sol/.openclaw/workspace/scripts/`
- `/home/sol/.hermes/hermes-agent/scripts/whatsapp-bridge/`

- [ ] **Step 1: Fazer backups com timestamp UTC** dos quatro scripts vivos e do `bridge.js`, depois conferir os caminhos absolutos.

- [ ] **Step 2: Publicar a Edge Function** no projeto `ouqwbbermlzqqvtqwlul` e confirmar sucesso.

- [ ] **Step 3: Copiar os quatro scripts Python e o módulo Node**, preservar executável e rodar `py_compile`/`node --check` na VPS.

- [ ] **Step 4: Aplicar primeiro o dry-run do patch**, aplicar o patch real, validar `bridge.js` e reiniciar somente `hermes-gateway-sol.service`.

- [ ] **Step 5: Confirmar `active` e `/health` conectado** antes de qualquer tentativa de envio.

- [ ] **Step 6: Provar na conversa da própria Sol** um texto inofensivo maior que 4.096 caracteres e exigir `singleMessage: true`, um `messageId`, um único item em `messageIds` e uma única bolha sem `(1/2)`.

- [ ] **Step 7: Rodar dry-run Comercial e Administrativo nas três unidades** e validar separação, datas brasileiras, ausência de termos proibidos e tamanho abaixo de 16.000. Não enviar aos grupos nesta etapa.

### Task 9: Verificação final e push sem merge

**Files:** Repository and production evidence only.

- [ ] **Step 1: Repetir a suíte da Task 7** após o deploy.

- [ ] **Step 2: Conferir `git status`, histórico e divergência**; exigir worktree limpa e branch apenas à frente do remoto.

- [ ] **Step 3: Executar `git push origin hotfix/relatorio-cron-auth`** e confirmar fast-forward.

- [ ] **Step 4: Conferir os checks da PR existente**, corrigir eventual falha e não executar merge.

