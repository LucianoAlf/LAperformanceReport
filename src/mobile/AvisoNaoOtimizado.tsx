import { Flag } from 'lucide-react';

/**
 * Faixa de degradacao. Some sozinha quando a rota entra em ROTAS_PORTADAS,
 * e serve de lista de pendencias visivel para quem usa.
 */
export function AvisoNaoOtimizado() {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2">
      <Flag className="h-3.5 w-3.5 flex-none text-amber-400" aria-hidden="true" />
      <p className="text-[10.5px] leading-snug text-amber-400">
        <strong className="font-semibold text-slate-50">Tela ainda não adaptada.</strong>{' '}
        Funciona, mas rola para o lado.
      </p>
    </div>
  );
}

export default AvisoNaoOtimizado;
