import { useShellMobile } from '@/hooks/useShellMobile';
import { MobileLayout } from '@/mobile/MobileLayout';
import { AppLayout } from './AppLayout';

/**
 * Unico ponto onde se decide qual shell renderizar.
 *
 * O AppLayout nao sabe que isto existe — e o que mantem o desktop intocado.
 * A decisao em si mora em useShellMobile, para a tela de cada modulo portado
 * responder ao mesmo veredito (kill switch e override inclusos).
 */
export function ResponsiveLayout() {
  const shell = useShellMobile();

  return shell === 'mobile' ? <MobileLayout /> : <AppLayout />;
}

export default ResponsiveLayout;
