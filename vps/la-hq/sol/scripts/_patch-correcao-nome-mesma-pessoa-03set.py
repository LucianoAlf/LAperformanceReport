#!/usr/bin/env python3
"""Patch idempotente: a Sol para de anunciar update que NAO houve na correcao de nome.

INCIDENTE (Mayra/CG, 03/09/2026 22:22-22:24, aluno Lucas Nunes):
  Jhon:  "PG pix parcela 09/2026 aluno Lucas Nunes de Souza - LA CG R$417,00"
  Sol:   card com ALUNO "Lucas Nunes de Salles" + "nao tenho certeza, confere o nome"
  Mayra: "Sol, o aluno e Lucas Nunes de Souza"
  Sol:   "Atualizei a pendencia com o aluno informado:" -> card IDENTICO (Salles)
  Mayra: "Sol, o nome do aluno e Lucas Nunes de Souza"
  Sol:   "Atualizei a pendencia com o aluno informado:" -> card IDENTICO (Salles)

CAUSA-RAIZ: no caminho de correcao tardia, `alvoP.aluno` recebe o nome que a
canonica devolveu, e o cabecalho e HARDCODED em "Atualizei a pendencia com o
aluno informado" — independentemente de algo ter mudado. Quando o nome ditado
resolve para o MESMO cadastro que ja estava no card, a Sol reenvia um card
identico afirmando ter atualizado. Quem corrigiu nao tem como distinguir "casei
seu nome com este cadastro" de "ignorei voce", repete, e o pagamento fica parado.

`_mesmaPessoa('Lucas Nunes de Salles','Lucas Nunes de Souza')` devolve TRUE
(primeiro nome igual + 'nunes' em comum), entao `_trocouAluno` e false e nem
divergencia era registrada. A pessoa casada estava CERTA — so existe um
"Lucas Nunes" ativo em CG, Teclado, R$ 417, parcela 09/2026 vence 05/09. O
defeito e a FRASE, nao o casamento.

⚠️ NAO cria gramatica nova de dialogo (compromisso vigente da frente V4). Muda
   apenas o CABECALHO da confirmacao, para descrever o que de fato aconteceu —
   mesma classe do "Lancei ✅" que anunciava gravacao inexistente.

⚠️ So dispara quando ha CONFLITO REAL de grafia: token significativo do nome
   ditado que nao existe no cadastro. "aluno: Lucas" contra "Lucas Nunes de
   Salles" e abreviacao, nao conflito — segue com o texto de sempre, senao a
   Sol viraria burocrata em toda correcao com nome curto.

Uso: python3 _patch-correcao-nome-mesma-pessoa-03set.py [--check]
Cria backup .bak-<ts>-before-correcao-nome antes de escrever.
"""
import sys, time, shutil

ALVO = "/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs"
CHECK = "--check" in sys.argv

src = open(ALVO, encoding="utf-8").read()
orig = src

if "_conflitoDeGrafiaAluno" in src:
    print("ja aplicado — nada a fazer")
    sys.exit(0)


def trocar(de, para, rotulo, esperado=1):
    global src
    n = src.count(de)
    assert n == esperado, f"{rotulo}: esperava {esperado} ocorrencia(s), achei {n}"
    src = src.replace(de, para)
    print(f"  ok {rotulo}")


# 1) helper puro, ao lado de _mesmaPessoa (fonte unica da regra de conflito)
trocar(
    "function _alunoRotulado(body) {",
    '''// Conflito REAL de grafia: token significativo do nome ditado que nao existe
// no cadastro. Serve para distinguir "voce escreveu o sobrenome diferente do
// que esta no sistema" (conflito) de "voce escreveu so o primeiro nome"
// (abreviacao). Conectivo e token de <=2 letras nao contam.
function _conflitoDeGrafiaAluno(ditado, cadastro) {
  const norm = (s) => _normConf(String(s || '')).replace(/[^a-z\\s]/g, ' ').replace(/\\s+/g, ' ').trim();
  const CONECTIVO = new Set(['de', 'da', 'do', 'dos', 'das', 'e', 'del', 'di']);
  const d = norm(ditado), c = norm(cadastro);
  if (!d || !c || d === c) return false;
  const tc = new Set(c.split(' '));
  return d.split(' ').some((p) => p.length > 2 && !CONECTIVO.has(p) && !tc.has(p));
}

function _alunoRotulado(body) {''',
    "_conflitoDeGrafiaAluno",
)

# 2) o cabecalho passa a descrever o que aconteceu
trocar(
    """          let texto = 'Atualizei a pendencia com o aluno informado:\\n\\n' + montarPreview({""",
    """          // 03/09 (Mayra/CG, Lucas Nunes): anunciar "Atualizei" reenviando o MESMO
          // nome e indistinguivel de ter ignorado quem corrigiu — ela repetiu duas
          // vezes e o pagamento ficou parado. Quando o nome ditado resolve para o
          // cadastro que ja estava no card E a grafia conflita, a Sol diz isso, mostra
          // o nome do sistema e devolve a saida (confirmar ou dar outro nome).
          const _grafiaConflita = !_trocouAluno && !!_alunoAntesDaCorrecao
            && _conflitoDeGrafiaAluno(nomeTardio, alvoP.aluno);
          if (_grafiaConflita) {
            log({ acao: 'correcao_nome_mesma_pessoa', chatId, ditado: nomeTardio, cadastro: alvoP.aluno });
          }
          const _cabecalhoCorrecao = _grafiaConflita
            ? ('E o mesmo cadastro que eu ja tinha aqui — no sistema ele esta como *'
               + alvoP.aluno + '*.\\nSe for ele, responde *pode*. Se for outra pessoa, me manda o nome completo.\\n'
               + '_(se o errado for o cadastro, da pra corrigir no Emusys)_\\n\\n')
            : 'Atualizei a pendencia com o aluno informado:\\n\\n';
          let texto = _cabecalhoCorrecao + montarPreview({""",
    "cabecalho honesto",
)

# 3) o log de resultado precisa distinguir os dois desfechos (hoje os dois
#    gravam `preview_aluno_corrigido` e o placar le como sucesso)
trocar(
    """          log({ acao: 'preview_aluno_corrigido', chatId, aluno: alvoP.aluno });
          return { acao: 'preview_aluno_corrigido', aluno: alvoP.aluno };""",
    """          log({ acao: 'preview_aluno_corrigido', chatId, aluno: alvoP.aluno, mesma_pessoa: _grafiaConflita || undefined });
          return { acao: 'preview_aluno_corrigido', aluno: alvoP.aluno, mesmaPessoa: _grafiaConflita || undefined };""",
    "log distingue desfecho",
)

assert src != orig
if CHECK:
    print("--check: patch valido, nada escrito")
    sys.exit(0)
bak = f"{ALVO}.bak-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-before-correcao-nome"
shutil.copy2(ALVO, bak)
open(ALVO, "w", encoding="utf-8").write(src)
print("aplicado. backup:", bak)
