# Health Score do Professor V3 - Piloto da Fase 2

**Data:** 2026-07-16
**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`
**Versao final do reconstrutor no piloto:** `periodos-professor-v1.8-piloto`
**Janela coletada:** 2026-06-01 a 2026-07-16
**Estado:** Gate 2 aprovado; Task 9 Step 1 pre-2022 concluido em sombra

> Atualizacao posterior: a escala historica anterior a 2022 esta documentada em
> `docs/auditorias/2026-07-16-health-score-professor-v3-escala-pre2022.md`.

## 1. Veredito

A camada historica em sombra foi implantada e validada nas tres unidades sem trocar nenhuma fonte produtiva.

O piloto comprovou que e possivel reconstruir periodos no grao correto:

`unidade + pessoa + matricula-disciplina + professor + periodo continuo`

Os invariantes tecnicos passaram:

- zero sobreposicao na mesma chave canonica;
- zero professor nao resolvido nos periodos finais;
- zero aula experimental usada como evidencia de permanencia;
- zero periodo encerrado sem data final;
- zero periodo ativo com data final;
- zero periodo ativo marcado como elegivel para permanencia;
- mesma entrada e mesma versao retornam a mesma reconstrucao e o mesmo hash;
- nenhuma inferencia por nome foi publicada;
- nenhum consumidor V2, card, ranking ou relatorio foi migrado.

O Gate 2 foi fechado depois da validacao nominal conduzida por Alf com as equipes das tres unidades. As decisoes foram registradas de forma append-only em `professor_periodos_revisoes_v1`; a reconstrucao original permaneceu imutavel.

## 2. O que foi criado

### Banco

- `professor_periodos_reconstrucoes_v1`: execucoes versionadas e idempotentes.
- `professor_matricula_disciplina_periodos_v1`: periodos pedagogicos em sombra.
- `professor_periodos_revisoes_v1`: trilha append-only para revisao humana futura.
- `vw_professor_periodos_diagnostico_v1`: fila tecnica sem payload bruto e com `security_invoker`.
- `materializar_periodos_professor_v1`: materializacao transacional chamada somente pelo backend autorizado.

### Backend

- `_shared/reconstrucao-periodos-professor.mjs`: motor puro e testavel.
- `reconstruir-periodos-professor`: Edge Function protegida por JWT/service role.

### Auditoria

- `tests/periodosProfessorCanonicos.test.mjs`.
- `scripts/verify-health-score-professor-v3.sql`.

## 3. Execucoes finais

| Unidade | Job de staging | Reconstrucao | Periodos | Diagnosticos | Hash |
|---|---|---|---:|---:|---|
| Barra | `85344401-9dc0-4b30-ab83-4ecae3a643ab` | `637a2b0e-6e33-4a10-83fc-6311f8d65edf` | 292 | 1.797 | `3850580c9aaeee1afc73a7dcdf7da5757110ade239c868740bb2933b1ca8cfc7` |
| Campo Grande | `2e25ef2b-8890-4c9d-b61e-d91f1cd4a666` | `f4823e61-b5b5-42ed-86ac-13c7ae0ba612` | 596 | 3.594 | `ab60ef9bbdb5b365ac22709ab2e2b9c16d0d09d763753379cf7528766f142916` |
| Recreio | `e65af16e-ceed-463b-b4be-eb3b5a997712` | `e38511d4-c5ed-4f0e-9d00-c5397bbb7f48` | 452 | 2.956 | `3efa6a2afa2d0a1e5537220533e5e1350c2cfe4f5fda499a11f17de9edc0c794` |

Total final: **1.340 periodos em sombra**.

## 4. Qualidade por unidade

| Unidade | Ativos | Encerrados | Alta | Media | Revisar | Publicaveis em sombra | Sem professor | Sem matricula-disciplina | Sobreposicoes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Barra | 255 | 37 | 28 | 248 | 16 | 28 | 0 | 0 | 0 |
| Campo Grande | 511 | 85 | 63 | 528 | 5 | 63 | 0 | 1 | 0 |
| Recreio | 423 | 29 | 63 | 381 | 8 | 63 | 0 | 0 | 0 |

`Publicavel em sombra` significa apenas que a evidencia atende aos checks tecnicos. Nao autoriza uso em tela, score ou relatorio produtivo.

O unico periodo sem `emusys_matricula_disciplina_id` esta em Campo Grande e se sobrepoe a outro periodo de uma disciplina diferente. Trata-se de segundo curso simultaneo, nao de duplicidade da mesma jornada.

## 5. Duplicidade real encontrada na API

O piloto inicialmente produziu 2.758 periodos. A auditoria mostrou que a API pode devolver a mesma aula/aluno/professor/horario em duas representacoes:

- uma linha com `matricula_disciplina_id = 0`;
- outra com o identificador estruturado correto;
- em um caso, duas IDs estruturadas de renovacoes consecutivas.

O staging preserva todas as linhas brutas. A supressao acontece somente no reconstrutor em sombra e fica registrada como `evento_semantico_duplicado_suprimido`.

Eventos suprimidos no piloto final:

- Barra: 1.477;
- Campo Grande: 3.256;
- Recreio: 2.403.

Essa correcao reduziu o resultado para 1.340 periodos sem apagar evidencia de origem.

## 6. Continuidade de renovacao

Quando duas IDs de matricula-disciplina representam continuidade da mesma pessoa, disciplina e professor, o reconstrutor:

1. preserva todas as IDs em `evidencias.matriculas_disciplinas_origem`;
2. escolhe como chave canonica a jornada atual ou a evidencia mais recente;
3. mantem um unico periodo continuo;
4. limita a confianca a `media`;
5. nao publica o periodo ate revisao quando houver inferencia.

No caso nominal `emusys:3119`, Campo Grande, as IDs `3445` e `4141` foram mantidas como origem de uma unica continuidade. A troca posterior gerou dois periodos, um encerrado e um ativo, usando a primeira evidencia confiavel da mudanca.

## 7. Diagnosticos que permanecem visiveis

Os diagnosticos nao sao erros escondidos. Eles sao a fila de trabalho do piloto.

Principais classes:

- aula cancelada ou experimental ignorada;
- substituicao candidata;
- troca ainda nao sustentada;
- jornada atual divergente do recorte historico;
- continuidade de matricula-disciplina inferida;
- fallback associado a uma unica jornada possivel;
- transicao estruturada sem aula nova no recorte;
- identidade insuficiente, mantida fora da publicacao.

Nenhum diagnostico `revisar` foi promovido automaticamente.

## 8. Identidade historica de professor

O reconstrutor resolve professor por ID Emusys escopado pela unidade. Identidade historica valida pode dar dono ao passado, mas nao reativa vinculo operacional atual.

Assim, casos como Leonardo em Campo Grande e professores inativos continuam com o historico atribuivel sem reaparecer em carteira, agenda, aderencia ou cobranca atual.

## 9. Regra dos quatro meses

A regra foi implantada como coluna gerada com duracao precisa em dias dividida por `30,44`.

- somente periodos encerrados podem ser elegiveis;
- menos de quatro meses permanece no historico, mas nao entra em permanencia;
- periodos ativos nunca entram;
- o piloto curto de junho/julho nao pretende produzir uma base representativa de permanencia.

O backfill historico amplo e necessario antes de calibrar essa metrica.

## 10. Seguranca

- RLS habilitada nas tres tabelas.
- `public`, `anon` e `authenticated` sem acesso.
- `service_role` possui somente leitura nas reconstrucoes e periodos.
- `service_role` possui leitura e insercao append-only nas revisoes.
- materializacao ocorre por RPC protegida, com `search_path` fixo.
- a view diagnostica usa `security_invoker`.
- chamada sem JWT da Edge Function retorna `401`.
- nenhuma permissao direta de `UPDATE`, `DELETE`, `TRUNCATE`, `TRIGGER` ou `REFERENCES` foi deixada ao `service_role` nessas tabelas.

## 11. O que nao foi feito

- nenhum backfill total desde 2018;
- nenhuma escrita em `aulas_emusys` ou `aluno_presenca`;
- nenhuma escrita em `anotacoes` ou `anotacoes_fabio`;
- nenhuma alteracao no churn/Random Forest;
- nenhuma mudanca nos relatorios gerencial, administrativo ou comercial;
- nenhum card, KPI, ranking ou tela passou a consumir a V3;
- nenhuma versao anterior foi apagada; elas permanecem como trilha de auditoria.

## 12. Homologacao nominal e Gate 2

Foram registrados 31 pareceres humanos:

- 25 `aprovado`;
- 2 `corrigido`;
- 2 `rejeitado`;
- 2 `manter_revisao`.

Resumo por unidade:

- Barra: troca efetiva, renovacao continua, tres jornadas simultaneas e substituicao isolada confirmadas;
- Recreio: uma falsa troca corrigida para substituicao, renovacao continua, quatro jornadas simultaneas, outra substituicao isolada e dois vinculos de professor historico aprovados;
- Campo Grande: uma troca efetiva aprovada, uma falsa troca corrigida para cobertura temporaria, cinco jornadas simultaneas aprovadas e outra substituicao isolada confirmada.

As duas ambiguidades preservadas sao:

1. `CG-3C`: o vinculo atual de Canto foi confirmado, mas a continuidade historica entre os dois IDs de renovacao nao foi respondida explicitamente;
2. `CG-6`: foi confirmado que o professor nao e atual em Campo Grande, mas nao foi confirmado se o vinculo historico nominal da aluna realmente ocorreu.

Esses dois periodos continuam com decisao `manter_revisao`, confianca efetiva `revisar` e publicabilidade efetiva falsa. Eles nao bloqueiam o Gate 2 porque permanecem visiveis e nao foram promovidos.

A validacao tambem encontrou dois falsos positivos do reconstrutor:

- `REC-1`: substituicao interpretada como troca;
- `CG-2`: cobertura temporaria interpretada como troca.

Em ambos, o periodo do titular recebeu decisao `corrigido` para permanecer ativo e o periodo artificial do substituto recebeu `rejeitado`. A evidencia reconstruida original nao foi apagada nem sobrescrita.

**Gate 2:** concluido. O proximo passo autorizado e escalar o backfill por prioridade: primeiro a coorte anterior a 2022, depois a anterior a 2024 e somente entao o restante da base.

## 14. Atualizacao da escala historica

O primeiro recorte de escala foi concluido depois do Gate 2:

- 105.112 eventos aluno-aula anteriores a 2022;
- 2.560 periodos reconstruidos em sombra;
- 32 blocos privados por pessoa canonica em Campo Grande e Recreio;
- zero pessoas divididas entre blocos;
- zero periodos ativos duplicados por pessoa e matricula-disciplina;
- 318 periodos encerrados que atendem simultaneamente ao corte de quatro meses e a publicabilidade atual.

A execucao tambem tornou visivel a lacuna de identidade historica de professores: 1.202 periodos ainda nao possuem professor local resolvido. Eles permanecem no historico e fora da publicacao; nao houve casamento por nome.

O detalhamento, os IDs, hashes, contagens e a retomada transacional do Recreio estao no relatorio de escala pre-2022 citado no cabecalho.

## 13. Verificacao executada

- 52 testes Node passaram, incluindo contrato de isolamento V2/V3, staging, reconstrutor e regressoes dos KPIs atuais.
- `deno check` passou nas Edges `backfill-historico-professor-emusys` e `reconstruir-periodos-professor`.
- `npm run build` concluiu com sucesso.
- `git diff --check` nao encontrou erro de whitespace; apenas avisos de conversao LF/CRLF do worktree Windows.
- a consulta de contaminacao confirmou zero aula experimental nos periodos.
- a consulta de seguranca confirmou RLS nas tres tabelas, `security_invoker` na view, zero grant para `public`/`anon`/`authenticated` e `search_path=public, pg_temp` na RPC.
- os advisors do Supabase nao apontaram exposicao nova da camada. O aviso informativo `RLS enabled no policy` e intencional: essas tabelas sao internas, sem policy de usuario final e com grants minimos ao backend.

O build manteve avisos preexistentes de chunking/ciclo do Recharts e tamanho de bundle. Eles nao foram introduzidos pela Fase 2 e nao impedem o piloto backend em sombra.
