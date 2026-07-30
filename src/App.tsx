import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";

// Páginas
import Auth from "@/pages/Auth";
import Dashboard from "@/pages/Dashboard";
import Agenda from "@/pages/Agenda";
import Pacientes from "@/pages/Pacientes";
import PacienteDetalhe from "@/pages/PacienteDetalhe"; // ⬅️ corrigido
import PacienteFinanceiro from "@/pages/PacienteFinanceiro";
import PacienteAutorizacoes from "@/pages/PacienteAutorizacoes";
import NovaAnamnese from "@/pages/NovaAnamnese";
import Financeiro from "@/pages/Financeiro";
import FinanceiroServicos from "@/pages/FinanceiroServicos";
import FinanceiroRepasses from "@/pages/FinanceiroRepasses";
import RelatorioRepasses from "@/pages/RelatorioRepasses";
import Pagamentos from "@/pages/Pagamentos";
import Medicos from "@/pages/Medicos";
// import Configuracoes from "@/pages/Configuracoes"; // ⬅️ removido (não existe)

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Rotas públicas */}
          <Route path="/" element={<Auth />} />
          <Route path="/auth" element={<Auth />} />

          {/* Rotas protegidas com layout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/pacientes" element={<Pacientes />} />
              <Route path="/pacientes/:id" element={<PacienteDetalhe />} /> {/* ⬅️ corrigido */}
              <Route path="/pacientes/:id/financeiro" element={<PacienteFinanceiro />} />
              <Route path="/pacientes/:id/autorizacoes" element={<PacienteAutorizacoes />} />
              <Route path="/pacientes/:id/nova-anamnese" element={<NovaAnamnese />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/financeiro/servicos" element={<FinanceiroServicos />} />
              <Route path="/financeiro/repasses" element={<FinanceiroRepasses />} />
              <Route path="/financeiro/relatorios" element={<RelatorioRepasses />} />
              <Route path="/financeiro/pagamentos" element={<Pagamentos />} />
              <Route path="/medicos" element={<Medicos />} />
              {/* <Route path="/configuracoes" element={<Configuracoes />} /> */} {/* ⬅️ removido */}
            </Route>
          </Route>

          {/* Fallback 404 */}
          <Route path="*" element={<div>404 - Página não encontrada</div>} />
        </Routes>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
