import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const filePath = 'src/components/App/Administrativo/ModalRelatorio.tsx';
const source = readFileSync(filePath, 'utf8');

assert(
  source.includes('function classificarTipoEvasaoMovimentacao'),
  'monthly reports must use a shared evasion type classifier',
);

assert(
  !source.includes("evasoes.filter(e => e.tipo_evasao === 'interrompido')"),
  'monthly report must not count interrupted evasions from raw tipo_evasao only',
);

assert(
  !source.includes("const tipo = e.tipo_evasao || 'outros';"),
  'standalone evasion report must not group missing tipo_evasao as outros',
);

assert(
  !source.includes("e.tipo_evasao || 'N/A'"),
  'standalone evasion report must not print missing tipo_evasao as N/A',
);

assert(
  source.includes('const tipo = classificarTipoEvasaoMovimentacao(e);'),
  'monthly evasion details must classify normal evasions with missing tipo_evasao as interrupted',
);

console.log('relatorio admin mensal evasoes: OK');
