# Contrato assinado — contrato de leitura do TOM

## Estado do rollout

**LIBERADO PARA RELIGAR O TOM.** Desde a medição de 05/09/2026 às 17:11–17:15 BRT, o `GET /matriculas` do Emusys passou a retornar `contrato_atual.contrato_assinado=true` tanto para assinatura manual quanto para assinatura eletrônica. O formato do payload não mudou.

A liberação pressupõe que o TOM leia `contrato_assinatura_status` e `contrato_dado_fresco`. O recorte antigo `tem_data_contrato` continua existindo por compatibilidade, mas representa o período de aulas e não comprova assinatura.

O LA Report apenas lê o Emusys. Nada deste ciclo escreve no fornecedor.

## Fonte e limites

Fonte canônica: `GET https://api.emusys.com.br/v1/matriculas?status=ativa`, paginado e autenticado por `?token=`.

O booleano `contrato_atual.contrato_assinado` significa agora:

- `true`: o contrato atual está assinado no Emusys, por modo manual ou eletrônico;
- `false`: a assinatura do contrato atual ainda não foi concluída no Emusys.

A API ainda **não expõe**:

- modo da assinatura;
- data real da assinatura;
- data de assinatura manual;
- data em que a assinatura foi solicitada;
- assinatura da escola;
- estado intermediário “aguardando a assinatura do aluno”.

Portanto, `false` autoriza o produto a dizer **“Não assinado”** e colocar o contrato na pauta. Não autoriza dizer “nunca enviamos”, “o responsável não respondeu” ou atribuir a pendência a alguém: a API não distingue essas etapas.

Caso-limite confirmado: Giovanna Oliveira da Cunha, matrícula 1558 do Recreio, aparecia na tela como solicitação enviada em 04/09, escola já assinou e aguardando o aluno; a API continuou `false` às 17:11. Esse caso deve aparecer como `nao_assinado`, sem inventar a etapa.

`contrato_status_observado_em` registra quando o LA Report viu o estado. Não é data jurídica da assinatura.

## Contraprova da mudança do fornecedor

Matrículas do Recreio confrontadas com a tela e relidas no payload cru em 05/09/2026:

| Matrícula | Aluno | 05:10 BRT | 17:11 BRT | Tela do Emusys |
|---:|---|:---:|:---:|---|
| 32 | Beatriz Souto Machado | `false` | `true` | Manual · 23/05/2026 |
| 78 | Josué Salazar N. G. Poças | `false` | `true` | Manual · 07/08/2026 |
| 169 | Nathan Leggett de Moura | `false` | `true` | Manual · 28/05/2026 |
| 328 | Lucas Cseko e Silva | `false` | `true` | Manual · 02/07/2026 |
| 394 | Catarina Petrolongo Pinto Abreu | `false` | `true` | Manual · 23/06/2026 |
| 409 | Manuela Chermont (Garage Band) | `false` | `true` | Manual · 17/06/2026 |
| 167 | Bruna Silva de Sá Vale | `true` | `true` | Eletrônica |
| 416 | Yuri de Souza Ribeiro | `true` | `true` | Eletrônica |

As seis assinaturas manuais viraram `true`; as duas eletrônicas permaneceram `true`. Esse conjunto é o canário de regressão em `scripts/verificar-regressao-contratos-emusys.mjs`.

Retrato das matrículas ativas na mesma medição:

| Unidade | 05:10 BRT — assinadas / não assinadas | 17:11–17:15 BRT — assinadas / não assinadas |
|---|---:|---:|
| Recreio | 105 / 312 | 411 / 7 |
| Campo Grande | 11 / 458 | 365 / 105 |
| Barra | 22 / 260 | 157 / 126 |
| **Total** | **138 / 1.030** | **933 / 238** |

### Validação pós-publicação

Uma reconciliação forçada e autenticada foi executada em produção nas três unidades em 05/09/2026, entre 18:49 e 18:51 BRT. As três execuções terminaram em `succeeded`, sem erro:

| Unidade | Páginas | Matrículas ativas | Assinadas | Não assinadas |
|---|---:|---:|---:|---:|
| Recreio | 9 | 418 | 411 | 7 |
| Campo Grande | 10 | 470 | 365 | 105 |
| Barra | 6 | 283 | 157 | 126 |
| **Total** | **25** | **1.171** | **933** | **238** |

