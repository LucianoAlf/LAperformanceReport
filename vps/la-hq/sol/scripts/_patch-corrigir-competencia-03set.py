#!/usr/bin/env python3
"""Patch idempotente: a Sol passa a entender correcao de COMPETENCIA.

INCIDENTE (Mayra/CG, 03/09/2026 20:37-20:38, aluno Lucas Nunes):
  texto  "PG pix parcela 09/2026 aluno Lucas Nunes de Souza - LA CG R$417,00"
  Sol    card com FATURA "Parcela 10/2026 ... vence 05/10"   <- competencia errada
  Mayra  "Sol, a parcela e 09/2026"
  Sol    "Nao entendi essa 🤔 ... escreve aluno: Nome Completo para eu corrigir"

CAUSA-RAIZ (duas, somadas):

(a) O bloco de correcao tardia colhe o VALOR declarado no texto humano
    (`extrairValor(txt)`, adicionado em 31/08 pelo caso do OCR de R$387) mas
    NAO colhe a COMPETENCIA — ela so e' herdada da pendencia
    (`let competencia = alvoP.competencia`). Assimetria pura: o humano podia
    corrigir o valor pelo texto e nao a competencia.

(b) O bloco inteiro so roda `if (nomeTardio && alvoP)` — exige que o humano
    declare um NOME. "a parcela e 09/2026" nao tem nome, entao nem entrava.

E o fallback LLM tambem nao alcancava: `classificarCorrecaoPendencia` tem as
intencoes corrigir_aluno|categoria|valor|forma|sem_aluno|descartar|aprovar|nada
— **nao existe corrigir_competencia, nem campo competencia na saida**. O
classificador literalmente nao tinha como expressar o que a Mayra disse.

⚠️ POR QUE A COMPETENCIA SAIU ERRADA (nao foi regressao de codigo): as 19:22 a
   fatura 09/2026 estava `aberta` e a Sol escolheu ela, certo. A ADM baixou o
   pagamento no Emusys, e o espelho viu as 20:33:26 — 4 min antes do card. No
   instante do card a 09 ja constava paga mas **sem `valor_pago` propagado**,
   entao ela nao casava em nenhum ramo da cascata e a unica com valor 417 era a
   10/2026 -> ramo `valor_exato` -> competencia do mes seguinte. Minutos depois
   a RPC ja devolve a 09/2026 corretamente. E uma JANELA DE PROPAGACAO, e o
   conserto de verdade e' o humano poder dizer a competencia — que e' este patch.

O QUE MUDA (nenhuma gramatica nova de dialogo — compromisso vigente da V4):

  1. `_competenciaDitada`: o bloco de correcao passa a colher a competencia do
     texto humano com `extrairCompetenciaTexto`, do mesmo jeito que ja colhe o
     valor. Declaracao humana VENCE a fatura casada: se a canonica devolver
     outra competencia, o vinculo de fatura e' solto (o lancamento sai sem
     vinculo, como na contestacao de fatura) em vez de gravar a fatura errada.
  2. `classificarCorrecaoPendencia` ganha a intencao `corrigir_competencia` e o
     campo `competencia` na saida — o fallback LLM passa a ter como expressar
     construcao inedita ("e do mes passado", "essa e a de setembro").
  3. `tratarNaoEntendida` traduz a intencao para uma frase que a gramatica JA
     entende: `parcela MM/AAAA aluno: <nome que ja esta no card>`. Zero regex
     nova. ⚠️ A COMPETENCIA VEM ANTES DO ROTULO: com `aluno: Nome parcela
     MM/AAAA` o captador de nome devolve "Lucas Nunes de Salles parcela" — a
     classe de caracteres dele nao aceita digito, entao ele para no "09" e deixa
     a palavra colada. O teste pegou isso antes de ir para producao.

Uso: python3 _patch-corrigir-competencia-03set.py [--check]
Cria backup .bak-<ts>-before-competencia antes de escrever.
"""
import sys, time, shutil

