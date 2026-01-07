import { useState, useEffect } from 'react';
import { SecaoComercial, UnidadeComercial } from '../../types/comercial';
import SidebarComercial from './SidebarComercial';
import ComercialInicio from './ComercialInicio';
import ComercialVisaoGeral from './ComercialVisaoGeral';
import ComercialFunil from './ComercialFunil';
import ComercialRanking from './ComercialRanking';
import ComercialSazonalidade from './ComercialSazonalidade';
import ComercialFinanceiro from './ComercialFinanceiro';
import ComercialAlertas from './ComercialAlertas';
import ComercialMetas from './ComercialMetas';
import ComercialProfessores from './ComercialProfessores';
import ComercialCursos from './ComercialCursos';
import ComercialOrigem from './ComercialOrigem';

interface ComercialDashboardProps {
  onPageChange: (page: 'gestao' | 'comercial') => void;
}

// Lista de seções para o IntersectionObserver
const sections: SecaoComercial[] = [
  'inicio',
  'visao-geral',
  'funil',
  'professores',
  'cursos',
  'origem',
  'ranking',
  'sazonalidade',
  'financeiro',
  'alertas',
  'metas'
];

export function ComercialDashboard({ onPageChange }: ComercialDashboardProps) {
  const [activeSection, setActiveSection] = useState<SecaoComercial>('inicio');
  const [ano, setAno] = useState(2025);
  const [unidade, setUnidade] = useState<UnidadeComercial>('Consolidado');

  // IntersectionObserver para detectar seção ativa durante scroll
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      const visibleEntries = entries.filter(entry => entry.isIntersecting);
      if (visibleEntries.length > 0) {
        const mostVisible = visibleEntries.reduce((prev, current) => 
          current.intersectionRatio > prev.intersectionRatio ? current : prev
        );
        setActiveSection(mostVisible.target.id as SecaoComercial);
      }
    }, { threshold: [0.1, 0.25, 0.5, 0.75], rootMargin: '-10% 0px -10% 0px' });

    sections.forEach(sectionId => {
      const el = document.getElementById(sectionId);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Função para scroll suave ao clicar na sidebar
  const scrollToSection = (sectionId: SecaoComercial) => {
    setActiveSection(sectionId);
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-screen bg-slate-950">
      <SidebarComercial 
        activeSection={activeSection} 
        onSectionChange={scrollToSection}
        onPageChange={onPageChange}
      />
      
      <main className="flex-1 ml-64 overflow-y-auto">
        {/* Seção Início */}
        <section id="inicio">
          <ComercialInicio onStart={() => scrollToSection('visao-geral')} />
        </section>

        {/* Seção Visão Geral */}
        <section id="visao-geral">
          <ComercialVisaoGeral 
            ano={ano} 
            unidade={unidade} 
            onAnoChange={setAno} 
            onUnidadeChange={setUnidade} 
          />
        </section>

        {/* Seção Funil */}
        <section id="funil">
          <ComercialFunil ano={ano} unidade={unidade} onAnoChange={setAno} onUnidadeChange={setUnidade} />
        </section>

        {/* Seção Professores */}
        <section id="professores">
          <ComercialProfessores />
        </section>

        {/* Seção Cursos */}
        <section id="cursos">
          <ComercialCursos />
        </section>

        {/* Seção Origem */}
        <section id="origem">
          <ComercialOrigem />
        </section>

        {/* Seção Ranking */}
        <section id="ranking">
          <ComercialRanking />
        </section>

        {/* Seção Sazonalidade */}
        <section id="sazonalidade">
          <ComercialSazonalidade />
        </section>

        {/* Seção Financeiro */}
        <section id="financeiro">
          <ComercialFinanceiro ano={ano} unidade={unidade} onAnoChange={setAno} onUnidadeChange={setUnidade} />
        </section>

        {/* Seção Alertas */}
        <section id="alertas">
          <ComercialAlertas />
        </section>

        {/* Seção Metas */}
        <section id="metas">
          <ComercialMetas />
        </section>
      </main>
    </div>
  );
}

export default ComercialDashboard;
