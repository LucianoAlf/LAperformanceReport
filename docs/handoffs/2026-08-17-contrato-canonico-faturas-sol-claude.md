# Contrato canônico v4 — Faturas de Alunos, LA Report e Sol

**Data:** 17/08/2026
**Projeto Supabase:** ouqwbbermlzqqvtqwlul
**Fonte de verdade sincronizada:** Emusys → sync_run_items
**Estado:** banco e exportador publicados. A prova visual autenticada da tela permanece pendente nesta data.

## Decisão de produto

Há duas leituras, que não podem ser confundidas:

| Leitura | Quem usa | Universo |
|---|---|---|
| **Faturas de Alunos** | equipe operacional | ciclo completo: pagas, abertas, vencidas, a vencer, canceladas e reconciliação |
| **Cobrar agora D+2** | Sol, em modo sombra | abertas de alunos ativos, identidade exata, pelo menos dois dias em atraso e três competências recentes |

**Em atraso D+0** é informação financeira: venceu, aparece.
**Cobrar agora D+2** é fila operacional: passou pelos gates abaixo.

## Fonte única

### Interface de Faturas

O browser chama somente:

~~~
public.get_faturas_alunos_financeiro_v1(
  p_unidade_id uuid,
  p_competencia_inicio date,
  p_competencia_fim date,
  p_status text,
  p_curso_id bigint,
  p_forma_pagamento text,
  p_busca text,
  p_as_of_date date
) returns jsonb
~~~

É a fonte de /app/faturas. O browser não lê emusys_faturas, sync_run_items,
alunos ou Emusys diretamente.

### Carteira da Sol

A Sol chama, **somente no backend com service_role**:

~~~
public.get_inadimplencia_canonica(
  p_unidade_id uuid,
  p_as_of_date date
) returns jsonb
~~~

O retorno esperado é **schema v4**. Não usar sol_caixa_inadimplentes; ela é
histórica e não representa o novo fluxo. As RPCs de caixa abaixo permanecem
fora do escopo e não podem ser alteradas:

- sol_caixa_lancar_recebimento
- sol_caixa_abrir
- sol_caixa_fechar
- sol_caixa_casar_parcela

## Gate obrigatório da Sol

Antes de apresentar, exportar ou preparar abordagem, validar:

~~~
schema_version = 4
status IN ('ok', 'partial')
fonte = 'sync_run_items'
operational.collection_allowed = true
operational.collection_scope = 'confirmed_active_d2_3_competencias'
operational.consumer_must_apply_collection_grace = false
operational.block_reasons = []
policy.delinquency_rule = 'd_plus_2'
policy.collection_grace_days = 2
policy.student_scope =
  'exact_invoice_enrollment + aluno_ativo_atual; trancado, evadido e arquivado fora da carteira D+2'
freshness.fresh_until > agora
~~~

Qualquer falha: lista vazia, motivo auditado, nenhum fallback em cache,
emusys_faturas, flag booleano, nome de aluno ou sync próprio. Em partial, usar
apenas os items confirmados que a RPC publicou.

Cada item já é D+2, está entre mês atual e dois anteriores, tem status=aberta,
source_missing=false, pagamento nulo, identidade exata, matrícula atual ativa
e cadastro não arquivado. Não reaplicar D+2 no consumidor:
consumer_must_apply_collection_grace é false porque o canônico já fez o corte.

Antes de WhatsApp, a Sol usa somente contact_resolution_status=resolved,
preserva IDs exatos de fatura, matrícula e contrato e nunca junta por nome.

## Regras e reconciliação

- Trancado temporário, evadido, inativo e ex-aluno ficam fora de Cobrar agora D+2.
- Reingresso entra apenas com matrícula ativa atual e identidade Emusys comprovadas.
- A janela é de três competências, não 90 dias corridos.
- source_missing é “não observado na fotografia atual”; nunca é pagamento,
  não reduz saldo e não entra em cobrança ou total.
- Somente status=paga em sincronização válida confirma quitação.
- source_missing, identidade inválida e contato pendente ficam na
  **Reconciliação financeira** de /app/faturas. Não bloqueiam o subconjunto
  confirmado seguro nem são misturados à cobrança.

## Valores financeiros e forma de pagamento

| Campo | Significado |
|---|---|
| valor_com_desconto | original menos descontos fixo e condicional |
| valor_sem_desconto_condicional | original menos desconto fixo |
| valor_atualizado | valor sem desconto condicional + multa 2% + mora 1% ao mês pro rata |

