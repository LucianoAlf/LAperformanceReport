# Health Score V3 - Gate 1 do catalogo Emusys

**Data:** 2026-07-21  
**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`  
**Modo:** coleta diagnostica, sem cutover de consumidores  
**Veredito:** aprovado

## Escopo executado

- migration `20260720120000_emusys_catalogo_professor_disciplinas.sql` aplicada;
- Edge Function `sync-professor-disciplinas-emusys` implantada com autenticacao propria;
- secret dedicado configurado sem registrar seu valor em codigo, log ou documento;
- coleta executada em ordem: Barra, Recreio e Campo Grande;
- cada unidade executada duas vezes para provar idempotencia;
- migration corretiva `20260721110000_emusys_catalogo_finalizador_auth_role.sql` aplicada apos teste RED/GREEN do guard de `service_role`.

## Incidente controlado

A primeira chamada da Barra leu e persistiu todo o catalogo, mas falhou na finalizacao. A causa foi o uso do claim legado `request.jwt.claim.role` pelo finalizador no PostgREST atual.

A correcao substituiu o guard por `auth.role()`, manteve `security definer`, fixou `search_path = public, pg_temp` e preservou os grants exclusivos do `service_role`. A execucao incompleta nao inativou nenhuma linha. Recreio e Campo Grande so foram chamados depois da correcao.

## Resultado por unidade

| Unidade | Disciplinas | Turma | Individual | Atribuicoes formais | Requisicoes |
|---|---:|---:|---:|---:|---:|
| Barra | 20 | 19 | 1 | 159 | 22 |
| Recreio | 29 | 18 | 11 | 169 | 31 |
| Campo Grande | 37 | 24 | 13 | 127 | 39 |

As duas execucoes completas de cada unidade retornaram exatamente as mesmas contagens. Em todas elas:

- `catalogo_inativados = 0`;
- `atribuicoes_inativadas = 0`;
- `falhas = 0`.

## Evidencias de integridade

| Verificacao | Resultado |
|---|---|
| Mesmo ID de disciplina em duas modalidades na mesma unidade | 0 casos |
| Contagem da API diferente da persistida | 0 casos |
| Atribuicao sem professor ou disciplina de origem | 0 casos |
| Campos fora da allowlist no snapshot do catalogo | 0 casos |
| Campos fora da allowlist no snapshot das atribuicoes | 0 casos |
| Linhas V1 alteradas pelo novo coletor | 0 |
| Total ativo V1 antes/depois | 245 / 245 |
| Inativacao provocada pela execucao que falhou | 0 |

O snapshot guarda apenas identificadores tecnicos, modalidade, nomes operacionais de disciplina/professor e metadados da coleta. Nao foram adicionados contatos, documentos, datas de nascimento ou outros dados pessoais desnecessarios.

## Seguranca

As tres tabelas possuem RLS habilitado. `anon` e `authenticated` nao possuem `SELECT`; `service_role` possui o acesso operacional necessario. O finalizador tambem retorna:

- `anon_execute = false`;
- `authenticated_execute = false`;
- `service_role_execute = true`.

O advisor de seguranca informa `RLS enabled no policy` nessas tabelas. Neste desenho isso e intencional: nao existe leitura direta pelo navegador; o acesso e service-only.

## Desempenho

O advisor registrou dois FKs sem indice dedicado:

- catalogo composto da atribuicao `(unidade_id, emusys_disciplina_id)`;
- `solicitado_por` da execucao.

Sao avisos informativos, sem impacto no resultado do Gate 1. Os indices de execucao tambem aparecem como ainda nao utilizados por terem acabado de ser criados. A otimizacao dos FKs fica registrada para o hardening, sem alterar a semantica do catalogo.

## Conclusao

O catalogo bruto do Emusys esta reproduzivel, privado e idempotente nas tres unidades. Nenhum consumidor V1, Health Score, card, relatorio ou fila existente mudou. O Gate 1 esta concluido e a materializacao V2 pode avancar de forma controlada.
