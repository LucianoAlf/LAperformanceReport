import React from 'react';

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
}

interface PageTitleProps extends TypographyProps {
  highlight?: string;
  highlightColor?: string;
}

interface KPINumberProps extends TypographyProps {
  color?: string;
}

/**
 * Título principal de página (H1)
 * Padrão: text-4xl font-grotesk font-bold
 */
export function PageTitle({ 
  children, 
  highlight, 
  highlightColor = 'text-emerald-400',
  className = '' 
}: PageTitleProps) {
  if (highlight) {
    return (
      <h1 className={`text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2 ${className}`}>
        {children} <span className={highlightColor}>{highlight}</span>
      </h1>
    );
  }
  
  return (
    <h1 className={`text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2 ${className}`}>
      {children}
    </h1>
  );
}

/**
 * Número grande de KPI
 * Padrão: text-5xl font-grotesk font-bold
 */
export function KPINumber({ 
  children, 
  color = 'text-white',
  className = '' 
}: KPINumberProps) {
  return (
    <div className={`text-5xl font-grotesk font-bold ${color} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Número médio (cards secundários)
 * Padrão: text-3xl font-grotesk font-bold
 */
export function KPINumberMedium({ 
  children, 
  color = 'text-white',
  className = '' 
}: KPINumberProps) {
  return (
    <div className={`text-3xl font-grotesk font-bold ${color} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Número pequeno (valores secundários)
 * Padrão: text-2xl font-grotesk font-bold
 */
export function KPINumberSmall({ 
  children, 
  color = 'text-white',
  className = '' 
}: KPINumberProps) {
  return (
    <div className={`text-2xl font-grotesk font-bold ${color} ${className}`}>
      {children}
    </div>
  );
}

/**
 * Subtítulo de seção (H3)
 * Padrão: text-lg font-semibold text-white
 */
export function SectionTitle({ children, className = '' }: TypographyProps) {
  return (
    <h3 className={`text-lg font-semibold text-white ${className}`}>
      {children}
    </h3>
  );
}

/**
 * Descrição/subtítulo abaixo do título
 * Padrão: text-gray-400
 */
export function PageSubtitle({ children, className = '' }: TypographyProps) {
  return (
    <p className={`text-gray-400 ${className}`}>
      {children}
    </p>
  );
}

/**
 * Label de campo/filtro
 * Padrão: text-sm text-gray-400
 */
export function Label({ children, className = '' }: TypographyProps) {
  return (
    <span className={`text-sm text-gray-400 ${className}`}>
      {children}
    </span>
  );
}

/**
 * Texto pequeno (descrições, rodapés)
 * Padrão: text-xs text-gray-500
 */
export function SmallText({ children, className = '' }: TypographyProps) {
  return (
    <span className={`text-xs text-gray-500 ${className}`}>
      {children}
    </span>
  );
}

/**
 * Badge de seção
 * Padrão: text-sm font-medium com fundo colorido
 */
interface BadgeProps extends TypographyProps {
  icon?: React.ReactNode;
  variant?: 'emerald' | 'cyan' | 'pink' | 'yellow' | 'blue';
}

export function SectionBadge({ 
  children, 
  icon,
  variant = 'emerald',
  className = '' 
}: BadgeProps) {
  const variants = {
    emerald: 'bg-emerald-500/20 text-emerald-400',
    cyan: 'bg-cyan-500/20 text-cyan-400',
    pink: 'bg-pink-500/20 text-pink-400',
    yellow: 'bg-yellow-500/20 text-yellow-400',
    blue: 'bg-blue-500/20 text-blue-400',
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${variants[variant]} text-sm font-medium px-3 py-1 rounded-full mb-4 ${className}`}>
      {icon}
      {children}
    </span>
  );
}
