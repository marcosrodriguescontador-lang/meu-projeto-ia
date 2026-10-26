import { forwardRef, type InputHTMLAttributes } from 'react'
import { centavosParaTexto, paraCentavos } from '@shared/dinheiro'
import { SITUACOES_OFERTA, type SituacaoOferta } from '@shared/schemas'
import { Entrada, Selo, cx } from '@/components/ui'

export function SeloSituacao({ situacao }: { situacao: string }) {
  const tom = (
    { DISPONIVEL: 'destaque', RESERVADO: 'alerta', EM_NEGOCIACAO: 'alerta', ALUGADO: 'escuro', VENDIDO: 'escuro', INDISPONIVEL: 'neutro', INATIVO: 'neutro' } as const
  )[situacao as SituacaoOferta] ?? 'neutro'
  return <Selo tom={tom}>{SITUACOES_OFERTA[situacao as SituacaoOferta] ?? situacao}</Selo>
}

/** Campo monetário: aceita "1234,5" e normaliza para "1.234,50" ao sair do campo. */
export const CampoMoeda = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean; sufixo?: string }>(({ className, onBlur, onChange, sufixo = 'R$', ...p }, ref) => (
  <div className="relative">
    <span className="pointer-events-none absolute top-2 left-3 text-sm text-texto-3">{sufixo}</span>
    <Entrada
      ref={ref}
      inputMode="decimal"
      className={cx('numeros pl-9 text-right', className)}
      {...p}
      onChange={onChange}
      onBlur={(e) => {
        const c = paraCentavos(e.target.value)
        if (c != null && e.target.value !== centavosParaTexto(c)) {
          e.target.value = centavosParaTexto(c)
          onChange?.(e)
        }
        onBlur?.(e)
      }}
    />
  </div>
))

export const CampoSufixo = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalido?: boolean; sufixo: string }>(({ className, sufixo, ...p }, ref) => (
  <div className="relative">
    <Entrada ref={ref} inputMode="decimal" className={cx('numeros pr-10 text-right', className)} {...p} />
    <span className="pointer-events-none absolute top-2 right-3 text-sm text-texto-3">{sufixo}</span>
  </div>
))
