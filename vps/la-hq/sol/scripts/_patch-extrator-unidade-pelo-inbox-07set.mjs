#!/usr/bin/env node
// FALSO NEGATIVO: sinal que nao nasce porque o telefone nao resolveu (07/09/2026).
//
// 🔴 O caso real, no mesmo run em que eu media o falso POSITIVO: a conversa
//    20629 da `LA_Secretaria_Recreio` classificou como sinal e o insert morreu
//    com *"null value in column unidade_id violates not-null constraint"*. A
//    resolucao por telefone (`radar_resolver_entidade_por_telefone`) nao achou
//    aluno nem lead, entao `ident.unidade_id` veio nulo.
//
//    E o pior tipo de perda: a conversa foi lida, o modelo achou que era sinal,
//    a OpenAI foi paga — e nada chegou a pauta. Falso negativo custa tanto
//    quanto falso positivo, e este some sem ninguem perceber (o run responde
//    `ok:true` com um contador `erro_insert_sinal` que ninguem olha).
//
// ⚠️ A unidade JA ESTAVA NA MAO. A foto traz `c.unidade`, derivada de
//    `sol_chatwoot_inboxes` — o inbox se chama literalmente
//    `LA_Secretaria_Recreio`. So faltava usa-la quando a pessoa nao resolve.
//
// ⚠️ A unidade do INBOX e fallback, nunca preferencia: quando o telefone
//    resolve, quem manda e o cadastro do aluno. Aluno de CG pode escrever para
//    o inbox do Recreio, e nesse caso a unidade dele e CG.
//
// ⚠️ Se nem assim houver unidade (inbox sem unidade, como Instagram ou
//    Sol-Atendimento), o insert continua falhando E CONTINUA SENDO LOGADO — nao
//    inventar unidade e o certo; o que nao pode e a perda ser invisivel.
import fs from 'node:fs';

const alvo = process.argv[2] || 'supabase/functions/extrair-sinais-conversa/index.ts';
let s = fs.readFileSync(alvo, 'utf8');

if (s.includes('unidadeDoInbox')) { console.log('ja aplicado'); process.exit(0); }

const EOL = s.includes('\r\n') ? '\r\n' : '\n';

// 1) helper que traduz o nome da unidade da foto para o id
const ANC1 = 'async function classificar(';
if ((s.split(ANC1).length - 1) !== 1) { console.error('ANCORA classificar: esperava 1'); process.exit(1); }
const HELPER = [
  '// Traduz o nome da unidade que vem na foto (`sol_chatwoot_inboxes.unidade`)',
  '// para o id do LA Report. Cache em memoria: sao tres unidades e o run inteiro',
  '// dura minutos.',
  'let _unidades: Record<string, string> | null = null;',
  'async function unidadeDoInbox(',
  '  sb: SupabaseClient,',
  '  nome: string | null | undefined,',
  '): Promise<string | null> {',
  '  if (!nome) return null;',
  '  if (!_unidades) {',
  '    const { data } = await sb.from("unidades").select("id, nome");',
  '    _unidades = {};',
  '    for (const u of data ?? []) {',
  '      _unidades[String(u.nome).toLowerCase().trim()] = u.id;',
  '    }',
  '  }',
  '  return _unidades[String(nome).toLowerCase().trim()] ?? null;',
  '}',
  '',
  ANC1,
].join(EOL);
s = s.replace(ANC1, HELPER);

// 2) o insert usa o fallback
const ANC2 = '      unidade_id: ident.unidade_id ?? null,';
if ((s.split(ANC2).length - 1) !== 1) { console.error('ANCORA unidade_id: esperava 1'); process.exit(1); }
const NOVO2 = [
  '      // ⚠️ Fallback pelo INBOX quando o telefone nao resolve para aluno/lead.',
  '      //    Sem ele o sinal morre no NOT NULL e a conversa lida some (caso real:',
  '      //    conversa 20629 da LA_Secretaria_Recreio, 07/09). O cadastro do aluno',
  '      //    tem precedencia: aluno de CG que escreve ao inbox do Recreio e CG.',
  '      unidade_id: ident.unidade_id ?? await unidadeDoInbox(sb, c.unidade),',
].join(EOL);
s = s.replace(ANC2, NOVO2);

fs.writeFileSync(alvo, s);
console.log('extrator: unidade do inbox vira fallback');
