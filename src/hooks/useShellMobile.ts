import { useIsMobile } from '@/hooks/useIsMobile';
import { resolverShell } from '@/lib/shellMobile';

/**
 * Le as TRES entradas da decisao de shell e devolve o veredito.
 *
 * Existe porque quem escolhe a TELA (DashboardResponsivo, e cada modulo
 * portado daqui em diante) precisa decidir pela mesma funcao que escolhe o
 * SHELL (ResponsiveLayout). Enquanto a tela olhava so a largura, ela
 * discordava do shell nos dois casos que importam: com VITE_MOBILE_SHELL=off
 * o shell voltava ao desktop e a tela continuava mobile (o rollback nao
 * revertia nada), e com shell-override='mobile' num desktop o shell era
 * mobile e a tela era a do desktop — justo o caminho que existe para revisar
 * o trabalho no aparelho.
 */
export function useShellMobile(): 'mobile' | 'desktop' {
  const larguraMobile = useIsMobile();

  const flagDesligada = import.meta.env.VITE_MOBILE_SHELL === 'off';

  let override: string | null = null;
  try {
    override = localStorage.getItem('shell-override');
  } catch {
    // Navegador com storage bloqueado (aba anonima, cookies barrados).
    // Sem override e o comportamento normal — nao e erro.
    override = null;
  }

  return resolverShell({ larguraMobile, flagDesligada, override });
}

export default useShellMobile;
