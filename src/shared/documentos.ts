// Validação de CPF e CNPJ (numérico e alfanumérico — IN RFB 2.229/2024, vigente desde jul/2026).

export function normalizarDocumento(valor: string): string {
  return valor.replace(/[.\-/\s]/g, '').toUpperCase()
}

export function validarCpf(valor: string): boolean {
  const cpf = normalizarDocumento(valor)
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false
  const digitos = cpf.split('').map(Number)
  const dv = (n: number): number => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += digitos[i]! * (n + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }
  return dv(9) === digitos[9] && dv(10) === digitos[10]
}

// Cada caractere vale (código ASCII − 48): '0'..'9' → 0..9, 'A'..'Z' → 17..42.
export function validarCnpj(valor: string): boolean {
  const cnpj = normalizarDocumento(valor)
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  const valores = cnpj.split('').map((c) => c.charCodeAt(0) - 48)
  const dv = (n: number): number => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const soma = pesos.reduce((acc, p, i) => acc + p * valores[i]!, 0)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return dv(12) === valores[12] && dv(13) === valores[13]
}

export function formatarDocumento(valor: string): string {
  const d = normalizarDocumento(valor)
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5')
  return valor
}

export function mascararDocumento(valor: string): string {
  const d = normalizarDocumento(valor)
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  return formatarDocumento(d)
}

export function validarCep(valor: string): boolean {
  return /^\d{8}$/.test(valor.replace(/\D/g, ''))
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
] as const
