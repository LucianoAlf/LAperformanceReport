# Health Score Professor V3 - Gate 6 em sombra

**Data:** 2026-07-18

**Projeto Supabase:** `ouqwbbermlzqqvtqwlul`

**Status:** execucao tecnica concluida; nenhuma publicacao produtiva

## 1. Veredito

O motor V3 foi executado em sombra para julho de 2026. A camada V2 permaneceu
intacta e continua sendo a fonte dos consumidores produtivos.

Foram criados `129` snapshots provisorios e `0` snapshots publicados:

| Recorte | Snapshots |
|---|---:|
| Barra | 20 |
| Campo Grande | 33 |
| Recreio | 26 |
| Consolidado | 50 |

Estados:

- `120` provisorios;
- `9` em maturacao;
- `0` fechados ou publicados.

## 2. Por que ainda nao existe score final

Julho e o primeiro mes do trimestre e a configuracao V1 vigora a partir de
`2026-07-01`. Portanto, a ausencia de score final e comportamento correto:

- conversao aguarda maturacao da coorte trimestral e janela D+30;
- media/turma precisa dos tres fechamentos mensais do trimestre;
- numero de alunos precisa dos tres fechamentos mensais;
- retencao ainda nao tem meta e confirmacoes reais suficientes;
- presenca comeca em `03/08/2026`;
- permanencia historica ja possui valor e nota quando a amostra e publicavel.

Nenhuma metrica sem base recebeu zero. A cobertura maxima observada foi `25%`,
correspondente ao pilar de permanencia disponivel.

## 3. Comparacao V2 x V3

Foi criada a RPC interna
`get_health_score_professor_v3_comparacao_sombra(date, uuid)`. Ela retorna,
por professor, unidade e pilar:

- valor V2 e valor bruto V3;
- delta diagnostico;
- meta, nota e peso V3;
- amostra, cobertura, confianca e estado de base;
- fonte e explicacao semantica;
- versao e revisao do snapshot.

A RPC e somente leitura, aceita apenas `service_role/postgres` e nao troca
nenhum consumidor.

Na media/turma, a diferenca absoluta media ficou pequena:

| Unidade | Professores com valor V3 | Delta absoluto medio |
|---|---:|---:|
| Barra | 19 | 0,03 |
| Campo Grande | 31 | 0,08 |
| Recreio | 24 | 0,05 |

Exemplos nominais:

| Professor/unidade | V2 media/turma | V3 media/turma | Permanencia V3 |
|---|---:|---:|---:|
| Daiana / Barra | 2,11 | 1,91 | 11,20 meses |
| Gabriel Antony / Barra | 1,19 | 1,24 | 11,12 meses |
| Peterson / Barra | 1,43 | 1,38 | 12,41 meses |
| Daiana / Campo Grande | 3,25 | 3,25 | 10,19 meses |
| Peterson / Campo Grande | 1,42 | 1,44 | 15,19 meses |
| Rafael Akeem / Recreio | 1,18 | 1,19 | 8,88 meses |
| Ramon / Recreio | 1,00 | 1,00 | 14,15 meses |

As diferencas nao foram escondidas. Elas permanecem no comparador para
homologacao antes de qualquer virada.

## 4. Permanencia nominal

Foram conferidos periodos abaixo e acima de quatro meses nas tres unidades.
O historico preserva os vinculos curtos, mas somente periodos encerrados com
duracao minima de quatro meses, publicabilidade e confianca elegivel entram na
nota.

| Unidade | Encerrados | Menos de 4 meses | Elegiveis por duracao | Publicaveis |
|---|---:|---:|---:|---:|
| Barra | 1.073 | 528 | 545 | 738 |
| Campo Grande | 3.499 | 1.453 | 2.046 | 2.555 |
| Recreio | 2.535 | 1.216 | 1.319 | 1.066 |

Elegibilidade por duracao e publicabilidade historica sao filtros diferentes;
o motor preserva essa transparencia.

## 5. Seguranca e desempenho

Durante a auditoria foi identificado acesso direto herdado para quatro roles
de agentes. Como a camada ainda esta em sombra, os grants foram revogados por
migration. Resultado final:

- `public/anon/authenticated`: zero grants nas quatro tabelas V3;
- agentes internos: zero grants diretos;
- `service_role`: leitura nas quatro tabelas;
- RLS ativo e sem policies de cliente, produzindo bloqueio direto intencional;
- comparador disponivel somente para `service_role`.

O comparador retornou 120 linhas para Barra em aproximadamente `319 ms` no
`EXPLAIN ANALYZE`, adequado para auditoria interna e nao usado no carregamento
produtivo.

## 6. Requisito para o Gate 7

A UI de configuracao deve permitir liberdade controlada para a coordenacao:

1. sliders alteram apenas pesos;
2. metas possuem campos numericos separados;
3. uma versao ativa e imutavel;
4. editar duplica a versao ativa para um novo rascunho;
5. o rascunho exige vigencia, autor e justificativa;
6. a coordenacao simula impacto antes de ativar;
7. ativacao e comando separado;
8. snapshots fechados nunca sao reescritos;
9. o navegador nao escreve diretamente nas tabelas;
10. a operacao exige `professores.editar`.

## 7. Proximo passo

O Gate 7 pode iniciar em homologacao. A UI V3 deve permanecer atras de feature
flag e consumir somente snapshots/configuracoes V3, sem fallback para V2 ou
zero e sem substituir a configuracao produtiva atual.

## 8. Arquivos

- `supabase/migrations/20260718183000_health_score_v3_meta_conversao_70_ativa.sql`;
- `supabase/migrations/20260718190000_health_score_v3_comparacao_sombra.sql`;
- `supabase/migrations/20260718191500_health_score_v3_gate6_isolamento_roles.sql`;
- `tests/healthScoreProfessorV3Snapshots.test.mjs`.
