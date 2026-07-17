# Health Score Professor V3 - Escala historica anterior a 2022

**Data:** 2026-07-16
**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`
**Contrato:** Health Score Professor V3 V5
**Escopo:** Fase 2, Task 9, Step 1
**Recorte:** 2018-01-01 a 2021-12-31
**Estado:** concluido em sombra; nenhum consumidor produtivo migrado

## 1. Veredito

O primeiro recorte de escala historica foi coletado e reconstruido nas tres unidades.

O checkpoint pre-2022 esta aprovado como execucao tecnica porque:

- os tres jobs pararam exatamente em `2022-01-01`, sem cursor pendente;
- nenhuma coleta escreveu em `aulas_emusys`, `aluno_presenca`, `anotacoes` ou `anotacoes_fabio`;
- Campo Grande e Recreio foram reconstruidos em 32 blocos privados por pessoa canonica;
- nenhuma pessoa canonica foi dividida entre blocos;
- a camada final nasceu somente depois da conclusao de todos os blocos;
- os totais materializados batem com a soma das partes;
- a repeticao final retornou a mesma reconstrucao e o mesmo hash;
- nao existe periodo ativo duplicado para a mesma pessoa e matricula-disciplina;
- nenhuma evidencia incompleta foi promovida como publicavel.

O checkpoint nao autoriza score nem permanencia oficial. O recorte revelou uma fila real de identidade historica de professor, especialmente no Recreio. O motor preservou esses periodos, mas os manteve fora da publicacao.

## 2. Coleta por unidade

| Unidade | Job | Paginas | Aulas | Roster aluno-aula | Estado final |
|---|---|---:|---:|---:|---|
| Barra | `5ed0377a-8257-4f8b-b1d1-0b38422f499d` | 54 | 786 | 759 | pausado em 01/01/2022 |
| Campo Grande | `7caf6df0-d7bf-4632-b3cb-695daafa85c4` | 753 | 72.707 | 73.504 | pausado em 01/01/2022 |
| Recreio | `fe5d0efe-7ac8-422a-8016-c2e449e11be1` | 431 | 40.330 | 30.849 | pausado em 01/01/2022 |

Os jobs continuam retomaveis. O estado `pausado` e intencional: preserva o checkpoint para o proximo recorte sem declarar concluido o intervalo total ate 16/07/2026.

## 3. Reconstrucoes finais

| Unidade | Reconstrucao | Versao | Eventos | Periodos | Diagnosticos | Hash |
|---|---|---|---:|---:|---:|---|
| Barra | `7b9bd9fc-e490-4f8c-bc60-8326203469a2` | `periodos-professor-v1.9-pre2022` | 759 | 55 | 473 | `645c6918061c211e1b8794989a692181c2539ebc9dec8e4b28459b635636d954` |
| Campo Grande | `dee454eb-9c54-4522-9ed6-92de3a7f0d19` | `periodos-professor-v1.10-pre2022-particionado` | 73.504 | 1.638 | 37.029 | `142c6a8ffda2ee744150196c088922ae59f87a45e2b3cc797c60576a9b59be22` |
| Recreio | `0da6fbf6-bfc6-4449-b2e3-f7da96281877` | `periodos-professor-v1.10-pre2022-particionado` | 30.849 | 867 | 15.993 | `5d04bed0003d12b8bacc2d22050ea37be92589956fb9244e76563e9fde4b24e8` |

Total do recorte: **105.112 eventos aluno-aula** e **2.560 periodos reconstruidos em sombra**.

## 4. Particionamento por pessoa

O processamento em escala nao foi dividido por ano, curso ou matricula-disciplina. A chave de particionamento e a pessoa canonica escopada pela unidade.

Isso garante que duas matriculas da mesma pessoa permanecam juntas durante a reconstrucao. A pessoa pode gerar periodos pedagogicos independentes por matricula-disciplina e professor, mas sua evidencia nao e separada artificialmente no processamento.

### Campo Grande

- 32 blocos com dados;
- minimo de 892 eventos por bloco;
- maximo de 3.618;
- media de 2.297;
- 72.978 eventos com pessoa resolvida;
- 526 eventos sem pessoa resolvida, mantidos como diagnostico;
- zero pessoas canonicas divididas entre blocos.

### Recreio

- 32 blocos com dados;
- minimo de 256 eventos por bloco;
- maximo de 2.097;
- media de 964,03;
- 29.896 eventos com pessoa resolvida;
- 953 eventos sem pessoa resolvida, mantidos como diagnostico;
- zero pessoas canonicas divididas entre blocos.

Barra permaneceu no caminho monolitico porque possuia apenas 759 eventos de roster. Nao houve ganho tecnico em reprocessar esse lote pequeno em 32 blocos.

`total_particoes` na reconstrucao final representa grupos logicos do motor, nao blocos fisicos. Nos lotes particionados, o numero de blocos fisicos fica registrado em `parametros.total_particoes_execucao = 32`.

## 5. Qualidade dos periodos

| Unidade | Alta | Media | Revisar | Publicaveis em sombra | Elegiveis por duracao | Permanencia publicavel | Ativos duplicados |
|---|---:|---:|---:|---:|---:|---:|---:|
| Barra | 33 | 22 | 0 | 15 | 23 | 12 | 0 |
| Campo Grande | 828 | 678 | 132 | 587 | 773 | 282 | 0 |
| Recreio | 375 | 379 | 113 | 90 | 314 | 24 | 0 |

`Elegiveis por duracao` aplica apenas o corte de quatro meses e o estado encerrado. `Permanencia publicavel` adiciona as exigencias de identidade, inicio completo, ausencia de conflito e confianca alta ou revisada.

Portanto, os 1.110 periodos elegiveis por duracao nao podem ser usados integralmente no score. Somente 318 atendem tambem aos criterios atuais de publicabilidade.

## 6. Lacunas encontradas

| Unidade | Periodos sem professor local | Sem matricula-disciplina | Inicio incompleto |
|---|---:|---:|---:|
| Barra | 32 | 0 | 20 |
| Campo Grande | 520 | 44 | 459 |
| Recreio | 650 | 7 | 240 |

Essas linhas nao foram descartadas. Elas preservam ID Emusys, evidencia e diagnostico para conciliacao futura.

A falta de `professor_id` local no historico nao significa que a aula nao teve professor. Significa que a identidade Emusys historica ainda nao foi amarrada com seguranca a um professor local naquela unidade. Nome nao foi usado como identidade definitiva.

Nenhum periodo publicavel possui professor ausente, matricula-disciplina ausente, inicio incompleto ou conflito aberto.

## 7. Falha transitoria e retomada do Recreio

Durante a coleta do Recreio, uma gravacao de pagina recebeu `STAGING_TRANSACAO_FALHOU`.

Os logs do Postgres mostraram `canceling statement due to statement timeout` durante forte atividade de checkpoint e outros timeouts simultaneos no banco. O cursor permaneceu na pagina anterior confirmada.

Procedimento aplicado:

1. preservar codigo, contexto e horario do erro;
2. recolocar somente o job em estado executavel;
3. repetir uma unica pagina;
4. confirmar o avanco de 9.885 para 9.985 aulas;
5. continuar uma pagina por chamada, com intervalo entre chamadas;
6. parar automaticamente em 01/01/2022.

Depois da retomada, 315 paginas adicionais foram persistidas sem nova falha. Nenhum timeout foi ocultado por aumento de limite no banco.

## 8. Idempotencia

O manifesto foi preparado duas vezes para Campo Grande e Recreio. A segunda chamada retornou `idempotente = true` e preservou os totais.

A ultima particao foi repetida apos a materializacao:

- Campo Grande retornou a reconstrucao `dee454eb-9c54-4522-9ed6-92de3a7f0d19`;
- Recreio retornou a reconstrucao `0da6fbf6-bfc6-4449-b2e3-f7da96281877`;
- ambos mantiveram contagens e hashes;
- nenhuma segunda camada final foi criada.

## 9. Isolamento

- manifesto, partes e resultados continuam internos;
- `public`, `anon` e `authenticated` nao possuem leitura ou execucao direta;
- RPCs internas usam `SECURITY DEFINER` com `search_path = public, pg_temp`;
- a Edge exige JWT e valida perfil administrativo;
- V2, cards, rankings, Dashboard, Analytics e relatorios nao mudaram de fonte;
- churn/Random Forest permaneceu fora do escopo.

## 10. Decisao do checkpoint

**Task 9, Step 1:** concluido.

O proximo passo do plano e o recorte anterior a 2024. Antes de qualquer score, a fila de identidade historica de professor deve continuar explicita e os novos conflitos devem ser comparados com este baseline. CSV permanece fonte residual para lacunas comprovadas, nunca atalho para promover periodo automaticamente.

## 11. Verificacao tecnica final

- testes focados do coletor, checkpoint, reconstrucao, particionamento e contrato V3: 28/28 aprovados;
- suite automatizada completa: 177/177 testes aprovados;
- `deno check` das Edges de coleta e reconstrucao: aprovado;
- build de producao: aprovado, apenas com os avisos preexistentes de tamanho de bundle;
- `git diff --check`: aprovado;
- advisors de seguranca e desempenho: nenhum aviso associado aos novos objetos de manifesto, particoes ou RPCs da reconstrucao;
- teste de protecao da RPC antiga atualizado para exigir o consumidor atual `get_kpis_professor_periodo_canonico_v3`; a RPC antiga continua sem chamada no codigo executavel.

Esta verificacao nao promoveu resultados para cards, rankings ou relatorios. Os 1.202 periodos sem professor local permanecem diagnosticos internos e nao entram no score.
