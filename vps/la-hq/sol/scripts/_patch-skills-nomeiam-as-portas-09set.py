#!/usr/bin/env python3
"""As skills passam a NOMEAR as portas — reforço de saliência, NÃO causa-raiz.

⚠️ CORRIGIDO EM 09/09/2026, DEPOIS DA MEDIÇÃO DO ALFREDO. A versão anterior
   deste cabeçalho afirmava que as 14 portas "não estão no array visível ao
   modelo" e que por isso ele não as achava. **Isso está errado e a medição é
   dele:** o perfil vivo tem 480 tools deferidas (~72,8 mil tokens) e as portas
   da Sol **já aparecem nominalmente no catálogo resumido do `tool_search`**.
   O modelo consegue encontrá-las. Meu diagnóstico estava incompleto.

   O que o dado sustenta continua de pé, e é menos do que eu tinha dito:
     · desde 08/09, o journal registra 14 chamadas de
       `mcp__sol_acesso_restrito__query` e ZERO de `mcp__sol_portas__*`
       (uma delas bateu em `permission denied for table alunos`, existindo a
       porta `situacao_dos_alunos`);
     · as skills citam `sol-acesso-restrito__query` pelo nome literal 2×, e
       nome literal de porta 0×.

   Ou seja: nomear as portas torna a busca mais provável. **Não é a causa.**
   As duas hipóteses que restam, e que o Alfredo priorizou com razão, são
   (a) reduzir a superfície de 480 tools — só o `mcp-hugo` responde por 424 —
   e (b) tirar a `query` larga da superfície operacional nos domínios que as
   portas já cobrem. Ferramenta disponível não vence instrução escrita; mas
   atalho largo disponível vence porta específica com a mesma facilidade.

⚠️ Isto NÃO edita o texto de prioridade que já existe (o patch de 07/09 já
   mandava priorizar as portas). Só acrescenta o catálogo de nomes.

⚠️ NÃO APLICADO EM PRODUÇÃO. Dry-run por padrão; `--aplicar` exige o gate.
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
