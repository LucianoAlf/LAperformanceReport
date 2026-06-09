# P0.1D - Relatorios, Graficos e Vinculos Operacionais

Data: 2026-06-08

## 1. Resumo executivo

Este pacote continua a unificacao das fontes dos KPIs de alunos, sem mexer em banco.

Foram tratados dois pontos:

- Relatorio administrativo WhatsApp: deixou de usar `vw_kpis_gestao_mensal` para KPIs de alunos/matriculas e passou a calcular pela regra canonica viva do P0.1.
- Pagina Alunos: vinculos filhos de segundo curso/banda agora exibem o tipo de matricula do proprio vinculo, evitando esconder bolsa integral/parcial.

Nao houve migration, deploy, UPDATE, DELETE, INSERT, backfill ou alteracao em `dados_mensais`.

## 2. Leticia Ferreira Vasconcelos

Evidencia SELECT-only anterior:

- Vinculo principal: Teclado, regular, parcela R$ 420.
- Vinculo filho: Canto, segundo curso, `tipo_matricula_id = 3`, `BOLSISTA_INT`, parcela nula.

Problema:

- A tabela mostrava apenas `2o curso`, mesmo quando o vinculo filho era bolsa integral.
- A ficha financeira ja mostrava corretamente `Bolsista Integral`.

Correção aplicada:

- `TabelaAlunos.tsx` agora mostra badge do tipo de matricula do vinculo filho:
  - `Bolsista integral`;
  - `Bolsista parcial`;
  - `Banda`.

Validação visual:

- Leticia expandida na Pagina Alunos mostra `2o curso` + `Bolsista integral` no vinculo de Canto.

## 3. Relatorio administrativo WhatsApp

Arquivo alterado:

- `supabase/functions/relatorio-admin-whatsapp/index.ts`

Antes:

- KPIs de alunos vinham de `vw_kpis_gestao_mensal`.
- Alguns itens eram queries diretas locais em `alunos`.
- Isso podia divergir dos cards validados em Dashboard, Analytics, Administrativo e Pagina Alunos.

Depois:

- KPIs de alunos/matriculas usam uma helper canonica local no Edge Function:
  - alunos ativos = pessoas unicas ativas/trancadas;
  - alunos pagantes = pessoas unicas com parcela recorrente pagante;
  - bolsistas integrais/parciais = pessoas com vinculo ativo/trancado nao-banda marcado como bolsa;
  - matriculas ativas = vinculos ativos/trancados;
  - banda/coral/segundo curso separados como vinculos;
  - novos no mes = pessoas pagantes novas, sem segundo curso, banda/coral ou bolsista.

Ainda nao alterado neste pacote:

- Renovacoes, avisos previos, nao renovacao e churn continuam usando `vw_kpis_retencao_mensal`/`movimentacoes_admin`.
- O caso de renovacao antecipada foi explicitamente deixado para outro desenho, conforme decisao do Alf.

## 4. Graficos

O ajuste de `useDadosHistoricos.ts` removeu dependencia de `vw_kpis_gestao_mensal` para dados atuais e historico de gestao:

- dados atuais passam por `fetchKPIsAlunosCanonicos`;
- historico de gestao passa a ler `dados_mensais`.

Ainda pendente:

- revisar retencao grafico a grafico;
- revisar comercial/leads em frente propria;
- confirmar se `TabDashboard` legado ainda deve existir ou ser removido/deprecado.

## 5. Objetos ainda nao liberados para deprecacao

Nenhum objeto deve ser removido agora.

| Objeto | Status | Motivo |
|---|---|---|
| `vw_kpis_retencao_mensal` | Em uso | Retencao/relatorio administrativo ainda dependem dela |
| `vw_dashboard_unidade` | Legado a revisar | Referencia em `TabDashboard` |
| `vw_kpis_comercial_historico` | Fora do P0.1 | Comercial/leads ainda precisa frente propria |
| `vw_unidade_anual` | Fora do P0.1 | Historico anual ainda precisa classificacao |
| `get_programa_fideliza_dados` | Pendente | Fideliza+ fica em P0.2 |
| `get_carteira_professores` | Pendente | Professores/carteira fica operacional |

## 6. Validacao executada

- Build local passou.
- Chrome logado validou a Pagina Alunos com Leticia expandida.
- O relatorio foi corrigido localmente, mas ainda nao foi feito deploy da Edge Function.

## 7. Riscos restantes

- A automacao de renovacao antecipada ainda pode registrar competencia operacional errada.
- Dados operacionais de Olivia/Laura/Manuela/Isis/Leticia precisam tratamento nominal pela equipe, sem ajuste automatico neste pacote.
- Retencao ainda nao esta 100% unificada com snapshot/historico.
- Edge Function precisa deploy aprovado para a correcao chegar ao relatorio enviado.

## 8. Proximo passo recomendado

1. Deploy controlado do `relatorio-admin-whatsapp`, com teste manual de payload para Campo Grande e Recreio.
2. P0.1E: auditar retencao/churn/renovacao por grafico e relatorio.
3. P0.2: auditar Fideliza+ e `get_programa_fideliza_dados`.
4. So depois iniciar plano formal de deprecacao de views/RPCs.
