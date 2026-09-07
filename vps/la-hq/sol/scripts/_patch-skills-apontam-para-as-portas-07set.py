#!/usr/bin/env python3
"""AS SKILLS PASSAM A APONTAR PARA AS PORTAS (07/09/2026).

🔴 POR QUE ISTO EXISTE — medido, nao suposto. Com as 12 portas no ar e visiveis
   (a Sol lista as 12 quando perguntada), fiz duas perguntas que sao exatamente
   o trabalho delas ("como esta o caixa hoje?" e "quem esta inadimplente?") e
   `automacao_log` (evento `sol_portas`) registrou **ZERO** chamadas: 7 antes,
   7 depois. Ela respondeu certo — pela porta larga `sol-acesso-restrito__query`,
   digitando o telefone dentro do SQL, que e o buraco que as portas fecham.

   A causa esta escrita: `sol-bi-admin/SKILL.md:14` manda usar a porta larga
   **"sempre que possivel"**. Ferramenta disponivel nao vence instrucao
   explicita — ligar o servidor nao muda comportamento, muda a possibilidade.

⚠️ A porta larga NAO e removida. Ela vira o que sempre deveria ser: o que se usa
   quando as 12 nao cobrem. Tirar as duas coisas no mesmo movimento — instrucao
   e ferramenta — seria trocar de piso no escuro.

⚠️ A skill viva e a do PERFIL (`/home/sol/.hermes/profiles/sol/skills/`), nao a
   do workspace: `config.yaml` tem `skills.external_dirs: []`. As duas copias de
   `sol-bi-admin` ja estao com md5 diferente — a do workspace e sombra velha.

  python3 _patch-skills-apontam-para-as-portas-07set.py <dir-de-skills>
"""
import io
import os
import sys

SECAO = """
## Por onde perguntar — as 12 portas vêm PRIMEIRO

Para estas perguntas existe uma ferramenta com nome de trabalho. Use ela, não SQL:

| A pessoa pergunta | Porta |
| --- | --- |
| como tá o caixa? já fechou? quanto entrou? | `sol_portas__caixa_do_dia` |
| quem tá devendo? quanto temos atrasado? | `sol_portas__inadimplencia` |
| quanto faturamos? quantas faturas em aberto? | `sol_portas__faturas_do_mes` |
| quantos ativos? como tá o mês? ticket? | `sol_portas__numeros_da_unidade` |
| como estão os alunos? quantos sem anamnese? | `sol_portas__situacao_dos_alunos` |
| quem não lançou chamada? | `sol_portas__presenca_pendente` |
| tenho pendência? | `sol_portas__pendencias_de_cadastro` |
| quem avisou que sai? | `sol_portas__aviso_previo` |
| quem falta renovar? | `sol_portas__renovacoes` |
| quem tá vencendo? | `sol_portas__contratos_vencendo` |
| tem aluno sem cobrança? | `sol_portas__alunos_sem_fatura` |
| o que tem hoje? a sala 3 tá livre? | `sol_portas__agenda_do_dia` |

Toda porta pede `p_solicitante_telefone`: copie do **"Participante que enviou"**
do envelope, só os dígitos. É ele que decide qual unidade você enxerga — e toda
chamada fica registrada com esse número. Sem saber quem falou, pergunte.

**Não passe `unidade` para quem não é diretoria.** A porta já sabe qual é a da
pessoa; pedir outra só serve para tomar "não".

`sol-acesso-restrito__query` continua existindo para o que as 12 **não** cobrem.
Se a pergunta está na tabela acima e você foi pelo SQL, foi pelo caminho errado:
o número pode até sair certo, mas o recorte de unidade passa a depender do que
você digitou, não do cadastro.
"""

LINHA_VELHA = "Usar MCP read-only `sol-acesso-restrito__query` sempre que possível para LA Report/dados oficiais da escola."
LINHA_NOVA = ("Para caixa, inadimplência, faturas, números da unidade, situação dos alunos, presença,\n"
              "pendências, aviso prévio, renovações, contratos vencendo, alunos sem fatura e agenda:\n"
              "use as **portas** (`sol_portas__*`), não SQL — veja a skill `sol-la-report-business-rules`.\n"
              "`sol-acesso-restrito__query` é o read-only para o que as portas não cobrem.")

if len(sys.argv) < 2:
    print("uso: python3 _patch-skills-apontam-para-as-portas-07set.py <dir-de-skills>", file=sys.stderr)
    raise SystemExit(2)

base = sys.argv[1]
mudou = 0

# 1. a skill que carrega para estas perguntas ganha o mapa
alvo = os.path.join(base, "sol-la-report-business-rules", "SKILL.md")
s = io.open(alvo, encoding="utf-8").read()
if "as 12 portas vêm PRIMEIRO" in s:
    print("business-rules: ja aplicado")
else:
    ANC = "\nTraduza a pergunta operacional para a regra canônica correta antes de consultar ou responder.\n"
    n = s.count(ANC)
    if n != 1:
        print("ANCORA business-rules: esperava 1, achei %d" % n, file=sys.stderr)
        raise SystemExit(1)
    s = s.replace(ANC, ANC + SECAO, 1)
    io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
    print("business-rules: mapa das 12 portas acrescentado")
    mudou += 1

# 2. a instrucao que mandava para a porta larga passa a ser o fallback
alvo = os.path.join(base, "sol-bi-admin", "SKILL.md")
s = io.open(alvo, encoding="utf-8").read()
if LINHA_NOVA.split("\n")[0] in s:
    print("bi-admin: ja aplicado")
else:
    n = s.count(LINHA_VELHA)
    if n != 1:
        print("ANCORA bi-admin: esperava 1, achei %d" % n, file=sys.stderr)
        raise SystemExit(1)
    s = s.replace(LINHA_VELHA, LINHA_NOVA, 1)
    io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
    print("bi-admin: porta larga virou fallback")
    mudou += 1

print("mudancas: %d" % mudou)
