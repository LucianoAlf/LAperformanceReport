# Handoff final — inadimplência canônica para a Sol

> **Histórico, substituído.** Não use este contrato v3 nem
> `sol_caixa_inadimplentes` em integrações novas. A versão vigente é o
> [contrato canônico v4](2026-08-17-contrato-canonico-faturas-sol-claude.md).

Data: 16/08/2026
Projeto Supabase: `ouqwbbermlzqqvtqwlul`
Backend publicado: `2cd9147e`
Frontend publicado: `35aaf3da`

## Contrato definitivo

- Verdade financeira D+0: `public.get_inadimplencia_canonica(uuid, date)`.
- Lista operacional D+2 da Sol: `public.sol_caixa_inadimplentes(...)`.
- Página operacional do LA Report: `/app/faturas`.
- A Sol é consumidora da leitura canônica; não possui sync próprio.
- As RPCs de caixa `sol_caixa_lancar_recebimento`, `sol_caixa_abrir`,
  `sol_caixa_fechar` e `sol_caixa_casar_parcela` não foram alteradas.

### Fonte e universo

Entram na leitura canônica somente faturas que atendem simultaneamente a:

1. competência no mês corrente ou nos dois meses anteriores;
2. `status = 'aberta'`;
3. vencimento anterior à data de corte;
4. `source_missing = false`;
5. unidade, matrícula e pessoa identificadas de forma exata;
6. matrícula atual com estado Emusys `ativa` na mesma unidade;
7. cadastro não arquivado.

Alunos `trancada`, `evadido`, `inativa` e ex-alunos sem matrícula ativa ficam
fora da lista principal. Eles não são apagados: permanecem disponíveis para a
camada futura de histórico/reconciliação. Reingresso conta como aluno atual
somente quando a matrícula atual ativa e a identidade Emusys estão comprovadas.

`source_missing` significa apenas “não observado na consulta fresca da origem”.
Nunca significa pagamento. Só `status = 'paga'` em observação válida confirma
pagamento.

### Gate de segurança

Uma leitura pode ser usada somente quando:

```text
status IN ('ok', 'partial')
AND operational.collection_allowed = true
AND operational.collection_scope = 'confirmed_only'
AND freshness.fresh_until ainda não expirou
```

Em `partial`, somente `items` confirmados estão liberados. Os blocos de
`source_missing`, identidade inválida, validação e contato pendente são
reconciliação e não entram nos totais nem em mensagens.

Em `stale`, `incomplete`, `error`, `collection_allowed=false` ou
`collection_scope='blocked'`, a Sol deve retornar lista vazia, registrar o
bloqueio e não fazer fallback.

## RPC operacional da Sol

```sql
public.sol_caixa_inadimplentes(
  p_unidade_id uuid,
  p_carencia_dias int default 2,
  p_multa_pct numeric default 0.02,
  p_mora_pct_mes numeric default 0.01,
  p_grave_dias int default 30,
  p_critico_dias int default 40
) returns jsonb
```

A execução é exclusiva de `service_role` e deve ocorrer somente no backend.
Nenhuma chave pode ir para navegador, log, URL, mensagem ou prompt.

A RPC já:

- chama `get_inadimplencia_canonica`;
- aplica carência D+2;
- exclui contato não resolvido;
- agrega uma ação por pessoa e unidade;
- preserva todas as faturas e matrículas exatas da pessoa;
- usa os valores original e atualizado publicados pelo canônico.

Nunca reconstruir identidade por nome, telefone, posição, curso ou
`emusys_student_id`. Use somente `aluno_id_canonico`, `contato`,
`emusys_matricula_ids` e `faturas` retornados pela RPC.

## Regra de valor

O canônico publica o valor atualizado por fatura, arredondado em duas casas:

```text
valor_original × (1 + 0,02 + 0,01 × dias_atraso / 30)
```

A parcela vencida perdeu o desconto condicional. O consumidor não deve
recalcular juros. O campo vivo `juros_e_multa` do Emusys ficou em zero nos
probes de 16/08/2026, apesar da documentação dizer que seria dinâmico; por isso
o contrato publicado continua sendo a fonte operacional até nova reconciliação
formal.

## Evidência validada em produção

Leitura de 16/08/2026, com três competências frescas e
`collection_allowed=true`. Os timestamps são evidência daquele gate, não
autorização permanente: toda execução precisa validar o frescor atual.

