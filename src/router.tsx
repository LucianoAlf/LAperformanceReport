import { createBrowserRouter, Navigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';

// =============================================================================
// LAZY LOADING - Componentes carregados sob demanda para reduzir bundle inicial
// =============================================================================

// Componente de loading para Suspense
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-96">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Carregando...</p>
      </div>
    </div>
  );
}

// Wrapper para lazy loading com Suspense
function lazyLoad(importFn: () => Promise<{ default: React.ComponentType<any> }>) {
  const LazyComponent = lazy(importFn);
  return (
    <Suspense fallback={<PageLoader />}>
      <LazyComponent />
    </Suspense>
  );
}

// =============================================================================
// IMPORTS SÍNCRONOS - Componentes essenciais carregados imediatamente
// =============================================================================

// Layout e Autenticação (sempre necessários)
import { AppLayout } from './components/App/Layout';
import { LoginPage, PrivateRoute } from './components/App/Auth';

// Dashboard (página inicial - carrega imediatamente)
import { DashboardPage } from './components/App/Dashboard';

// =============================================================================
// IMPORTS LAZY - Componentes carregados sob demanda
// =============================================================================

// Entrada
const EntradaMenu = lazy(() => import('./components/App/Entrada').then(m => ({ default: m.EntradaMenu })));
const FormLead = lazy(() => import('./components/App/Entrada/FormLead').then(m => ({ default: m.FormLead })));
const FormMatricula = lazy(() => import('./components/App/Entrada/FormMatricula').then(m => ({ default: m.FormMatricula })));
const FormEvasao = lazy(() => import('./components/App/Entrada/FormEvasao').then(m => ({ default: m.FormEvasao })));
const FormRenovacao = lazy(() => import('./components/App/Entrada/FormRenovacao').then(m => ({ default: m.FormRenovacao })));
const RelatorioDiario = lazy(() => import('./components/App/Entrada/RelatorioDiario').then(m => ({ default: m.RelatorioDiario })));

// Admin
const GerenciarUsuarios = lazy(() => import('./components/App/Admin').then(m => ({ default: m.GerenciarUsuarios })));
const PainelPermissoes = lazy(() => import('./components/App/Admin/PainelPermissoes').then(m => ({ default: m.PainelPermissoes })));

// Operacional
const ComercialPage = lazy(() => import('./components/App/Comercial').then(m => ({ default: m.ComercialPage })));
const PlanilhaRetencao = lazy(() => import('./components/App/Retencao').then(m => ({ default: m.PlanilhaRetencao })));
const ProfessoresPage = lazy(() => import('./components/App/Professores').then(m => ({ default: m.ProfessoresPage })));
const AdministrativoPage = lazy(() => import('./components/App/Administrativo').then(m => ({ default: m.AdministrativoPage })));
const AlunosPage = lazy(() => import('./components/App/Alunos').then(m => ({ default: m.AlunosPage })));
const SalasPage = lazy(() => import('./components/App/Salas').then(m => ({ default: m.SalasPage })));
const ProjetosPage = lazy(() => import('./components/App/Projetos').then(m => ({ default: m.ProjetosPage })));
const PreAtendimentoPage = lazy(() => import('./components/App/PreAtendimento').then(m => ({ default: m.PreAtendimentoPage })));

// Metas
const MetasPageNew = lazy(() => import('./components/App/Metas').then(m => ({ default: m.MetasPageNew })));

// Configurações
const ConfigPage = lazy(() => import('./components/App/Config').then(m => ({ default: m.ConfigPage })));

// Analytics
const GestaoMensalPage = lazy(() => import('./components/GestaoMensal').then(m => ({ default: m.GestaoMensalPage })));

// Histórico
const Apresentacoes2025Page = lazy(() => import('./components/App/Historico').then(m => ({ default: m.Apresentacoes2025Page })));

// Apresentações (legado)
const AppLegacy = lazy(() => import('../App'));
const ComercialDashboard = lazy(() => import('./components/Comercial').then(m => ({ default: m.ComercialDashboard })));
const RetencaoDashboard = lazy(() => import('./components/Retencao').then(m => ({ default: m.RetencaoDashboard })));

