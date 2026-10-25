import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { OfertaDto } from '@shared/dto'
import { SITUACOES_OFERTA, SITUACOES_POR_MODALIDADE } from '@shared/schemas'
import { AreaTexto, Aviso, Botao, Campo, Dialogo, Selecao, useToast } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { SeloSituacao } from './comum'

export function DialogoSituacao({ oferta, imovelId, aoFechar }: { oferta: OfertaDto; imovelId: number; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const opcoes = SITUACOES_POR_MODALIDADE[oferta.modalidade].filter((s) => s !== oferta.situacao)
  const [situacao, setSituacao] = useState<string>(opcoes[0]!)
  const [motivo, setMotivo] = useState('')
  const [falha, setFalha] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const automatica = (oferta.modalidade === 'LOCACAO' && situacao === 'ALUGADO') || (oferta.modalidade === 'VENDA' && situacao === 'VENDIDO')
  return (
    <Dialogo
      aberto
      titulo={`Situação da ${oferta.modalidade === 'VENDA' ? 'venda' : 'locação'}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            carregando={carregando}
            disabled={motivo.trim().length < 3}
            onClick={async () => {
              setCarregando(true)
              setFalha(null)
              try {
                await rpc('imoveis.alterarSituacao', { ofertaId: oferta.id, situacao: situacao as never, motivo })
                toast.sucesso('Situação alterada.')
                void qc.invalidateQueries({ queryKey: ['imovel', imovelId] })
                void qc.invalidateQueries({ queryKey: ['imoveis'] })
                void qc.invalidateQueries({ queryKey: ['historico-situacao', imovelId] })
                aoFechar()
              } catch (e) {
                setFalha(e instanceof Error ? e.message : String(e))
              } finally {
                setCarregando(false)
              }
            }}
          >
            Alterar
          </Botao>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm">
          Situação atual: <SeloSituacao situacao={oferta.situacao} />
        </div>
        <Campo rotulo="Nova situação">{(i) => <Selecao id={i} opcoes={opcoes.map((s) => [s, SITUACOES_OFERTA[s]] as [string, string])} value={situacao} onChange={(e) => setSituacao(e.target.value)} />}</Campo>
        {automatica && (
          <Aviso tom="alerta">
            A partir das Fases 3 e 5, as situações {oferta.modalidade === 'VENDA' ? '"Vendido"' : '"Alugado"'} serão definidas automaticamente pelo contrato. Use a alteração manual apenas para registrar imóveis já
            negociados antes do sistema.
            {oferta.modalidade === 'VENDA' && ' A oferta de locação disponível será inativada.'}
          </Aviso>
        )}
        <Campo rotulo="Motivo" obrigatorio ajuda="Fica registrado no histórico do imóvel.">{(i) => <AreaTexto id={i} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}</Campo>
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
    </Dialogo>
  )
}
