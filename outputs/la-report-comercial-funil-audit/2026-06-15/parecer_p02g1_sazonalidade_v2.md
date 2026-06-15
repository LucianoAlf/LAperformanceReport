# Parecer P02.G1 - Sazonalidade v2

Data: 2026-06-15

## Escopo

Patch local para migrar apenas o bloco `ComercialSazonalidade` da rota `/apresentacao/comercial` para a fonte comercial canonica v2.

Arquivos do patch:

- `src/components/Comercial/ComercialSazonalidade.tsx`
- `src/hooks/useComercialSeriesMensaisV2.ts`

Fora do escopo:

- Banco, SQL, migrations e Supabase.
- `dados_comerciais` e `origem_leads`.
- Dashboard, Analytics, `/app/comercial`, `ComercialPage`, `useComercialData`.
- `ComercialCursos`, `ComercialProfessores`, `ComercialFunil`.
- Merge e deploy.

## Fonte de dados

O novo hook `useComercialSeriesMensaisV2` chama a RPC:

`get_kpis_comercial_canonicos_v2`

Formato usado:

- 12 chamadas mensais para 2025.
- `p_unidade_id: null`.
- `p_periodo: mensal`.
- leitura de `kpis.leads_entrantes`.
- leitura de `kpis.matriculas_comerciais_principais`.
- leitura de `por_unidade` para Campo Grande, Recreio e Barra.

O patch nao usa `useComercialData`, `dados_comerciais` ou `origem_leads`.

## Evidencia visual

Validacao visual local autenticada read-only em:

`http://127.0.0.1:5174/apresentacao/comercial`

Resultado:

- Sazonalidade sem erro RPC.
- Sem `NaN`.
- Sem loading infinito.
- Grafico com `Leads Entrantes` vs `Matriculas Comerciais`.
- Heatmap preenchido para Campo Grande, Recreio, Barra e TOTAL.
- Toggle `Leads Entrantes` / `Matriculas Comerciais` funcionando.
- Cards de maior/menor matricula comercial aparecem.
- Insight calculado/neutro.
- `ComercialInicio` continua ok.
- `ComercialOrigem` continua ok.

Artefatos visuais:

`D:\2026\_la-report-artifacts\2026-06-14-p02g1-sazonalidade-visual\`

ZIP:

`D:\2026\_la-report-artifacts\2026-06-14-p02g1-sazonalidade-visual.zip`

## Payload real v2

A validacao capturou os 12 meses de 2025 a partir do payload real da RPC v2.

Totais normalizados:

- Leads Entrantes: 2.133
- Matriculas Comerciais: 73

Por unidade:

- Campo Grande: 1.100 leads / 13 matriculas
- Recreio: 520 leads / 2 matriculas
- Barra: 513 leads / 58 matriculas

Observacao importante: essa distribuicao por unidade veio do payload real da RPC v2. Nao foi tratada como bug visual automatico. Deve entrar como pendencia de validacao semantica posterior.

Arquivos de evidencia:

- `05_rpc_raw_payloads_dedup_2025.json`
- `06_series_mensais_normalizadas_reais.json`
- `07_validacao_visual_summary.json`

## Gates

Scripts disponiveis no projeto:

- `dev`
- `build`
- `preview`

Nao ha scripts `lint` ou `test` configurados no `package.json`.

Gates executados:

- Validacao local de normalizacao com fixture v2: passou.
- `npm run build`: passou com exit code 0.

Observacoes do build:

- Warnings de chunks/Recharts preexistentes.
- Nenhum erro de compilacao.

## Riscos e pendencias

- A distribuicao `Barra 58 / Campo Grande 13 / Recreio 2` precisa de validacao semantica posterior com Alf/Hugo.
- O patch nao corrige regra de negocio de matricula por unidade; apenas renderiza o payload canonico v2.
- O bloco ainda esta hardcoded em 2025, como os demais blocos da apresentacao.
- Este PR nao autoriza migrar outro consumidor comercial.

## Veredito

P02.G1 esta apto para PR pequeno e draft, limitado aos arquivos listados acima e a este parecer.

Ainda nao autorizado:

- merge;
- deploy;
- banco;
- SQL;
- migration;
- mudanca em consumidores fora de Sazonalidade.
