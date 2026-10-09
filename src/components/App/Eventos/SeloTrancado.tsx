import { PauseCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * "trancado" — a matricula esta pausada, e a pessoa segue convidavel.
 *
 * FONTE UNICA do rotulo e do texto de ajuda: a aba Alunos, o seletor da Grade e a busca de
 * aluno de outra unidade falam da MESMA pessoa, e nao podem divergir sobre o que "trancado"
 * significa. Aqui ele e so apresentacao — quem decide e o banco
 * (`vw_evento_aluno_elegivel_v1.trancado` por pessoa, `cursos[].trancado` por curso).
 *
 * ⚠️ O selo e informativo, NUNCA bloqueio: trancar nao e sair, e o recital e convite.
 * Esconder era o defeito que a Fernanda relatou (09/10/2026); mostrar sem marca seria
 * pior, porque o ingresso e o aviso ao professor sairiam como se o aluno estivesse em aula.
 */
export function SeloTrancado({
  /** 'pessoa' = nenhuma matricula ativa; 'curso' = so este curso esta trancado. */
  escopo = 'pessoa',
  className,
}: {
  escopo?: 'pessoa' | 'curso';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1 rounded bg-amber-500/15 px-1.5 py-px',
        'text-[12px] font-medium text-amber-300 sm:text-[10.5px]',
        className,
      )}
      title={
        escopo === 'curso'
          ? 'Matrícula deste curso trancada — pode participar do recital, é decisão da coordenação'
          : 'Matrícula trancada — pode participar do recital, é decisão da coordenação'
      }
    >
      <PauseCircle className="h-3 w-3" />
      trancado
    </span>
  );
}
