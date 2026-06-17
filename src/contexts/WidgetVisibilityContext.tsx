import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';

interface WidgetVisibilityContextType {
  widgetsHidden: boolean;
  registerSentinel: (el: HTMLElement | null) => void;
  pushForceHide: () => void;
  popForceHide: () => void;
}

const WidgetVisibilityContext = createContext<WidgetVisibilityContextType>({
  widgetsHidden: false,
  registerSentinel: () => {},
  pushForceHide: () => {},
  popForceHide: () => {},
});

export function WidgetVisibilityProvider({ children }: { children: ReactNode }) {
  const [sentinelIntersecting, setSentinelIntersecting] = useState(false);
  const [forceHideCount, setForceHideCount] = useState(0);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const registerSentinel = useCallback((el: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (!el) {
      setSentinelIntersecting(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setSentinelIntersecting(entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(el);
    observerRef.current = observer;
  }, []);

  const pushForceHide = useCallback(() => setForceHideCount(n => n + 1), []);
  const popForceHide = useCallback(() => setForceHideCount(n => Math.max(0, n - 1)), []);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  // Widgets somem quando o sentinela está visível OU quando alguém forçou esconder (ex: chat aberto).
  const widgetsHidden = sentinelIntersecting || forceHideCount > 0;

  return (
    <WidgetVisibilityContext.Provider value={{ widgetsHidden, registerSentinel, pushForceHide, popForceHide }}>
      {children}
    </WidgetVisibilityContext.Provider>
  );
}

/** Hook consumidor: widgets usam para saber se devem se esconder */
export function useWidgetsHidden() {
  return useContext(WidgetVisibilityContext).widgetsHidden;
}

/**
 * Esconde os widgets flutuantes enquanto `ativo` for true (ex: conversa de chat aberta
 * sobrepondo o input). Confiável: não depende de quem ganhou a corrida de sentinelas.
 */
export function useForceHideWidgets(ativo: boolean) {
  const { pushForceHide, popForceHide } = useContext(WidgetVisibilityContext);
  useEffect(() => {
    if (!ativo) return;
    pushForceHide();
    return () => popForceHide();
  }, [ativo, pushForceHide, popForceHide]);
}

/** Hook produtor: páginas chamam para obter ref do elemento sentinela (paginação) */
export function useWidgetOverlapSentinel() {
  const { registerSentinel } = useContext(WidgetVisibilityContext);

  const sentinelRef = useCallback(
    (el: HTMLElement | null) => {
      registerSentinel(el);
    },
    [registerSentinel]
  );

  useEffect(() => {
    return () => registerSentinel(null);
  }, [registerSentinel]);

  return sentinelRef;
}
