import { useIsMobile } from '@/hooks/useIsMobile';
import { resolverShell } from '@/lib/shellMobile';
import { MobileLayout } from '@/mobile/MobileLayout';
import { AppLayout } from './AppLayout';

/**
 * Unico ponto onde se decide qual shell renderizar.
 *
 * O AppLayout nao sabe que isto existe — e o que mantem o desktop intocado.
 */
export function ResponsiveLayout() {
  const ehMobile = useIsMobile();

  const flagDesligada = import.meta.env.VITE_MOBILE_SHELL === 'off';

  let override: string | null = null;
  try {
    override = localStorage.getItem('shell-override');
  } catch {
    // Navegador com storage bloqueado (aba anonima, cookies barrados).
    // Sem override e o comportamento normal — nao e erro.
    override = null;
  }

  const shell = resolverShell({ larguraMobile: ehMobile, flagDesligada, override });

  return shell === 'mobile' ? <MobileLayout /> : <AppLayout />;
}

export default ResponsiveLayout;
