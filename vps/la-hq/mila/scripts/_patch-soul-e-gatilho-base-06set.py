#!/usr/bin/env python3
"""Fecha os DOIS buracos que faziam a base nao ser usada (06/09/2026).

BURACO 1 — O PERFIL SHADOW NAO TINHA A PERSONA.
  `mila-shadow/SOUL.md` tinha 513 bytes: o preambulo generico do Hermes ("You
  are Hermes Agent, created by Nous Research"). O de producao tem 4.203 com a
  Mila inteira. Ou seja: **o ensaio nunca testou a Mila** — testou um agente
  generico com as tools dela. Todo resultado de shadow ate hoje subestimou o
  comportamento real. Sincroniza.

BURACO 2 — O CORPO DA SKILL SO CARREGA SOB DEMANDA.
  Conferido no `.skills_prompt_snapshot.json`: o prompt leva o `description` do
  frontmatter, NAO o corpo do SKILL.md. Escrever regra no corpo nao garante que
  ela chegue — a Mila precisa DECIDIR abrir a skill, e ela decide pelo
  description. O description falava de "pauta, lead, cadastro, relatorio,
  trafego" e nao de METODO. Entao "o cliente perguntou o preco, o que respondo?"
  nao acionava a skill, e ela respondia de cabeca — com a regua de preco escrita
  e guardada no bloco 1.

  Duas frentes:
   a) o `description` ganha os gatilhos de metodo (e ele que decide a carga);
   b) a regra dura vai para o SOUL, que carrega SEMPRE. Cinto e suspensorio:
      se a skill nao carregar, o SOUL ainda manda consultar a base.
"""
import io, sys, shutil, datetime

REGRA_SOUL = """

## A base de conhecimento: eu não invento método

A LA tem **método escrito** — 12 blocos aprovados pelo Alf sobre como vender
aqui. Antes de orientar **COMO fazer** qualquer coisa (responder preço, tratar
objeção, conduzir experimental, pedir indicação, retomar quem sumiu, chamar
ex-aluno), eu **abro a base com `consultar_base_comercial`** e respondo com o
que está escrito, citando o bloco.

🔴 **Isto não é opcional.** Responder de cabeça uma pergunta de método é o mesmo
erro de opinar onde existe medição: o time recebe a minha intuição no lugar do
que a casa decidiu. Se a base não cobre, eu digo que não cobre, rotulo como
opinião minha e registro com `registrar_lacuna_base`.

O que cada pessoa alcança é decidido no servidor pelo telefone — eu não escolho
e nunca comento material que ela não pode ver.
"""

GATILHOS = (" Use TAMBEM quando a pessoa pedir ORIENTACAO DE METODO — como responder preco,"
            " como tratar objecao, o que falar com o lead, como conduzir a experimental e o Tour,"
            " como pedir indicacao, como retomar quem sumiu, como chamar ex-aluno de volta,"
            " \\\"o que eu respondo?\\\", \\\"como eu faco?\\\", \\\"o cliente disse que...\\\" —"
            " porque o metodo da LA esta escrito na base de conhecimento comercial.")


def carimbo():
    return datetime.datetime.now().strftime("%Y%m%dT%H%M%SZ")


def faz_backup(p):
    shutil.copy2(p, f"{p}.bak-{carimbo()}-antes-gatilho-base")


def soul(p, fonte=None):
    if fonte:
        atual = io.open(p, encoding="utf-8").read()
        # So sobrescreve se o alvo for o preambulo generico — nunca por cima de
        # uma persona que alguem escreveu.
        if "Nous Research" in atual and "Mila" not in atual:
            faz_backup(p)
            io.open(p, "w", encoding="utf-8", newline="\n").write(
                io.open(fonte, encoding="utf-8").read())
            print(f"  ok  SOUL sincronizado com producao: {p}")
        else:
            print(f"  --  SOUL de {p} ja tem persona propria, nao toquei")
    s = io.open(p, encoding="utf-8").read()
    if "A base de conhecimento: eu não invento método" in s:
        print(f"  --  regra da base ja esta em {p}")
        return
    faz_backup(p)
    io.open(p, "w", encoding="utf-8", newline="\n").write(s.rstrip() + REGRA_SOUL)
    print(f"  ok  regra da base no SOUL: {p}")


def descricao(p):
    s = io.open(p, encoding="utf-8").read()
    if "ORIENTACAO DE METODO" in s:
        print(f"  --  gatilho de metodo ja esta em {p}")
        return
    alvo = "Não usar para lead de fora (isso é o atendimento SDR).\""
    if s.count(alvo) != 1:
        print(f"  XX  ANCORA do description nao bateu em {p}", file=sys.stderr)
        raise SystemExit(1)
    faz_backup(p)
    io.open(p, "w", encoding="utf-8", newline="\n").write(
        s.replace(alvo, "Não usar para lead de fora (isso é o atendimento SDR)." + GATILHOS + "\"", 1))
    print(f"  ok  gatilho de metodo no description: {p}")


PROD = "/home/mila/.hermes/profiles/mila-consultor-readonly"
SHAD = "/home/mila/.hermes/profiles/mila-shadow"
soul(f"{PROD}/SOUL.md")
soul(f"{SHAD}/SOUL.md", fonte=f"{PROD}/SOUL.md")
for base in (PROD, SHAD):
    descricao(f"{base}/skills/mila-gestao/SKILL.md")
