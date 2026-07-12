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
  /** Telefone do VENDEDOR (publicMetadata.telefone no Clerk), nao do cliente. */
  vendedor_telefone: string | null;
  loja: string | null;
  nome_cliente: string;
  telefone: string;
  placa: string;
  /** Vem da importacao automatica do ViaNuvem (vendedor_id = "vianuvem"); nulo para captacoes de vendedor. */
  cpf: string | null;
  email: string | null;
  /** Origem do lead: "Indicação" (formulario do vendedor; valor gravado com acento) ou "ViaNuvem" (importacao automatica). */
  canal: string | null;
  created_at: string;
}

/** Payload usado para inserir uma nova captacao. */
export interface NovaCaptacao {
  vendedor_id: string;
  vendedor_nome: string | null;
  vendedor_telefone?: string | null;
  loja: string | null;
  nome_cliente: string;
  telefone: string;
  placa: string;
  cpf?: string | null;
  email?: string | null;
  canal?: string | null;
}
