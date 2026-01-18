import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  readonly props: Props;
  state: State = { hasError: false, error: null };

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary capturou erro:', error, errorInfo);
  }

  render(): React.ReactNode {
    const { children } = this.props;
    
    if (this.state.hasError) {
      const isEnvError = this.state.error?.message?.includes('Supabase');

      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
          <div className="max-w-md w-full">
            <div className="bg-slate-800/50 backdrop-blur-sm border border-red-500/50 rounded-2xl p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-full mb-4">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-3">
                {isEnvError ? 'Configuração Necessária' : 'Erro no Sistema'}
              </h2>
              
              {isEnvError ? (
                <div className="text-left space-y-4">
                  <p className="text-gray-300">
                    As variáveis de ambiente do Supabase não estão configuradas.
                  </p>
                  
                  <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4">
                    <p className="text-sm text-gray-400 mb-2">Crie um arquivo <code className="text-cyan-400">.env</code> na raiz do projeto:</p>
                    <pre className="text-xs text-cyan-300 font-mono">
{`VITE_SUPABASE_URL=sua_url_aqui
VITE_SUPABASE_ANON_KEY=sua_chave_aqui`}
                    </pre>
                  </div>
                  
                  <p className="text-sm text-gray-400">
                    Após criar o arquivo, reinicie o servidor de desenvolvimento.
                  </p>
                </div>
              ) : (
                <p className="text-gray-300 mb-4">
                  {this.state.error?.message || 'Ocorreu um erro inesperado'}
                </p>
              )}
              
              <button
                onClick={() => window.location.reload()}
                className="mt-6 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-medium py-3 rounded-xl hover:opacity-90 transition-opacity"
              >
                <RefreshCw className="w-5 h-5" />
                Recarregar Página
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}