ALVO = "/home/sol/.hermes/profiles/sol/caixa-ingestao/caixa-financeiro.cjs"
CHECK = "--check" in sys.argv

src = open(ALVO, encoding="utf-8").read()
orig = src

if "_competenciaDitada" in src:
    print("ja aplicado — nada a fazer")
    sys.exit(0)


def trocar(de, para, rotulo, esperado=1):
    global src
    n = src.count(de)
    assert n == esperado, f"{rotulo}: esperava {esperado} ocorrencia(s), achei {n}"
    src = src.replace(de, para)
    print(f"  ok {rotulo}")


# ── 1) colher a competencia declarada, simetrico ao valor ────────────────────
trocar(
    """          {
            const _vTexto = extrairValor(txt);
            if (_vTexto && Math.abs((alvoP.valor || 0) - _vTexto) >= 0.01) {
              log({ acao: 'valor_do_texto_na_correcao', chatId, de: alvoP.valor || null, para: _vTexto });
              alvoP.valor = _vTexto;
            }
          }""",
    """          {
            const _vTexto = extrairValor(txt);
            if (_vTexto && Math.abs((alvoP.valor || 0) - _vTexto) >= 0.01) {
              log({ acao: 'valor_do_texto_na_correcao', chatId, de: alvoP.valor || null, para: _vTexto });
              alvoP.valor = _vTexto;
            }
          }
          // 03/09 (Mayra/CG): o humano podia corrigir o VALOR pelo texto e nao a
          // COMPETENCIA — ela so era herdada da pendencia. Assimetria pura, e a
          // Mayra caiu nela dizendo "a parcela e 09/2026" enquanto o card trazia
          // 10/2026 (janela de propagacao da baixa no Emusys).
          let _competenciaDitada = null;
          {
            const _cTexto = extrairCompetenciaTexto(txt);
            if (_cTexto && _cTexto !== alvoP.competencia) {
              log({ acao: 'competencia_do_texto_na_correcao', chatId, de: alvoP.competencia || null, para: _cTexto });
              _competenciaDitada = _cTexto;
              alvoP.competencia = _cTexto;
            }
          }""",
    "colhe competencia do texto",
)

# ── 2) declaracao humana vence a fatura casada ───────────────────────────────
trocar(
    """              if (c.parcela && querParcela) {
                parcela = c.parcela;
                if (c.parcela.competencia) competencia = c.parcela.competencia;
              }""",
    """              if (c.parcela && querParcela) {
                // Competencia DITADA pelo humano vence a da fatura casada. Se a
                // canonica trouxe outra, soltamos o vinculo em vez de gravar a
                // fatura errada — mesma politica da contestacao de fatura: sujar
                // a carteira do aluno e' pior que lancar sem vinculo.
                const _compCanonica = c.parcela.competencia || null;
                if (_competenciaDitada && _compCanonica && _compCanonica !== _competenciaDitada) {
                  log({ acao: 'competencia_ditada_vence_fatura', chatId,
                        fatura: _compCanonica, ditada: _competenciaDitada });
                  parcela = null;
                  canonica = null;
                  competencia = _competenciaDitada;
                } else {
                  parcela = c.parcela;
                  if (_compCanonica) competencia = _competenciaDitada || _compCanonica;
                }
              }""",
    "competencia ditada vence a fatura",
)

