import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { formatarMoeda, paraPontosBase } from '@shared/dinheiro'
import type { ComissaoDto } from '@shared/dto-crm'
import { PAPEIS_RATEIO } from '@shared/schemas-crm'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, Confirmacao, cx, Dialogo, Entrada, Selecao, Selo, Tabela, useToast } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { invalidarCrm, useCorretores } from './comum'

export interface LinhaRateio {
  papel: keyof typeof PAPEIS_RATEIO
  beneficiarioId: string
  percentual: string
}

const pct = (bp: number) => (bp / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })

/** Rateio padrão (Configuração Q24) com captador e vendedor preenchidos. */
export function useRateioPadrao(captadorId: number | null, vendedorId: number | null) {
  const { data } = useQuery({ queryKey: ['rateio-padrao'], queryFn: () => rpc('comissoes.rateioPadrao') })
  const linhas: LinhaRateio[] | null = data
    ? data.itens.map((i) => ({ papel: i.papel, percentual: pct(i.percentualBp), beneficiarioId: i.papel === 'CAPTADOR' && captadorId ? String(captadorId) : i.papel === 'VENDEDOR' && vendedorId ? String(vendedorId) : '' }))
    : null
  return linhas
}

export const rateioParaEnvio = (l: LinhaRateio[]) => l.map((r) => ({ papel: r.papel, beneficiarioId: r.beneficiarioId ? Number(r.beneficiarioId) : null, percentual: r.percentual }))

export function EditorRateio({ linhas, aoMudar, valorCentavos }: { linhas: LinhaRateio[]; aoMudar: (l: LinhaRateio[]) => void; valorCentavos?: number }) {
  const { data: corretores } = useCorretores()
  const soma = linhas.reduce((s, l) => s + (paraPontosBase(l.percentual) ?? 0), 0)
  const set = (i: number, p: Partial<LinhaRateio>) => aoMudar(linhas.map((l, k) => (k === i ? { ...l, ...p, ...(p.papel === 'IMOBILIARIA' ? { beneficiarioId: '' } : {}) } : l)))
  return (
    <div className="space-y-2 text-sm">
      {linhas.map((l, i) => (
        <div key={i} className="grid grid-cols-[9rem_1fr_6rem_7rem_2rem] items-center gap-2">
          <Selecao aria-label="Papel" opcoes={PAPEIS_RATEIO} value={l.papel} onChange={(e) => set(i, { papel: e.target.value as 'CAPTADOR' })} />
          {l.papel === 'IMOBILIARIA' ? (
            <div className="px-3 text-texto-2">Status Negócios Imobiliários</div>
          ) : (
            <Selecao aria-label="Beneficiário" opcoes={(corretores ?? []).map((c) => [String(c.id), c.nome] as [string, string])} vazio="Selecione o corretor/parceiro" value={l.beneficiarioId} onChange={(e) => set(i, { beneficiarioId: e.target.value })} />
          )}
          <div className="relative">
            <Entrada aria-label="Percentual do participante" className="numeros pr-7 text-right" value={l.percentual} onChange={(e) => set(i, { percentual: e.target.value })} />
            <span className="absolute top-2 right-2.5 text-texto-3">%</span>
          </div>
          <div className="numeros text-right text-texto-2">{valorCentavos != null ? formatarMoeda(Math.floor((valorCentavos * (paraPontosBase(l.percentual) ?? 0)) / 10_000)) : ''}</div>
          <Botao tamanho="sm" variante="fantasma" title="Remover" icone={<Trash2 className="size-3.5" />} onClick={() => aoMudar(linhas.filter((_, k) => k !== i))} disabled={linhas.length <= 1} />
        </div>
      ))}
      <div className="flex items-center justify-between">
        <Botao tamanho="sm" variante="fantasma" icone={<Plus className="size-3.5" />} onClick={() => aoMudar([...linhas, { papel: 'OUTRO', beneficiarioId: '', percentual: '0' }])}>
          Adicionar participante
        </Botao>
        <span className={cx('numeros text-xs', soma === 10_000 ? 'text-texto-2' : 'font-medium text-perigo')}>Soma: {pct(soma)}%</span>
      </div>
    </div>
  )
}

