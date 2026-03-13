import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { DetailedDependency } from '@/hooks/useProfessorDependencies';

interface ListaDependenciasProps {
  titulo: string;
  icone: React.ReactNode;
  items: DetailedDependency[];
  cor: 'red' | 'gray';
  maxVisible?: number;
}

export function ListaDependencias({ 
  titulo, 
  icone, 
  items, 
  cor, 
  maxVisible = 3 
}: ListaDependenciasProps) {
  const [expandido, setExpandido] = useState(false);
  
  if (items.length === 0) return null;
  
  const itemsVisiveis = expandido ? items : items.slice(0, maxVisible);
  const temMais = items.length > maxVisible;

  const corClasses = cor === 'red' 
    ? 'border-red-500/20 bg-red-500/5' 
    : 'border-gray-700 bg-gray-800/50';
  
  const corTexto = cor === 'red' ? 'text-red-300' : 'text-gray-300';

  return (
    <div className={`border rounded-lg p-3 ${corClasses}`}>
      <div className="flex items-center gap-2 mb-2">
        {icone}
        <span className="font-semibold text-sm">
          {titulo} ({items.length})
        </span>
      </div>
      
      <ul className="space-y-1.5">
        {itemsVisiveis.map((item, index) => (
          <li key={`${item.id}-${index}`} className="flex items-start gap-2 text-sm">
            <span className="text-gray-500 mt-0.5">•</span>
            <div className="flex-1 min-w-0">
              <span className={`${corTexto} font-medium`}>{item.nome}</span>
              {item.info_adicional && (
                <span className="text-gray-500 ml-2 text-xs">
                  ({item.info_adicional})
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
      
      {temMais && (
        <button 
          onClick={() => setExpandido(!expandido)}
          className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors"
        >
          {expandido ? (
            <>
              <ChevronUp className="w-3 h-3" />
              Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Mostrar todos ({items.length - maxVisible} mais)
            </>
          )}
        </button>
      )}
    </div>
  );
}
