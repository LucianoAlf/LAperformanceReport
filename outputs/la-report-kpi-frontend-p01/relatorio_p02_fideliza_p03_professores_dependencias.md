# P0.2/P0.3 - Fideliza+, Professores e Dependencias Legadas

Data: 2026-06-08

## 1. Escopo

Auditoria SELECT-only e leitura de codigo para as duas frentes que ficaram fora da unificacao P0.1 dos cards executivos de alunos:

- P0.2: Administrativo / Programa Fideliza+.
- P0.3: Professores / Carteira e Performance.

Nao houve migration, DDL, deploy ou escrita em banco.

## 2. Fideliza+

Frontend:

- `src/hooks/useFidelizaPrograma.ts`
- `src/components/App/Administrativo/TabProgramaFideliza.tsx`

Fonte atual:

- RPC `public.get_programa_fideliza_dados(p_ano integer, p_trimestre integer, p_unidade_id uuid)`.

Achados:

- A RPC e `SECURITY DEFINER`.
- A RPC nao tem `SET search_path = public, pg_temp`.
- A RPC mistura fontes:
  - `dados_mensais` para algumas bases mensais anteriores;
  - `movimentacoes_admin` para evasoes trimestrais;
  - `renovacoes` para renovacao/reajuste;
  - `dados_mensais.inadimplencia` para inadimplencia;
  - fallback vivo em `alunos` por `COUNT(*)` quando falta base em `dados_mensais`.
- A inadimplencia trimestral ignora meses com `inadimplencia = 0` por causa do filtro `dm.inadimplencia > 0`; isso pode distorcer uma meta em que zero e valor legitimo.
- O fechamento trimestral `salvar_historico_trimestral_fideliza` escreve em `programa_fideliza_historico` usando media de `dados_mensais`, tambem sem validar status em `competencias_mensais`.

Valores observados via RPC para Q2/2026:

| Unidade | Churn | Inadimplencia | Renovacao | Evasoes tri | Base media |
|---|---:|---:|---:|---:|---:|
| Barra | 3.59% | 0.00% | 100.00% | 24 | 223 |
| Campo Grande | 2.24% | 0.00% | 100.00% | 31 | 463 |
| Recreio | 3.94% | 0.00% | 100.00% | 37 | 311 |

Conclusao P0.2:

- Fideliza+ nao deve ser considerado 100% alinhado aos KPIs canonicos mensais ainda.
- Nao deprecar `get_programa_fideliza_dados`.
- Proxima etapa correta: desenhar regra trimestral formal:
  - trimestre fechado deve depender apenas de competencias fechadas/snapshots aprovados;
  - trimestre aberto pode ser preliminar, mas com badge claro;
  - inadimplencia zero precisa contar como dado valido;
  - toda funcao `SECURITY DEFINER` nova/revisada precisa de `SET search_path = public, pg_temp`.

## 3. Professores / Carteira

Arquivos:

- `src/components/App/Professores/TabCarteiraProfessores.tsx`
- `src/components/App/Professores/TabPerformanceProfessores.tsx`
- `src/components/GestaoMensal/TabProfessoresNew.tsx`

Fontes atuais:

- RPC `public.get_carteira_professores(p_unidade_id uuid)`.
- View `public.vw_kpis_professor_mensal`.
- View `public.vw_kpis_professor_historico`.
- Queries diretas em `alunos`, `vw_turmas_implicitas`, `turmas_explicitas`, `turmas_alunos` e leads/movimentacoes auxiliares.

Achados:

- `get_carteira_professores` e operacional vivo, baseado em `alunos.status = 'ativo'`.
- A carteira conta linhas/vinculos por professor, nao pessoa unica canonica de KPI executivo.
- `vw_kpis_professor_mensal` tambem e viva e usa `CURRENT_DATE`.
- `TabCarteiraProfessores` calculava "Alunos Pagantes" por derivacao `round(MRR / ticket)`, o que era fonte falsa.

Acao local aplicada:

- Removido o card derivado "Alunos Pagantes" da Carteira de Professores.
- Adicionado badge: `Carteira operacional ao vivo - nao compara com competencia fechada`.
- Mantido o modulo como operacional; nao migrado para fonte historica.

Conclusao P0.3:

- Professores/Carteira pode continuar vivo/operacional.
- Nao deve ser usado para comparar com Dashboard/Analytics nem com competencia fechada.
- Antes de qualquer deprecacao, e preciso decidir se existe necessidade de snapshot historico de professor; hoje nao existe.

## 4. Dependencias que bloqueiam deprecacao

Varredura SELECT-only por `pg_get_functiondef`/`pg_views` encontrou dependencias ativas:

| Objeto candidato | Dependente encontrado | Tipo |
|---|---|---|
| `vw_kpis_gestao_mensal` | `get_dados_relatorio_gerencial` | function |
| `vw_kpis_gestao_mensal` | `get_dados_retencao_ia` | function |
| `vw_kpis_retencao_mensal` | `get_dados_relatorio_gerencial` | function |
| `vw_kpis_retencao_mensal` | `get_dados_retencao_ia` | function |
| `vw_kpis_professor_mensal` | `get_dados_relatorio_gerencial` | function |

Impacto:

- Ainda nao pode remover `vw_kpis_gestao_mensal`, `vw_kpis_retencao_mensal` ou `vw_kpis_professor_mensal`.
- Mesmo que o frontend principal tenha sido corrigido, relatorios/RPCs internos ainda podem puxar fonte antiga.

## 5. Proximo patch recomendado

### P0.1G - Relatorios gerenciais/IA

Objetivo:

- Corrigir `get_dados_relatorio_gerencial` e `get_dados_retencao_ia` para a mesma regra:
  - mes fechado: `dados_mensais`;
  - mes atual aberto: fonte viva canonica;
  - mes passado aberto: preliminar/indisponivel, sem recalculo silencioso.

Regras:

- Migration separada, revisada antes.
- Sem alterar snapshot.
- Sem backfill.
- Todas as funcoes `SECURITY DEFINER` revisadas com `SET search_path = public, pg_temp`.

### P0.2 - Fideliza+

Objetivo:

- Definir governanca trimestral.
- Corrigir inadimplencia zero como valor legitimo.
- Separar trimestre aberto/preliminar de trimestre fechado/premiacao.

### P0.3 - Professores

Objetivo:

- Manter carteira como operacional.
- Decidir se existe necessidade de snapshot historico por professor.
- Se existir, criar desenho separado; se nao, documentar como operacional e bloquear comparacoes com KPI fechado.

## 6. Decisao atual

- Cards executivos de alunos: unificados nas telas principais.
- Relatorio WhatsApp: patch local pronto, ainda nao deployado.
- Relatorios gerenciais/IA: bloqueiam deprecacao das views antigas.
- Fideliza+: pendente de desenho trimestral.
- Professores: operacional vivo, sem status de KPI historico.
