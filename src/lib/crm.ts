// Helpers para o módulo CRM
export interface PacienteCrm {
  id: string;
  nome: string;
  telefone: string | null;
  data_nascimento: string | null;
  profissional?: { nome: string } | null;
}

export const PLACEHOLDERS = [
  "{paciente}",
  "{data}",
  "{hora}",
  "{profissional}",
  "{dias_sem_atendimento}",
] as const;

export function aplicarTemplate(
  texto: string,
  vars: Partial<Record<"paciente" | "data" | "hora" | "profissional" | "dias_sem_atendimento", string | number>>
): string {
  return texto
    .replace(/\{paciente\}/g, String(vars.paciente ?? ""))
    .replace(/\{data\}/g, String(vars.data ?? ""))
    .replace(/\{hora\}/g, String(vars.hora ?? ""))
    .replace(/\{profissional\}/g, String(vars.profissional ?? ""))
    .replace(/\{dias_sem_atendimento\}/g, String(vars.dias_sem_atendimento ?? ""));
}

/** Normaliza telefone brasileiro para wa.me (apenas dígitos, com DDI 55) */
export function telefoneWaMe(telefone: string | null | undefined): string | null {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function abrirWhatsapp(telefone: string | null | undefined, mensagem: string): boolean {
  const tel = telefoneWaMe(telefone);
  if (!tel) return false;
  const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
