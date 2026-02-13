import { Wifi, WifiOff } from 'lucide-react';
import type { WhatsAppConnectionStatus } from '../../types';

interface WhatsAppBannerProps {
  status: WhatsAppConnectionStatus;
}

export function WhatsAppBanner({ status }: WhatsAppBannerProps) {
  if (status.connected) {
    return (
      <div className="bg-emerald-900/40 border-b border-emerald-800/50 px-4 py-1.5 flex items-center gap-2 flex-shrink-0">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <Wifi className="w-3.5 h-3.5 text-emerald-400" />
        <span className="text-xs text-emerald-300 font-medium">WhatsApp conectado</span>
        {status.phone && (
          <span className="text-xs text-emerald-500">• {status.phone}</span>
        )}
        {status.instanceName && (
          <span className="text-xs text-emerald-500">• {status.instanceName}</span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-red-900/40 border-b border-red-800/50 px-4 py-2 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
        <WifiOff className="w-3.5 h-3.5 text-red-400" />
        <span className="text-xs text-red-300 font-semibold">WhatsApp desconectado</span>
        {status.error && (
          <span className="text-xs text-red-400">• {status.error}</span>
        )}
      </div>
    </div>
  );
}
