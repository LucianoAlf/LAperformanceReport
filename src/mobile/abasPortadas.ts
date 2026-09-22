/**
 * Quais ABAS de uma rota já ganharam versão mobile.
 *
 * Por que o grão deixou de ser a rota. Em 14/09/2026 a tela de Alunos foi
 * marcada como portada tendo só a aba Lista adaptada — e `/app/alunos` tem
 * OITO abas e 6 KPIs. O efeito não foi "faltou coisa": foi a faixa âmbar
 * sumir, e com ela o aviso de que aquela tela mostra menos. Quem abrisse via
 * menos do que via antes sem nenhum sinal.
 *
 * Marcar a rota inteira só quando as 8 abas estiverem prontas também não
 * serve: deixaria o celular sem nada por semanas, quando 7 dessas abas já
 * ABREM hoje (desajeitadas, rolando para o lado — que é a degradação
 * combinada na §8 do spec).
 *
 * Então a faixa passa a ser por aba: a rota é alcançável desde o primeiro
 * dia, cada aba declara se foi adaptada, e a faixa some uma por vez.
 */

/** Rotas que exibem a própria faixa, por aba, em vez da faixa do shell. */
export const ROTAS_COM_FAIXA_POR_ABA: readonly string[] = ['/app/alunos', '/app/agenda'];

/**
 * Abas com versão mobile, por rota. Cresce uma linha por aba portada.
 *
 * ⚠️ A ausência aqui NÃO esconde a aba — ela continua alcançável, só ganha a
 * faixa. É o contrário de bloquear.
 */
export const ABAS_PORTADAS: Readonly<Record<string, readonly string[]>> = {
  // ⚠️ `'conciliacao'` entra com RECORTE declarado: no celular ela decide só o
  // que é binário e nunca em lote — o resto é leitura, com o motivo escrito na
  // linha (ver `@/lib/conciliacao`). A faixa some porque a tela foi adaptada,
  // não porque faz tudo o que a do computador faz.
  '/app/alunos': ['lista', 'historico', 'turmas', 'automacao', 'distribuicao', 'grade', 'conciliacao'],
  // ⚠️ `'calendario'` continua FORA de propósito: ele segue abrindo a tela do
  // desktop, com a faixa âmbar. Marcar a rota inteira apagaria a faixa dele
  // junto — que é exatamente o erro cometido com Alunos em 14/09.
  '/app/agenda': ['professor', 'sala', 'chamada'],
};

export function rotaTemFaixaPorAba(
  pathname: string,
  rotas: readonly string[] = ROTAS_COM_FAIXA_POR_ABA,
): boolean {
  return rotas.includes(pathname);
}

/**
 * A aba tem versão mobile? Rota desconhecida devolve `false` — o padrão é
 * avisar, nunca presumir que está adaptada.
 */
export function abaFoiPortada(
  pathname: string,
  aba: string | null | undefined,
  mapa: Readonly<Record<string, readonly string[]>> = ABAS_PORTADAS,
): boolean {
  if (!aba) return false;
  return (mapa[pathname] ?? []).includes(aba);
}
