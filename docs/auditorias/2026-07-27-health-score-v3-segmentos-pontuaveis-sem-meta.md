# Health Score V3 - Inventario de Segmentos Pontuaveis sem Meta

**Data de preparacao:** 2026-07-27
**Modo:** SELECT-only
**Script:** `scripts/inventory-health-score-v3-segmentos-sem-meta.sql`

## Estado

Executado no projeto remoto `ouqwbbermlzqqvtqwlul` antes da criacao da revisao
V4. O inventario bloqueante retornou lista vazia nas tres unidades.

O script resolve a configuracao ativa aplicavel a julho de 2026 por vigencia e
usa IDs como identidade. Nomes de unidade, curso e professor aparecem somente
como rotulos de leitura.

## Grao

Cada linha representa uma combinacao:

```text
config_id
unidade_id
curso_id
modalidade
```

Tambem sao exibidos a versao da configuracao, os nomes descritivos, a quantidade
de professores, os `professor_ids`, os nomes para conferencia humana e o motivo
da ausencia da meta.

## Filtros

- unidades Campo Grande, Recreio e Barra pelos UUIDs canonicos;
- atribuicao com `status = 'ativo'`;
- `vigencia_fim is null`;
- `confianca in ('alta', 'revisada')`;
- curso com `natureza_operacional = 'pedagogica'`;
- meta segmentada em estado `configurada` ausente.

`Aula Experimental` (`curso_id = 45`) nao integra o inventario pedagogico. Sua
classificacao comercial nao remove nem substitui a fonte propria da conversao.

## Registro da execucao

```text
executado_em: 2026-07-27
ambiente/projeto: ouqwbbermlzqqvtqwlul
config_id: 4f34ac12-8a6a-4adc-9910-c60aebe2be89
config_versao: 4
total_de_linhas: 0
resultado: aprovado para ativacao
```

| Unidade | Segmentos pedagogicos pontuaveis sem meta |
|---|---:|
| Barra | 0 |
| Campo Grande | 0 |
| Recreio | 0 |

A verificacao posterior a ativacao tambem retornou `[]`.

## Limite

O resultado acima cobre somente atribuicoes pontuaveis. A auditoria do Task 8
encontrou 29 atribuicoes diagnosticas nao pontuaveis sem meta. Elas nao
bloquearam a ativacao, mas hoje ainda podem produzir
`segmentacao_incompleta` no agregado do professor. O efeito e detalhado em
`docs/auditorias/2026-07-27-health-score-v3-recalculo-tres-unidades.md`.
