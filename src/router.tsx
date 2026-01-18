import { createBrowserRouter, Navigate } from 'react-router-dom';

// Páginas do Sistema
import { AppLayout } from './components/App/Layout';
import { DashboardPage } from './components/App/Dashboard';
import { EntradaMenu } from './components/App/Entrada';
import { FormLead } from './components/App/Entrada/FormLead';
import { FormMatricula } from './components/App/Entrada/FormMatricula';
import { FormEvasao } from './components/App/Entrada/FormEvasao';
import { FormRenovacao } from './components/App/Entrada/FormRenovacao';
import { RelatorioDiario } from './components/App/Entrada/RelatorioDiario';
import { HomePage } from './components/App/Pages';

// Autenticação
import { LoginPage, PrivateRoute } from './components/App/Auth';

// Admin
import { GerenciarUsuarios } from './components/App/Admin';

// Planilhas Inline
import { PlanilhaComercial } from './components/App/Comercial';
import { PlanilhaRetencao } from './components/App/Retencao';
import { SnapshotDiario } from './components/App/Snapshot';

// Apresentações (componentes existentes - INTOCADOS)
import App from '../App';
import { ComercialDashboard } from './components/Comercial';
import { RetencaoDashboard } from './components/Retencao';

// Placeholder para páginas ainda não implementadas
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-gray-400">Em desenvolvimento...</p>
      </div>
    </div>
  );
}

// Wrapper para apresentações - usa o App original que já gerencia o estado
function GestaoApresentacao() {
  return <App />;
}

function ComercialApresentacao() {
  return <ComercialDashboard onPageChange={() => {}} />;
}

function RetencaoApresentacao() {
  return <RetencaoDashboard onPageChange={() => {}} />;
}

export const router = createBrowserRouter([
  // Página de Login
  {
    path: '/login',
    element: <LoginPage />,
  },

  // Página inicial - redireciona para app ou login
  {
    path: '/',
    element: <Navigate to="/app" replace />,
  },

  // Sistema de Gestão 2026 - ROTAS PROTEGIDAS
  {
    path: '/app',
    element: <PrivateRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <DashboardPage />,
          },
          {
            path: 'entrada',
            element: <EntradaMenu />,
          },
          {
            path: 'entrada/lead',
            element: <FormLead />,
          },
          {
            path: 'entrada/experimental',
            element: <PlaceholderPage title="Aula Experimental" />,
          },
          {
            path: 'entrada/matricula',
            element: <FormMatricula />,
          },
          {
            path: 'entrada/evasao',
            element: <FormEvasao />,
          },
          {
            path: 'entrada/renovacao',
            element: <FormRenovacao />,
          },
          {
            path: 'entrada/aviso-previo',
            element: <PlaceholderPage title="Aviso Prévio" />,
          },
          {
            path: 'entrada/aluno',
            element: <PlaceholderPage title="Cadastro de Alunos" />,
          },
          {
            path: 'relatorios',
            element: <PlaceholderPage title="Relatórios" />,
          },
          {
            path: 'relatorios/diario',
            element: <RelatorioDiario />,
          },
          {
            path: 'metas',
            element: <PlaceholderPage title="Gestão de Metas" />,
          },
          {
            path: 'config',
            element: <PlaceholderPage title="Configurações" />,
          },
          // Planilhas Inline
          {
            path: 'comercial',
            element: <PlanilhaComercial />,
          },
          {
            path: 'retencao',
            element: <PlanilhaRetencao />,
          },
          {
            path: 'snapshot',
            element: <SnapshotDiario />,
          },
          // Rotas Admin - apenas para admin
          {
            path: 'admin/usuarios',
            element: <GerenciarUsuarios />,
          },
        ],
      },
    ],
  },

  // Apresentações (preservadas 100% - também protegidas)
  {
    path: '/apresentacao',
    element: <PrivateRoute />,
    children: [
      {
        path: 'gestao',
        element: <GestaoApresentacao />,
      },
      {
        path: 'comercial',
        element: <ComercialApresentacao />,
      },
      {
        path: 'retencao',
        element: <RetencaoApresentacao />,
      },
    ],
  },

  // Redirect para login se rota não existir
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);

export default router;
