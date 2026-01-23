// Componente de estrelas visuais para score

import { Star } from 'lucide-react';

interface EstrelaScoreProps {
  score: number; // 0-100
  tamanho?: 'sm' | 'md' | 'lg';
  mostrarTexto?: boolean;
}

function scoreParaEstrelas(score: number): number {
  if (score >= 90) return 5;
  if (score >= 75) return 4;
  if (score >= 60) return 3;
  if (score >= 40) return 2;
  return 1;
}

function scoreParaTexto(score: number): string {
  if (score >= 90) return 'Ótimo';
  if (score >= 75) return 'Muito bom';
  if (score >= 60) return 'Bom';
  if (score >= 40) return 'Razoável';
  return 'Limitado';
}

function scoreParaCor(score: number): string {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 75) return 'text-green-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

const TAMANHOS = {
  sm: 'w-3 h-3',
  md: 'w-4 h-4',
  lg: 'w-5 h-5'
};

export function EstrelaScore({ score, tamanho = 'md', mostrarTexto = false }: EstrelaScoreProps) {
  const numEstrelas = scoreParaEstrelas(score);
  const texto = scoreParaTexto(score);
  const cor = scoreParaCor(score);
  const tamanhoClasse = TAMANHOS[tamanho];

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={`${tamanhoClasse} ${i <= numEstrelas ? cor : 'text-slate-600'} ${i <= numEstrelas ? 'fill-current' : ''}`}
          />
        ))}
      </div>
      {mostrarTexto && (
        <span className={`text-xs font-medium ${cor}`}>{texto}</span>
      )}
    </div>
  );
}

export { scoreParaEstrelas, scoreParaTexto, scoreParaCor };
