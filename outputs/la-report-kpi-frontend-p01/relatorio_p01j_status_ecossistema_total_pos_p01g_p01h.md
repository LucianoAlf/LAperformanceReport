# P0.1J - Status do Ecossistema de Fontes KPI apos P0.1G/P0.1H

Data: 2026-06-09

## 1. Resumo executivo

O nucleo de KPIs executivos de alunos esta no trilho canonico nas telas principais:

- Dashboard;
- Analytics / Gestao;
- Administrativo / Lancamentos;
- Pagina Alunos.

Para mes fechado, a fonte segue `dados_mensais`.
Para mes atual aberto, a fonte viva canonica usa a regra de pessoas unicas versus vinculos.

O que ainda nao pode ser chamado de 100% concluido:

- deploy da Edge Function `relatorio-admin-whatsapp`;
- Fideliza+;
- Professores / Carteira e Performance;
- objetos legados mantidos como rollback ou como area fora do P0.1;
- deprecacao de views/RPCs antigas.

## 2. Validado nesta etapa

### Build

`npm run build` passou.

Avisos ainda existentes:

- avisos antigos do Rollup/Recharts sobre reexport circular de `Bar`;
- chunks grandes.

Nao houve erro de TypeScript/bundling.

### Smoke visual via Playwright

Ambiente:

- app local `http://127.0.0.1:4176`;
- usuario autenticado;
- sem disparar relatorio, recalculo, snapshot ou escrita operacional.

Resultados:

| Tela | Resultado |
|---|---|
| Administrativo / Lancamentos | carregou sem erro; resumo consolidado Jun/2026 mostra base canonica: 1.034 ativos, 989 pagantes, 1.209 matriculas |
| Analytics / Retencao | carregou sem erro; usa helper operacional canonica para mes atual |
| Administrativo / Programa Fideliza+ | carregou sem erro; badge `Fonte trimestral propria - P0.2 pendente` visivel |
| Professores / Carteira | carregou sem erro; badge `Carteira operacional ao vivo - nao compara com competencia fechada` visivel |
| Leticia Ferreira Vasconcelos / Recreio | validado visualmente pelo Alf: segundo curso aparece como `Bolsista integral` |

## 3. Varredura de codigo local

Busca em `src` e `supabase/functions` por fontes legadas:

| Referencia restante | Arquivo | Status |
|---|---|---|
| `get_programa_fideliza_dados` | `src/hooks/useFidelizaPrograma.ts` | pendente P0.2 |
| `get_carteira_professores` | `src/components/App/Professores/TabCarteiraProfessores.tsx` | operacional P0.3 |
| `vw_dashboard_unidade` | `src/components/GestaoMensal/TabDashboard.tsx` | componente legado isolado, sem export no barrel |

Nao apareceram referencias runtime em frontend/Edge para:

- `vw_kpis_gestao_mensal`;
- `vw_kpis_retencao_mensal`;
- `vw_dashboard_unidade`, fora do componente legado isolado.

## 4. Varredura SELECT-only no banco

Projeto confirmado pelo MCP:

- `https://ouqwbbermlzqqvtqwlul.supabase.co`

Funcoes verificadas:

| Funcao | Fonte atual | Status |
|---|---|---|
| `get_kpis_alunos_canonicos` | canonica | OK; `SECURITY DEFINER`; `SET search_path = public, pg_temp` |
| `get_dados_relatorio_gerencial` | chama `get_kpis_alunos_canonicos` | OK; nao usa views antigas |
| `get_dados_retencao_ia` | chama `get_kpis_alunos_canonicos` | OK; nao usa views antigas |
| `get_programa_fideliza_dados` | RPC propria trimestral | pendente; `SECURITY DEFINER` sem `SET search_path` |
| `get_carteira_professores` | operacional vivo por professor | pendente P0.3; nao e KPI historico |

Funcoes legadas renomeadas ainda existem:

- `get_dados_relatorio_gerencial_legacy_p01g`;
- `get_dados_retencao_ia_legacy_p01g`.

Elas ainda referenciam views antigas, mas sao rollback/legado. Nao devem ser chamadas pelo frontend atual.

## 5. Relatorios administrativos

### Relatorio manual / tela Administrativo

Status: corrigido localmente para usar resumo canonico da tela.

### Edge Function `relatorio-admin-whatsapp`

Status: patch local aplicado, mas ainda nao deployado.

Mudanca local:

