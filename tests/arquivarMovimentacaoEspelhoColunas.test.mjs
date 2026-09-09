// A lixeira de movimentações precisa espelhar TODA coluna nova da tabela viva.
//
// CASO (08/09/2026): a migration `20260905180228_saida_emusys_canonica_por_matricula`
// acrescentou `origem_registro` a `movimentacoes_admin` e não espelhou em
// `movimentacoes_admin_arquivadas`. Como `arquivar_movimentacao_admin` copiava por POSIÇÃO
// (`select v_linha.*`), o insert passou a mandar 42 valores para 41 lugares e a RPC quebrou
// com `INSERT has more expressions than target columns`.
//
// Efeito real: a RPC é chamada por três telas (aba de movimentações, avisos vencidos e
// planilha de retenção) e o DELETE direto é bloqueado por trigger desde agosto — então de
// 05/09 a 08/09 a equipe ficou sem conseguir nem arquivar nem excluir lançamento errado.
// Ninguém reportou; foi descoberto por acaso ao corrigir outra coisa.
//
// A RPC hoje copia por nome e RECUSA com `COLUNA_SEM_ESPELHO`, mas essa guarda só fala
// depois que a migration já está em produção. Este teste é o que pega antes: varre as
// migrations e cobra o espelho de cada coluna adicionada à tabela viva.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dirMigrations = path.join(raiz, 'supabase/migrations');

// A lixeira nasceu aqui; só colunas adicionadas DEPOIS precisam de espelho declarado,
// porque as anteriores já entraram na criação da tabela.
const MIGRATION_DA_LIXEIRA = '20260810172140_movimentacoes_admin_lixeira_e_trava_delete.sql';

/**
 * Colunas adicionadas a uma tabela por `alter table ... add column`. Aceita o `if not
 * exists` e o nome com ou sem `public.`, que é como as migrations do repo variam.
 */
function colunasAdicionadas(sql, tabela) {
  const encontradas = new Set();
  const alvo = new RegExp(
    String.raw`alter\s+table\s+(?:only\s+)?(?:public\.)?${tabela}\b([\s\S]*?);`,
    'gi',
  );
  for (const bloco of sql.matchAll(alvo)) {
    const corpo = bloco[1];
    const adds = corpo.matchAll(
      /add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi,
    );
    for (const add of adds) encontradas.add(add[1].toLowerCase());
  }
  return encontradas;
}

function migrationsAposLixeira() {
  return readdirSync(dirMigrations)
    .filter((nome) => nome.endsWith('.sql') && nome >= MIGRATION_DA_LIXEIRA)
    .sort();
}

test('toda coluna nova de movimentacoes_admin tem espelho na lixeira', () => {
  const naViva = new Map(); // coluna -> migration que a criou
  const naLixeira = new Set();

  for (const nome of migrationsAposLixeira()) {
    const sql = readFileSync(path.join(dirMigrations, nome), 'utf8');
    // A ordem importa: a mesma migration pode criar a coluna nas duas tabelas.
    for (const coluna of colunasAdicionadas(sql, 'movimentacoes_admin_arquivadas')) {
      naLixeira.add(coluna);
    }
    for (const coluna of colunasAdicionadas(sql, 'movimentacoes_admin')) {
      if (!naViva.has(coluna)) naViva.set(coluna, nome);
    }
  }

  const semEspelho = [...naViva.entries()].filter(([coluna]) => !naLixeira.has(coluna));

  assert.deepEqual(
    semEspelho,
    [],
    'Coluna(s) adicionada(s) a movimentacoes_admin sem espelho em '
      + 'movimentacoes_admin_arquivadas: '
      + semEspelho.map(([coluna, origem]) => `${coluna} (${origem})`).join(', ')
      + '. Sem o espelho, arquivar_movimentacao_admin recusa com COLUNA_SEM_ESPELHO e a '
      + 'equipe fica sem conseguir excluir lançamento pela tela.',
  );
});

test('o caso que originou o teste esta coberto: origem_registro', () => {
  // Guarda contra o teste passar por não estar lendo nada (regex quebrada, pasta errada).
  const naViva = new Set();
  for (const nome of migrationsAposLixeira()) {
    const sql = readFileSync(path.join(dirMigrations, nome), 'utf8');
    for (const coluna of colunasAdicionadas(sql, 'movimentacoes_admin')) naViva.add(coluna);
  }
  assert.ok(
    naViva.has('origem_registro'),
    'a varredura deixou de enxergar `origem_registro` em movimentacoes_admin — '
      + 'o teste virou verde vazio e nao protege mais nada',
  );
});

/** Tira os comentários `--`, senão o texto que EXPLICA o defeito é lido como o defeito. */
function semComentarios(sql) {
  return sql.split('\n').filter((linha) => !linha.trimStart().startsWith('--')).join('\n');
}

test('a RPC copia por nome e recusa coluna sem espelho', () => {
  const sql = readFileSync(
    path.join(dirMigrations, '20260908193000_arquivar_movimentacao_copia_por_nome.sql'),
    'utf8',
  );
  const codigo = semComentarios(sql);
  assert.match(
    codigo,
    /COLUNA_SEM_ESPELHO/,
    'a RPC precisa recusar explicitamente, nunca arquivar pela metade',
  );
  assert.doesNotMatch(
    codigo,
    /select\s+v_linha\.\*/i,
    'a copia posicional (`select v_linha.*`) foi a causa do defeito e nao pode voltar',
  );
  assert.match(
    sql,
    /revoke\s+execute\s+on\s+function\s+public\.arquivar_movimentacao_admin[\s\S]*?anon/i,
    'CREATE OR REPLACE reabre EXECUTE para anon neste projeto, e esta funcao APAGA linha',
  );
});