/** Situação da comissão: quanto a imobiliária recebeu e quanto já foi liberado/pago a cada participante. */
export function PainelComissao({ comissao: c }: { comissao: ComissaoDto }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const [editar, setEditar] = useState<LinhaRateio[] | null>(null)
  const [cancelar, setCancelar] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const recebidoPct = c.valorCentavos ? Math.round((c.recebidoCentavos / c.valorCentavos) * 100) : 0
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-4 gap-4">
        <div>
          <div className="text-xs text-texto-2">Comissão</div>
          <div className="numeros font-semibold">{formatarMoeda(c.valorCentavos)}</div>
          <div className="text-xs text-texto-3">
            {pct(c.percentualBp)}% sobre {formatarMoeda(c.baseCentavos)}
          </div>
        </div>
        <div>
          <div className="text-xs text-texto-2">Recebido pela imobiliária</div>
          <div className="numeros font-semibold">{formatarMoeda(c.recebidoCentavos)}</div>
          <div className="mt-1 h-1.5 rounded bg-superficie-2">
            <div className="h-1.5 rounded bg-destaque" style={{ width: `${recebidoPct}%` }} />
          </div>
        </div>
        <div>
          <div className="text-xs text-texto-2">Pagador</div>
          <div>{c.pagador ?? (c.origem === 'LOCACAO' ? 'Intermediação no 1º aluguel' : '—')}</div>
        </div>
        <div>
          <div className="text-xs text-texto-2">Situação</div>
          {c.situacao === 'CANCELADA' ? <Selo tom="perigo">Cancelada</Selo> : c.recebidoCentavos >= c.valorCentavos ? <Selo tom="destaque">Recebida</Selo> : <Selo tom="alerta">A receber</Selo>}
        </div>
      </div>
      {c.motivoCancelamento && <Aviso tom="alerta">Cancelada: {c.motivoCancelamento}</Aviso>}
      <div className="rounded-md border border-borda">
        <Tabela colunas={['Participante', 'Papel', { t: '%', cls: 'text-right' }, { t: 'Valor', cls: 'text-right' }, { t: 'Liberado', cls: 'text-right' }, { t: 'Pago', cls: 'text-right' }]}>
          {c.rateio.map((r) => (
            <tr key={r.id}>
              <td className="font-medium">{r.beneficiario ?? 'Imobiliária'}</td>
              <td className="text-texto-2">{PAPEIS_RATEIO[r.papel as keyof typeof PAPEIS_RATEIO]}</td>
              <td className="numeros text-right">{pct(r.percentualBp)}</td>
              <td className="numeros text-right">{formatarMoeda(r.valorCentavos)}</td>
              <td className="numeros text-right">{r.papel === 'IMOBILIARIA' ? '—' : formatarMoeda(r.liberadoCentavos)}</td>
              <td className="numeros text-right">{r.papel === 'IMOBILIARIA' ? '—' : formatarMoeda(r.pagoCentavos)}</td>
            </tr>
          ))}
        </Tabela>
      </div>
      <p className="text-xs text-texto-3">A parte de cada corretor vira conta a pagar somente na proporção do que a imobiliária já recebeu desta comissão.</p>
      {pode('comissoes.gerenciar') && c.situacao === 'ATIVA' && (
        <div className="flex justify-end gap-2">
          {c.recebidoCentavos === 0 && (
            <Botao variante="fantasma" onClick={() => setCancelar(true)}>
              Cancelar comissão
            </Botao>
          )}
          {c.rateioEditavel && (
            <Botao onClick={() => setEditar(c.rateio.map((r) => ({ papel: r.papel as 'CAPTADOR', beneficiarioId: r.beneficiarioId ? String(r.beneficiarioId) : '', percentual: pct(r.percentualBp) })))}>Alterar rateio</Botao>
          )}
        </div>
      )}
      {editar && (
        <Dialogo
          aberto
          largura="max-w-2xl"
          titulo="Alterar rateio da comissão"
          aoFechar={() => setEditar(null)}
          rodape={
            <>
              <Botao variante="fantasma" onClick={() => setEditar(null)}>
                Cancelar
              </Botao>
              <Botao
                variante="primario"
                onClick={async () => {
                  try {
                    await rpc('comissoes.rateio', { id: c.id, rateio: rateioParaEnvio(editar) })
                    toast.sucesso('Rateio atualizado.')
                    invalidarCrm(qc)
                    setEditar(null)
                  } catch (e) {
                    setFalha(e instanceof Error ? e.message : String(e))
                  }
                }}
              >
                Salvar
              </Botao>
            </>
          }
        >
          <EditorRateio linhas={editar} aoMudar={setEditar} valorCentavos={c.valorCentavos} />
          {falha && (
            <div className="mt-3">
              <Aviso tom="perigo">{falha}</Aviso>
            </div>
          )}
        </Dialogo>
      )}
      <Confirmacao
        aberto={cancelar}
        titulo="Cancelar comissão"
        perigo
        exigirMotivo
        textoConfirmar="Cancelar comissão"
        mensagem="O título a receber da comissão é cancelado e nada será liberado aos corretores. Só é possível enquanto nada foi recebido."
        aoFechar={() => setCancelar(false)}
        aoConfirmar={async (motivo) => {
          await rpc('comissoes.cancelar', { id: c.id, motivo })
          toast.sucesso('Comissão cancelada.')
          invalidarCrm(qc)
        }}
      />
    </div>
  )
}
