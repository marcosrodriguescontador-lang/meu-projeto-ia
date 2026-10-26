import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { formatarMoeda } from '@shared/dinheiro'
import { formatarCompetencia, formatarData } from '@shared/financeiro/datas'
import { ORIGENS_TITULO } from '@shared/schemas-locacao'
import { useSessao } from '@/app/sessao'
import { Botao, CabecalhoPagina, Cartao, Entrada, Paginacao, Selecao, Tabela } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { DialogoTitulo, rotuloOrigem, SeloTitulo } from './comum'
import { DialogoNovoTitulo } from './NovoTitulo'

/** Contas a receber e a pagar (mesma tela, sentido diferente). */
export function Titulos({ sentido }: { sentido: 'RECEBER' | 'PAGAR' }) {
  const [f, setF] = useState({ busca: '', situacao: 'EM_ABERTO', origem: '', vencimentoDe: '', vencimentoAte: '', pagina: 1 })
  const { pode } = useSessao()
  const [aberto, setAberto] = useState<number | null>(null)
  const [novo, setNovo] = useState(false)
  const mudar = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p, pagina: p.pagina ?? 1 }))
  const entrada = { sentido, situacao: f.situacao || undefined, origem: f.origem || undefined, busca: f.busca || undefined, vencimentoDe: f.vencimentoDe || undefined, vencimentoAte: f.vencimentoAte || undefined, pagina: f.pagina }
  const { data, isLoading } = useQuery({ queryKey: ['titulos', entrada], queryFn: () => rpc('titulos.listar', entrada), placeholderData: keepPreviousData })
  const origens = Object.entries(ORIGENS_TITULO).filter(([k]) => (sentido === 'RECEBER' ? ['COBRANCA_LOCACAO', 'CAUCAO', 'RESCISAO', 'RENEGOCIACAO', 'RECEITA_PROPRIA'] : ['REPASSE', 'PAGAMENTO_TERCEIRO', 'DEVOLUCAO_CAUCAO', 'DESPESA']).includes(k))
  return (
    <>
      <CabecalhoPagina
        titulo={sentido === 'RECEBER' ? 'Contas a receber' : 'Contas a pagar'}
        subtitulo={sentido === 'RECEBER' ? 'Cobranças emitidas. A baixa só ocorre com o registro do recebimento.' : 'Repasses a proprietários, pagamentos a terceiros, devoluções de caução e despesas da imobiliária.'}
        acoes={
          pode(sentido === 'PAGAR' ? 'financeiro.pagar' : 'financeiro.receber') && (
            <Botao variante="primario" icone={<Plus className="size-4" />} onClick={() => setNovo(true)}>
              {sentido === 'PAGAR' ? 'Nova despesa' : 'Nova receita própria'}
            </Botao>
          )
        }
      />
      <Cartao semPadding>
        <div className="grid grid-cols-6 gap-3 border-b border-borda p-4">
          <div className="relative col-span-2">
            <Search className="absolute top-2.5 left-3 size-4 text-texto-3" />
            <Entrada className="pl-9" placeholder="Pessoa, descrição ou nº do contrato" value={f.busca} onChange={(e) => mudar({ busca: e.target.value })} />
          </div>
          <Selecao
            aria-label="Situação"
            opcoes={{ EM_ABERTO: 'Em aberto', VENCIDO: 'Vencidos', LIQUIDADO: 'Liquidados', CANCELADO: 'Cancelados', RENEGOCIADO: 'Renegociados' }}
            vazio="Todas as situações"
            value={f.situacao}
            onChange={(e) => mudar({ situacao: e.target.value })}
          />
          <Selecao aria-label="Origem" opcoes={origens as [string, string][]} vazio="Todas as origens" value={f.origem} onChange={(e) => mudar({ origem: e.target.value })} />
          <Entrada type="date" title="Vencimento de" value={f.vencimentoDe} onChange={(e) => mudar({ vencimentoDe: e.target.value })} />
          <Entrada type="date" title="Vencimento até" value={f.vencimentoAte} onChange={(e) => mudar({ vencimentoAte: e.target.value })} />
        </div>
        <Tabela colunas={['Vencimento', sentido === 'RECEBER' ? 'Devedor' : 'Favorecido', 'Descrição', 'Origem', { t: 'Valor', cls: 'text-right' }, { t: 'Saldo', cls: 'text-right' }, 'Situação']} vazio={data?.itens.length === 0} carregando={isLoading}>
          {data?.itens.map((t) => (
            <tr key={t.id} className="cursor-pointer" onClick={() => setAberto(t.id)}>
              <td className="numeros whitespace-nowrap">{formatarData(t.vencimento)}</td>
              <td className="font-medium">{t.pessoa}</td>
              <td>
                {t.descricao}
                {t.competencia && <div className="text-xs text-texto-3">Competência {formatarCompetencia(t.competencia)}</div>}
              </td>
              <td className="text-texto-2">{rotuloOrigem(t.origem)}</td>
              <td className="numeros text-right">{formatarMoeda(t.valorCentavos)}</td>
              <td className="numeros text-right font-medium">{formatarMoeda(t.saldoCentavos)}</td>
              <td>
                <SeloTitulo situacao={t.situacao} diasAtraso={t.diasAtraso} />
              </td>
            </tr>
          ))}
        </Tabela>
        {data && (
          <div className="numeros flex justify-end border-t border-borda px-4 py-2 text-sm">
            Saldo dos títulos filtrados: <strong className="ml-2">{formatarMoeda(data.somaSaldo)}</strong>
          </div>
        )}
        {data && <Paginacao pagina={f.pagina} porPagina={100} total={data.total} aoMudar={(p) => mudar({ pagina: p })} />}
      </Cartao>
      {novo && <DialogoNovoTitulo sentido={sentido} aoFechar={() => setNovo(false)} />}
      {aberto !== null && <DialogoTitulo id={aberto} aoFechar={() => setAberto(null)} />}
    </>
  )
}
