#!/usr/bin/env node
// A DESCRIÇÃO DA TOOL DE TRÁFEGO PASSA A EXIGIR A RESSALVA (08/09/2026).
//
// 🔴 O CASO: às 14:49 a Mila mandou ao Luciano "custo por matrícula: R$ 1.185
//    (Instagram) / R$ 1.051 (Google)" e concluiu *"Google converte melhor e tem
//    custo por matrícula menor"*. Ele respondeu **"tá errado"**.
//
//    O número saía de uma função com dois defeitos (o gasto do Meta contado
//    duas vezes, corrigido na migration `20260908180000`), mas **um terceiro
//    problema é de LEITURA, não de cálculo**: metade do denominador ainda não
//    tinha tido tempo de virar matrícula. Medido em 365 dias de leads pagos, o
//    lead leva **mediana 8 dias** até a matrícula (p75 20, p90 46) — e na
//    janela que ela leu, **237 dos 466 leads do Instagram (50,9%) tinham menos
//    de 20 dias**.
//
//    Ou seja: R$ 1.185 não é o custo por matrícula. É um **teto**, e vai cair
//    conforme os leads amadurecem.
//
// ⚠️ A descrição ANTIGA já dizia "(imaturo)" entre parênteses e a Mila não
//    falou disso. Parêntese não é obrigação. É a mesma lição de 05/09 — ela
//    tinha a tool `o_que_aprendemos` disponível e respondeu de intuição: **tool
//    nova não basta, tem que ensinar QUANDO e COM QUE RESSALVA usar.**
//
// ⚠️ Também ensino a nova forma dos canais, senão ela "corrige" o agrupamento
//    de volta: Instagram+Facebook é **uma linha porque é uma verba só** (o Meta
//    não separa por posicionamento nesta tabela), e Site entra no Google por
//    regra do Luciano de 03/09. Dois canais cobrando da mesma plataforma é
//    exatamente o que duplicava o gasto.
//
// ⚠️ E proíbo o ranking com número pequeno: ela comparou 4 matrículas contra 3
//    e concluiu quem "converte melhor". Isso é ruído, não resultado.
const fs = require('fs');

const alvo = process.argv[2] || '/home/mila/.openclaw/workspace/scripts/mila-gestao-tools-mcp.mjs';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('leads_imaturos')) { console.log('ja aplicado'); process.exit(0); }

const VELHO = "    description: 'DIRETORIA. Desempenho por canal (Instagram, Google, Indicação, Visita...): leads, agendamentos, matrículas, gasto, custo por lead e por matrícula, retorno em LTV. `gasto` NULL com gasto_dias_cobertos=0 = NÃO SEI (nunca \"de graça\"). Canal orgânico não tem mídia — diga \"sem mídia\", não \"custo zero\". Use p_dias=30/p_maturidade=0 para o mês corrente (imaturo) e 180/35 para coorte madura.',";

const NOVO = "    description: 'DIRETORIA. Desempenho por canal: leads, agendamentos, matrículas, gasto, custo por lead e por matrícula, retorno em LTV. 🔴 SEMPRE que citar `custo_matricula` ou `conv_pct`, diga na MESMA frase quantos leads ainda não tiveram tempo: o campo `leads_imaturos` conta os criados há menos de `dias_p50_ate_converter` dias (a mediana medida entre o lead pago chegar e virar matrícula). Com imaturos relevantes, `custo_matricula` é um **TETO que ainda vai cair**, nunca \"o custo\" — em 08/09 ela disse \"R$ 1.185 por matrícula\" com 109 de 467 leads sem chance de converter, e o Alf respondeu \"tá errado\". 🔴 NÃO ranqueie canal por conversão com pouca matrícula (4 contra 3 é ruído, não resultado) — diga que a diferença ainda não separa. ⚠️ Os canais vêm agrupados por VERBA, e é assim que deve ser lido: `Instagram/Facebook` é UMA linha porque é uma conta só do Meta (o gasto é indivisível na fonte), e `Site` entra no `Google` (é a landing page da campanha — regra do Alf, 03/09). Não desagregue nem \"corrija\" isso: dois canais cobrando da mesma plataforma foi o que duplicou o gasto até 08/09. ⚠️ `gasto` NULL com `gasto_dias_cobertos`=0 = NÃO SEI (nunca \"de graça\"); canal orgânico é \"sem mídia\", não \"custo zero\"; e se `gasto_dias_cobertos` < `janela_dias`, diga que a foto de gasto está incompleta. Use dias=30/maturidade=0 para o mês corrente e 180/35 para coorte madura.',";

const n = s.split(VELHO).length - 1;
if (n !== 1) { console.error('ANCORA da descricao: esperava 1, achei ' + n); process.exit(1); }

const carimbo = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
fs.copyFileSync(alvo, alvo + '.bak-' + carimbo + '-antes-teto-trafego');
fs.writeFileSync(alvo, s.split(VELHO).join(NOVO));
console.log('ok: a tool de trafego passa a exigir a ressalva de imaturidade');