# ── 3) o classificador LLM ganha corrigir_competencia ────────────────────────
trocar(
    """      + '{"intencao":"corrigir_aluno|corrigir_categoria|corrigir_valor|corrigir_forma|sem_aluno|descartar|aprovar|nada",'
      + '"aluno_nome":null,"categoria":null,"valor":null,"forma":null,"entidade":null}. '""",
    """      + '{"intencao":"corrigir_aluno|corrigir_categoria|corrigir_valor|corrigir_forma|corrigir_competencia|sem_aluno|descartar|aprovar|nada",'
      + '"aluno_nome":null,"categoria":null,"valor":null,"forma":null,"competencia":null,"entidade":null}. '""",
    "schema do LLM com competencia",
)
trocar(
    """      + '"nao e esse aluno, e o Joao Silva" => corrigir_aluno; "isso e venda" => corrigir_categoria; '
      + '"foi no dinheiro" => corrigir_forma.\\n\\nMENSAGEM:\\n' + t.slice(0, 800);""",
    """      + '"nao e esse aluno, e o Joao Silva" => corrigir_aluno; "isso e venda" => corrigir_categoria; '
      + '"foi no dinheiro" => corrigir_forma; '
      + '"a parcela e 09/2026" ou "essa e a de setembro" => corrigir_competencia com competencia "09/2026". '
      + 'competencia sempre no formato MM/AAAA.\\n\\nMENSAGEM:\\n' + t.slice(0, 800);""",
    "exemplo de competencia no prompt",
)
trocar(
    """        const intencoes = ['corrigir_aluno', 'corrigir_categoria', 'corrigir_valor', 'corrigir_forma', 'sem_aluno', 'descartar', 'aprovar', 'nada'];""",
    """        const intencoes = ['corrigir_aluno', 'corrigir_categoria', 'corrigir_valor', 'corrigir_forma', 'corrigir_competencia', 'sem_aluno', 'descartar', 'aprovar', 'nada'];""",
    "intencao aceita",
)
trocar(
    """          forma: (o.forma && String(o.forma).toLowerCase().trim()) || null,
          entidade: (o.entidade && String(o.entidade).trim()) || null,""",
    """          forma: (o.forma && String(o.forma).toLowerCase().trim()) || null,
          // normaliza aqui: o modelo devolve "09/2026", "9/26", "setembro"...
          competencia: extrairCompetenciaTexto(String(o.competencia || '')) || null,
          entidade: (o.entidade && String(o.entidade).trim()) || null,""",
    "competencia normalizada na saida",
)

# ── 4) a intencao vira frase que a gramatica JA entende ──────────────────────
trocar(
    """      else if (cls.intencao === 'corrigir_forma' && cls.forma) sintetico = 'a forma é ' + cls.forma;""",
    """      else if (cls.intencao === 'corrigir_forma' && cls.forma) sintetico = 'a forma é ' + cls.forma;
      // A gramatica de correcao exige um NOME para entrar no bloco. Reusamos o
      // nome que JA esta no card e anexamos a competencia — `_limparAlunoRotulado`
      // corta o sufixo "parcela ..." do nome, e a competencia e' colhida do mesmo
      // texto pelo passo 1. Nenhuma regex nova.
      else if (cls.intencao === 'corrigir_competencia' && cls.competencia) {
        const _alvoNome = (arrP.find((p) => p.aluno) || {}).aluno || null;
        // ⚠️ A competencia vem ANTES do rotulo. Com `aluno: Nome parcela MM/AAAA`
        // o captador de nome engole o "parcela" (medido: devolvia "Lucas Nunes
        // de Salles parcela") — a classe de caracteres dele nao aceita digito,
        // entao ele para no "09" e deixa a palavra colada no nome.
        sintetico = _alvoNome
          ? ('parcela ' + cls.competencia + ' aluno: ' + _alvoNome)
          : null;
        if (!sintetico) {
          await sendFn(chatId, 'Entendi que a competência é ' + cls.competencia
            + ' — mas ainda não sei de qual aluno é. Me manda *aluno: Nome Completo* citando o card.');
          return { tratou: true, acao: 'fallback_llm_pede_aluno_p_competencia', intencao: cls.intencao };
        }
      }""",
    "traducao para frase canonica",
)

assert src != orig
compile("", "<x>", "exec")  # no-op, sintaxe JS e' checada com node --check
if CHECK:
    print("--check: patch valido, nada escrito")
    sys.exit(0)
bak = f"{ALVO}.bak-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}-before-competencia"
shutil.copy2(ALVO, bak)
open(ALVO, "w", encoding="utf-8").write(src)
print("aplicado. backup:", bak)