| Unidade | D+0 faturas / matrículas | Original | Atualizado | Sol D+2 pessoas | Original D+2 | Atualizado D+2 |
|---|---:|---:|---:|---:|---:|---:|
| Campo Grande | 15 / 11 | R$ 6.705,00 | R$ 6.910,14 | 11 | R$ 6.705,00 | R$ 6.910,14 |
| Barra | 19 / 18 | R$ 7.976,00 | R$ 8.156,85 | 15 | R$ 6.629,00 | R$ 6.782,46 |
| Recreio | 4 / 4 | R$ 1.910,87 | R$ 1.954,03 | 3 | R$ 1.420,00 | R$ 1.452,36 |

No Recreio existe uma fatura confirmada de R$ 490,87, matrícula Emusys `645`,
sem contato local unívoco. Ela aparece na visão financeira D+0, mas fica fora
da lista da Sol até o vínculo ser resolvido. Isso explica 4 matrículas no
financeiro e 3 pessoas acionáveis na Sol.

Totais visuais consolidados na página:

- 38 faturas confirmadas D+0;
- 33 matrículas;
- R$ 16.591,87 original;
- R$ 17.021,02 atualizado;
- 35 faturas D+2, agrupadas em 30 pessoas elegíveis;
- 1 contato pendente, fora de qualquer ação.

Confronto sem juros com os XLSX oficiais:

| Unidade | Competência | Emusys | Canônico ativo | Explicação |
|---|---:|---:|---:|---|
| Campo Grande | 06/2026 | 6 / R$ 2.682,00 | 4 / R$ 1.788,00 | 2 evadidos excluídos |
| Campo Grande | 07/2026 | 8 / R$ 3.576,00 | 8 / R$ 3.576,00 | bateu |
| Campo Grande | 08/2026 | 3 / R$ 1.341,00 | 3 / R$ 1.341,00 | bateu |
| Recreio | 06/2026 | 1 / R$ 480,00 | 0 | Cherley evadido |
| Recreio | 07/2026 | 1 / R$ 480,00 | 0 | Ísis evadida |
| Recreio | 08/2026 | 5 / R$ 2.390,87 | 4 / R$ 1.910,87 | Ísis evadida |
| Barra | 06/2026 | 0 | 0 | sem registros |
| Barra | 07/2026 | 1 / R$ 397,00 | 1 / R$ 397,00 | bateu |
| Barra | 08/2026 | 18 / R$ 7.579,00 | 18 / R$ 7.579,00 | bateu |

## Prompt pronto para o Claude

```text
Claude, conecte a Sol exclusivamente à RPC
public.sol_caixa_inadimplentes da instância Supabase
ouqwbbermlzqqvtqwlul, somente no backend com service_role.

Não crie sync próprio e não leia sync_run_items, emusys_faturas,
inadimplente_emusys, status_pagamento ou qualquer view antiga. Não altere
sol_caixa_lancar_recebimento, sol_caixa_abrir, sol_caixa_fechar nem
sol_caixa_casar_parcela.

Para cada unidade, chame:
sol_caixa_inadimplentes(unidade_id, 2, 0.02, 0.01, 30, 40).

Só use o array alunos quando status estiver em ok|partial,
collection_allowed=true, collection_scope='confirmed_only' e fresh_until ainda
estiver válido. Em stale, incomplete, error, bloqueio ou expiração, não envie
nada, não use cache antigo e não faça fallback. Solicite atualização pelo fluxo
oficial do LA Report; a Sol não dispara o Emusys diretamente.

Use somente aluno_id_canonico e contato publicados. Não case pessoas por nome,
telefone, student_id, curso ou ordenação. Preserve emusys_matricula_ids e o
array faturas na auditoria. A RPC já aplica D+2, exclui alunos trancados,
evadidos/inativos, ex-alunos e contatos não resolvidos, agrega uma ação por
pessoa/unidade e publica valor_atualizado. Não recalcule juros.

Antes de ligar qualquer envio, rode em modo sombra nas três unidades: grave o
payload e o timestamp, valide os gates, compare os totais acima e mostre ao Alf
as pessoas/faturas que seriam acionadas. O teste não pode enviar WhatsApp,
e-mail nem alterar caixa. Só ative o cron de cobrança após aprovação explícita
desse modo sombra.
```

## Página operacional

A página `/app/faturas` está publicada no LA Report e usa apenas
`get_inadimplencia_canonica`. Ela mostra confirmados D+0, elegibilidade D+2,
valores, frescor, reconciliação e detalhe por fatura. Não executa cobrança nem
mutação financeira.

Especificação e plano:

- `docs/superpowers/specs/2026-08-16-faturas-alunos-a-c-design.md`;
- `docs/superpowers/plans/2026-08-16-faturas-alunos-a-c.md`.
