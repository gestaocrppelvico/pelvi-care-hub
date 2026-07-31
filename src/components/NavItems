// src/components/Navigation.tsx
import { useAuth } from '@/hooks/useAuth';
import { Home, Calendar, Users, DollarSign, MessageSquare, UserCog } from 'lucide-react';

export function useNavItems() {
  const { isAdmin, isSecretaria, isFisio } = useAuth();

  const baseItems = [
    { label: 'Dashboard', icon: Home, href: '/' },
    { label: 'Agenda', icon: Calendar, href: '/agenda' },
  ];

  const patientItem = { label: 'Pacientes', icon: Users, href: '/pacientes' };

  const financeiroItem = { label: 'Financeiro', icon: DollarSign, href: '/financeiro' };
  const crmItem = { label: 'CRM', icon: MessageSquare, href: '/crm' };
  const configItem = { label: 'Configurações', icon: UserCog, href: '/configuracoes' };

  if (isAdmin) {
    return [...baseItems, patientItem, financeiroItem, crmItem, configItem];
  }

  if (isSecretaria) {
    return [...baseItems, patientItem, financeiroItem, crmItem];
  }

  if (isFisio) {
    // Fisio vê apenas sua agenda e seus pacientes (filtro automático)
    return [...baseItems, patientItem];
  }

  return baseItems; // fallback
}
