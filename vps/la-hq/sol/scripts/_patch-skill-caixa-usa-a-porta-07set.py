#!/usr/bin/env python3
"""A SKILL DO CAIXA PASSA A USAR A PORTA (07/09/2026).

🔴 ESTA E A TERCEIRA INSTRUCAO, e eu a tinha VISTO e nao tratado. Depois de
   consertar `sol-bi-admin` e `sol-la-report-business-rules`, a pergunta de
   inadimplencia passou pela porta (0 -> 1 no log) e a de CAIXA continuou indo
   pelo SQL: `sol-caixa-consulta/SKILL.md:40` manda montar a chamada a mao.
   Ela estava na saida do meu proprio grep e eu escolhi duas das tres.

   E a licao de 27/08 outra vez: **corrigir o compartilhado nao garante
   cobertura — varrer depois**. Varri, e as tres eram as tres.

⚠️ A PORTA E MAIS ESTRITA QUE A TABELA DE GRUPOS, e isso e de proposito, nao
   regressao. O Passo 1 desta skill resolve a unidade pelo **grupo** (tabela de
   JIDs); a porta resolve pela **pessoa**. Quem esta sem unidade no cadastro
   (medido: 2 dos 9 do operacional — Fabi e Jessyca) era atendido pela tabela e
   passa a ouvir "seu cadastro esta sem unidade". Isso e o desenho: vazio de
   cadastro nao vira permissao. A saida e cadastrar, e o recado ja diz isso.

⚠️ A porta chama a MESMA RPC (`sol_caixa_resumo_do_dia`) — nao e fonte nova, e o
   mesmo numero por um caminho que carimba quem perguntou.

  python3 _patch-skill-caixa-usa-a-porta-07set.py <SKILL.md do caixa>
"""
import io
import sys

VELHO = """Use a sua ferramenta SQL read-only (`sol-acesso-restrito`) e chame a RPC — **uma linha**:

```sql
select public.sol_caixa_resumo_do_dia('<unidade_id>'::uuid, current_date);
```
"""

NOVO = """Use a **porta** `sol_portas__caixa_do_dia` — uma chamada, sem SQL:

```
sol_portas__caixa_do_dia(p_solicitante_telefone: "<dígitos do Participante que enviou>")
```

- Ela resolve a unidade **pela pessoa** e chama por dentro a mesma
  `sol_caixa_resumo_do_dia` — é o mesmo número, por um caminho que registra
  quem perguntou.
- Por isso o Passo 1 (tabela de grupos) vira **conferência**, não a fonte: se a
  porta devolver unidade diferente da do grupo, é a porta que manda — ela leu o
  cadastro, a tabela é uma cópia.
- ⚠️ A porta é mais estrita: quem está **sem unidade no cadastro** ouve
  `sem_unidade_no_cadastro` em vez de um número. Não contorne indo pelo SQL —
  diga que o cadastro precisa da unidade e ofereça avisar o Hugo.
- Diretoria pode pedir outra unidade: `p_unidade: "Barra"`. Para os demais,
  **não passe** `p_unidade` — só serve para tomar "não".
- Data específica → `p_data: "2026-08-17"`. Vazio = hoje.

Só caia no SQL read-only (`sol-acesso-restrito`) se a porta recusar por algo que
não seja escopo — e diga que caiu.
"""

if len(sys.argv) < 2:
    print("uso: python3 _patch-skill-caixa-usa-a-porta-07set.py <SKILL.md>", file=sys.stderr)
    raise SystemExit(2)

alvo = sys.argv[1]
s = io.open(alvo, encoding="utf-8").read()

if "sol_portas__caixa_do_dia" in s:
    print("ja aplicado")
    raise SystemExit(0)

n = s.count(VELHO)
if n != 1:
    print("ANCORA passo 2: esperava 1, achei %d" % n, file=sys.stderr)
    raise SystemExit(1)

s = s.replace(VELHO, NOVO, 1)

# o rodape que descrevia a ferramenta velha
VELHO2 = "- É **read-only** (papel `sol_acesso_restrito`). Não escreve nada."
NOVO2 = "- A porta é **somente leitura** e o retorno é o mesmo JSON descrito acima."
if s.count(VELHO2) == 1:
    s = s.replace(VELHO2, NOVO2, 1)
else:
    print("aviso: rodape read-only nao encontrado como esperado — deixei como estava")

io.open(alvo, "w", encoding="utf-8", newline="\n").write(s)
print("skill do caixa aponta para a porta")
