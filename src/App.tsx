import PlanosConfig from "./pages/PlanosConfig";
import RelatorioRepasses from "./pages/RelatorioRepasses";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/AppShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Pacientes from "./pages/Pacientes";
import PacienteNovo from "./pages/PacienteNovo";
import PacienteDetalhe from "./pages/PacienteDetalhe";
import Prontuario from "./pages/Prontuario";
import Medicos from "./pages/Medicos";
import MedicoNovo from "./pages/MedicoNovo";
import MedicoDetalhe from "./pages/MedicoDetalhe";
import PacienteEditar from "./pages/PacienteEditar";
import AdminDashboard from "./pages/AdminDashboard";
import Agenda from "./pages/Agenda";
import AtendimentoNovo from "./pages/AtendimentoNovo";
import Mais from "./pages/Mais";
import Explorar from "./pages/Explorar";
import Crm from "./pages/Crm";
import CrmTemplates from "./pages/CrmTemplates";
import Financeiro from "./pages/Financeiro";
import FinanceiroServicos from "./pages/FinanceiroServicos";
import FinanceiroRepasses from "./pages/FinanceiroRepasses";
import PacienteFinanceiro from "./pages/PacienteFinanceiro";
import Documentos from "./pages/Documentos";
import PacienteDocumentos from "./pages/PacienteDocumentos";
import PacienteAutorizacoes from "./pages/PacienteAutorizacoes";
import NotFound from "./pages/NotFound";
import NovaAnamnese from './pages/NovaAnamnese';
import NovaEvolucao from './pages/NovaEvolucao';
import VisualizarProntuario from './pages/VisualizarProntuario';
import EditarAnamnese from "./pages/EditarAnamnese";
import EditarEvolucao from "./pages/EditarEvolucao";
import VinculoPacientes from "./pages/VinculoPacientes";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/agenda/novo" element={<AtendimentoNovo />} />
            <Route path="/atendimentos/:atendimentoId/prontuario" element={<Prontuario />} />
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/pacientes/novo" element={<PacienteNovo />} />
            <Route path="/pacientes/:id" element={<PacienteDetalhe />} />
            <Route path="/pacientes/:id/editar" element={<PacienteEditar />} />
            <Route path="/medicos" element={<Medicos />} />
            <Route path="/medicos/novo" element={<MedicoNovo />} />
            <Route path="/medicos/:id" element={<MedicoDetalhe />} />
            <Route path="/explorar" element={<Explorar />} />
            <Route path="/dashboard" element={<AdminDashboard />} />
            <Route path="/crm" element={<Crm />} />
            <Route path="/crm/templates" element={<CrmTemplates />} />
            
            {/* 🔥 ROTA PARA PLANOS DE SAÚDE */}
            <Route path="/configuracoes/planos" element={<PlanosConfig />} />
            
            <Route path="/paciente/:id/anamnese/nova" element={<NovaAnamnese />} />
            <Route path="/paciente/:id/evolucao/nova" element={<NovaEvolucao />} />
            <Route path="/paciente/:id/prontuario/:prontuarioId" element={<VisualizarProntuario />} />
            <Route path="/paciente/:id/anamnese/editar/:prontuarioId" element={<EditarAnamnese />} />
            <Route path="/paciente/:id/evolucao/editar/:prontuarioId" element={<EditarEvolucao />} />
            
            {/* ROTAS DO FINANCEIRO */}
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/financeiro/relatorios" element={<RelatorioRepasses />} />
            <Route path="/financeiro/servicos" element={<FinanceiroServicos />} />
            <Route path="/financeiro/repasses" element={<FinanceiroRepasses />} />
            <Route path="/financeiro/vincular" element={<VinculoPacientes />} />

            <Route path="/pacientes/:id/financeiro" element={<PacienteFinanceiro />} />
            <Route path="/pacientes/:id/documentos" element={<PacienteDocumentos />} />
            <Route path="/pacientes/:id/autorizacoes" element={<PacienteAutorizacoes />} />
            <Route path="/documentos" element={<Documentos />} />
            <Route path="/mais" element={<Mais />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
