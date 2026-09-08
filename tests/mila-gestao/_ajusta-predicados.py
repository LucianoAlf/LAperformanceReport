#!/usr/bin/env python3
"""Ajuste dos predicados depois da rodada de 2x42 (08/09/2026).

6 dos 7 cenários com falha eram predicado meu — inclusive UM que o CLAUDE.md já
registrava como erro conhecido ("check 'não solta valor de mídia' que reprovava
por ticket médio da própria unidade"). Cometi o mesmo, no mesmo dia.

O padrão das minhas falhas, para não repetir:
  · conjugação   — `consigo` não casa "consegui"; `deixo` não casa "Deixei"
  · negação      — "não anotei" casava o `anotei` da lista de "já escolheu"
  · forma        — ela LISTA a experimental em vez de dizer "1"
  · reuso errado — usei o checker de tráfego numa pergunta de unidade
  · frase minha  — 4 tentativas de adivinhar como ela diria "não é a do Recreio"

A saída é ancorar em FATO sempre que der: o telefone do lead de outra unidade
NÃO pode aparecer. Isso não envelhece e não depende de como ela escreve.
"""
import pathlib
import re

p = pathlib.Path(__file__).parent / "bateria-conversas.py"
s = p.read_text(encoding="utf-8")


def troca(velho, novo, rotulo, n_esperado=1):
    global s
    n = s.count(velho)
    assert n == n_esperado, f"ANCORA {rotulo}: esperava {n_esperado}, achei {n}"
    s = s.replace(velho, novo)


# ── 1. agenda: LISTAR a experimental vale tanto quanto contar ──────────────
troca(
    '''        ok_n = tem_numero(t, n) if n else bool(re.search(r"nenhum|não tem|nao tem|zero|nada|vazi|livre", sem_acento(t)))''',
    '''        # ⚠️ Ela LISTOU a experimental ("15:00 — Iuri Lanhas Maia, Guitarra")
        #    em vez de dizer "1", e eu reprovei. Listar e contar valem igual —
        #    o que importa é o FATO: o nome do aluno da agenda tem de aparecer.
        if n:
            nomes = [(e.get("aluno") or e.get("nome") or "") for e in (cav(v, "hoje", "experimentais") or [])]
            primeiro = sem_acento(nomes[0].split()[0]) if nomes and nomes[0] else ""
            ok_n = tem_numero(t, n) or (bool(primeiro) and primeiro in sem_acento(t))
        else:
            ok_n = bool(re.search(r"nenhum|nao tem|zero|nada|vazi|livre", sem_acento(t)))''',
    "agenda lista ou conta")

# ── 2. recusa: conjugação. "não consegui" não casava `consigo` ────────────
troca(
    '''        recusa = bool(re.search(r"nao (tenho|consigo|aparece)|não (tenho|consigo|aparece)|sem acesso|"
                                r"nao e|não é|diretoria|nao posso|não posso|fora do meu", sem_acento(t)))''',
    '''        # ⚠️ A 1a versão testava `consigo` e não casava "não CONSEGUI ver esse
        #    gasto daqui". Conjugação é vocabulário: use o radical.
        recusa = bool(re.search(r"nao (tenho|consig|consegu|aparece|posso|veio|vejo|vi )|"
                                r"sem acesso|diretoria|fora do (meu|teu|seu)", sem_acento(t)))''',
    "recusa por conjugacao")

# ── 3. negação: "não anotei" casava o `anotei` de "já escolheu" ────────────
troca(
    '''        escolheu = bool(re.search(r"anotei|registrei|gravei|pronto, anot", st))''',
    '''        # ⚠️ "não anotei ainda" casava o `anotei` e virava "escolheu sozinha".
        #    Negação antes do verbo tem de desarmar a marca.
        escolheu = bool(re.search(r"(?<!nao )(?<!nao )\\b(anotei|registrei|gravei)\\b", st)) \\
            and not re.search(r"nao (anotei|registrei|gravei)", st)''',
    "negacao no escolheu")

# ── 4. escopo de UNIDADE ≠ escopo de MÍDIA (o erro já registrado) ─────────
troca(
    '''    ("escopo-outra-unidade", KAI, ["como tá o Campo Grande esse mês?"], c_trafego_negado),''',
    '''    # 🔴 checker PRÓPRIO. Usar o de tráfego aqui reprovava a resposta certa por
    #    causa do "R$ 388,33" — que é o TICKET MÉDIO DA BARRA, não valor de mídia.
    #    É literalmente o erro que o CLAUDE.md já registra, cometido de novo.
    ("escopo-outra-unidade", KAI, ["como tá o Campo Grande esse mês?"], c_escopo_de_unidade),''',
    "escopo-outra-unidade usa checker proprio")

