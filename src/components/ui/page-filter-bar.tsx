import React from 'react';
import { cn } from '@/lib/utils';

interface PageFilterBarProps {
  children?: React.ReactNode;
  className?: string;
}

/**
 * Linha padronizada de filtros que fica entre o header global e as abas.
 * Quando não há filtros, renderiza um espaçador com altura mínima
 * para manter as abas sempre na mesma posição vertical entre páginas.
 */
export function PageFilterBar({ children, className }: PageFilterBarProps) {
  return (
    <div className={cn("flex items-center justify-end min-h-[40px]", className)}>
      {children}
    </div>
  );
}
