# Health Score Professor V3 - Gate 8 modal individual

**Data:** 2026-07-18

**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`

**Status:** checkpoint tecnico em homologacao; Gate 8 ainda aberto

## 1. Escopo

Esta entrega migra somente o modal individual do professor para leitura V3,
sob a feature flag `VITE_HEALTH_SCORE_V3_MODAL_ENABLED`.

Continuam inalterados:

- tabela Performance e rankings;
- relatorios individual e da coordenacao;
- Dashboard e Analytics;
- consumidores do Fabio e LA Teacher;
- motor e consumidores V2 produtivos.

## 2. Leitura auditavel

A RPC `get_health_score_professor_v3_snapshot_modal` entrega o ultimo snapshot
da competencia no escopo exato solicitado:

- unidade: filtra somente o `unidade_id` recebido;
- consolidado: exige `unidade_id is null`;
- professor e competencia sao obrigatorios;
- a revisao mais recente do snapshot e selecionada sem fan-out entre escopos.

Para cada pilar, o retorno preserva:

- valor real e nota sem substituir `null` por zero;
- numerador, denominador e tamanho da amostra;
- peso original, peso disponivel e contribuicao;
- estado de base e publicabilidade;
- fonte, versao da regra e detalhes;
- motivo de exclusao ou bloqueio.

## 3. Seguranca

A RPC usa `SECURITY DEFINER`, `search_path = public, pg_temp` e o guard
`fn_health_score_professor_v3_ator_gerenciador()` antes de ler os snapshots.

Permissoes conferidas:

- `public`: sem `EXECUTE`;
- `anon`: sem `EXECUTE`;
- `authenticated`: com `EXECUTE`, sujeito ao guard;
- `service_role`: com `EXECUTE`.

As tabelas internas continuam sem leitura direta pelo navegador.

## 4. Frontend e rollback

Quando a flag esta ativa, o modal mostra:

- selo `V3 em homologacao`;
- recorte de competencia, unidade ou consolidado e versao da configuracao;
- score e cobertura somente quando disponiveis;
- os seis pilares com valor, amostra, base, cobertura do pilar, fonte e motivo;
- `Sem base` quando o snapshot nao autoriza publicacao.

O hook usa uma sequencia de requisicao e descarta respostas obsoletas. Uma
troca rapida de professor, competencia ou unidade nao pode sobrescrever o
recorte atual com a resposta atrasada da selecao anterior.

Quando a flag vale explicitamente `false`, o caminho V3 fica desligado e o
modal preserva a apresentacao V2 existente. Em desenvolvimento, a homologacao
fica ligada por padrao, salvo esse desligamento explicito.

## 5. Evidencia remota

Para Peterson Biancamano em julho de 2026:

- consolidado: seis pilares, cobertura total `25%`, permanencia `14,5 meses`
  e `57` vinculos encerrados elegiveis;
- Campo Grande: seis pilares, cobertura total `25%`, permanencia `15,2 meses`
  e `43` vinculos encerrados elegiveis;
- Recreio: nenhuma linha, como esperado para o escopo atual;
- conversao com amostra `1/1` permanece `sem base` por nao atingir tres
  experimentais;
- presenca permanece `sem base`, sem zero substituto;
- retencao em revisao fica fora do score, mesmo exibindo o valor bruto.

## 6. Validacao visual

No Chrome autenticado em `http://localhost:5175/app/professores` foram
confirmados:

- recorte exato de Campo Grande;
- recorte exato Consolidado;
- ausencia de sobreposicao ou texto cortado no modal desktop;
- motivo de bloqueio visivel no cabecalho;
- separacao entre cobertura total e peso disponivel de cada pilar;
- permanencia exibida como meses e vinculos elegiveis, sem expor a soma bruta
  como se fosse denominador;
- V2 preservado nas secoes ainda fora do escopo deste checkpoint.

## 7. Verificacoes

- `node --test tests/healthScoreProfessorV3Frontend.test.mjs`: `14/14`;
- `node --test tests/*.test.mjs`: `246/246`;
- `npm run build`: exit `0`;
- `git diff --check`: sem erro de whitespace;
- migration aplicada no Supabase remoto;
- leitura real da RPC nos recortes Consolidado, Barra e Campo Grande;
- validacao visual em navegador autenticado.

## 8. Pendencia controlada

Ainda nao existe snapshot V3 publicavel de julho com base completa. Portanto,
o estado incompleto foi validado de ponta a ponta, mas a validacao visual de
um professor com todos os pilares publicaveis permanece aberta.

Este ponto nao autoriza fabricar um caso nem antecipar dados de presenca. A
Task 18, que migra Performance e rankings, permanece bloqueada ate:

1. homologacao do modal pelo Alf;
2. disponibilidade e validacao de um snapshot com base completa;
3. manutencao do rollback individual por feature flag.
