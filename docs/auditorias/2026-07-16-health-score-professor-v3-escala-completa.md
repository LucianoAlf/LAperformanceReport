# Health Score Professor V3 - Escala historica completa

**Data:** 2026-07-16
**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`
**Contrato:** Health Score Professor V3 V5
**Escopo:** Fase 2, Task 9, Steps 2 a 4
**Recorte integral:** 2018-01-01 a 2026-07-16
**Versao final:** `periodos-professor-v1.12-full-20260716-particionado`
**Estado:** concluido em sombra; nenhum consumidor produtivo migrado

## 1. Veredito

A coleta historica e a reconstrucao dos periodos professor-matricula-disciplina foram concluidas nas tres unidades ate 16/07/2026.

O lote integral esta tecnicamente aprovado como evidencia em sombra porque:

- os tres jobs chegaram ao fim do recorte sem cursor pendente;
- 429.381 aulas historicas unicas foram preservadas no staging;
- 434.193 eventos aluno-aula entraram no manifesto e no reconstrutor;
- o manifesto e o total final de eventos batem exatamente em cada unidade;
- as 32 particoes de cada unidade terminaram com status `concluido`;
- a repeticao de uma particao retornou a mesma reconstrucao e o mesmo hash;
- nao existe periodo ativo duplicado na chave canonica completa;
- nenhuma lacuna de professor ou matricula-disciplina foi publicada;
- nenhuma tela, card, ranking, relatorio ou RPC produtiva passou a consumir a V3;
- as tabelas privadas permanecem com RLS e sem privilegios para `public`, `anon` e `authenticated`.

Este veredito nao transforma os numeros em score oficial. A V3 continua em sombra. Identidades historicas nao resolvidas e revisoes humanas ainda precisam atravessar os gates seguintes antes de qualquer publicacao.

## 2. Por que as aulas historicas foram coletadas

O objetivo nao e calcular o tempo que a pessoa permaneceu na escola. O objetivo e reconstruir, no grao correto, quanto tempo cada matricula-disciplina permaneceu com cada professor.

Uma fotografia atual de matricula informa apenas o professor de agora. Ela nao responde com seguranca:

- quando o periodo com o professor anterior comecou;
- quando terminou;
- se a mudanca foi troca definitiva ou substituicao;
- se duas disciplinas da mesma pessoa pertenciam a professores diferentes;
- se uma renovacao manteve continuidade pedagogica;
- se um professor historico esta inativo hoje, mas foi titular no passado.

As aulas sao a sequencia temporal usada como evidencia para formar periodos continuos. O staging nao substitui `aulas_emusys` produtiva e nao e exibido na aplicacao.

## 3. Coleta completa por unidade

| Unidade | Job | Paginas | Aulas recebidas no job | Aulas unicas no staging | Eventos aluno-aula | Intervalo real |
|---|---|---:|---:|---:|---:|---|
| Barra | `5ed0377a-8257-4f8b-b1d1-0b38422f499d` | 686 | 61.279 | 61.282 | 62.695 | 09/10/2021 a 16/07/2026 |
| Campo Grande | `7caf6df0-d7bf-4632-b3cb-695daafa85c4` | 2.182 | 213.098 | 213.100 | 222.293 | 05/02/2018 a 16/07/2026 |
| Recreio | `fe5d0efe-7ac8-422a-8016-c2e449e11be1` | 1.606 | 154.999 | 154.999 | 149.205 | 02/05/2018 a 16/07/2026 |
| **Total** | - | **4.474** | **429.376** | **429.381** | **434.193** | ate 16/07/2026 |

O staging e cumulativo e possui chave unica por unidade+aula. As cinco aulas adicionais ja tinham sido observadas em execucoes anteriores do piloto/escala e permaneceram como a ultima versao valida. O job integral nao as apagou, e o manifesto final usou a fotografia completa de 429.381 aulas unicas.

## 4. Coorte anterior a 2024

Antes da escala integral foi executado o recorte 2018-01-01 a 2023-12-31 com a versao `periodos-professor-v1.11-pre2024-particionado`.

| Unidade | Eventos | Periodos | Diagnosticos | Permanencia publicavel |
|---|---:|---:|---:|---:|
| Barra | 19.192 | 527 | 10.278 | 57 |
| Campo Grande | 122.139 | 2.596 | 62.606 | 374 |
| Recreio | 75.736 | 1.778 | 39.420 | 45 |
| **Total** | **217.067** | **4.901** | **112.304** | **476** |

As 32 particoes por unidade foram concluidas. A chave canonica completa permaneceu sem periodo ativo duplicado.

## 5. Reconstrucao integral

| Unidade | Eventos | Periodos | Ativos | Encerrados | Diagnosticos | Hash |
|---|---:|---:|---:|---:|---:|---|
| Barra | 62.695 | 1.495 | 433 | 1.062 | 33.014 | `a3384f12f184...` |
| Campo Grande | 222.293 | 4.273 | 1.120 | 3.153 | 114.596 | `3dab9305c177...` |
| Recreio | 149.205 | 3.166 | 894 | 2.272 | 77.637 | `c37c05c1c7e8...` |
| **Total** | **434.193** | **8.934** | **2.447** | **6.487** | **225.247** | - |

O menor inicio reconstruido foi:

- Barra: 11/10/2021;
- Campo Grande: 03/03/2018;
- Recreio: 03/05/2018.

## 6. Confianca e permanencia

| Unidade | Alta | Media | Revisar | Publicaveis | Elegiveis por 4 meses | Publicaveis e elegiveis |
|---|---:|---:|---:|---:|---:|---:|
| Barra | 574 | 652 | 269 | 461 | 507 | 115 |
| Campo Grande | 2.089 | 1.752 | 432 | 1.707 | 1.871 | 610 |
| Recreio | 1.200 | 1.424 | 542 | 678 | 1.226 | 162 |
| **Total** | **3.863** | **3.828** | **1.243** | **2.846** | **3.604** | **887** |

`Elegivel por 4 meses` aplica o corte contratual de duracao aos periodos encerrados. `Publicavel e elegivel` adiciona identidade resolvida, matricula-disciplina resolvida, inicio completo, ausencia de conflito e confianca alta ou revisada.

Os 887 periodos sao base de calibracao em sombra. Nao sao uma metrica oficial e ainda nao alimentam cards.

## 7. Diagnosticos do motor

| Diagnostico | Barra | Campo Grande | Recreio |
|---|---:|---:|---:|
| Evento semantico duplicado suprimido | 29.048 | 106.152 | 70.640 |
| Experimental ignorada | 2.004 | 3.107 | 3.268 |
| Aula cancelada ignorada | 642 | 2.010 | 1.028 |
| Substituicao candidata | 542 | 802 | 1.307 |
| Fallback de matricula-disciplina | 395 | 1.286 | 414 |
| Continuidade inferida | 215 | 818 | 545 |
| Troca sem sustentacao | 137 | 152 | 234 |
| Identidade insuficiente para particao | 15 | 264 | 18 |
| Professor Emusys ausente | 8 | 0 | 179 |
| Jornada atual divergente | 8 | 1 | 3 |

Eventos experimentais, cancelados e sem acompanhamento nao geram permanencia. Duplicacoes de roster, turma e linhas operacionais sao suprimidas antes da formacao dos periodos.

## 8. Invariantes e idempotencia

### 8.1 Manifesto

| Unidade | Eventos finais | Linhas no manifesto | Diferenca |
|---|---:|---:|---:|
| Barra | 62.695 | 62.695 | 0 |
| Campo Grande | 222.293 | 222.293 | 0 |
| Recreio | 149.205 | 149.205 | 0 |

### 8.2 Chave ativa

A verificacao usa:

```text
reconstrucao
+ pessoa_chave
+ matricula_disciplina_id

