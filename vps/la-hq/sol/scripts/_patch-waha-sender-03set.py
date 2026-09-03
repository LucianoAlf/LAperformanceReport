#!/usr/bin/env python3
"""Patch idempotente: `lareport_whatsapp_single.py` aprende a enviar por WAHA.

POR QUE: o relatorio comercial "tem que ser a Mila" (Luciano, 03/09). A Mila
real fala pelas sessoes WAHA do Chatwoot (147/148/155), todas WORKING no
servidor multi-tenant waha.agenticflowio.com.br. O script so sabia UAZAPI e a
bridge nativa da Sol — nao havia caminho WAHA nenhum (grep 'waha' = 0).

O QUE MUDA:
  - `_fetch_caixa(caixa_id)` le TAMBEM provedor/waha_url/waha_api_key/
    waha_session da whatsapp_caixas (antes lia so os campos UAZAPI)
  - `_send_via_waha(jid, text, timeout, caixa_id)` -> POST /api/sendText
  - `send_single_report(caixa_id=)` roteia por `provedor`: waha -> WAHA,
    senao -> UAZAPI, como antes. SEM fallback cruzado, igual a regra da caixa 3.

⚠️ O WAHA esta atras de Cloudflare e recusa User-Agent nao-browser com
   Error 1010 — medido em 03/09. Por isso o header User-Agent de navegador.
⚠️ Grupo (`@g.us`) so recebe se a sessao for MEMBRO. Em 03/09 nenhum numero da
   Mila estava nos 3 grupos "RELATORIOS DIARIOS" — sem isso o envio falha, e a
   falha e a resposta certa (nao cair na Sol).

Uso: python3 _patch-waha-sender-03set.py [--check]
Cria backup .bak-<ts>-before-waha-sender antes de escrever.
"""
import sys, time, shutil, re

ALVO = "/home/sol/.openclaw/workspace/scripts/lareport_whatsapp_single.py"
CHECK = "--check" in sys.argv

src = open(ALVO, encoding="utf-8").read()
orig = src

if "_send_via_waha" in src:
    print("ja aplicado — nada a fazer")
    sys.exit(0)


def trocar(de, para, rotulo, esperado=1):
    global src
    n = src.count(de)
    assert n == esperado, f"{rotulo}: esperava {esperado}, achei {n}"
    src = src.replace(de, para)
    print(f"  ok {rotulo}")


# 1) creds: ler tambem os campos WAHA e o provedor
trocar(
    "        'select': 'id,nome,uazapi_url,uazapi_token,ativo',",
    "        'select': 'id,nome,uazapi_url,uazapi_token,ativo,provedor,waha_url,waha_api_key,waha_session',",
    "select com campos waha",
)
trocar(
    """    creds = {
        'url': rows[0]['uazapi_url'].rstrip('/'),
        'token': rows[0]['uazapi_token'],
        'nome': rows[0]['nome'],
        'caixa_id': caixa_id,
    }""",
    """    creds = {
        'url': rows[0]['uazapi_url'].rstrip('/'),
        'token': rows[0]['uazapi_token'],
        'nome': rows[0]['nome'],
        'caixa_id': caixa_id,
        # roteamento por provedor (03/09): a Mila fala por sessao WAHA
        'provedor': (rows[0].get('provedor') or 'uazapi').lower(),
        'waha_url': (rows[0].get('waha_url') or '').rstrip('/'),
        'waha_api_key': rows[0].get('waha_api_key') or '',
        'waha_session': rows[0].get('waha_session') or '',
    }""",
    "creds com waha",
)

# 2) o remetente WAHA, logo antes do bridge nativo
trocar(
    "def _send_via_native_bridge(jid, text, timeout):",
    '''def _send_via_waha(jid, text, timeout, caixa_id):
    """Envia pela sessao WAHA da caixa. Sem fallback: sair pelo numero errado e
    pior que nao sair."""
    creds = _fetch_uazapi_creds(caixa_id)
    if not creds['waha_url'] or not creds['waha_api_key'] or not creds['waha_session']:
        raise RuntimeError(f"waha_creds_missing: caixa_id={caixa_id}")
    payload = json.dumps(
        {'session': creds['waha_session'], 'chatId': jid, 'text': text},
        ensure_ascii=False,
    ).encode('utf-8')
    req = request.Request(
        f"{creds['waha_url']}/api/sendText",
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'X-Api-Key': creds['waha_api_key'],
            # Cloudflare na frente do WAHA devolve Error 1010 para UA nao-browser
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
        },
        method='POST',
    )
    try:
        with request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode('utf-8')
    except error.HTTPError as exc:
        detail = exc.read().decode('utf-8', errors='replace')[:1000]
        raise RuntimeError(f'waha_http_{exc.code}: {detail}') from exc
    except error.URLError as exc:
        raise RuntimeError(f'waha_unavailable: {exc.reason}') from exc
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError('waha_invalid_json') from exc
    message_id = (
        result.get('id')
        or (result.get('key') or {}).get('id')
        or (result.get('_data') or {}).get('id', {}).get('id') if isinstance((result.get('_data') or {}).get('id'), dict) else None
    ) or result.get('id')
    if not message_id:
        raise RuntimeError(f'waha_message_id_missing: {raw[:300]}')
    return {'message_id': message_id, 'transport': f"waha_caixa_{caixa_id}"}


def _send_via_native_bridge(jid, text, timeout):''',
    "_send_via_waha",
)

# 3) roteamento por provedor dentro de send_single_report
trocar(
    """    if caixa_id:
        return _send_via_uazapi(jid, text, timeout, caixa_id)""",
    """    if caixa_id:
        if _fetch_uazapi_creds(caixa_id)['provedor'] == 'waha':
            return _send_via_waha(jid, text, timeout, caixa_id)
        return _send_via_uazapi(jid, text, timeout, caixa_id)""",
    "roteamento por provedor",
)

assert src != orig
compile(src, ALVO, "exec")  # sintaxe
if CHECK:
    print("--check: patch valido, nada escrito")
    sys.exit(0)
bak = f"{ALVO}.bak-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-before-waha-sender"
shutil.copy2(ALVO, bak)
open(ALVO, "w", encoding="utf-8").write(src)
print("aplicado. backup:", bak)
