// Compatibilidade para imports internos antigos. A rota publica usa index.ts,
// que aponta para a mesma tela financeira global.
export {
  FaturasAlunosFinanceirasPage as FaturasAlunosPage,
  FaturasAlunosFinanceirasPage as default,
} from './FaturasAlunosFinanceirasPage';
