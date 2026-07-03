import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/App/Administrativo/ModalAvisoPrevio.tsx', 'utf8');

assert(
  source.includes('const hoje = new Date();'),
  'novo aviso previo deve calcular a data real de hoje, nao apenas a competencia selecionada na tela',
);

assert(
  source.includes('const dataAvisoPadrao = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());'),
  'data padrao deve ser normalizada para meia-noite local antes do toISOString',
);

assert(
  source.includes('const proximoMes = new Date(dataAvisoPadrao.getFullYear(), dataAvisoPadrao.getMonth() + 1, 1);'),
  'mes_saida padrao deve ser o mes seguinte a data real do aviso',
);

assert(
  source.includes('data: dataAvisoPadrao,'),
  'formData.data deve receber dataAvisoPadrao para evitar cadastrar aviso atual no mes historico',
);

assert(
  !source.includes('data: new Date(parseInt(ano), parseInt(mes) - 1, new Date().getDate())'),
  'novo aviso previo nao deve herdar a data da competencia historica',
);

console.log('modal aviso previo default date: OK');
