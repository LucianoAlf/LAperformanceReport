#!/usr/bin/env python3
"""As skills passam a NOMEAR as portas — o modelo só busca o que sabe nomear.

🔴 A CAUSA, provada em 09/09/2026 (o Alfredo pediu prova, e ela refuta as duas
   hipóteses anteriores — a minha e a dele):

   1. `tools.tool_search.enabled: auto` no `config.yaml`. O `tool_search.py` do
      Hermes diz na própria doc: *"MCP and non-core plugin tools are REPLACED in
      the model-visible array... the moment ANY deferrable tools are present,
      they hide behind the bridge."* Ou seja: **as 14 portas não estão no array
      visível ao modelo.** Ele só as alcança buscando.

   2. As skills ativas citam `sol-acesso-restrito__query` **pelo nome literal,
      2 vezes**. Citam o nome literal de **alguma porta: ZERO vezes.**

   3. Resultado medido no journal do `hermes-gateway-sol.service`, desde 08/09:
      **14 chamadas de `mcp__sol_acesso_restrito__query`, 0 de `mcp__sol_portas__*`.**
      Uma delas bateu em `permission denied for table alunos` — existindo a porta
      `situacao_dos_alunos`.

   O modelo não desobedeceu. Ele buscou o que sabia nomear, achou, e usou.

⚠️ NÃO É "editar três skills às cegas", que foi a minha proposta anterior e que o
   Alfredo recusou com razão. As skills já mandam priorizar as portas — o que
   falta é o CATÁLOGO: nome exato, um por linha, para o `tool_search` conseguir
   casar a busca.

⚠️ Não mexe no texto de prioridade que já existe. Só acrescenta a lista.

⚠️ NÃO APLICADO EM PRODUÇÃO. Este arquivo é a mudança proposta; rodar exige o
   gate do Alf, porque o perfil da Sol é produção.
"""
import os
import pathlib
import shutil
import sys
from datetime import datetime

BASE = pathlib.Path(os.environ.get(
    "SOL_SKILLS_DIR", "/home/sol/.hermes/profiles/sol/skills"))

# nome real exposto pelo MCP (conferido por `tools/list` em 09/09) -> o que faz
PORTAS = [
    ("caixa_do_dia",           "movimentos e saldo do caixa de um dia"),
    ("inadimplencia",          "quem está em aberto, por unidade"),
    ("faturas_do_mes",         "faturas da competência"),
    ("numeros_da_unidade",     "KPIs consolidados da unidade"),
    ("situacao_dos_alunos",    "cadastro, anamnese, presença, inadimplência por aluno"),
    ("presenca_pendente",      "chamada não fechada do dia"),
    ("pendencias_de_cadastro", "o que falta preencher"),
    ("aviso_previo",           "quem avisou saída"),
    ("renovacoes",             "ciclos a renovar e renovados"),
    ("contratos_vencendo",     "contratos com fim próximo"),
    ("alunos_sem_fatura",      "teve aula e não foi cobrado"),
    ("pauta_do_dia",           "o que merece ação hoje"),
    ("agenda_do_dia",          "aulas do dia"),
    ("registrar_desfecho",     "ESCREVE: registra o desfecho de um sinal"),
]

BLOCO = """
## Portas disponíveis — nomes exatos

🔴 As tools de MCP **não aparecem prontas** na lista do modelo (`tool_search` em
`auto` no perfil): elas ficam atrás da busca. Buscar exige o NOME. Por isso ele
está aqui, um por linha — sem isto, a busca acha `query` e não acha porta, que
foi o que aconteceu em 09/09 (14 chamadas de SQL largo, 0 de porta).

| tool | responde |
|---|---|
"""


def main():
    aplicar = "--aplicar" in sys.argv
    carimbo = datetime.now().strftime("%Y%m%dT%H%M%S")
    linhas = "\n".join(f"| `mcp__sol_portas__{n}` | {d} |" for n, d in PORTAS)
    bloco = BLOCO + linhas + "\n"

    alvos = ["sol-caixa-consulta", "sol-bi-admin", "sol-la-report-business-rules"]
    for nome in alvos:
        arq = BASE / nome / "SKILL.md"
        if not arq.exists():
            print(f"  !! {nome}: SKILL.md ausente")
            continue
        texto = arq.read_text(encoding="utf-8")
        if "mcp__sol_portas__caixa_do_dia" in texto:
            print(f"  == {nome}: ja tem o catalogo")
            continue
        novo = texto.rstrip() + "\n" + bloco
        if aplicar:
            shutil.copy2(arq, f"{arq}.bak-{carimbo}-antes-catalogo-portas")
            arq.write_text(novo, encoding="utf-8")
            print(f"  ok {nome}: catalogo acrescentado (+{len(bloco)} chars)")
        else:
            print(f"  -- {nome}: acrescentaria {len(bloco)} chars "
                  f"({len(PORTAS)} portas nomeadas)")

    if not aplicar:
        print("\n(ensaio — nada escrito. Use --aplicar com o gate do Alf.)")


if __name__ == "__main__":
    main()
