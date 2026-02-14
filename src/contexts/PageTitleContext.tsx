import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface PageTitleData {
  titulo: string;
  subtitulo?: string;
  icone?: LucideIcon;
  iconeCor?: string; // ex: "text-violet-400"
  iconeWrapperCor?: string; // ex: "bg-violet-500/20"
}

interface PageTitleContextType {
  pageTitle: PageTitleData | null;
  setPageTitle: (data: PageTitleData) => void;
}

const PageTitleContext = createContext<PageTitleContextType>({
  pageTitle: null,
  setPageTitle: () => {},
});

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [pageTitle, setPageTitleState] = useState<PageTitleData | null>(null);

  const setPageTitle = useCallback((data: PageTitleData) => {
    setPageTitleState(data);
  }, []);

  return (
    <PageTitleContext.Provider value={{ pageTitle, setPageTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

/**
 * Hook para ler o título da página (usado pelo AppHeader).
 */
export function usePageTitle() {
  const context = useContext(PageTitleContext);
  if (!context) {
    throw new Error('usePageTitle deve ser usado dentro de PageTitleProvider');
  }
  return context;
}

/**
 * Hook para a página definir seu título no header global.
 * Chamar no componente da página: useSetPageTitle({ titulo, subtitulo, icone, ... })
 */
export function useSetPageTitle(data: PageTitleData) {
  const { setPageTitle } = usePageTitle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPageTitle(data);
  }, [data.titulo, data.subtitulo]);
}
