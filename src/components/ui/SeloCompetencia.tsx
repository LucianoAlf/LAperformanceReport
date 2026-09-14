import { Lock, Unlock } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useShellMobile } from '@/hooks/useShellMobile';

/**
 * O selo que diz se a competência está aberta ou fechada para escrita.
 *
 * Estava copiado, igual, em três telas (Alunos, Gestão e Comercial). Virou
 * componente quando a versão de celular precisou ser diferente: consertar o
 * mesmo trecho três vezes é como o filtro de período chegou à tela de Alunos
 * ainda largo, depois de já ter sido resolvido no Dashboard.
 *
 * ⚠️ No celular ele mostra **só o estado** ("Aberto"/"Fechado"), não o rótulo
 * inteiro. `badgeLabel` é `<unidade> · <competência> · <estado>`, e no telefone
 * os dois primeiros já estão na tela, a centímetros dali: a unidade no
 * cabeçalho e a competência na pílula ao lado. Repetir os três custava 76px de
 * altura numa faixa de 375px — o selo não cabia ao lado da pílula e descia uma
 * linha inteira. O texto completo continua no `title`, e no desktop nada muda.
 */

export interface SeloCompetenciaStatus {
  loading: boolean;
  bloqueiaEscrita: boolean;
  tooltip?: string;
  badgeLabel: string;
  /** Só o estado: "Aberto", "Fechado"… */
  label: string;
}

interface SeloCompetenciaProps {
  status: SeloCompetenciaStatus;
  /** Classes de cor calculadas pela tela (variam com o estado). */
  className?: string;
  /** `rounded-xl` em Gestão/Comercial, `rounded-lg` em Alunos. */
  raio?: 'lg' | 'xl';
}

export function SeloCompetencia({ status, className, raio = 'xl' }: SeloCompetenciaProps) {
  const ehCelular = useShellMobile() === 'mobile';

  const texto = status.loading
    ? 'Validando competência'
    : ehCelular
      ? status.label
      : status.badgeLabel;

  return (
    <div
      className={cn(
        'flex max-w-full items-center gap-1.5 border px-3 py-1.5 text-xs font-medium',
        raio === 'lg' ? 'min-h-8 rounded-lg' : 'min-h-9 rounded-xl',
        className,
      )}
      // O rótulo inteiro nunca se perde: no celular ele fica aqui.
      title={status.loading ? undefined : `${status.badgeLabel}${status.tooltip ? ` — ${status.tooltip}` : ''}`}
    >
      {status.bloqueiaEscrita ? <Lock className="h-3.5 w-3.5 flex-none" /> : <Unlock className="h-3.5 w-3.5 flex-none" />}
      <span className="min-w-0 truncate">{texto}</span>
    </div>
  );
}

export default SeloCompetencia;
