#!/usr/bin/env python3
"""A MILA PASSA A PUXAR O ASSUNTO DAS PENDENCIAS DE CADASTRO (06/09/2026).

Pergunta do Alf: "a Mila tambem tem que ser proativa em perguntar a questao do
cadastro do cliente — canal de origem, curso de interesse. Isso tambem ta?"

**Nao estava.** Conferido antes de responder:

  · `n_pendencias_de_hoje` = 0 para as TRES consultoras, mesmo com a Kailane
    tendo 9 leads sem canal de origem e 13 experimentais sem desfecho. O campo
    conta pendencia NASCIDA no dia, nao o acumulado.
  · a cutucada de hora em hora nao menciona pendencia em lugar nenhum.
  · nao existe regra de radar para "sem canal" ou "sem curso".

Ou seja: a Mila so falava de pendencia se a consultora perguntasse. E quem nao
sabe que pode perguntar, nao pergunta.

🔴 E ISSO QUEBRAVA O CONVITE DO DIA que eu tinha construido horas antes: a
   aplicabilidade do convite `registrar_pendencia` testava
   `n_pendencias_de_hoje`, que e sempre 0. O convite existia e **nunca ia
   disparar**. Feature que depende de um campo que ninguem conferiu nasce morta.

⚠️ O TELEFONE NAO ESTA NO PAYLOAD do briefing — conferido: o dict `consultora`
   tem so nome/apelido/unidade. Quem sabe com quem esta falando e o envelope,
   que recebe `c` (consultoras) ou `p` (lideranca). Por isso `_com_agenda`
   passa a receber `quem`.

⚠️ FONTE UNICA: os numeros vem de `radar_pendencias_comerciais_v1`, a MESMA que
   a tool `pendencias_comerciais` usa. Se o briefing contasse por conta propria,
   o numero da manha divergiria do que ela responde quando perguntam — e duas
   contagens da mesma coisa foi a causa-raiz das duplicatas de renovacao.

⚠️ SO NA MANHA. Pendencia de cadastro e trabalho de janela aberta; as 18:30
   vira cobranca sobre um dia que ja acabou.

  python3 _patch-proativa-pendencias-cadastro-06set.py <mila-proativa.py>
"""
import io
import sys

FUNCAO = '''
def pendencias_de_cadastro(telefone):
    """Os buracos de cadastro da consultora, da MESMA fonte que a tool
    `pendencias_comerciais` — ver o cabecalho do patch. Nunca derruba o
    briefing: erro aqui devolve None e ela fala normalmente."""
    if not telefone:
        return None
    try:
        r = rpc("radar_pendencias_comerciais_v1",
                {"p_solicitante_telefone": telefone, "p_amostra": 3}) or {}
        p = r.get("pendencias") or {}

        def bloco(chave):
            b = p.get(chave) or {}
            return {"total": b.get("total") or 0,
                    "exemplos": [x.get("nome") or x.get("nome_aluno")
                                 for x in (b.get("amostra") or [])][:3]}

        out = {"sem_canal_de_origem": bloco("lead_sem_canal_de_origem"),
               "sem_curso_de_interesse": bloco("lead_sem_curso_de_interesse"),
               "sem_motivo_da_nao_matricula": bloco("experimental_feita_sem_desfecho")}
        out["total"] = sum(v["total"] for v in out.values() if isinstance(v, dict))
        return out if out["total"] > 0 else None
    except Exception as e:  # noqa: BLE001
        log(f"pendencias de cadastro indisponiveis ({e}) — sigo sem elas")
        return None

'''

TROCAS = [
    # 1. a funcao nova, antes do helper
    ("def _com_agenda(dados):",
     FUNCAO.strip() + "\n\n\ndef _com_agenda(dados, quem=None):",
     "funcao + assinatura de _com_agenda"),

    # 2. o bloco da manha usa `quem` e alimenta o convite
    ('''        if dados.get("tipo") == "manha":
            c = convite_do_dia(dados)
            if c:
                d["convite_do_dia"] = c''',
     '''        if dados.get("tipo") == "manha":
            pend = pendencias_de_cadastro((quem or {}).get("telefone"))
            if pend:
                d["pendencias_de_cadastro"] = pend
                dados = d          # o convite precisa ENXERGAR a pendencia
            c = convite_do_dia(dados)
            if c:
                d["convite_do_dia"] = c''',
     "bloco da manha"),

    # 3. a aplicabilidade que testava campo sempre zero
    ('''    ("registrar_pendencia",
     lambda d: d.get("n_pendencias_de_hoje") or None,
     "ofereca registrar no LA Report o que ela souber de cabeca sobre os "
     "{ctx} cadastros incompletos — canal de origem, curso, motivo de perda"),''',
     '''    # ⚠️ Olhava `n_pendencias_de_hoje`, que e SEMPRE 0 (conta pendencia nascida
    #    no dia, nao o acumulado). O convite existia e nunca disparava.
    ("registrar_pendencia",
     lambda d: (d.get("pendencias_de_cadastro") or {}).get("total") or None,
     "ofereca preencher os {ctx} cadastros incompletos que ela resolve FALANDO "
     "com voce — de onde o lead veio, que instrumento quer, por que nao fechou. "
     "Cite um nome de `pendencias_de_cadastro` para ser concreta"),''',
     "convite registrar_pendencia"),
]

CHAMADA = "json.dumps(_com_agenda(dados), ensure_ascii=False)"

PEDIDO = (
    "📋 SE VIER `pendencias_de_cadastro`, cite em UMA linha, com um nome de exemplo, e "
    "ofereca preencher na hora — \\\"o Fulano ta sem canal de origem, lembra de onde ele "
    "veio? eu registro\\\". Nunca liste todos: um nome e o numero bastam. Sao buracos que "
    "ela resolve falando com voce, em segundos, sem abrir sistema nenhum.\\n"
)

if len(sys.argv) < 2:
    print("uso: python3 _patch-proativa-pendencias-cadastro-06set.py <mila-proativa.py>",
          file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "def pendencias_de_cadastro(" in s:
    print("a proativa ja puxa pendencia de cadastro — nada a fazer")
    raise SystemExit(0)

for de, para, rotulo in TROCAS:
    if s.count(de) != 1:
        print(f"ANCORA {rotulo}: esperava 1, achei {s.count(de)}", file=sys.stderr)
        raise SystemExit(1)
    s = s.replace(de, para, 1)
    print(f"  ok  {rotulo}")

# 4. os DOIS envelopes repassam quem esta falando: `p` na lideranca, `c` nas
#    consultoras. A ordem importa — a lideranca aparece primeiro no arquivo.
if s.count(CHAMADA) != 2:
    print(f"ANCORA das chamadas de _com_agenda: esperava 2, achei {s.count(CHAMADA)}",
          file=sys.stderr)
    raise SystemExit(1)
s = s.replace(CHAMADA, "json.dumps(_com_agenda(dados, p), ensure_ascii=False)", 1)
s = s.replace(CHAMADA, "json.dumps(_com_agenda(dados, c), ensure_ascii=False)", 1)
print("  ok  os dois envelopes repassam quem esta falando")

ANC_PEDIDO = "🔴 SE VIER `convite_do_dia`"
if s.count(ANC_PEDIDO) == 1:
    s = s.replace(ANC_PEDIDO, PEDIDO + ANC_PEDIDO, 1)
    print("  ok  o pedido manda citar a pendencia")
else:
    print("AVISO: nao achei a ancora do pedido — o campo vai no JSON mesmo assim",
          file=sys.stderr)

io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print(f"\npendencia de cadastro acrescentada em {alvo}")