// Páginas públicas (sem autenticação)
const FeedbackProfessorPage = lazy(() => import('./components/App/Feedback').then(m => ({ default: m.FeedbackProfessorPage })));

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

// Wrapper para apresentações - usa os componentes lazy com Suspense
function GestaoApresentacao() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AppLegacy />
    </Suspense>
  );
}

function ComercialApresentacao() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ComercialDashboard onPageChange={() => {}} />
    </Suspense>
  );
}

function RetencaoApresentacao() {
  return (
    <Suspense fallback={<PageLoader />}>
      <RetencaoDashboard onPageChange={() => {}} />
    </Suspense>
  );
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
            element: <Suspense fallback={<PageLoader />}><EntradaMenu /></Suspense>,
          },
          {
            path: 'entrada/lead',
            element: <Suspense fallback={<PageLoader />}><FormLead /></Suspense>,
          },
          {
            path: 'entrada/experimental',
            element: <PlaceholderPage title="Aula Experimental" />,
          },
          {
            path: 'entrada/matricula',
            element: <Suspense fallback={<PageLoader />}><FormMatricula /></Suspense>,
          },
          {
            path: 'entrada/evasao',
            element: <Suspense fallback={<PageLoader />}><FormEvasao /></Suspense>,
          },
          {
            path: 'entrada/renovacao',
            element: <Suspense fallback={<PageLoader />}><FormRenovacao /></Suspense>,
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
            element: <Suspense fallback={<PageLoader />}><RelatorioDiario /></Suspense>,
          },
          {
            path: 'gestao-mensal',
            element: <Suspense fallback={<PageLoader />}><GestaoMensalPage /></Suspense>,
          },
          {
            path: 'metas',
            element: <Suspense fallback={<PageLoader />}><MetasPageNew /></Suspense>,
          },
          {
            path: 'config',
            element: <Suspense fallback={<PageLoader />}><ConfigPage /></Suspense>,
          },
          // Operacional
          {
            path: 'comercial',
            element: <Suspense fallback={<PageLoader />}><ComercialPage /></Suspense>,
          },
          {
            path: 'pre-atendimento',
            element: <Suspense fallback={<PageLoader />}><PreAtendimentoPage /></Suspense>,
          },
          {
            path: 'administrativo',
            element: <Suspense fallback={<PageLoader />}><AdministrativoPage /></Suspense>,
          },
          {
            path: 'retencao',
            element: <Suspense fallback={<PageLoader />}><PlanilhaRetencao /></Suspense>,
          },
          {
            path: 'alunos',
            element: <Suspense fallback={<PageLoader />}><AlunosPage /></Suspense>,
          },
          {
            path: 'professores',
            element: <Suspense fallback={<PageLoader />}><ProfessoresPage /></Suspense>,
          },
          {
            path: 'projetos',
            element: <Suspense fallback={<PageLoader />}><ProjetosPage /></Suspense>,
          },
          {
            path: 'salas',
            element: <Suspense fallback={<PageLoader />}><SalasPage /></Suspense>,
          },
          {
            path: 'apresentacoes-2025',
            element: <Suspense fallback={<PageLoader />}><Apresentacoes2025Page /></Suspense>,
          },
          // Rotas Admin - apenas para admin
          {
            path: 'admin/usuarios',
            element: <Suspense fallback={<PageLoader />}><GerenciarUsuarios /></Suspense>,
          },
          {
            path: 'admin/permissoes',
            element: <Suspense fallback={<PageLoader />}><PainelPermissoes /></Suspense>,
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

  // Página pública de feedback do professor (sem autenticação)
  {
    path: '/feedback/:token',
    element: <Suspense fallback={<PageLoader />}><FeedbackProfessorPage /></Suspense>,
  },

  // Redirect para login se rota não existir
  {
    path: '*',
    element: <Navigate to="/login" replace />,
  },
]);

export default router;
