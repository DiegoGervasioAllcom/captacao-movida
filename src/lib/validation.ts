// =========================================================================
// Validacao e mascaras dos campos do formulario de captacao
// Regras (Brasil):
//  - Nome: obrigatorio
//  - Telefone: 10 ou 11 digitos (fixo ou celular)
//  - Placa: Mercosul (ABC1D23) ou antiga (ABC1234), sempre em maiusculo
// =========================================================================

/** Remove tudo que nao for digito. */
export function somenteDigitos(valor: string): string {
  return valor.replace(/\D+/g, "");
}

/**
 * Aplica a mascara brasileira de telefone enquanto o usuario digita.
 * Aceita ate 11 digitos: (00) 0000-0000 ou (00) 00000-0000.
 */
export function mascararTelefone(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone valido = 10 (fixo) ou 11 (celular) digitos. */
export function telefoneValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  return d.length === 10 || d.length === 11;
}

/** Aplica a mascara brasileira de CPF enquanto o usuario digita: 000.000.000-00. */
export function mascararCpf(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function digitoVerificadorCpf(base: string): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) {
    soma += Number(base[i]) * (base.length + 1 - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

/** CPF valido = 11 digitos, nao repetidos, com os 2 digitos verificadores corretos. */
export function cpfValido(valor: string): boolean {
  const d = somenteDigitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const d1 = digitoVerificadorCpf(d.slice(0, 9));
  const d2 = digitoVerificadorCpf(d.slice(0, 9) + d1);
  return d === `${d.slice(0, 9)}${d1}${d2}`;
}

const DOMINIO_EMAIL_CORPORATIVO = "@movida.com.br";

/** Autocadastro do vendedor exige e-mail corporativo (@movida.com.br). */
export function emailCorporativoValido(valor: string): boolean {
  return valor.trim().toLowerCase().endsWith(DOMINIO_EMAIL_CORPORATIVO);
}

/**
 * Normaliza a placa: remove espacos/hifens e converte para maiusculo.
 * Limita a 7 caracteres alfanumericos.
 */
export function normalizarPlaca(valor: string): string {
  return valor
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 7);
}

const RE_PLACA_ANTIGA = /^[A-Z]{3}[0-9]{4}$/; // ABC1234
const RE_PLACA_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/; // ABC1D23

/** Placa valida = padrao antigo OU Mercosul. */
export function placaValida(valor: string): boolean {
  const p = normalizarPlaca(valor);
  return RE_PLACA_ANTIGA.test(p) || RE_PLACA_MERCOSUL.test(p);
}

export interface ErrosCaptacao {
  nome_cliente?: string;
  telefone?: string;
  placa?: string;
}

export interface DadosCaptacaoForm {
  nome_cliente: string;
  telefone: string;
  placa: string;
}

/**
 * Valida o formulario inteiro e retorna um objeto de erros.
 * Sem erros = objeto vazio.
 */
export function validarCaptacao(dados: DadosCaptacaoForm): ErrosCaptacao {
  const erros: ErrosCaptacao = {};

  if (!dados.nome_cliente.trim()) {
    erros.nome_cliente = "Informe o nome do cliente.";
  }

  if (!dados.telefone.trim()) {
    erros.telefone = "Informe o telefone.";
  } else if (!telefoneValido(dados.telefone)) {
    erros.telefone = "Telefone deve ter 10 ou 11 digitos.";
  }

  if (!dados.placa.trim()) {
    erros.placa = "Informe a placa.";
  } else if (!placaValida(dados.placa)) {
    erros.placa = "Placa invalida. Use ABC1D23 (Mercosul) ou ABC1234.";
  }

  return erros;
}
