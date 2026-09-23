import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Agenda from "@/pages/Agenda";
import Pacientes from "@/pages/Pacientes";
import PacienteDetalhe from "@/pages/PacienteDetalhe";
import PacienteNovo from "@/pages/PacienteNovo";
import PacienteEditar from "@/pages/PacienteEditar";
import PacienteFinanceiro from "@/pages/PacienteFinanceiro";
import PacienteAutorizacoes from "@/pages/PacienteAutorizacoes";
import NovaAnamnese from "@/pages/NovaAnamnese";
import NovaEvolucao from "@/pages/NovaEvolucao";
import EditarAnamnese from "@/pages/EditarAnamnese";
import EditarEvolucao from "@/pages/EditarEvolucao";
import VisualizarProntuario from "@/pages/VisualizarProntuario";
import Financeiro from "@/pages/Financeiro";
import FinanceiroServicos from "@/pages/FinanceiroServicos";
import FinanceiroRepasses from "@/pages/FinanceiroRepasses";
import Pagamentos from "@/pages/Pagamentos";
import Medicos from "@/pages/Medicos";
import Crm from "@/pages/Crm";
import CrmTemplates from "@/pages/CrmTemplates";
import Configuracoes from "@/pages/Configuracoes";
import PlanosConfig from "@/pages/PlanosConfig";
import VinculoPacientes from "@/pages/VinculoPacientes";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agenda" element={<Agenda />} />
            
            {/* ============ PACIENTES ============ */}
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/pacientes/novo" element={<PacienteNovo />} />
            <Route path="/pacientes/:id" element={<PacienteDetalhe />} />
            <Route path="/pacientes/:id/editar" element={<PacienteEditar />} />
            <Route path="/pacientes/:id/financeiro" element={<PacienteFinanceiro />} />
            <Route path="/pacientes/:id/autorizacoes" element={<PacienteAutorizacoes />} />
            <Route path="/pacientes/:id/anamnese" element={<NovaAnamnese />} />
            <Route path="/pacientes/:id/anamnese/nova" element={<NovaAnamnese />} />
            <Route path="/pacientes/:id/anamnese/editar/:prontuarioId" element={<EditarAnamnese />} />
            <Route path="/pacientes/:id/evolucao/nova" element={<NovaEvolucao />} />
            <Route path="/pacientes/:id/evolucao/editar/:prontuarioId" element={<EditarEvolucao />} />
            <Route path="/pacientes/:id/prontuario/:prontuarioId" element={<VisualizarProntuario />} />
            
            {/* ============ FINANCEIRO ============ */}
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/financeiro/servicos" element={<FinanceiroServicos />} />
            <Route path="/financeiro/repasses" element={<FinanceiroRepasses />} />
            <Route path="/financeiro/vincular" element={<VinculoPacientes />} />
            <Route path="/financeiro/pagamentos" element={<Pagamentos />} />
            
            {/* ============ OUTRAS ============ */}
            <Route path="/medicos" element={<Medicos />} />
            <Route path="/crm" element={<Crm />} />
            <Route path="/crm/templates" element={<CrmTemplates />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="/configuracoes/planos" element={<PlanosConfig />} />
            
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