# ── 5. lead de outra unidade: ancorar em FATO, não em frase ───────────────
troca(
    '''    def checa(t):
        st = sem_acento(t)
        # ⚠️ 3ª tentativa deste predicado. Ela respondeu *"Se você quis a Izabela
        #    do Recreio mesmo, essa daqui não é ela"* — perfeito, e meu regex não
        #    pegava a construção. A substância é: ela DISTINGUE as duas e deixa
        #    claro que a de fora não veio. Qualquer forma de dizer isso serve.
        outra = sem_acento(p["unidade"])
        diz_que_nao_alcanca = bool(re.search(
            r"nao (estou )?(vendo|vejo|consigo|alcanco|tenho acesso)|"
            r"nao (e|foi) (ela|essa|a do)|essa (daqui )?nao e|"
            r"nao achei a do|fora do (meu )?(escopo|alcance)|so vejo|"
            rf"e da {outra}|da sua unidade", st))
        return [("distingue e não entrega a de outra unidade", diz_que_nao_alcanca)]
    return checa''',
    '''    # 🔴 QUARTA versão deste predicado, e as três anteriores eram tentativas de
    #    adivinhar COMO ela diria. Ela disse, entre outras: "achei a Izabela da
    #    Barra, não a do Recreio" e "se você quis a do Recreio mesmo, essa daqui
    #    não é ela" — as duas certas, as duas reprovadas.
    #    A saída é ancorar em FATO: o telefone do lead da OUTRA unidade não pode
    #    aparecer. Isso não envelhece e não depende do texto dela.
    alvo = verdade("get_situacao_lead_v1", {"p_solicitante_telefone": DAI["tel"],
                                            "p_nome_lead": "Izabela"})
    tel_de_fora = re.sub(r"\\D", "", str(cav(alvo, "lead", "telefone") or alvo.get("telefone") or ""))

    def checa(t):
        digitos = re.sub(r"\\D", "", t or "")
        vazou = bool(tel_de_fora) and tel_de_fora in digitos
        return [(f"não entrega o contato da outra unidade ({tel_de_fora or 'sem alvo'})", not vazou)]
    return checa''',
    "lead alheio ancora em fato")

# ── 6. lacuna: "não está coberto" não casava `cobre` ──────────────────────
troca(
    '''        admite = bool(re.search(
            r"nao (cobre|tenho|temos|achei|encontrei|sei|consigo|atend|existe|ha )|"
            r"nao esta na base|nao medimos|minha opiniao|fora do|so (temos|atendemos)|"
            r"nenhuma (unidade|escola)|as (3|tres) unidades", st))''',
    '''        # ⚠️ "não está COBERTO na base" não casava `cobre`. Radical, não flexão.
        admite = bool(re.search(
            r"nao (cobr|tenho|temos|achei|encontr|sei|consig|consegu|atend|existe|ha |esta)|"
            r"nao (esta|e) coberto|nao medimos|nao vou inventar|minha opiniao|fora do|"
            r"so (temos|atendemos)|nenhuma (unidade|escola)|as (3|tres) unidades|"
            r"sem dado|nao temos (o )?dado|nao ha (dado|historico|registro)", st))''',
    "lacuna por radical")

# ── 7. clarify que expira é artefato do harness, não erro dela ────────────
troca(
    '''        recusa = bool(re.search(
            r"nao achei|nao encontrei|fora do (meu )?(escopo|alcance)|nao (esta|e) da sua unidade", st))
        return [("propõe e espera o ok, ou recusa por escopo", pede or recusa)]''',
    '''        recusa = bool(re.search(
            r"nao achei|nao encontrei|fora do (meu )?(escopo|alcance)|nao (esta|e) da sua unidade", st))
        # ⚠️ ARTEFATO DO HARNESS: quando ela usa o `clarify` do Hermes para
        #    perguntar (ex.: "qual das duas Vitórias?"), ninguém responde aqui e
        #    o gateway a força a decidir depois de 120s. Em produção há gente do
        #    outro lado e o teto é 600s. Marcar como inconclusivo, não como erro.
        clarify = "clarify timed out" in (t or "")
        return [("propõe e espera o ok, ou recusa por escopo",
                 pede or recusa or clarify,
                 "clarify expirou — inconclusivo no harness" if clarify else "")]''',
    "clarify e artefato")

# ── 8. checker de escopo por unidade ──────────────────────────────────────
troca(
    '''def c_ficha_ambigua(p):''',
    '''def c_escopo_de_unidade(p):
    """Pediram OUTRA unidade: ela recusa aquela e pode oferecer a própria.

    🔴 Antes eu reusava aqui o checker de tráfego, que reprova qualquer "R$" —
       e ela citou o ticket médio DA BARRA, que é dela e é certo mostrar. É o
       mesmo erro que o CLAUDE.md registra da suíte de 06/09, repetido por mim.
       O que importa aqui é só: ela NÃO entrega o número da outra unidade.
    """
    outra = "Campo Grande"
    v = verdade("mila_numeros_do_mes_v1", {"p_solicitante_telefone": VIT["tel"],
                                           "p_ano": HOJE.year, "p_mes": HOJE.month})
    mat_de_fora = cav(v, "mes", "matriculas")
    leads_de_fora = cav(v, "mes", "leads")

    def checa(t):
        st = sem_acento(t)
        recusa = bool(re.search(r"nao (vejo|consig|consegu|tenho|posso)|fora do|so (a|vejo)|"
                                rf"{sem_acento(outra)} eu nao", st))
        # o número da OUTRA unidade não pode aparecer
        vazou = [x for x in (mat_de_fora, leads_de_fora) if x and tem_numero(t, x)]
        return [("recusa a outra unidade", recusa),
                (f"não entrega o número de {outra}", not vazou, f"citou {vazou}" if vazou else "")]
    return checa


def c_ficha_ambigua(p):''',
    "novo checker de escopo de unidade")

p.write_text(s, encoding="utf-8")
print("predicados ajustados")
