import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const edge = readFileSync(
  new URL('../supabase/functions/enviar-pesquisa-pos-primeira-aula/index.ts', import.meta.url),
  'utf8',
);

// Um aluno tem mais de uma conversa no mesmo departamento quando a de boas-vindas nasce no
// telefone do responsavel e depois aparece a do telefone dele. Com maybeSingle a busca erra e
// devolve nulo: a mensagem 'interativo' nao era gravada e sobrava so o eco achatado do webhook.
test('busca da conversa do aluno nao usa maybeSingle', () => {
  const busca = edge.match(/\.eq\('aluno_id', alunoId\)[\s\S]{0,240}?;/)?.[0] ?? '';

  assert.notEqual(busca, '', 'busca da conversa por aluno nao encontrada');
  assert.doesNotMatch(busca, /maybeSingle/);
});

test('conversa e casada pelo telefone da mensagem', () => {
  const resolver = edge.match(/async function resolverConversaAluno[\s\S]*?\n\}/)?.[0] ?? '';

  assert.notEqual(resolver, '', 'resolverConversaAluno nao encontrada');
  assert.match(resolver, /somenteDigitos\(c\.whatsapp_jid\) === alvo/);
});

// uq_admin_conversas_jid_depto faz o insert falhar quando o numero ja tem conversa; sem
// reconsultar, a edge ficava sem conversaId e retornava sem gravar nada.
test('insert recusado pelo indice unico do jid cai em nova consulta', () => {
  const resolver = edge.match(/async function resolverConversaAluno[\s\S]*?\n\}/)?.[0] ?? '';

  assert.match(resolver, /\.eq\('whatsapp_jid', jid\)/);
});

test('falha ao resolver a conversa e registrada no log', () => {
  assert.match(edge, /console\.error\('\[enviar-pesquisa\] conversa nao resolvida/);
});

test('falha ao gravar a mensagem na caixa e registrada no log', () => {
  assert.match(edge, /console\.error\('\[enviar-pesquisa\] mensagem nao gravada/);
});