A RPC publicou zero ocorrências do estado antigo. A ressalva original sobre duas pessoas em `nao_verificado` foi corrigida em 06/09/2026: as observações estavam completas, mas uma linha local duplicada de cada pessoa não carregava `alunos.emusys_matricula_id`, embora a jornada canônica carregasse a matrícula exata.

Depois da migration `fix_contrato_assinatura_ids_locais_pessoa`:

| Unidade | Pessoa | IDs locais | Relevantes / assinados / não verificados | Resultado |
|---|---|---|---:|---|
| Campo Grande | Ana Luiza Marques Paiva | `1621, 1738` | `2 / 2 / 0` | `assinado`, fresco |
| Recreio | Davi Lima Queiroz | `1504, 2355` | `1 / 1 / 0` | `assinado`, fresco; Garage Band dispensada |

A varredura encontrou 172 pessoas com múltiplos IDs locais, das quais 146 possuem mais de um ID local ativo: Barra 25, Campo Grande 51 e Recreio 70. Nenhuma ficou em `nao_verificado` depois da correção. Na comparação integral antes da publicação, somente Ana Luiza e Davi mudaram de estado.

O canário confirmou as oito matrículas em `true`, e Giovanna Oliveira da Cunha, matrícula 1558, permaneceu em `false`, como esperado para o estado intermediário que a API não detalha.

## Persistência

Tabela `public.aluno_contratos_emusys`, no grão `(unidade_id, emusys_matricula_id, contrato_emusys_id)`:

| Campo | Tipo | Significado |
|---|---|---|
| `unidade_id` | `uuid` | Unidade do Emusys; parte obrigatória da identidade. |
| `emusys_matricula_id` | `text` | ID da matrícula dentro da unidade. |
| `emusys_aluno_id` | `text nullable` | ID do aluno dentro da unidade, para rastreio. |
| `aluno_id` | `integer nullable` | Vínculo local, quando encontrado. |
| `contrato_emusys_id` | `text nullable` | ID do contrato atual; nulo representa matrícula observada sem `contrato_atual`. |
| `contrato_assinado` | `boolean nullable` | Booleano cru do Emusys; manual + eletrônica. Nulo somente sem contrato atual. |
| `contrato_status_observado_em` | `timestamptz` | Quando o LA Report observou o estado; não é data da assinatura. |
| `origem` | `text` | `snapshot_backfill` ou `api_reconciliacao`. |
| `payload_hash` | `text nullable` | Rastro técnico sem duplicar o payload pessoal. |

Execuções ficam em `public.contrato_assinatura_sync_execucoes`. `running`, `succeeded` e `failed` representam a execução real; toda falha aberta grava `erro` e `completed_at`.

## RPC que o TOM deve ler

```text
get_situacao_alunos_v1(
  p_unidade_id uuid,
  p_referencia date,
  p_apenas_pendentes boolean
)
```

Campos por pessoa:

| Campo | Tipo | Uso |
|---|---|---|
| `contrato_assinatura_status` | `text` | Estado canônico: `assinado`, `nao_assinado`, `sem_contrato`, `nao_verificado` ou `dispensado`. |
| `contratos_assinados_todos` | `boolean nullable` | `true` quando todas as matrículas relevantes estão assinadas; `false` quando alguma não está; nulo se não verificado ou dispensado. |
| `contratos_relevantes` | `integer` | Matrículas acadêmicas ativas exigidas. |
| `contratos_assinados` | `integer` | Relevantes observadas com `true`. |
| `contratos_nao_assinados` | `integer` | Relevantes observadas com `false`. |
| `contratos_sem_contrato` | `integer` | Relevantes observadas sem `contrato_atual`. |
| `contratos_nao_verificados` | `integer` | Relevantes sem identidade segura, inclusive após tentar a cobertura integral da jornada, ou sem observação. |
| `contrato_status_observado_em` | `timestamptz nullable` | Observação mais antiga entre as matrículas relevantes; não é assinatura. |
| `contrato_reconciliado_em` | `timestamptz nullable` | Conclusão da rodada válida no dia BRT da referência. |
| `contrato_dado_fresco` | `boolean` | `true` somente com rodada do dia e todas as matrículas relevantes observadas. |

`tem_data_contrato:boolean` não mudou: continua significando apenas que existe data de início do período contratual.