~~~
multa = valor_sem_desconto_condicional × 0,02
mora = valor_sem_desconto_condicional × 0,01 × dias_atraso / 30
valor_atualizado = valor_sem_desconto_condicional + multa + mora
~~~

Para faturas pagas, a tela mostra o valor efetivamente pago. Para abertas ou
canceladas, a forma exibida é a forma prevista da matrícula. Sem dado:
**Forma não informada**, sem inferir boleto, Pix ou cartão.

O GET /faturas do Emusys documenta juros_e_multa dinâmico. Na sondagem
controlada de 17/08, três faturas vencidas retornaram zero nesse campo; por
isso o LA Report usa a fórmula contratual explícita, não apresenta esse zero
como valor autoritativo e mantém o fato registrado para acompanhamento.

## Frescor e sincronização

Uma única fila sincroniza competências. A Sol não cria cron, polling ou sync
paralelo.

| Recorte | Cadência | Frescor publicado |
|---|---:|---:|
| competência atual | 15 minutos | 30 minutos |
| dois meses anteriores | 60 minutos | 75 minutos |
| backlog antigo aberto/source_missing | 2 horas | 2 horas |

O worker é serial, persiste 429 com backoff e põe identificador inválido de
matrícula em validação/quarentena sem derrubar a coleta. A Edge
sync-faturas-emusys está ativa na versão 33. Atualizar agora usa essa mesma
fila.

## Evidência da reconciliação

Sincronizações controladas de junho, julho e agosto de 2026 foram comparadas
aos seis arquivos enviados pelo Emusys. Contagem e valor original em atraso
coincidiram exatamente:

| Unidade | Jun/2026 | Jul/2026 | Ago/2026 |
|---|---:|---:|---:|
| Campo Grande | 6 / R$ 2.682,00 | 8 / R$ 3.576,00 | 3 / R$ 1.341,00 |
| Recreio | 1 / R$ 480,00 | 1 / R$ 480,00 | 5 / R$ 2.390,87 |
| Barra | 0 / R$ 0,00 | 1 / R$ 397,00 | 18 / R$ 7.579,00 |

A prova ao vivo de agosto em Campo Grande também ficou item a item igual:
459 faturas no Emusys e 459 no snapshot, sem item exclusivo nem diferença nos
campos centrais.

## Prompt pronto para o Claude/Sol

~~~
Implemente apenas o consumidor da Sol para a carteira canônica v4 do LA Report.

Chame no backend (service_role) public.get_inadimplencia_canonica(unidade_id,
as_of_date). Não use sol_caixa_inadimplentes, emusys_faturas, flags de aluno,
cache de lista, sync próprio ou qualquer join por nome.

Aceite somente schema_version=4; status ok/partial; fonte=sync_run_items;
operational.collection_allowed=true;
collection_scope=confirmed_active_d2_3_competencias;
consumer_must_apply_collection_grace=false; block_reasons=[];
policy.delinquency_rule=d_plus_2; policy.collection_grace_days=2; e
freshness.fresh_until no futuro. Caso contrário, lista vazia e motivo auditado;
nunca faça fallback.

Use somente items retornados. Eles já são D+2, das três competências recentes,
de alunos ativos e identidade exata. Não aplique outra carência. Exclua da ação
todo item sem contact_resolution_status=resolved. Preserve
emusys_fatura_id/emusys_matricula_id/emusys_contrato_id. Não deduza pagamento
de source_missing: é reconciliação, nunca cobrança.

Exiba valor_com_desconto, valor_sem_desconto_condicional e valor_atualizado.
Não recalcule juros na Sol. Não altere sol_caixa_lancar_recebimento,
sol_caixa_abrir, sol_caixa_fechar ou sol_caixa_casar_parcela.

Mantenha modo sombra: pode listar, agrupar e auditar, mas não envia WhatsApp,
não liga cron de cobrança e não efetua baixa sem aprovação humana posterior e
comparação sombra verde nas três unidades.
~~~

## Fora desta etapa

- Cobrança de ex-alunos ou débitos fora das três competências: fluxo histórico
  separado, ainda a decidir.
- Envio automático de WhatsApp, baixa, negociação ou recebimento.
- Financeiro estratégico, contas a pagar e conciliação bancária.
