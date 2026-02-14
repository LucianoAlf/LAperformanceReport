import React from 'react';
import { useSetPageTitle } from '@/contexts/PageTitleContext';
import { Link } from 'react-router-dom';
import { 
  Phone, 
  GraduationCap, 
  UserMinus, 
  RefreshCw, 
  AlertTriangle,
  Users,
  FileText,
  Calendar
} from 'lucide-react';

const menuComercial = [
  { 
    path: '/app/entrada/lead', 
    label: 'Novo Lead', 
    description: 'Registrar novo contato comercial',
    icon: Phone, 
    color: 'from-blue-500 to-cyan-500' 
  },
  { 
    path: '/app/entrada/experimental', 
    label: 'Aula Experimental', 
    description: 'Agendar ou registrar experimental',
    icon: Calendar, 
    color: 'from-violet-500 to-purple-500' 
  },
  { 
    path: '/app/entrada/matricula', 
    label: 'Nova Matrícula', 
    description: 'Converter lead em aluno',
    icon: GraduationCap, 
    color: 'from-emerald-500 to-green-500' 
  },
];

const menuRetencao = [
  { 
    path: '/app/entrada/renovacao', 
    label: 'Renovação', 
    description: 'Registrar renovação de contrato',
    icon: RefreshCw, 
    color: 'from-purple-500 to-violet-500' 
  },
  { 
    path: '/app/entrada/evasao', 
    label: 'Registrar Evasão', 
    description: 'Registrar saída de aluno',
    icon: UserMinus, 
    color: 'from-rose-500 to-red-500' 
  },
  { 
    path: '/app/entrada/aviso-previo', 
    label: 'Aviso Prévio', 
    description: 'Registrar aviso de saída',
    icon: AlertTriangle, 
    color: 'from-amber-500 to-orange-500' 
  },
];

const menuGestao = [
  { 
    path: '/app/entrada/aluno', 
    label: 'Cadastro de Alunos', 
    description: 'Gerenciar cadastro de alunos',
    icon: Users, 
    color: 'from-slate-500 to-slate-600' 
  },
  { 
    path: '/app/relatorios/diario', 
    label: 'Relatório Diário', 
    description: 'Fechar o dia e salvar snapshot',
    icon: FileText, 
    color: 'from-amber-500 to-orange-500' 
  },
];

export function EntradaMenu() {
  useSetPageTitle({
    titulo: 'Entrada de Dados',
    subtitulo: 'Selecione o tipo de registro que deseja fazer',
    icone: FileText,
    iconeCor: 'text-slate-400',
    iconeWrapperCor: 'bg-slate-700/50',
  });

  return (
    <div className="space-y-8">

      {/* Comercial */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          Comercial
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {menuComercial.map((item) => (
            <MenuCard key={item.path} {...item} />
          ))}
        </div>
      </section>

      {/* Retenção */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-400" />
          Retenção
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {menuRetencao.map((item) => (
            <MenuCard key={item.path} {...item} />
          ))}
        </div>
      </section>

      {/* Gestão */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400" />
          Gestão
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {menuGestao.map((item) => (
            <MenuCard key={item.path} {...item} />
          ))}
        </div>
      </section>
    </div>
  );
}

function MenuCard({ 
  path, 
  label, 
  description, 
  icon: Icon, 
  color 
}: {
  path: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <Link
      to={path}
      className="group bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-cyan-500/30 transition-all"
    >
      <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">{label}</h3>
      <p className="text-sm text-gray-400">{description}</p>
    </Link>
  );
}

export default EntradaMenu;
