import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';

interface WidgetVisibilityContextType {
  widgetsHidden: boolean;
  registerSentinel: (el: HTMLElement | null) => void;
}

const WidgetVisibilityContext = createContext<WidgetVisibilityContextType>({
  widgetsHidden: false,
  registerSentinel: () => {},
});

export function WidgetVisibilityProvider({ children }: { children: ReactNode }) {
  const [widgetsHidden, setWidgetsHidden] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const registerSentinel = useCallback((el: HTMLElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    if (!el) {
      setWidgetsHidden(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setWidgetsHidden(entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(el);
    observerRef.current = observer;
  }, []);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  return (
    <WidgetVisibilityContext.Provider value={{ widgetsHidden, registerSentinel }}>
      {children}
    </WidgetVisibilityContext.Provider>
  );
}

/** Hook consumidor: widgets usam para saber se devem se esconder */
export function useWidgetsHidden() {
  return useContext(WidgetVisibilityContext).widgetsHidden;
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
