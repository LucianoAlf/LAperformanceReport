import {
  LayoutDashboard, BarChart3, Target, Settings,
  Phone, Megaphone, MousePointerClick, Briefcase, CalendarClock,
  ClipboardList, Users, Guitar, Mic2, ReceiptText, Heart, GraduationCap,
  Building2, FolderKanban, UserCog, Shield, Activity, FolderArchive,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { RegraVisibilidade } from './menuVisibilidade';

export interface ItemMenu {
  path: string;
  label: string;
  /** usado na barra inferior, onde nao cabe "Administrativo" */
  labelCurto?: string;
  icon: LucideIcon;
  end?: boolean;
  visibilidade?: RegraVisibilidade;
}

export const MENU_PRINCIPAL: ItemMenu[] = [
  { path: '/app', label: 'Dashboard', labelCurto: 'Início', icon: LayoutDashboard, end: true },
  { path: '/app/gestao-mensal', label: 'Analytics', icon: BarChart3 },
  { path: '/app/metas', label: 'Metas', icon: Target },
  { path: '/app/config', label: 'Configurações', labelCurto: 'Config', icon: Settings },
];

export const MENU_OPERACIONAL: ItemMenu[] = [
  { path: '/app/pre-atendimento', label: 'Pré-Atendimento', labelCurto: 'Pré-At.', icon: Phone },
  { path: '/app/campanhas', label: 'Campanhas', icon: Megaphone, visibilidade: 'campanhas' },
  { path: '/app/trafego-pago', label: 'Tráfego Pago', labelCurto: 'Tráfego', icon: MousePointerClick, visibilidade: 'trafego_pago' },
  { path: '/app/comercial', label: 'Comercial', icon: Briefcase },
  { path: '/app/agenda', label: 'Agenda', icon: CalendarClock },
  { path: '/app/administrativo', label: 'Administrativo', labelCurto: 'Admin', icon: ClipboardList },
  { path: '/app/alunos', label: 'Alunos', icon: Users },
  { path: '/app/bandas', label: 'Bandas', icon: Guitar },
  { path: '/app/eventos', label: 'Eventos', icon: Mic2, visibilidade: 'eventos' },
  { path: '/app/faturas', label: 'Faturas', icon: ReceiptText },
  { path: '/app/sucesso-aluno', label: 'Sucesso do Aluno', labelCurto: 'Sucesso', icon: Heart },
  { path: '/app/professores', label: 'Professores', labelCurto: 'Profs.', icon: GraduationCap },
  { path: '/app/time', label: 'Time', icon: Users },
  { path: '/app/salas', label: 'Salas', icon: Building2 },
  { path: '/app/projetos', label: 'Projetos', icon: FolderKanban },
];

/**
 * Os 3 destinos do bloco "Admin" hoje hardcoded em JSX no AppSidebar
 * (`{isAdmin && (...)}`, linha ~246), duplicados aqui de proposito — a folha
 * "Mais" nao tinha como enxerga-los. NAO editar o AppSidebar para consumir
 * esta lista: ele continua com o JSX dele, a duplicacao aqui e temporaria
 * (ver teste de paridade em tests/mobileVisibilidadeParidadeDesktop.test.mjs).
 */
export const MENU_ADMIN: ItemMenu[] = [
  { path: '/app/admin/usuarios', label: 'Gerenciar Usuários', labelCurto: 'Usuários', icon: UserCog, visibilidade: 'admin' },
  { path: '/app/admin/permissoes', label: 'Permissões', icon: Shield, visibilidade: 'admin' },
  { path: '/app/automacoes', label: 'Saúde das Automações', labelCurto: 'Automações', icon: Activity, visibilidade: 'admin' },
];

/**
 * O item do bloco "Historico" do AppSidebar (linha ~323) — um bloco
 * SEPARADO do `{isAdmin && (...)}`, visivel para todo mundo no desktop. Por
 * isso NAO leva `visibilidade` nenhuma: marca-lo como admin esconderia no
 * celular um modulo que o desktop mostra a todos (a divergencia que o teste
 * de paridade do item 6 existe pra impedir).
 */
export const MENU_HISTORICO: ItemMenu[] = [
  { path: '/app/apresentacoes-2025', label: 'Apresentações 2025', labelCurto: 'Apresentações', icon: FolderArchive },
];

/**
 * Os 4 destinos de um toque na barra inferior (decisao do Hugo, 12/09/2026).
 * Serve ADM, secretaria e coordenacao — o maior grupo de uso.
 * Os outros 14 modulos ficam a dois toques, no "Mais".
 */
export const ROTAS_BARRA_INFERIOR: readonly string[] = [
  '/app',
  '/app/alunos',
  '/app/agenda',
  '/app/administrativo',
];
