#!/usr/bin/env python3
"""Monta o RELATÓRIO da bateria: ferramenta, pergunta, resposta e veredito.

O placar diz quantos passaram. Este arquivo diz **o que foi perguntado, o que
ela respondeu e por que passou ou não** — que é o que se lê para decidir se a
Mila pode trabalhar.

Uso:  relatorio.py /tmp/bat-v4.json > docs/handoffs/....md
"""
import json
import sys
from collections import defaultdict

# qual ferramenta cada cenário exercita (para o relatório sair por ferramenta,
# não por cenário: a pergunta é "a tool X funciona?", não "o cenário Y passou?")
FERRAMENTA = {
    "mes-consultora-kai": "numeros_do_mes", "mes-consultora-dai": "numeros_do_mes",
    "mes-consultora-vit": "numeros_do_mes", "mes-rede-kri": "numeros_do_mes",
    "mes-rede-alf": "numeros_do_mes", "mes-rede-recorte": "numeros_do_mes",
    "nao-inventa-mes": "numeros_do_mes",
    "agenda-kai": "agenda_do_dia", "agenda-dai": "agenda_do_dia",
    "agenda-rede-kri": "agenda_do_dia",
    "fechamento-kai": "fechamento_do_dia",
    "estrelas-kai": "estrelas_matriculador", "estrelas-dai": "estrelas_matriculador",
    "pendencias-vit": "pendencias_comerciais", "pauta-dai": "minha_pauta",
    "retomadas-dai": "retomadas_do_dia", "agenda-escola": "agenda_da_escola",
    "atendimento-kri": "desempenho_atendimento", "atendimento-outras": "desempenho_atendimento",
    "trafego-agosto-alf": "trafego_por_canal", "trafego-agosto-kri": "trafego_por_canal",
    "trafego-negado-kai": "trafego_por_canal (gate)", "trafego-negado-dai": "trafego_por_criativo (gate)",
    "base-preco": "consultar_base_comercial", "base-experimental": "consultar_base_comercial",
    "base-indicacao": "consultar_base_comercial", "base-lacuna": "consultar_base_comercial",
    "padrao-porque": "o_que_aprendemos", "onde-focar": "onde_focar",
    "escrita-sem-id": "anotar_lead", "escrita-curso": "registrar_curso_interesse",
    "escrita-motivo": "registrar_motivo_perda", "escrita-canal": "registrar_canal_origem",
    "escrita-retomada": "registrar_retomada",
    "recado-colaborador": "propor_recado", "recado-professor": "propor_recado",
    "recado-para-mim": "recado_para_mim",
    "escopo-outra-unidade": "escopo por unidade", "escopo-professor-alheio": "propor_recado (escopo)",
    "escopo-lead-alheio": "ficha_lead (escopo)", "ficha-ambigua": "ficha_lead (ambiguidade)",
    "nao-inventa": "honestidade",
}


def main():
    dados = json.load(open(sys.argv[1], encoding="utf-8"))
    por_cenario = defaultdict(list)
    for r in dados:
        por_cenario[r["cenario"]].append(r)

    total = len(por_cenario)
    limpos = sum(1 for c, rs in por_cenario.items()
                 if all(all(v[1] for v in r.get("vereditos", [])) for r in rs if "vereditos" in r))

    print(f"# Bateria da Mila — relatório completo\n")
    print(f"**{limpos}/{total} cenários limpos em todas as rodadas.** "
          f"{len(dados)} conversas no total.\n")
    print("Cada bloco traz a **pergunta feita**, a **resposta dela** e o **veredito**, "
          "com o fato vindo da RPC e a conferência de número feita campo a campo.\n")

    # agrupado por ferramenta
    por_tool = defaultdict(list)
    for c in por_cenario:
        por_tool[FERRAMENTA.get(c, "outros")].append(c)

    for tool in sorted(por_tool):
        cenarios = sorted(por_tool[tool])
        marcas = []
        for c in cenarios:
            rs = [r for r in por_cenario[c] if "vereditos" in r]
            ok = sum(1 for r in rs if all(v[1] for v in r["vereditos"]))
            marcas.append(f"{c} {ok}/{len(rs)}")
        print(f"\n## `{tool}`\n")
        print("  ·  ".join(marcas) + "\n")
        for c in cenarios:
            for r in por_cenario[c]:
                if "vereditos" not in r:
                    print(f"<details><summary><b>{c}</b> · rodada {r['rodada']} · ERRO</summary>\n")
                    print(f"```\n{r.get('erro')}\n```\n</details>\n")
                    continue
                if r["rodada"] != 1:
                    continue      # o detalhe completo na rodada 1; a 2ª só no placar
                ok = all(v[1] for v in r["vereditos"])
                print(f"<details><summary>{'✅' if ok else '❌'} <b>{c}</b> — {r['pessoa']}</summary>\n")
                print(f"**Resposta da Mila:**\n\n> " +
                      (r.get("resposta") or "").replace("\n", "\n> ")[:1800] + "\n")
                for nome, v, porque in r["vereditos"]:
                    marca = "✅" if v else ("⁉️" if v is None else "❌")
                    print(f"- {marca} {nome.replace('[NUM] ', '')}")
                    print(f"  - _{porque}_")
                print("\n</details>\n")


if __name__ == "__main__":
    main()
