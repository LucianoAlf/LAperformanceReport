/**
 * Rotas que ja ganharam tela mobile propria.
 *
 * Cresce uma linha por modulo portado. Enquanto a rota nao esta aqui, o
 * shell mostra a tela do desktop com a faixa de aviso — degradar, nunca
 * bloquear: a equipe usa tudo, todo dia, e hoje essas telas ja abrem.
 */
export const ROTAS_PORTADAS: readonly string[] = ['/app', '/app/alunos'];

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
