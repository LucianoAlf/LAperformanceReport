import { Hammer } from 'lucide-react';

/**
 * Aviso de modulo em construcao — LAPE-39.
 *
 * O modulo foi aberto a todo usuario autenticado em 19/09/2026 com as fases 5 a 7 ainda
 * por fazer (revisao, impressao, check-in e certificado). Quem abrir a tela precisa saber
 * disso ANTES de montar um recital inteiro aqui e descobrir que nao da para imprimir.
 *
 * Fonte unica de proposito: a lista e o detalhe exibem o MESMO texto. Duas copias
 * divergem na primeira vez que alguem atualiza so uma.
 */
export function AvisoEmDesenvolvimento() {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
      <Hammer className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0 text-[12.5px] leading-relaxed text-amber-200/90">
        <span className="font-medium text-amber-200">Módulo em desenvolvimento.</span>{' '}
        Já dá para marcar quem participa, montar os blocos e registrar o palco. Ainda não
        existem a revisão de pendências, a impressão da programação, o check-in e o
        certificado. O que você cadastrar aqui fica salvo e não se perde.
      </div>
    </div>
  );
}
