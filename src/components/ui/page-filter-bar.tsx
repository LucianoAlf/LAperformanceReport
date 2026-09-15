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
    // flex-wrap: sem ele os filtros que nao cabem na largura do celular ficam
    // FORA da tela em vez de descer uma linha — nao encolhem, porque item de
    // flex nao passa abaixo do proprio min-content.
    //
    // justify-start ate `sm`: alinhar a direita numa faixa de 351px cola tudo
    // na borda e deixa o buraco do lado esquerdo, que e o que faz a barra
    // parecer quebrada no telefone. Em tela larga segue `justify-end`, como
    // sempre foi.
    <div className={cn("flex flex-wrap items-center justify-start gap-2 min-h-[40px] sm:justify-end", className)}>
      {children}
    </div>
  );
}
