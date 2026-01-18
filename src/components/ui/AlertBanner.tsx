import { ReactNode, useState } from 'react';
import { X, Info, AlertTriangle, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AlertBannerProps {
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
  dismissible?: boolean;
  icon?: ReactNode;
  className?: string;
}

const typeConfig = {
  info: {
    bg: 'bg-cyan-500/10 border-cyan-500/30',
    text: 'text-cyan-400',
    icon: Info,
  },
  warning: {
    bg: 'bg-amber-500/10 border-amber-500/30',
    text: 'text-amber-400',
    icon: AlertTriangle,
  },
  error: {
    bg: 'bg-rose-500/10 border-rose-500/30',
    text: 'text-rose-400',
    icon: AlertCircle,
  },
  success: {
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    text: 'text-emerald-400',
    icon: CheckCircle,
  },
};

export function AlertBanner({
  type,
  title,
  message,
  action,
  dismissible = true,
  icon,
  className,
}: AlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const config = typeConfig[type];
  const IconComponent = config.icon;

  return (
    <div className={cn(
      "relative flex items-start gap-3 p-4 rounded-xl border",
      config.bg,
      className
    )}>
      {/* Ícone */}
      <div className={cn("flex-shrink-0 mt-0.5", config.text)}>
        {icon || <IconComponent size={20} />}
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <h4 className={cn("font-semibold text-sm", config.text)}>
          {title}
        </h4>
        {message && (
          <p className="text-slate-400 text-sm mt-1">
            {message}
          </p>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className={cn(
              "mt-2 text-sm font-medium underline underline-offset-2 hover:no-underline transition-all",
              config.text
            )}
          >
            {action.label}
          </button>
        )}
      </div>

      {/* Botão de fechar */}
      {dismissible && (
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 p-1 text-slate-500 hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-700/50"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default AlertBanner;
