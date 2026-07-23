# Health Score V3 - Gate 2 do catalogo Emusys

**Data:** 2026-07-21  
**Projeto:** `ouqwbbermlzqqvtqwlul`  
**Escopo:** materializacao controlada de professor, unidade, curso e modalidade  
**Resultado:** aprovado, sem cutover de frontend

## O que foi aplicado

- Migration `20260720121000_professor_curso_modalidade_catalogo_v2.sql`.
- Evidencia V2 orientada pelo catalogo oficial do Emusys.
- Materializador idempotente conectado somente ao final de sync completo.
- Fila V2 com excecoes reais; pistas de `professores_cursos` e conflitos baseados em `aulas_emusys.tipo` foram excluidos.
- `fonte='emusys'` e `confianca='alta'` para vinculos resolvidos automaticamente.
- V1, assinaturas existentes e consumidores atuais permaneceram intactos.

## Simulacao antes da escrita

| Unidade | Desejados | Ja existentes | Novos | Automaticos a encerrar |
|---|---:|---:|---:|---:|
| Barra | 122 | 71 | 51 | 11 |
| Recreio | 149 | 68 | 81 | 15 |
| Campo Grande | 116 | 73 | 43 | 7 |

Os 33 encerramentos eram exclusivamente linhas automaticas de fonte `aula`, confianca media, ausentes do catalogo formal e da jornada ativa. Nenhuma linha manual ou revisada foi encerrada.

## Materializacao e idempotencia

| Unidade | Criados | Atualizados | Encerrados | Segunda execucao |
|---|---:|---:|---:|---|
| Barra | 51 | 71 | 11 | 0 criados, 0 atualizados, 0 encerrados |
| Recreio | 81 | 68 | 15 | 0 criados, 0 atualizados, 0 encerrados |
| Campo Grande | 43 | 73 | 7 | 0 criados, 0 atualizados, 0 encerrados |

Estado final:

| Unidade | Vinculos ativos | Fonte Emusys | Confianca alta | Duplicados | Fila acionavel |
|---|---:|---:|---:|---:|---:|
| Barra | 122 | 122 | 122 | 0 | 31 |
| Recreio | 149 | 149 | 149 | 0 | 7 |
| Campo Grande | 116 | 116 | 116 | 0 | 2 |

## Professor formal sem aluno

O catalogo manteve os vinculos formais mesmo sem jornada ativa:

| Unidade | Formais sem aluno | Materializados ativos |
|---|---:|---:|
| Barra | 55 | 55 |
| Recreio | 88 | 88 |
| Campo Grande | 47 | 47 |

Esses vinculos definem oferta e elegibilidade de configuracao. Como nenhum consumidor de score foi migrado neste gate, eles nao criam valor observado, nota ou penalizacao.

## Seguranca e desempenho

- Evidencia e materializador: sem `EXECUTE` para `public`, `anon` ou `authenticated`.
- Fila: disponivel para `authenticated`, com guarda `professores.editar` por unidade e `search_path` fixo.
- `service_role`: acesso operacional necessario.
- Consulta da evidencia completa: aproximadamente 97 ms para 459 linhas, com cache quente.
- Advisor: apenas avisos esperados de tabelas privadas com RLS sem policy publica, RPC guardada `SECURITY DEFINER` e indices novos ainda sem historico de uso.

## Testes

- `professorCursoModalidadeCatalogoV2.test.mjs`: 11/11.
- Compatibilidade V1, contrato segmentado e seguranca: 23/23.
- `git diff --check`: sem erro.

## Conclusao

O Gate 2 substituiu inferencias operacionais por catalogo, identidade por unidade e jornada canonica. A proxima fase pode orientar a matriz de metas pelo catalogo oficial sem reabrir a conciliacao cotidiana nem alterar ainda a configuracao ativa.
