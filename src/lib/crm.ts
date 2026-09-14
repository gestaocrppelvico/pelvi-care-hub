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

// ============================================================
// PREFERÊNCIA DE ABERTURA DO WHATSAPP (App Desktop vs Navegador)
// ============================================================

export type PreferenciaWhatsApp = "app" | "web";

const STORAGE_KEY = "crppelvico_whatsapp_preferencia";

/** Lê a preferência salva no navegador. Padrão: 'web' */
export function getPreferenciaWhatsApp(): PreferenciaWhatsApp {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY);
    if (salvo === "app" || salvo === "web") return salvo;
  } catch {
    // localStorage indisponível (modo anônimo, etc.)
  }
  return "web";
}

/** Salva a preferência no navegador */
export function setPreferenciaWhatsApp(pref: PreferenciaWhatsApp): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // ignora
  }
}

/**
 * Abre conversa no WhatsApp.
 * @param preferencia 'app' abre o aplicativo desktop (Windows).
 *                    'web' abre o WhatsApp Web no navegador.
 */
export function abrirWhatsapp(
  telefone: string | null | undefined,
  mensagem: string,
  preferencia: PreferenciaWhatsApp = "web"
): boolean {
  const tel = telefoneWaMe(telefone);
  if (!tel) return false;
  const encoded = encodeURIComponent(mensagem);

  const url =
    preferencia === "app"
      ? `whatsapp://send?phone=${tel}&text=${encoded}`
      : `https://web.whatsapp.com/send?phone=${tel}&text=${encoded}`;

  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
