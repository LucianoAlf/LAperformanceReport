import { AlertTriangle } from 'lucide-react';
import type { Alerta } from '@/hooks/useDashboardDados';

/**
 * Mesma semantica do bloco "Alertas Inteligentes" do desktop
 * (DashboardPage.tsx) — cor por severidade, icone por tipo. Repetida aqui em
 * vez de importada porque o desktop guarda os dois mapas inline, sem exportar
 * um modulo compartilhado; mudar a cor/icone de um alerta entre as duas telas
 * seria uma segunda versao da regra (ver CLAUDE.md, secao "Regras
 * Importantes").
 */
const severidadeConfig: Record<Alerta['severidade'], { dot: string; text: string }> = {
  critico: { dot: 'bg-red-500', text: 'text-red-400' },
  atencao: { dot: 'bg-amber-500', text: 'text-amber-400' },
  informativo: { dot: 'bg-blue-500', text: 'text-blue-400' },
};

const tipoIcone: Record<string, string> = {
  CONTRATO_VENCENDO: '📋',
  RENOVACOES_PENDENTES: '🔄',
  CONVERSAO_BAIXA: '📉',
  INADIMPLENCIA_ALTA: '💰',
  TICKET_CAINDO: '🎫',
  PROFESSOR_TURMA_BAIXA: '👨‍🏫',
  CHURN_ALTO: '📤',
  META_EM_RISCO: '🎯',
};

/**
 * Lista de alertas do Dashboard mobile — uma linha por alerta, em vez da
 * grade de cartoes do desktop (que depende de 2-3 colunas de largura).
 *
 * Lista vazia AFIRMA que esta vazia, com a mesma frase do desktop, em vez de
 * sumir: o catch do fetch de alertas so faz console.error, entao `alertas`
 * chega [] tanto quando nao ha alerta quanto quando a consulta falhou —
 * sumir tornaria os dois casos a mesma tela (CLAUDE.md, "Falha tem que ser
 * diagnosticavel"). E o que o bloco de unidades desta mesma tela ja faz.
 */
export function ListaAlertas({ alertas }: { alertas: Alerta[] }) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Alertas ({alertas.length})
        </h3>
      </div>
      {alertas.length > 0 ? (
        <div className="flex flex-col gap-2">
          {alertas.map((alerta, idx) => {
            const config = severidadeConfig[alerta.severidade] ?? severidadeConfig.informativo;
            return (
              <div
                key={idx}
                className="flex items-start gap-2 rounded-xl border border-slate-700/50 bg-slate-800/50 p-3"
              >
                <span className="text-lg">{tipoIcone[alerta.tipo_alerta] || '⚠️'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{alerta.descricao}</p>
                  <p className={`mt-1 text-xs ${config.text}`}>{alerta.detalhe}</p>
                  {/* Sem prop de "unidade selecionada" nesta interface (locked
                      para a Task 5), mostrar sempre — na visao de uma unidade
                      so e redundante, na consolidada e a unica pista de qual
                      unidade gerou o alerta (DashboardPage.tsx:358-360). */}
                  <p className="mt-1 text-xs text-gray-500">{alerta.unidade_nome}</p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  {alerta.quantidade > 1 && (
                    <span className={`text-xs font-bold ${config.text} bg-slate-900/50 px-2 py-0.5 rounded-full`}>
                      {alerta.quantidade}
                    </span>
                  )}
                  <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${config.dot}`} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 text-center text-gray-500">
          <div className="mb-2 text-3xl">✅</div>
          <p className="font-medium text-white">Tudo sob controle!</p>
          <p className="text-sm">Nenhum alerta ativo no momento</p>
        </div>
      )}
    </section>
  );
}

export default ListaAlertas;
