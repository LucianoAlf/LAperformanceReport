/**
 * Rotas que ja ganharam tela mobile propria.
 *
 * Cresce uma linha por modulo portado. Enquanto a rota nao esta aqui, o
 * shell mostra a tela do desktop com a faixa de aviso — degradar, nunca
 * bloquear: a equipe usa tudo, todo dia, e hoje essas telas ja abrem.
 */
export const ROTAS_PORTADAS: readonly string[] = ['/app'];

// ⚠️ '/app/alunos' saiu daqui em 14/09/2026, no mesmo dia em que entrou. A tela
// mobile existe e esta testada (src/mobile/telas/AlunosMobile.tsx), mas cobre
// UMA das 8 abas da pagina e nenhum dos 6 KPIs — e a ficha do aluno, que tem 9
// abas no desktop, virou uma folha de 9 campos. Marcar a rota como portada
// tirava a faixa de aviso e o acesso ao desktop: quem abrisse Alunos no celular
// veria menos do que ve hoje SEM NENHUM SINAL de que esta vendo menos. Isso nao
// e degradar, e esconder — o oposto do combinado da §8 do spec.

/** A raiz do app e a rota index (Dashboard) — suas "sub-rotas" sao outros modulos. */
const RAIZ_APP = '/app';

export function rotaFoiPortada(pathname: string, portadas: readonly string[] = ROTAS_PORTADAS): boolean {
  return portadas.some((rota) => {
    if (pathname === rota) return true;
    // Portar o Dashboard nao pode apagar a faixa de Alunos, Agenda e mais 15.
    if (rota === RAIZ_APP) return false;
    return pathname.startsWith(`${rota}/`);
  });
}
