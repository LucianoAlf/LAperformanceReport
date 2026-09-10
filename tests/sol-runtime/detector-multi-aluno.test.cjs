// Detector de contexto multi-aluno: casos REAIS extraídos dos lançamentos do caixa
// (últimos 20 dias) + o caso que falhou em 24/08 (Thiago e Matheus, R$350 cada).
// Roda contra o runtime vivo.
const mod = require('./_alvo.cjs');
const det = mod.detectarContextoMultiAluno;
if (typeof det !== 'function') { console.error('detectarContextoMultiAluno nao exportada'); process.exit(1); }

const MULTI = [
  'Passaporte aluno Thiago Fernandes E Matheus Fernandes 350,00 cada',   // caso 24/08
  'Passaporte alunos Thiago Fernandes e Matheus Fernandes',
  '08/26 - Daniel Da Hora Marinho e Arthur Da Hora Marinho',
  'Manuela Lima Dias e Lidiane Maria Barbosa Parcela 08/26',
  'Maria Luiza Silva e Maria Flor Silva e Maria Rita Porfirio Parcela 08/26',
  'Parcela 08/2026 - Gabriel Nogueira + Ana Clara Nogueira',
  'PG pix passaportes alunos João Victor Ramos Coelho e Pedro Victor Ramos Coelho - LA CG R$720,00',
  'Passaporte de João Victor e Pedro Victor - R$ 720,00',
  'Parcela dos alunos Lucas Silva e Mariana Silva R$ 400 cada',
];

const SINGULAR = [
  '08/26 - Alcione Vieira Bastos De Mello',
  '12 parcelas aluna Luiza Pimentel Oliveira Barbosa',                    // plural de PARCELA
  'Parcela 07/26 + 08/26 aluno Arthur Martins Teixeira',                  // "+" liga DATAS
  'pagamento a vista do pacote de renovação da aluna Catarina Bahia Teodoro, parcela ficou de 300',
  'Parcela do mês de agosto da aluna Valentina Mendes Rodrigues Aleixo R$814,81',
  'Passaporte promocional da aluna Giovanna Oliveira da Cunha - R$400,00',
  'Parcela 08/2026 - Isabella Pereira Freitas De almeida -',
  'Parcela do mês de agosto da aluna Amaia Rodriguez Mercês R$385,00',
  'PG passaporte ( cartão de débito) Aluno: Hugo Sobrinho Carmo KIDS CG - R$500,00',
];

let falhas = 0;
console.log('=== DEVEM DETECTAR MULTI ===');
MULTI.forEach((t) => {
  const r = det(t);
  console.log((r ? '  ok  ' : '  FALHA ') + t.slice(0, 78));
  if (!r) falhas++;
});
console.log('=== NAO PODEM DETECTAR (1 aluno) ===');
SINGULAR.forEach((t) => {
  const r = det(t);
  console.log((!r ? '  ok  ' : '  FALSO+ ') + t.slice(0, 78));
  if (r) falhas++;
});
console.log('');
if (falhas) { console.log(`RESULTADO: ${falhas} falha(s)`); process.exit(1); }
console.log('RESULTADO: PASSOU — ' + (MULTI.length + SINGULAR.length) + ' casos reais');