fallback quando matricula_disciplina_id nao existe:
reconstrucao
+ pessoa_chave
+ emusys_aluno_id
+ emusys_disciplina_id
```

Resultado: zero chaves canonicas ativas duplicadas nas tres unidades.

Uma agregacao incompleta apenas por `pessoa + coalesce(matricula_disciplina, -1)` produz falsos duplicados entre disciplinas antigas sem ID. Por isso ela nao deve ser usada para auditar este dominio.

### 8.3 Repeticao

A particao 31 foi executada novamente em cada unidade:

| Unidade | Eventos | Periodos | Diagnosticos |
|---|---:|---:|---:|
| Barra | 2.249 | 49 | 1.181 |
| Campo Grande | 7.195 | 139 | 3.728 |
| Recreio | 5.961 | 109 | 3.125 |

As reconstrucoes continuaram unicas, com os mesmos hashes e totais finais.

## 9. Lacunas para conciliacao humana/CSV

| Unidade | Periodos sem professor local | IDs Emusys distintos | Ativos | Elegiveis por duracao | Publicaveis |
|---|---:|---:|---:|---:|---:|
| Barra | 320 | 15 | 31 | 130 | 0 |
| Campo Grande | 896 | 39 | 128 | 444 | 0 |
| Recreio | 1.444 | 30 | 240 | 669 | 0 |
| **Total** | **2.660** | **84 escopados por unidade** | **399** | **1.243** | **0** |

Tambem existem 399 periodos sem `emusys_matricula_disciplina_id`:

- Barra: 43;
- Campo Grande: 187;
- Recreio: 169.

Nenhum deles e publicavel. A regra permanece: nome e pista, nao identidade definitiva.

Maiores filas nominais, apenas para orientar a conciliacao:

### Barra

- Beatriz Santa Rosa de Jesus: 70 periodos;
- Arthur Henrique Pereira de Andrade: 63;
- Victor Donin de Faria: 42;
- Leticia Fernandes Turques: 36;
- Felipe Marques Gevezier: 35.

### Campo Grande

- Leticia Fernandes Turques: 131 periodos;
- Mikaele Soares Rodrigues Augusto: 111;
- Andre Cesar Barbosa: 108;
- Miza Amisadai Batista da Silva Vieira: 76;
- Philipe Reis da Silva Gaspar: 65.

### Recreio

- Marcos Quintela Coelho Filho: 377 periodos;
- Davi dos Santos Ribeiro: 298;
- Natan Emanuel Moura de Souza: 229;
- Sara Vieira Arcanjo: 83;
- Luiza Magalhaes Mesquita: 80.

O CSV, quando necessario, deve registrar unidade, ID Emusys, fonte, hash, decisao e revisor. A importacao alimenta a fila de revisao; nao promove periodo automaticamente.

## 10. Revisoes do piloto

O piloto `periodos-professor-v1.8-piloto` possui 31 decisoes append-only:

- 25 aprovadas;
- 2 corrigidas;
- 2 rejeitadas;
- 2 mantidas em revisao.

A versao integral possui zero revisoes copiadas. Isso e intencional: IDs de periodo mudam entre reconstrucoes e uma decisao humana nao pode ser transferida por nome ou posicao.

Antes da publicacao, as decisoes do piloto devem ser reconciliadas por evidencia estrutural: unidade, pessoa, matricula-disciplina, professor, intervalo e hash da origem. A falta dessa transferencia nao invalida o lote; impede somente sua promocao silenciosa.

## 11. Isolamento e seguranca

As oito tabelas de staging/reconstrucao verificadas possuem RLS ativo e nenhum privilegio para `PUBLIC`, `anon` ou `authenticated`.

As RPCs de preparacao/finalizacao da reconstrucao tambem nao possuem `EXECUTE` para esses papeis.

Uma busca em `src/` nao encontrou referencia a:

- staging historico;
- manifesto;
- particoes;
- periodos V3;
- reconstrucoes V3.

Portanto, a aplicacao produtiva nao consegue consumir esses objetos por acidente.

## 12. Operacao e capacidade

O preparo inicial do manifesto excedeu o timeout padrao do PostgREST nas unidades maiores. Nao houve gravacao parcial. O preparo idempotente foi executado com timeout administrativo controlado e, depois, o processamento voltou ao caminho normal da Edge Function.

O orquestrador local passou a declarar:

- 30 segundos para autenticacao;
- 120 segundos para chamada da Edge.

Isso evita timeout prematuro do cliente sem esconder timeout do banco.

Os logs confirmaram respostas HTTP 200 das chamadas finais de `reconstruir-periodos-professor`. Nao houve OOM nem falha da reconstrucao integral.

## 13. Armazenamento

| Objeto | Tamanho total |
|---|---:|
| `emusys_aulas_historico_staging_v1` | 692 MB |
| `professor_periodos_reconstrucao_manifesto_v1` | 419 MB |
| `emusys_aula_alunos_historico_staging_v1` | 342 MB |
| `professor_matricula_disciplina_periodos_v1` | 45 MB |
| `professor_periodos_reconstrucao_particoes_v1` | 15 MB |
| `professor_periodos_reconstrucoes_v1` | 1.336 kB |
| `professor_periodos_revisoes_v1` | 192 kB |

O manifesto inclui versoes pre-2022, pre-2024 e integral. Nenhuma limpeza foi executada antes da homologacao. Uma politica de retencao deve ser aprovada depois que hashes, revisoes e rollback estiverem consolidados.

## 14. Verificacoes executadas

```powershell
node --test tests/backfillHistoricoCheckpoint.test.mjs `
  tests/backfillHistoricoProfessorEmusys.test.mjs `
  tests/periodosProfessorCanonicos.test.mjs `
  tests/reconstrucaoPeriodosParticionada.test.mjs `
  tests/healthScoreProfessorV3Contrato.test.mjs