### Regra de consumo do TOM

- `contrato_dado_fresco=false` ou `nao_verificado`: dizer “não conferi contratos hoje” e não cobrar.
- `nao_assinado`: incluir na pauta como contrato não assinado.
- `sem_contrato`: incluir na pauta como matrícula sem contrato atual no Emusys.
- `assinado` ou `dispensado`: não incluir na pauta de contrato.

O TOM deve buscar o conjunto com `p_apenas_pendentes=false` e aplicar esse recorte; `p_apenas_pendentes` também cobre outras pendências e não deve redefinir a semântica do contrato.

## Significado dos estados

- `assinado`: todas as matrículas acadêmicas ativas relevantes vieram com `contrato_assinado=true`. Confirma assinatura, mas não informa modo nem data.
- `nao_assinado`: ao menos uma matrícula relevante veio com `false`. É pendência de assinatura, mas não informa se nunca foi enviada ou se aguarda o aluno.
- `sem_contrato`: ao menos uma matrícula relevante foi observada sem `contrato_atual`. Não significa matrícula inativa.
- `nao_verificado`: falta rodada fresca, ID seguro ou observação completa. Não autoriza afirmar assinado nem pendente.
- `dispensado`: não há matrícula acadêmica relevante porque todas estão explicitamente dispensadas. Não significa contrato assinado.

## Regra por pessoa

A pessoa fica `assinado` somente quando **todas** as matrículas acadêmicas ativas relevantes estão com `contrato_assinado=true`. Um aluno de dois cursos não fica verde com apenas um contrato assinado.

Para pessoas com mais de um `aluno_id` local, a RPC reúne a jornada de todos os IDs e recupera as chaves exatas de matrícula Emusys. Ela só usa essa ponte quando a quantidade de matrículas acadêmicas da jornada é igual à quantidade local relevante. Sem cobertura integral, mantém o caminho conservador e retorna `nao_verificado` quando faltar identidade ou observação; uma observação nunca é repetida para completar outra matrícula.

Precedência: `dispensado` → `nao_verificado` → `sem_contrato` → `nao_assinado` → `assinado`.

## Dispensa de banda, coral e atividades extras

Uma matrícula é dispensada somente quando seu curso possui `cursos.is_projeto_banda=true`. Não há inferência por nome. A flag cobre o catálogo de projetos, bandas, coral e atividades extras; uma pessoa com curso acadêmico e banda continua obrigada apenas pelo curso acadêmico.

Se uma nova atividade precisar de dispensa, corrija o cadastro do curso. O TOM não mantém lista paralela.

## Frequência, frescura e force

Horários diários em `America/Sao_Paulo`, sem alteração:

- principal: Campo Grande 05:00, Recreio 05:10, Barra 05:20;
- retry: Campo Grande 05:30, Recreio 05:40, Barra 05:50.

Sem `force`, uma segunda chamada no mesmo dia responde `skipped_fresh`. Para uma reconciliação extraordinária, use `?force=1` **junto do `x-sync-token` válido**. Um bearer de serviço sem esse cabeçalho não autoriza o bypass. A rodada forçada usa a mesma trilha `running` → `succeeded|failed` e não muda o cálculo de frescura.

Cada rodada pagina com limite 50 até `tem_mais=false`, respeita 60 requisições/minuto e publica o lote apenas depois de validar todas as páginas. Sem `succeeded` no dia BRT, a RPC devolve dado não fresco.

## Backfill, legado e canário

O backfill inicial continua preservado e não é reexecutado. A atualização do fornecedor resolveu a assinatura manual no próprio booleano; não há migration de dados nem corte arbitrário de legado.

Após reconciliação forçada, rode o canário somente leitura:

```powershell
node --env-file=.env.local scripts/verificar-regressao-contratos-emusys.mjs
```

Ele exige as oito matrículas da contraprova em `true` e falha se o fornecedor voltar a devolvê-las como `false` ou removê-las da fotografia.

**Conclusão operacional:** o contrato do LA Report está liberado para o TOM. A ativação do booleano `CONTRATO_NA_PAUTA` pertence ao repositório do TOM e só deve ocorrer depois desta versão estar em produção e de uma execução `succeeded` no dia para cada unidade. A decisão de cobrar continua sendo por linha: qualquer pessoa com `contrato_dado_fresco=false` fica fora da cobrança.
