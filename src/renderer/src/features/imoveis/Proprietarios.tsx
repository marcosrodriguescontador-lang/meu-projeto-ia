import { Divide, Trash2 } from 'lucide-react'
import { useFieldArray, type UseFormReturn } from 'react-hook-form'
import { formatarPercentual, paraPontosBase } from '@shared/dinheiro'
import type { ImovelInput } from '@shared/schemas'
import { Aviso, Botao, Cartao, cx } from '@/components/ui'
import { BuscaPessoa } from '@/features/pessoas/BuscaPessoa'
import { CampoSufixo } from './comum'

/** Coproprietários com participação percentual (soma obrigatória de 100%). */
export function Proprietarios({ form, nomes, aoNomear }: { form: UseFormReturn<ImovelInput>; nomes: Record<number, string>; aoNomear: (id: number, nome: string) => void }) {
  const { control, register, watch, setValue } = form
  const { fields, append, remove } = useFieldArray({ control, name: 'proprietarios' })
  const lista = watch('proprietarios') ?? []
  const soma = lista.reduce((s, p) => s + (paraPontosBase(p.percentual as string) ?? 0), 0)

  const dividir = () => {
    const n = lista.length
    if (!n) return
    const base = Math.floor(10_000 / n)
    lista.forEach((_, i) => setValue(`proprietarios.${i}.percentual`, ((i === 0 ? base + (10_000 - base * n) : base) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 }), { shouldDirty: true }))
  }

  return (
    <Cartao
      titulo="Proprietários e coproprietários"
      acoes={
        fields.length > 1 && (
          <Botao tamanho="sm" icone={<Divide className="size-3.5" />} onClick={dividir}>
            Dividir igualmente
          </Botao>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-texto-2">A participação define o rateio dos repasses de aluguel (Fase 3). A pessoa recebe automaticamente o papel Proprietário.</p>
        {fields.length > 0 && (
          <div className="divide-y divide-borda rounded-md border border-borda">
            {fields.map((f, i) => (
              <div key={f.id} className="flex items-center gap-4 px-4 py-2.5">
                <div className="flex-1 text-sm font-medium">{nomes[f.pessoaId] ?? `Pessoa #${f.pessoaId}`}</div>
                <label className="flex items-center gap-1.5 text-xs text-texto-2">
                  <input
                    type="radio"
                    className="accent-[var(--destaque)]"
                    checked={!!watch(`proprietarios.${i}.principal`)}
                    onChange={() => fields.forEach((_, j) => setValue(`proprietarios.${j}.principal`, j === i, { shouldDirty: true }))}
                  />
                  Principal
                </label>
                <div className="w-32">
                  <CampoSufixo sufixo="%" {...register(`proprietarios.${i}.percentual`)} />
                </div>
                <button type="button" className="text-texto-3 hover:text-perigo" onClick={() => remove(i)} title="Remover">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <div className={cx('flex justify-between px-4 py-2 text-sm font-medium', soma === 10_000 ? 'text-destaque' : 'text-perigo')}>
              <span>Total</span>
              <span className="numeros">{formatarPercentual(soma)}</span>
            </div>
          </div>
        )}
        {fields.length === 0 && <Aviso tom="alerta">Informe ao menos um proprietário.</Aviso>}
        <BuscaPessoa
          ignorar={fields.map((f) => f.pessoaId)}
          aoSelecionar={(p) => {
            aoNomear(p.id, p.nome)
            append({ pessoaId: p.id, percentual: fields.length === 0 ? '100' : '', principal: fields.length === 0 })
          }}
        />
      </div>
    </Cartao>
  )
}