```

Resultado: 26 testes, 26 aprovados.

A suite oficial do repositorio tambem foi executada com todos os arquivos `tests/*.test.mjs` explicitamente selecionados:

```powershell
$files = Get-ChildItem tests -Filter '*.test.mjs'
node --test $files.FullName
```

Resultado: 178 testes, 178 aprovados.

O comando indiscriminado `node --test` sem escopo nao representa a suite oficial: ele tenta executar bundles de `dist/` e arquivos TypeScript de `scripts/` sem o runner apropriado. Essa descoberta nao alterou o resultado da suite versionada em `tests/`.

```powershell
deno check supabase/functions/backfill-historico-professor-emusys/index.ts
deno check supabase/functions/reconstruir-periodos-professor/index.ts
```

Resultado: ambas as funcoes aprovadas.

```powershell
npm run build
```

Resultado: build Vite concluido. Permanecem avisos preexistentes de chunk grande e reexport circular do Recharts; nenhum erro de compilacao.

### Verificacao visual

A pagina `http://localhost:5175/app/professores` foi aberta em sessao autenticada depois da reconstrucao:

- competencia visivel: `Jul/2026`;
- escopo: Consolidado;
- 48 de 48 professores carregados;
- alertas, KPIs, ranking e tabela renderizados;
- nenhum estado zerado de professor;
- a V3 historica nao apareceu como fonte da interface.

## 15. Observacoes fora do escopo

Durante a leitura dos logs apareceram erros repetidos em `classificar-desinteresse` e violacoes de `lead_nome` nulo em `leads_automacao_log`. Eles nao pertencem ao pipeline historico e nao foram causados pela reconstrucao, cujas chamadas terminaram em HTTP 200.

Esses erros devem virar uma auditoria separada; nao foram corrigidos dentro desta tarefa para evitar misturar dominios.

## 16. Proximo gate

Task 9 esta concluida tecnicamente:

- Step 2: coorte anterior a 2024 concluida;
- Step 3: restante da base concluido;
- Step 4: lacunas mapeadas para conciliacao/CSV, sem promocao automatica.

O proximo trabalho autorizado pelo plano e a Fase 3, transicoes futuras, seguido da transferencia auditada das decisoes do piloto e da construcao do motor V3. Nenhum consumidor deve ser migrado antes desses gates.
