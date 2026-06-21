import { CreditCard, DollarSign, LockKeyhole, Wallet } from 'lucide-react';
import { UnidadeComercial } from '../../types/comercial';

interface Props {
  ano: number;
  unidade: UnidadeComercial;
  onAnoChange: (ano: number) => void;
  onUnidadeChange: (unidade: UnidadeComercial) => void;
}

const bloqueios = [
  {
    icon: DollarSign,
    titulo: 'Ticket Medio Comercial',
    descricao: 'Bloqueado nesta apresentacao ate existir fonte canonica financeira por competencia.',
  },
  {
    icon: CreditCard,
    titulo: 'Ticket Medio Passaporte',
    descricao: 'Nao usar snapshot comercial como fonte. O relatorio mensal usa rotina propria validada separadamente.',
  },
  {
    icon: Wallet,
    titulo: 'Faturamento Passaporte',
    descricao: 'Aguardando contrato canonico para passaportes, parcelas e matriculas comerciais.',
  },
];

export function ComercialFinanceiro({ ano, unidade, onUnidadeChange }: Props) {
  return (
    <div className="p-8 min-h-screen">
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-500 text-sm font-medium px-3 py-1 rounded-full mb-4">
          <LockKeyhole className="w-4 h-4" /> Financeiro Comercial
        </span>
        <h1 className="text-4xl lg:text-5xl font-grotesk font-bold text-white mb-2">
          Ticket e <span className="text-emerald-500">Passaporte</span>
        </h1>
        <p className="text-gray-400">
          Apresentacao financeira comercial em bloqueio preventivo.
        </p>
        <p className="text-sm text-yellow-300 mt-2">
          Os dados antigos vinham de snapshot comercial. Para evitar divergencia entre telas, esta aba nao publica KPI financeiro ate a fonte canonica estar fechada.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 mb-8">
        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">Ano:</span>
          <span className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-gray-300">{ano}</span>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-gray-400 text-sm">Unidade:</span>
          {(['Consolidado', 'Campo Grande', 'Recreio', 'Barra'] as UnidadeComercial[]).map((u) => (
            <button
              key={u}
              onClick={() => onUnidadeChange(u)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                unidade === u
                  ? 'bg-emerald-500 text-slate-900'
                  : 'bg-slate-800 text-gray-400 hover:bg-slate-700'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {bloqueios.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.titulo} className="bg-slate-800/50 border border-yellow-500/30 rounded-2xl p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-yellow-500/20 rounded-xl">
                  <Icon className="w-6 h-6 text-yellow-300" />
                </div>
                <span className="text-xs text-yellow-300 bg-yellow-500/10 px-2 py-1 rounded-full">Bloqueado</span>
              </div>
              <div className="text-xl font-grotesk font-bold text-white mb-2">{item.titulo}</div>
              <div className="text-sm text-gray-400">{item.descricao}</div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
        <h3 className="text-lg font-semibold text-white mb-3">Criterio para desbloquear</h3>
        <div className="space-y-3 text-sm text-gray-300">
          <p>1. Definir fonte viva para passaporte, parcela, data de matricula e unidade comercial.</p>
          <p>2. Validar Maio/2026 e Junho/2026 contra o relatorio mensal comercial ja conferido.</p>
          <p>3. So depois republicar ticket, passaporte vendido e faturamento por unidade nesta aba.</p>
        </div>
      </div>
    </div>
  );
}

export default ComercialFinanceiro;
