import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { correcaoAguardandoSync } from '../src/lib/conciliacao.ts';

const le = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('aviso já corrigido no cadastro diz quem, quando (BRT) e que sai no sync', () => {
  // Caso real: Gabriela de Lima Sodré, corrigida pelo Arthur em 07/10 16:52 UTC.
  const frase = correcaoAguardandoSync({
    aguardando_sync: true,
    cadastro_alterado_em: '2026-10-07T16:52:27.912582+00:00',
    cadastro_alterado_por: 'arthur@lamusic.com.br',
  });
  assert.match(frase, /^Já corrigido no cadastro por arthur em 07\/10 às 13:52\./);
  assert.match(frase, /sync da noite/);
});

test('sem aguardando_sync não há aviso — nem com dado de alteração presente', () => {
  for (const v of [false, null, undefined]) {
    assert.equal(correcaoAguardandoSync({
      aguardando_sync: v, cadastro_alterado_em: '2026-10-07T16:52:27Z', cadastro_alterado_por: 'arthur@lamusic.com.br',
    }), null);
  }
});

test('autor que não é pessoa (sync, script) não vira nome na frase', () => {
  const frase = correcaoAguardandoSync({
    aguardando_sync: true, cadastro_alterado_em: null, cadastro_alterado_por: 'sync-matriculas-emusys',
  });
  assert.equal(frase, 'Já corrigido no cadastro. O aviso sai sozinho no sync da noite (entre 23h e 23h40).');
});

test('as duas telas leem a mesma frase da lib, sem reescrever a regra', () => {
  for (const p of ['../src/components/App/Alunos/ConciliacaoMatriculas.tsx', '../src/mobile/telas/alunos/ConciliacaoMobile.tsx']) {
    const fonte = le(p);
    assert.match(fonte, /correcaoAguardandoSync\(/, `${p} não usa a regra`);
    assert.doesNotMatch(fonte, /Já corrigido no cadastro/, `${p} reescreveu a frase`);
  }
});

test('migration: só compara status e ordena os já corrigidos por último', () => {
  const sql = le('../supabase/migrations/20261007180000_conciliacao_status_corrigido_aguarda_sync.sql');
  assert.match(sql, /d\.tipo_divergencia = 'status_divergente'/);
  assert.match(sql, /order by t\.aguardando_sync, t\.severidade, t\.detectado_em/);
  assert.match(sql, /coalesce\(/, 'NULL ordenaria depois do true');
  assert.doesNotMatch(sql, /update\s+public\.matriculas_divergencias/i, 'a tela não fecha aviso; quem fecha é o sync');
});
