import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  /** Fora do celular o seletor não existe: o chamador renderiza as abas como sempre. */
  ehCelular: boolean;
  /** O que a pílula DIZ: a seção em que a pessoa está agora. */
  rotuloAtual: string;
  /** Rótulo da folha — "Seção", "Etapa", conforme a ficha. */
  titulo?: string;
  /**
   * A `TabsList` inteira, com os seus gatilhos.
   *
   * ⚠️ Ela é passada, não reconstruída: quem monta a navegação continua sendo
   * o Radix, e os gatilhos guardam os `id` que cada `TabsContent` referencia
   * em `aria-labelledby`. Uma lista paralela de botões dentro da folha
   * quebraria esse par — e seria uma segunda fonte para os nomes das seções.
   */
  children: ReactNode;
}

/**
 * A navegação de uma ficha de 9 seções em tela de telefone.
 *
 * A faixa deslizante que existia aqui mostrava **3 seções e meia** em 375px:
 * as 5 seguintes — Anamnese, Histórico, Pesquisas, Aulas e Pedagógico — só
 * existiam para quem adivinhasse que a faixa rola. Anamnese é justamente uma
 * das que a secretaria mais abre.
 *
 * A pílula diz onde se está e abre a lista inteira numa folha: dois toques,
 * com as 9 à vista. É o mesmo gesto do período (`SeletorPeriodoMobile`) — de
 * propósito, para não haver dois vocabulários de navegação na mesma tela.
 *
 * ⚠️ Fechada, a lista continua montada (`hidden`) em vez de ser desmontada:
 * `aria-labelledby` resolve o texto de um elemento oculto, então o painel de
 * conteúdo segue rotulado; desmontar deixaria os 9 `TabsContent` apontando
 * para ids que não existem.
 */
export function SeletorSecaoMobile({ ehCelular, rotuloAtual, titulo = 'Seção', children }: Props) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aberto]);

  if (!ehCelular) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        className="flex min-h-[44px] w-full flex-shrink-0 items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-500"
      >
        <span className="truncate text-sm font-semibold text-slate-100">{rotuloAtual}</span>
        <ChevronDown className="h-4 w-4 flex-none text-slate-500" aria-hidden="true" />
      </button>

      {aberto ? (
        <>
          <button
            type="button"
            aria-label={`Fechar ${titulo.toLowerCase()}`}
            onClick={() => setAberto(false)}
            className="fixed inset-0 z-50 bg-slate-950/70"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={titulo}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[84%] overflow-y-auto rounded-t-2xl border-t border-slate-800 bg-slate-900 px-3 pt-2"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            // Escolher uma secao encerra a decisao: a folha fecha no mesmo
            // toque. Por delegacao, e nao com um `onClick` em cada gatilho —
            // quem os monta e' o chamador, e a lista nao pode depender de
            // cada item lembrar de fechar a folha.
            onClick={(e) => {
              if ((e.target as HTMLElement).closest('[role="tab"]')) setAberto(false);
            }}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-slate-700" aria-hidden="true" />
            <h2 className="mb-3 font-grotesk text-sm font-bold text-slate-50">{titulo}</h2>
            {children}
          </div>
        </>
      ) : (
        <div hidden>{children}</div>
      )}
    </>
  );
}

export default SeletorSecaoMobile;
