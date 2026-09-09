#!/usr/bin/env python3
"""Lê o `caixa.log` da Sol numa janela e mostra a decisão de cada turno.

🔴 POR QUE EXISTE. Em 09/09/2026 a Mayra (CG) gastou 19 minutos e 6 mensagens
   tentando fazer a Sol entender um comprovante de dois alunos, e desistiu. A
   Fernanda (Recreio) precisou de 3 correções para o mesmo tipo de caso. O
   Luciano resumiu: *"ela não aprende, repete os mesmos erros e isso cansa"*.

   Para achar a raiz é preciso ver, turno a turno: o que chegou, o que a
   gramática determinística entendeu, o que o LLM de correção entendeu e o que
   o roteador V4 (em sombra) teria decidido — lado a lado, na mesma linha do
   tempo.

Uso:  ler-caixa-log.py <inicio-iso> <fim-iso> [chatId-parcial]
      ler-caixa-log.py 2026-09-09T14:24 2026-09-09T14:46
"""
import json
import sys

CAMINHO = "/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa.log"

# campos que valem a pena mostrar por tipo de linha — o log tem dezenas
INTERESSE = ("intencao", "confianca", "legado", "pendencias", "modelo",
             "motivo", "erro", "aluno", "valor", "forma", "categoria",
             "competencia", "ok", "via", "decisao", "regra")


def resumo(d):
    partes = []
    for k in INTERESSE:
        v = d.get(k)
        if v not in (None, "", [], {}):
            partes.append(f"{k}={v}")
    campos = d.get("campos") or {}
    preenchidos = {k: v for k, v in campos.items() if v not in (None, "")}
    if preenchidos:
        partes.append("campos=" + json.dumps(preenchidos, ensure_ascii=False))
    return " ".join(partes)


def main():
    ini, fim = sys.argv[1], sys.argv[2]
    chat = sys.argv[3] if sys.argv[3:] else None

    for ln in open(CAMINHO, encoding="utf-8"):
        try:
            d = json.loads(ln)
        except Exception:  # noqa: BLE001
            continue
        ts = d.get("ts", "")
        if not (ini <= ts <= fim):
            continue
        if chat and chat not in str(d.get("chatId", "")):
            continue

        texto = d.get("texto") or d.get("legenda") or d.get("mensagem") or ""
        print(f"{ts[11:19]}  {d.get('acao', '?'):34s} {str(texto)[:100]}")
        r = resumo(d)
        if r:
            print(f"{'':12s}    -> {r[:230]}")


if __name__ == "__main__":
    main()
