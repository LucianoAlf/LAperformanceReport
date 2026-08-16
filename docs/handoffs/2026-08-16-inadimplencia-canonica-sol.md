# Handoff — inadimplência canônica para a Sol

Data: 16/08/2026
Projeto Supabase: `ouqwbbermlzqqvtqwlul`
Commit publicado em `main`: `8dafb2d0`

## Resultado publicado

- A verdade financeira D+0 está em `get_inadimplencia_canonica`.
- A lista operacional da Sol está em `sol_caixa_inadimplentes` e aplica D+2.
- A Sol não dispara sync próprio e não lê `sync_run_items`, `emusys_faturas`
  nem `inadimplente_emusys` diretamente.
- `partial + collection_allowed=true + collection_scope=confirmed_only` é uma
  liberação segura: somente os itens confirmados podem ser usados; quarentenas
  continuam visíveis separadamente.
- `stale`, `incomplete`, `error` ou `collection_allowed=false` bloqueiam toda
  ação. Não existe fallback por nome, student ID, snapshot antigo ou flag.
- Nenhum cron de cobrança nem mensagem automática foi ativado neste rollout.

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

Permissão: somente `service_role`. A chave nunca pode ir para navegador,
mensagem, log ou prompt.

Os três parâmetros de régua financeira são contrato fixo. A RPC rejeita
qualquer chamada com carência diferente de 2, multa diferente de 2% ou mora
diferente de 1% ao mês.

### Regra de consumo

Pode usar `alunos` somente quando:

```text
status IN ('ok', 'partial')
AND collection_allowed = true
AND collection_scope = 'confirmed_only'
```

Cada linha de `alunos` já é uma única ação por pessoa e unidade. Quando a mesma
pessoa tem mais de uma matrícula devedora, a RPC agrega a pessoa uma vez e
preserva os vínculos exatos em `emusys_matricula_ids` e `faturas`.

Campos principais por pessoa:

- `aluno_id_canonico`, `unidade_id`, `nome`, `curso`, `contato`;
- `emusys_matricula_ids`;
- `faturas`, com `canonical_fatura_id`, `emusys_fatura_id`,
  `emusys_matricula_id`, `emusys_contrato_id`, competência, vencimento, dias e
  valores;
- `parcelas`, `meses`, `dias`, `mais_antiga`;
- `valor_original`, `valor_atualizado`, `faixa`.

Nunca reconstruir identidade por nome, telefone, ordenação local ou
`emusys_student_id`. O único contato permitido é o publicado em
`aluno_id_canonico`/`contato` pela RPC.

## Regras de negócio fechadas

- Janela: mês atual e dois meses anteriores.
- Verdade financeira: fatura `aberta`, vencimento anterior a hoje,
  `source_missing=false`.
- Cobrança amigável da Sol: somente a partir de D+2.
- Pessoa atual: possui alguma matrícula atual `ativa` ou `trancada` na mesma
  unidade. Trancamento temporário continua financeiramente responsável.
- Ex-aluno: não possui nenhuma matrícula atual ativa ou trancada; fica fora
  desta lista mesmo que tenha dívida antiga.
- Reingresso conta como aluno atual. A dívida exata da matrícula anterior pode
  acompanhá-lo quando matrícula, unidade e pessoa estão comprovadas.
- `source_missing` significa “não confirmado na origem”, nunca “pago”.
- IDs opcionais inválidos e contato ambíguo ficam em quarentena e não derrubam
  os itens seguros.
- Valor atualizado por fatura:

```text
valor_original × (1 + 0,02 + 0,01 × dias_atraso / 30)
```

O desconto condicional já foi perdido. O arredondamento ocorre por fatura em
duas casas.

## Confirmações do ciclo de vida Emusys

- A OpenAPI versionada no repositório é a v1.4.0 e confirma os estados
  `ativa|inativa|trancada`, `trancamento_ativo` e
  `motivo_inativa=interrompida|concluida`. O anexo
  `api_emusys (2).json` é um snapshot anterior, v1.2.2; por isso ele não
  contém esses campos nem `/crm/aniversariantes`.
- Em produção, a projeção v1.3.1 tinha 14 matrículas `trancada` na auditoria
  de 16/08/2026. Para elas, `entra_financeiro_ativo=false` e
  `eh_trancamento_atual=true`.
- Essa separação é intencional: `entra_financeiro_ativo` continua sendo o
  denominador de aluno ativo dos KPIs. O radar de inadimplência acrescenta
  explicitamente `eh_trancamento_atual`, incluindo o trancado na cobrança sem
  transformá-lo em ativo pedagógico ou em pagante do MRR.
- O papel atual da pessoa vem de `GET /matriculas`, por unidade e identidade
  Emusys. Estado bruto atual `ativa|trancada` prevalece sobre `data_saida`
  histórica; `data_saida IS NULL` existe apenas no fallback sem estado bruto.
  A auditoria encontrou três linhas atuais com data de saída histórica, o caso
  que representa reingresso e que não pode ser excluído.
