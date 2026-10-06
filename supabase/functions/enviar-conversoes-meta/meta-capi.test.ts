/// <reference lib="deno.ns" />
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  eventId, JANELA_DIAS, montarEvento, normalizarTelefone, partesDoNome, sha256, triar, type ItemFila,
} from './meta-capi.ts';

const AGORA = Date.parse('2026-10-06T15:00:00Z');

function item(p: Partial<ItemFila> = {}): ItemFila {
  return {
    lead_id: 10, aluno_id: null, tipo: 'experimental', event_name: 'Schedule',
    ocorrido_em: '2026-10-01T15:00:00Z', valor: null, nome: 'Maria da Silva',
    telefone: '21 98765-4321', email: null, ...p,
  };
}

Deno.test('telefone: formatos do cadastro viram o mesmo numero com DDI', () => {
  assertEquals(normalizarTelefone('21 98765-4321'), '5521987654321');
  assertEquals(normalizarTelefone('5521987654321'), '5521987654321');
  assertEquals(normalizarTelefone('+55 (21) 98765-4321'), '5521987654321');
  assertEquals(normalizarTelefone('2133334444'), '552133334444');
  assertEquals(normalizarTelefone('021987654321'), '5521987654321');
});

Deno.test('telefone: lixo e estrangeiro nao viram hash', () => {
  assertEquals(normalizarTelefone(null), null);
  assertEquals(normalizarTelefone('.'), null);
  assertEquals(normalizarTelefone('12345'), null);
  assertEquals(normalizarTelefone('+1 978-391-6233'), null);
  assertEquals(normalizarTelefone('552198765432100'), null);
});

Deno.test('nome: "." e espaco nao viram nome; acento fica', () => {
  assertEquals(partesDoNome('.'), { fn: null, ln: null });
  assertEquals(partesDoNome('  '), { fn: null, ln: null });
  assertEquals(partesDoNome('Keise Gaspar Nascimento Peixoto'), { fn: 'keise', ln: 'peixoto' });
  assertEquals(partesDoNome('João'), { fn: 'joão', ln: null });
});

Deno.test('event_id: matricula e por aluno (dois leads, um evento)', () => {
  assertEquals(eventId({ tipo: 'matricula', lead_id: 1, aluno_id: 99 }), 'lareport-matricula-aluno-99');
  assertEquals(eventId({ tipo: 'matricula', lead_id: 2, aluno_id: 99 }), 'lareport-matricula-aluno-99');
  assertEquals(eventId({ tipo: 'experimental', lead_id: 7, aluno_id: null }), 'lareport-experimental-lead-7');
});

Deno.test('triagem: fora da janela, sem telefone, futuro e aluno repetido saem com motivo', () => {
  const velho = new Date(AGORA - (JANELA_DIAS + 1) * 86400_000).toISOString();
  const fila = [
    item({ lead_id: 1 }),
    item({ lead_id: 2, ocorrido_em: velho }),
    item({ lead_id: 3, telefone: '.' }),
    item({ lead_id: 4, ocorrido_em: '2026-12-01T00:00:00Z' }),
    item({ lead_id: 5, tipo: 'matricula', event_name: 'Purchase', aluno_id: 50 }),
    item({ lead_id: 6, tipo: 'matricula', event_name: 'Purchase', aluno_id: 50 }),
  ];
  const { elegiveis, descartes } = triar(fila, AGORA);
  assertEquals(elegiveis.map((e) => e.lead_id), [1, 5]);
  assertEquals(descartes.map((d) => d.item.lead_id), [2, 3, 4, 6]);
  assert(descartes[0].motivo.startsWith('fora da janela'));
  assertEquals(descartes[1].motivo, 'sem telefone valido');
});

Deno.test('evento: nada de dado pessoal em claro; valor so na matricula', async () => {
  const exp = await montarEvento(item());
  const txt = JSON.stringify(exp);
  assert(!txt.includes('98765'), 'telefone em claro');
  assert(!txt.toLowerCase().includes('maria'), 'nome em claro');
  assertEquals((exp.user_data as any).ph, [await sha256('5521987654321')]);
  assertEquals(exp.action_source, 'physical_store');
  assertEquals(exp.custom_data, undefined);
  assertEquals(exp.event_time, Math.floor(Date.parse('2026-10-01T15:00:00Z') / 1000));

  const mat = await montarEvento(item({ tipo: 'matricula', event_name: 'Purchase', aluno_id: 3, valor: '5053.54' }));
  assertEquals(mat.custom_data, { currency: 'BRL', value: 5053.54 });
  assertEquals(mat.event_id, 'lareport-matricula-aluno-3');
});

Deno.test('marca: Kids/School vai em content_category; sem marca nao inventa', async () => {
  const kids = await montarEvento(item({ marca: 'Kids' }));
  assertEquals(kids.custom_data, { content_category: 'Kids' });
  const school = await montarEvento(item({ tipo: 'matricula', event_name: 'Purchase', aluno_id: 4, valor: '4620', marca: 'School' }));
  assertEquals(school.custom_data, { currency: 'BRL', value: 4620, content_category: 'School' });
  const sem = await montarEvento(item({ marca: null }));
  assertEquals(sem.custom_data, undefined);
  const estranha = await montarEvento(item({ marca: 'Outra' }));
  assertEquals(estranha.custom_data, undefined);
});

Deno.test('sha256 confere com o valor conhecido', async () => {
  assertEquals(await sha256('br'), '885036a0da3dff3c3e05bc79bf49382b12bc5098514ed57ce0875aba1aa2c40d');
});
