#!/usr/bin/env node
// O EXTRATOR PASSA A CARIMBAR A SEGUNDA FOTO (07/09/2026).
//
// 🔴 Medido: 5 de 30 sinais de conversa vigentes (17%) ja tinham sido
//    respondidos e continuavam na pauta — a Sol cobraria a ADM por conversa
//    que ela ja tinha respondido. Com 4 dias de operacao. A taxa so cresce,
//    porque nada os apagava.
//
//    A causa esta escrita no proprio extrator: a chave de idempotencia inclui
//    a ultima mensagem, entao conversa parada do mesmo jeito nao e
//    reclassificada. O sinal e uma fotografia do instante da deteccao e
//    ninguem tirava a segunda.
//
// 🔴 A segunda foto ja existe e nao custa nada: a propria
//    `vw_atendimento_candidatos_sinal` e, por definicao, "cliente falou por
//    ultimo e ninguem respondeu". O extrator ja a busca inteira antes de
//    chamar a OpenAI. Quem ainda esta nela continua esperando; quem saiu, foi
//    respondido ou teve a conversa RESOLVIDA no Chatwoot — e resolver e
//    justamente o gesto pelo qual a equipe declara o desfecho.
//
// ⚠️ CRLF: este repo esta em Windows com autocrlf, entao ancorar com "\n" no
//    fim da linha NAO casa (medido: 1 ocorrencia sem a quebra, 0 com ela). O
//    patch ancora sem a quebra e reusa o final de linha do proprio arquivo.
import fs from 'node:fs';

const alvo = process.argv[2] || 'supabase/functions/extrair-sinais-conversa/index.ts';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('radar_marcar_foto_conversas_v1')) { console.log('ja aplicado'); process.exit(0); }

const EOL = s.includes('\r\n') ? '\r\n' : '\n';
const ANC = '  const candidatos: Candidato[] = foto.candidatos ?? [];';
const n = s.split(ANC).length - 1;
if (n !== 1) { console.error(`ANCORA: esperava 1, achei ${n}`); process.exit(1); }

const BLOCO = [
  '',
  '  // 1b) A SEGUNDA FOTO — o que faz o sinal SUMIR quando a equipe responde.',
  '  //',
  '  // 🔴 Medido em 07/09/2026: 5 de 30 sinais de conversa vigentes (17%) já',
  '  // tinham sido respondidos e continuavam na pauta. A causa é o comentário',
  '  // logo abaixo: a chave de idempotência inclui a última mensagem, então',
  '  // conversa parada do mesmo jeito não é reclassificada. O sinal é uma',
  '  // fotografia do instante e ninguém tirava a segunda.',
  '  //',
  '  // Esta foto JÁ é a segunda: por definição ela lista "cliente falou por',
  '  // último e ninguém respondeu". Quem ainda está nela continua esperando;',
  '  // quem saiu, foi respondido ou teve a conversa resolvida no Chatwoot.',
  '  // Custo: zero token, zero chamada nova — a foto já estava buscada.',
  '  //',
  '  // ⚠️ Roda ANTES do recorte de pendentes e independe de haver algo novo a',
  '  // classificar: em dia sem candidato novo é justamente quando os sinais',
  '  // velhos precisam ser reconferidos.',
  '  if (!ensaio) {',
  '    const { error: erroFoto } = await sb.rpc("radar_marcar_foto_conversas_v1", {',
  '      p_conversa_ids: candidatos.map((c) => Number(c.conversa_id)),',
  '      // ⚠️ foto truncada não decide nada: ausência não prova resposta.',
  '      p_truncado: foto.truncado === true,',
  '    });',
  '    if (erroFoto) {',
  '      // Falha aqui NÃO derruba a extração — ela só deixa a pauta um dia mais',
  '      // velha. Mas precisa aparecer: sem log, o sintoma seria "a pauta voltou',
  '      // a cobrar quem já respondeu" semanas depois, sem pista nenhuma.',
  '      await sb.from("automacao_log").insert({',
  '        evento: "mapa_sinais",',
  '        acao: "marcar_foto_conversas_falhou",',
  '        status: "erro",',
  '        aluno_nome: "(execucao)",',
  '        detalhes: { erro: String(erroFoto.message).slice(0, 300) },',
  '      });',
  '    }',
  '  }',
].join(EOL);

s = s.replace(ANC, ANC + EOL + BLOCO);
fs.writeFileSync(alvo, s);
console.log('extrator passa a carimbar a segunda foto');
