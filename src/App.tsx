import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Agenda from "@/pages/Agenda";
import Pacientes from "@/pages/Pacientes";
import PacienteDetalhe from "@/pages/PacienteDetalhe";
import PacienteFinanceiro from "@/pages/PacienteFinanceiro";
import PacienteAutorizacoes from "@/pages/PacienteAutorizacoes";
import NovaAnamnese from "@/pages/NovaAnamnese";
import Financeiro from "@/pages/Financeiro";
import FinanceiroServicos from "@/pages/FinanceiroServicos";
import FinanceiroRepasses from "@/pages/FinanceiroRepasses";
import Pagamentos from "@/pages/Pagamentos";
import Medicos from "@/pages/Medicos";
import Crm from "@/pages/Crm";
import CrmTemplates from "@/pages/CrmTemplates";
import Configuracoes from "@/pages/Configuracoes";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/agenda" element={<Agenda />} />
            <Route path="/pacientes" element={<Pacientes />} />
            <Route path="/paciente/:id" element={<PacienteDetalhe />} />
            <Route path="/paciente/:id/financeiro" element={<PacienteFinanceiro />} />
            <Route path="/paciente/:id/autorizacoes" element={<PacienteAutorizacoes />} />
            <Route path="/paciente/:id/anamnese" element={<NovaAnamnese />} />
            <Route path="/financeiro" element={<Financeiro />} />
            <Route path="/financeiro/servicos" element={<FinanceiroServicos />} />
            <Route path="/financeiro/repasses" element={<FinanceiroRepasses />} />
            <Route path="/pagamentos" element={<Pagamentos />} />
            <Route path="/medicos" element={<Medicos />} />
            <Route path="/crm" element={<Crm />} />
            <Route path="/crm/templates" element={<CrmTemplates />} />
            <Route
              path="/configuracoes"
              element={
                <ProtectedRoute requireRoles={["admin"]}>
                  <Configuracoes />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
