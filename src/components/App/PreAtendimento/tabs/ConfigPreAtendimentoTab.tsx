import { useState, type ComponentType } from 'react';
import { Settings, CalendarOff, Bot, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UNIDADES, resolverUnidadeInicial } from './config/unidades';
import { VisitasSection } from './config/VisitasSection';
import { FeriadosSection } from './config/FeriadosSection';
import { MilaSection } from './config/MilaSection';
import { ConhecimentoSection } from './config/ConhecimentoSection';

interface ConfigPreAtendimentoTabProps {
  unidadeId: string;
}

type SubAba = 'visitas' | 'feriados' | 'mila' | 'conhecimento';

const SUBABAS: Array<{
  id: SubAba;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Seções que não dependem de unidade escondem o seletor. */
  usaUnidade: boolean;
}> = [
  { id: 'visitas', label: 'Visitas', icon: Settings, usaUnidade: true },
  { id: 'feriados', label: 'Feriados', icon: CalendarOff, usaUnidade: false },
  { id: 'mila', label: 'Mila', icon: Bot, usaUnidade: true },
  { id: 'conhecimento', label: 'Conhecimento', icon: BookOpen, usaUnidade: true },
];

/**
 * Configurações do Pré-Atendimento.
 *
 * Casca com subabas. Antes era uma coluna de ~900 linhas com Visitas, Feriados e
 * Mila empilhados — a base de conhecimento caía no rodapé e passava despercebida.
 *
 * O seletor de unidade é próprio da aba (e não o filtro global do cabeçalho)
 * porque configuração sempre precisa de UMA unidade: "Consolidado" não faz
 * sentido para editar horário de visita ou prompt.
 */
export function ConfigPreAtendimentoTab({ unidadeId }: ConfigPreAtendimentoTabProps) {
  const [subAba, setSubAba] = useState<SubAba>('visitas');
  const [unidadeSelecionada, setUnidadeSelecionada] = useState<string>(
    resolverUnidadeInicial(unidadeId)
  );

  const abaAtual = SUBABAS.find(s => s.id === subAba)!;

  return (
    <div className="space-y-5">
      {/* Barra: subabas + seletor de unidade */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-slate-800 pb-3">
        <div className="flex items-center gap-1.5">
          {SUBABAS.map(({ id, label, icon: Icon }) => {
            const ativa = subAba === id;
            return (
              <button
                key={id}
                onClick={() => setSubAba(id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors',
                  ativa
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                )}
              >
                <Icon className={cn('w-4 h-4', ativa ? 'text-violet-400' : 'text-slate-500')} />
                {label}
              </button>
            );
          })}
        </div>

        {abaAtual.usaUnidade && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-slate-400">Unidade</Label>
            <Select value={unidadeSelecionada} onValueChange={setUnidadeSelecionada}>
              <SelectTrigger className="w-44 bg-slate-800/50 border-slate-700 text-white text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(UNIDADES).map(([id, nome]) => (
                  <SelectItem key={id} value={id}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {subAba === 'visitas' && <VisitasSection unidadeId={unidadeSelecionada} />}
      {subAba === 'feriados' && <FeriadosSection />}
      {subAba === 'mila' && (
        <MilaSection
          unidadeId={unidadeSelecionada}
          onIrParaConhecimento={() => setSubAba('conhecimento')}
        />
      )}
      {subAba === 'conhecimento' && <ConhecimentoSection unidadeId={unidadeSelecionada} />}
    </div>
  );
}