- passa a buscar KPIs de alunos/matriculas via RPC `get_kpis_alunos_canonicos`;
- remove dependencia de `vw_kpis_gestao_mensal` e `vw_kpis_retencao_mensal`;
- retencao operacional do mes vem de `movimentacoes_admin`.

Risco restante:

- enquanto nao houver deploy da Edge Function, o relatorio automatico em producao pode continuar usando a versao antiga implantada.

Para concluir:

1. aprovar deploy da Edge Function;
2. executar deploy controlado;
3. gerar relatorio teste sem enviar para equipe, se houver modo dry-run;
4. comparar Campo Grande, Recreio e Barra com cards canonicos.

## 6. Graficos

Status por area:

| Area | Status |
|---|---|
| Dashboard / graficos de alunos | migrados para dados historicos/canonicos conforme P0.1 |
| Analytics / Gestao / evolucao mensal | migrado para historico/canonico no escopo de alunos |
| Analytics / Retencao | mes atual usa helper operacional canonica; historico ainda e operacional de movimentos |
| Administrativo / resumo e retencao do mes | corrigido localmente para helper canonica |
| Comercial / Leads | fora do P0.1 |
| Fideliza+ trimestral | pendente P0.2 |
| Professores | pendente P0.3 |

## 7. Fideliza+ - P0.2

Fideliza+ ainda nao pode ser tratado como fonte 100% canonica.

Achados:

- `useFidelizaPrograma` consome RPC `get_programa_fideliza_dados`;
- a RPC e trimestral e tem regra propria;
- a RPC e `SECURITY DEFINER`, mas ainda nao tem `SET search_path = public, pg_temp`;
- a logica trimestral precisa decidir como tratar:
  - trimestre aberto/preliminar;
  - trimestre fechado/premiacao;
  - meses parcialmente fechados;
  - inadimplencia zero como valor legitimo;
  - churn/renovacao/reajuste trimestral.

Acao local aplicada:

- badge discreto em Fideliza+: `Fonte trimestral propria - P0.2 pendente`.

Nao foi feita migration P0.2.

## 8. Professores - P0.3

Carteira de Professores continua operacional ao vivo.

Isso e correto desde que nao seja comparado com KPI historico fechado.

Achados:

- `get_carteira_professores` nao usa fonte canonica de competencia;
- conta carteira/vinculos por professor;
- usa tambem `vw_kpis_professor_mensal` para performance/health score;
- nao existe snapshot historico de professor validado.

Acao local aplicada:

- badge: `Carteira operacional ao vivo - nao compara com competencia fechada`.

Nao foi feita migration P0.3.

## 9. Objetos que ainda nao podem ser removidos

Nao deprecar/remover ainda:

- `get_programa_fideliza_dados`;
- `get_carteira_professores`;
- `vw_kpis_professor_mensal`;
- `vw_kpis_comercial_mensal`;
- `get_dados_comercial_ia`;
- funcoes `_legacy_p01g`, enquanto rollback ainda for desejado;
- `vw_dashboard_unidade`, ate remover formalmente `TabDashboard.tsx` ou confirmar zero uso externo.

## 10. Objetos candidatos futuros

Podem entrar em plano de deprecacao depois de mais uma rodada de evidencias:

- `vw_kpis_gestao_mensal`;
- `vw_kpis_retencao_mensal`;
- `vw_dashboard_unidade`;
- funcoes `_legacy_p01g`.

Pre-condicoes:

1. zero referencia em frontend/Edge;
2. zero dependencia em RPC/view/function ativa;
3. zero uso em n8n/cron/relatorio externo;
4. substituto canonico documentado;
5. rollback definido;
6. etapa de desativacao antes de DROP.

## 11. Proxima sequencia segura

1. Deploy controlado da Edge Function `relatorio-admin-whatsapp`, se Alf aprovar.
2. P0.2: desenhar e revisar migration/RPC do Fideliza+ com governanca trimestral.
3. P0.3: decidir se Professores tera snapshot historico ou se sera formalmente apenas operacional.
4. P0.4: inventario de deprecacao das views antigas e funcoes legacy.

## 12. Decisao atual

Status honesto:

- KPIs executivos de alunos nas telas principais: corrigidos e validados.
- Graficos principais de alunos/retencao: corrigidos no escopo P0.1, com smoke visual OK.
- Relatorio automatico WhatsApp: patch local pronto, ainda precisa deploy.
- Fideliza+: identificado, sinalizado e pendente P0.2.
- Professores: identificado, sinalizado e pendente P0.3.
- Deprecacao: ainda nao aprovar DROP/remocao.
