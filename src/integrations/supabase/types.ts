export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      atendimentos: {
        Row: {
          assinatura_paciente_url: string | null
          autorizacao_id: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string
          evolucao: string | null
          google_event_id: string | null
          id: string
          last_synced_at: string | null
          observacoes: string | null
          paciente_id: string
          profissional_id: string
          status: Database["public"]["Enums"]["status_atendimento"]
          tipo: Database["public"]["Enums"]["tipo_atendimento"]
          unidade: string | null
          updated_at: string
          valor: number | null
        }
        Insert: {
          assinatura_paciente_url?: string | null
          autorizacao_id?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio: string
          evolucao?: string | null
          google_event_id?: string | null
          id?: string
          last_synced_at?: string | null
          observacoes?: string | null
          paciente_id: string
          profissional_id: string
          status?: Database["public"]["Enums"]["status_atendimento"]
          tipo?: Database["public"]["Enums"]["tipo_atendimento"]
          unidade?: string | null
          updated_at?: string
          valor?: number | null
        }
        Update: {
          assinatura_paciente_url?: string | null
          autorizacao_id?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          evolucao?: string | null
          google_event_id?: string | null
          id?: string
          last_synced_at?: string | null
          observacoes?: string | null
          paciente_id?: string
          profissional_id?: string
          status?: Database["public"]["Enums"]["status_atendimento"]
          tipo?: Database["public"]["Enums"]["tipo_atendimento"]
          unidade?: string | null
          updated_at?: string
          valor?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "atendimentos_autorizacao_id_fkey"
            columns: ["autorizacao_id"]
            isOneToOne: false
            referencedRelation: "autorizacoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atendimentos_profissional_id_fkey"
            columns: ["profissional_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      autorizacoes: {
        Row: {
          arquivo_guia_url: string | null
          arquivo_pedido_url: string | null
          created_at: string
          data_emissao: string | null
          data_validade: string | null
          id: string
          numero_guia: string | null
          observacoes: string | null
          paciente_id: string
          plano: string
          sessoes_autorizadas: number
          sessoes_realizadas: number
          status: Database["public"]["Enums"]["status_autorizacao"]
          updated_at: string
        }
        Insert: {
          arquivo_guia_url?: string | null
          arquivo_pedido_url?: string | null
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          id?: string
          numero_guia?: string | null
          observacoes?: string | null
          paciente_id: string
          plano: string
          sessoes_autorizadas?: number
          sessoes_realizadas?: number
          status?: Database["public"]["Enums"]["status_autorizacao"]
          updated_at?: string
        }
        Update: {
          arquivo_guia_url?: string | null
          arquivo_pedido_url?: string | null
          created_at?: string
          data_emissao?: string | null
          data_validade?: string | null
          id?: string
          numero_guia?: string | null
          observacoes?: string | null
          paciente_id?: string
          plano?: string
          sessoes_autorizadas?: number
          sessoes_realizadas?: number
          status?: Database["public"]["Enums"]["status_autorizacao"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "autorizacoes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_envios: {
        Row: {
          enviado_em: string
          enviado_por: string | null
          id: string
          mensagem: string
          paciente_id: string
          tipo: string
        }
        Insert: {
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          mensagem: string
          paciente_id: string
          tipo: string
        }
        Update: {
          enviado_em?: string
          enviado_por?: string | null
          id?: string
          mensagem?: string
          paciente_id?: string
          tipo?: string
        }
        Relationships: []
      }
      crm_templates: {
        Row: {
          ativo: boolean
          conteudo: string
          created_at: string
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          conteudo: string
          created_at?: string
          id?: string
          nome: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          conteudo?: string
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      documentos_pacientes: {
        Row: {
          arquivo_url: string | null
          conteudo_gerado: string | null
          created_at: string
          created_by: string | null
          id: string
          modelo_id: string | null
          nome: string
          paciente_id: string
          tipo: string
        }
        Insert: {
          arquivo_url?: string | null
          conteudo_gerado?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          modelo_id?: string | null
          nome: string
          paciente_id: string
          tipo: string
        }
        Update: {
          arquivo_url?: string | null
          conteudo_gerado?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          modelo_id?: string | null
          nome?: string
          paciente_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "documentos_pacientes_modelo_id_fkey"
            columns: ["modelo_id"]
            isOneToOne: false
            referencedRelation: "modelos_documentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documentos_pacientes_paciente_id_fkey"
            columns: ["paciente_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_insumos: {
        Row: {
          ativo: boolean
          categoria: string | null
          created_at: string
          id: string
          nome: string
          quantidade_atual: number
          quantidade_minima: number
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nome: string
          quantidade_atual?: number
          quantidade_minima?: number
          unidade?: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nome?: string
          quantidade_atual?: number
          quantidade_minima?: number
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      gcal_sync_state: {
        Row: {
          calendar_id: string
          id: string
          last_full_sync_at: string | null
          last_incremental_at: string | null
          sync_token: string | null
          updated_at: string
        }
        Insert: {
          calendar_id?: string
          id?: string
          last_full_sync_at?: string | null
          last_incremental_at?: string | null
          sync_token?: string | null
          updated_at?: string
        }
        Update: {
          calendar_id?: string
          id?: string
          last_full_sync_at?: string | null
          last_incremental_at?: string | null
          sync_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      medicos: {
        Row: {
          cidade: string | null
          created_at: string
          created_by: string | null
          crm: string | null
          email: string | null
          endereco: string | null
          especialidade: string | null
          estado: string | null
          id: string
          latitude: number | null
          longitude: number | null
          nome: string
          observacoes: string | null
          planos_atendidos: string[] | null
          telefone: string | null
          ultima_visita: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          created_by?: string | null
          crm?: string | null
          email?: string | null
          endereco?: string | null
          especialidade?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome: string
          observacoes?: string | null
          planos_atendidos?: string[] | null
          telefone?: string | null
          ultima_visita?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          cidade?: string | null
          created_at?: string
          created_by?: string | null
          crm?: string | null
          email?: string | null
          endereco?: string | null
          especialidade?: string | null
          estado?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          nome?: string
          observacoes?: string | null
          planos_atendidos?: string[] | null
          telefone?: string | null
          ultima_visita?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      modelos_documentos: {
        Row: {
          ativo: boolean
          conteudo: string
          created_at: string
          id: string
          nome: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          conteudo: string
          created_at?: string
          id?: string
          nome: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          conteudo?: string
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      movimentacao_estoque: {
        Row: {
          atendimento_id: string | null
          created_at: string
          created_by: string | null
          id: string
          insumo_id: string
          observacoes: string | null
          quantidade: number
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
        }
        Insert: {
          atendimento_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          insumo_id: string
          observacoes?: string | null
          quantidade: number
          tipo: Database["public"]["Enums"]["tipo_movimentacao"]
        }
        Update: {
          atendimento_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          insumo_id?: string
          observacoes?: string | null
          quantidade?: number
          tipo?: Database["public"]["Enums"]["tipo_movimentacao"]
        }
        Relationships: [
          {
            foreignKeyName: "movimentacao_estoque_atendimento_id_fkey"
            columns: ["atendimento_id"]
            isOneToOne: false
            referencedRelation: "atendimentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacao_estoque_insumo_id_fkey"
            columns: ["insumo_id"]
            isOneToOne: false
            referencedRelation: "estoque_insumos"
            referencedColumns: ["id"]
          },
        ]
      }
      pacientes: {
        Row: {
          ativo: boolean
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          id: string
          medico_solicitante_id: string | null
          nome: string
          numero_carteirinha: string | null
          observacoes: string | null
          plano_saude: string | null
          profissional_responsavel_id: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          medico_solicitante_id?: string | null
          nome: string
          numero_carteirinha?: string | null
          observacoes?: string | null
          plano_saude?: string | null
          profissional_responsavel_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          id?: string
          medico_solicitante_id?: string | null
          nome?: string
          numero_carteirinha?: string | null
          observacoes?: string | null
          plano_saude?: string | null
          profissional_responsavel_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_medico_solicitante_id_fkey"
            columns: ["medico_solicitante_id"]
            isOneToOne: false
            referencedRelation: "medicos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pacientes_profissional_responsavel_id_fkey"
            columns: ["profissional_responsavel_id"]
            isOneToOne: false
            referencedRelation: "profissionais"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome_completo: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome_completo?: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome_completo?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profissionais: {
        Row: {
          ativo: boolean
          cor_agenda: string
          created_at: string
          email: string | null
          especialidade: string | null
          google_calendar_color_id: string | null
          id: string
          nome: string
          tipo_repasse: Database["public"]["Enums"]["tipo_repasse"]
          unidade: string | null
          updated_at: string
          user_id: string | null
          valor_repasse: number
        }
        Insert: {
          ativo?: boolean
          cor_agenda?: string
          created_at?: string
          email?: string | null
          especialidade?: string | null
          google_calendar_color_id?: string | null
          id?: string
          nome: string
          tipo_repasse?: Database["public"]["Enums"]["tipo_repasse"]
          unidade?: string | null
          updated_at?: string
          user_id?: string | null
          valor_repasse?: number
        }
        Update: {
          ativo?: boolean
          cor_agenda?: string
          created_at?: string
          email?: string | null
          especialidade?: string | null
          google_calendar_color_id?: string | null
          id?: string
          nome?: string
          tipo_repasse?: Database["public"]["Enums"]["tipo_repasse"]
          unidade?: string | null
          updated_at?: string
          user_id?: string | null
          valor_repasse?: number
        }
        Relationships: []
      }
      prontuarios: {
        Row: {
          atendimento_id: string
          avaliacao_funcional: string | null
          conduta: string | null
          created_at: string
          created_by: string | null
          escala_dor: number | null
          evolucao_livre: string | null
          exercicios_prescritos: string | null
          id: string
          paciente_id: string
          profissional_id: string
          proximos_passos: string | null
          queixa_principal: string | null
          updated_at: string
        }
        Insert: {
          atendimento_id: string
          avaliacao_funcional?: string | null
          conduta?: string | null
          created_at?: string
          created_by?: string | null
          escala_dor?: number | null
          evolucao_livre?: string | null
          exercicios_prescritos?: string | null
          id?: string
          paciente_id: string
          profissional_id: string
          proximos_passos?: string | null
          queixa_principal?: string | null
          updated_at?: string
        }
        Update: {
          atendimento_id?: string
          avaliacao_funcional?: string | null
          conduta?: string | null
          created_at?: string
          created_by?: string | null
          escala_dor?: number | null
          evolucao_livre?: string | null
          exercicios_prescritos?: string | null
          id?: string
          paciente_id?: string
          profissional_id?: string
          proximos_passos?: string | null
          queixa_principal?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_profissional_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "secretaria" | "fisio"
      status_atendimento: "agendado" | "realizado" | "cancelado" | "faltou"
      status_autorizacao: "ativa" | "expirada" | "esgotada" | "pendente"
      tipo_atendimento: "Plano" | "Particular"
      tipo_movimentacao: "entrada" | "saida"
      tipo_repasse: "fixo" | "percentual"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "secretaria", "fisio"],
      status_atendimento: ["agendado", "realizado", "cancelado", "faltou"],
      status_autorizacao: ["ativa", "expirada", "esgotada", "pendente"],
      tipo_atendimento: ["Plano", "Particular"],
      tipo_movimentacao: ["entrada", "saida"],
      tipo_repasse: ["fixo", "percentual"],
    },
  },
} as const
