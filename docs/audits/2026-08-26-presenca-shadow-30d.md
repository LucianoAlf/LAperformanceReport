# Evidência shadow de presença — 30 dias

Data da coleta: 2026-08-26  
Projeto: `ouqwbbermlzqqvtqwlul`  
Janela: 2026-07-27 a 2026-08-25  
Modo: SQL ad hoc somente leitura, sem DDL, DML, deploy ou cutover

## Critério

- `contagem_v1`: linhas terminais do modelo legado.
- `contagem_v2`: ocorrências lógicas terminais após deduplicação por aluno, unidade, professor, início, fim e curso, com precedência humana e política temporal.
- `sem_explicacao`: divergência de estado ou cardinalidade sem uma causa concreta do contrato. Sync sem cobertura não é aceito como explicação.
- Os diagnósticos podem se sobrepor e, portanto, não formam uma soma aritmética do `delta`.
- As amostras foram redigidas por hash do slot; nenhuma amostra sem explicação foi encontrada.

## Resultado real

| Unidade | v1 | v2 | Delta | Gêmeas extras | Colisão de curso | Precedência humana | Política temporal | Dias sem log legado | Sem explicação |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Barra | 1.616 | 836 | -780 | 807 | 2 | 139 | 25 | 0 | 0 |
| Campo Grande | 2.890 | 1.622 | -1.268 | 1.599 | 0 | 361 | 4 | 0 | 0 |
| Recreio | 2.607 | 1.376 | -1.231 | 1.252 | 0 | 290 | 13 | 0 | 0 |

Hashes da projeção comparada:

| Unidade | Hash v1 | Hash v2 |
|---|---|---|
| Barra | `e1a133ace508f2fb4522978eb42dee75` | `a77335dcff9533030d9ef2e79e43a835` |
| Campo Grande | `20aefe164c599de20e7cc098d9e8b288` | `1dae414840d08df83a8240fbab8e9b82` |
| Recreio | `c080371af6c54d09efe9bf860d33091e` | `35810e26753d295c38f1f9982e5f1b7d` |

## Integridade das decisões humanas

O reparo proposto não contém `UPDATE`, `DELETE`, `INSERT` ou backfill de `aluno_presenca`. A simulação calculou a mesma contagem e o mesmo hash antes/depois:

| Unidade | Decisões humanas | Hash antes | Hash depois simulado | Alteração prevista |
|---|---:|---|---|---|
| Barra | 1.036 | `1597220987f6ed04907812f60b2d0e24` | `1597220987f6ed04907812f60b2d0e24` | não |
| Campo Grande | 2.436 | `ec5a3cb7e84ec761833dbcc351e1e508` | `ec5a3cb7e84ec761833dbcc351e1e508` | não |
| Recreio | 1.861 | `39c9bf63b6c20a92bc92054049478892` | `39c9bf63b6c20a92bc92054049478892` | não |

## Limites ainda abertos

- `roster_fantasma` permanece **não medido**, não zero: `aula_roster_sync_estado` e `ativo_operacional` ainda não estão publicados no remoto.
- “0 dias sem log” comprova a existência do log legado `emusys_sync_log`; não substitui a futura prova de cobertura completa por páginas, hash e execução terminal de `presenca_sync_cobertura`.
- A paridade visual dia/mês aberto/mês fechado continua pendente até a publicação técnica em sombra e a validação autenticada das telas.

## Estado do gate

- `sem_explicacao=0`: aprovado nas 90 combinações unidade/dia.
- decisão humana alterada: não.
- cutover: não ocorreu.
- dry-run de roster por unidade: aguarda publicação aditiva e aprovação humana separada.
- migration produtiva, reparo de roster, deploy de Edge e ativação de consumidores: exigem quatro autorizações distintas.