- `alunos.is_ex_aluno` e `/crm/aniversariantes` não participam da autorização
  de cobrança. O primeiro é um rótulo local sujeito a defasagem; o segundo é
  orientado a aniversários. O papel `aluno|ex_aluno` desse endpoint pode servir
  como reconciliação, mas nunca como uma segunda fonte operacional paralela.

## Gate real executado

Relatórios oficiais do Emusys, sem juros:

| Competência | Emusys CG | Canônico CG | Explicação |
|---|---:|---:|---|
| 06/2026 | 6 / R$ 2.682,00 | 4 / R$ 1.788,00 | 2 ex-alunos excluídos |
| 07/2026 | 8 / R$ 3.576,00 | 8 / R$ 3.576,00 | coincidência integral |
| 08/2026 | 3 / R$ 1.341,00 | 3 / R$ 1.341,00 | coincidência integral |

O probe read-only de CG/agosto conferiu item a item:

- Brenda Pereira Dias — fatura `45123`, matrícula `2460`, R$ 447,00;
- Francisco Adilson Costa Ribeiro — fatura `46232`, matrícula `2506`,
  R$ 447,00;
- Renan de Souza Corrêa — fatura `46815`, matrícula `2249`, R$ 447,00.

Os três vencimentos são 05/08/2026 e os cursos coincidem com o relatório.

Snapshots publicados:

- agosto: `5f13edb3-e713-41e1-80b6-87c5043e4b9f`;
- julho: `f6b12a40-d7f2-4d11-87fd-8f8f87c9e50e`;
- junho: `5ec95d35-2c4d-4fae-b967-f869404fd3e8`.

Todos terminaram `succeeded`, `snapshot_complete=true`, com as três unidades.
Julho passou mesmo com IDs opcionais inválidos: eles foram para
`validation_issues` e não derrubaram a coleta.

Leitura canônica de Campo Grande após o gate:

- `status=partial`, `collection_allowed=true`,
  `collection_scope=confirmed_only`;
- 15 faturas, 11 matrículas/pessoas;
- R$ 6.705,00 original e R$ 6.910,14 atualizado;
- Sol: 11 ações, 0 cadastros ausentes, 7 normais e 4 críticas.

### Juros do Emusys ao vivo

A OpenAPI diz que `juros_e_multa` é dinâmico. Porém, o payload vivo das três
faturas de agosto trouxe explicitamente `juros_e_multa=0` e
`desconto_aplicado=0`. Para cada R$ 447,00 vencido há 11 dias, a cláusula 2.5
produz R$ 10,58 e total atualizado de R$ 457,58. Até o Emusys corrigir essa
divergência, a Sol deve usar exclusivamente `valor_atualizado` publicado pela
RPC canônica.

## Prompt pronto para o Claude

```text
Claude, a Sol deve consumir exclusivamente a RPC
public.sol_caixa_inadimplentes da instância Supabase
ouqwbbermlzqqvtqwlul, sempre no backend com service_role.

Não crie sync próprio. Não leia sync_run_items, emusys_faturas,
inadimplente_emusys ou qualquer view antiga. Não altere as RPCs protegidas
sol_caixa_lancar_recebimento, sol_caixa_abrir, sol_caixa_fechar e
sol_caixa_casar_parcela.

Não consulte /crm/aniversariantes nem alunos.is_ex_aluno para decidir quem
pode ser cobrado. A RPC já resolve o papel atual pela matrícula Emusys; esses
dois sinais são apenas de reconciliação.

Chame sol_caixa_inadimplentes(unidade_id, 2, 0.02, 0.01, 30, 40).
Só permita ação quando status for ok ou partial, collection_allowed=true e
collection_scope='confirmed_only'. Em stale, incomplete, error ou bloqueio,
não envie nada e não faça fallback.

Use apenas o array alunos retornado. Ele já aplica D+2, uma ação por pessoa e
unidade, mantém trancados no radar, exclui ex-alunos sem matrícula atual e
preserva reingressos. Identifique o contato somente por aluno_id_canonico e
contato publicados. Nunca case por nome, telefone, student_id ou posição.

Preserve emusys_matricula_ids e faturas na auditoria de cada contato. Use
valor_atualizado da RPC; não recalcule juros e não use juros_e_multa bruto do
Emusys, pois o gate vivo de 16/08/2026 mostrou zero indevido nesse campo.

Antes de ligar qualquer cron, execute em modo sombra: leia as três unidades,
grave somente auditoria interna, compare contagens/valores com o contrato e
mostre o resultado ao Alf. Não envie WhatsApp, e-mail ou cobrança nesse teste.
```

## Publicação

- Migrations: `20260816184837` e `20260816184845`.
- Edge `export-contas-receber`: versão 20, `verify_jwt=false` preservado.
- Edge `sync-faturas-emusys`: versão 30, `verify_jwt=true` preservado.
- Frontend Vercel: produção publicada a partir de `main`.
