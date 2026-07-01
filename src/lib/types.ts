// =========================================================================
// Tipos compartilhados da aplicacao Captacao Movida
// =========================================================================

/** Papeis de usuario suportados (vem do Clerk em publicMetadata.role). */
export type Role = "vendedor" | "gestor";

/**
 * Representa uma linha da tabela `captacoes` no Supabase.
 * Mantenha em sincronia com supabase/schema.sql.
 */
export interface Captacao {
  id: string;
  vendedor_id: string;
  vendedor_nome: string | null;
  nome_cliente: string;
  telefone: string;
  placa: string;
  created_at: string;
}

/** Payload usado para inserir uma nova captacao. */
export interface NovaCaptacao {
  vendedor_id: string;
  vendedor_nome: string | null;
  nome_cliente: string;
  telefone: string;
  placa: string;
}
