import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { BedDouble, Building2, Car, LayoutGrid, List, Plus, Ruler, Search, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatarArea, formatarMoeda } from '@shared/dinheiro'
import type { ImovelResumo } from '@shared/dto'
import { FINALIDADES_IMOVEL, MODALIDADES, SITUACOES_OFERTA, TIPOS_IMOVEL, type ListarImoveisInput } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { Botao, CabecalhoPagina, Caixa, Cartao, Entrada, Paginacao, Selecao, Tabela, cx } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { CampoMoeda, SeloSituacao } from './comum'

type Filtros = {
  busca: string
  modalidade: string
  situacao: string
  tipo: string
  finalidade: string
  cidade: string
  bairro: string
  precoMin: string
  precoMax: string
  dormitoriosMin: string
  vagasMin: string
  caracteristicas: number[]
  ordenar: 'codigo' | 'recentes' | 'valor_asc' | 'valor_desc'
  pagina: number
}

const INICIAL: Filtros = { busca: '', modalidade: '', situacao: '', tipo: '', finalidade: '', cidade: '', bairro: '', precoMin: '', precoMax: '', dormitoriosMin: '', vagasMin: '', caracteristicas: [], ordenar: 'codigo', pagina: 1 }

function preferenciaVisao(): 'tabela' | 'cards' {
  try {
    return localStorage.getItem('imoveis.visao') === 'cards' ? 'cards' : 'tabela'
  } catch {
    return 'tabela'
  }
}

export const rotuloTipo = (t: string) => TIPOS_IMOVEL[t as keyof typeof TIPOS_IMOVEL] ?? t

export function ListaImoveis() {
  const { pode } = useSessao()
  const nav = useNavigate()
  const [f, setF] = useState<Filtros>(INICIAL)
  const [mais, setMais] = useState(false)
  const [visao, setVisao] = useState(preferenciaVisao)
  useEffect(() => {
    try {
      localStorage.setItem('imoveis.visao', visao)
    } catch {
      /* indisponível */
    }
  }, [visao])
  const mudar = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p, pagina: p.pagina ?? 1 }))

  const { data: localidades } = useQuery({ queryKey: ['localidades'], queryFn: () => rpc('imoveis.localidades') })
  const { data: caracs } = useQuery({ queryKey: ['caracteristicas'], queryFn: () => rpc('imoveis.caracteristicas') })
  const entrada: ListarImoveisInput = {
    busca: f.busca || undefined,
    modalidade: (f.modalidade || undefined) as never,
    situacao: (f.situacao || undefined) as never,
    tipo: (f.tipo || undefined) as never,
    finalidade: (f.finalidade || undefined) as never,
    cidade: f.cidade || undefined,
    bairro: f.bairro || undefined,
    precoMin: f.precoMin || undefined,
    precoMax: f.precoMax || undefined,
    dormitoriosMin: f.dormitoriosMin ? Number(f.dormitoriosMin) : undefined,
    vagasMin: f.vagasMin ? Number(f.vagasMin) : undefined,
    caracteristicas: f.caracteristicas.length ? f.caracteristicas : undefined,
    ordenar: f.ordenar,
    pagina: f.pagina,
    porPagina: 30
  }
  const { data, isLoading, error } = useQuery({ queryKey: ['imoveis', entrada], queryFn: () => rpc('imoveis.listar', entrada), placeholderData: keepPreviousData })
  const cidadeSel = localidades?.find((l) => `${l.cidade}` === f.cidade)
  const filtrosAvancados = [f.precoMin, f.precoMax, f.dormitoriosMin, f.vagasMin, f.finalidade].filter(Boolean).length + f.caracteristicas.length

  return (
    <>
      <CabecalhoPagina
        titulo="Imóveis"
        subtitulo="Carteira de imóveis com disponibilidade independente para venda e locação."
        acoes={
          pode('imoveis.criar') &&
          pode('imoveis.dados_internos.ver') && (
            <Link to="/imoveis/novo">
              <Botao variante="primario" icone={<Plus className="size-4" />}>
                Novo imóvel
              </Botao>
            </Link>
          )
        }
      />
      <Cartao semPadding>
        <div className="space-y-3 border-b border-borda p-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-3 size-4 text-texto-3" />
              <Entrada className="pl-9" placeholder="Código, endereço, bairro, cidade ou descrição" value={f.busca} onChange={(e) => mudar({ busca: e.target.value })} />
            </div>
            <Botao variante={mais ? 'primario' : 'secundario'} icone={<SlidersHorizontal className="size-4" />} onClick={() => setMais((m) => !m)}>
              Mais filtros{filtrosAvancados ? ` (${filtrosAvancados})` : ''}
            </Botao>
          </div>
          <div className="grid grid-cols-5 gap-3">
            <Selecao aria-label="Modalidade" opcoes={MODALIDADES} vazio="Venda e locação" value={f.modalidade} onChange={(e) => mudar({ modalidade: e.target.value })} />
            <Selecao aria-label="Situação" opcoes={SITUACOES_OFERTA} vazio="Todas as situações" value={f.situacao} onChange={(e) => mudar({ situacao: e.target.value })} />
            <Selecao aria-label="Tipo" opcoes={TIPOS_IMOVEL} vazio="Todos os tipos" value={f.tipo} onChange={(e) => mudar({ tipo: e.target.value })} />
            <Selecao aria-label="Cidade" opcoes={(localidades ?? []).map((l) => [l.cidade, `${l.cidade}/${l.uf}`] as [string, string])} vazio="Todas as cidades" value={f.cidade} onChange={(e) => mudar({ cidade: e.target.value, bairro: '' })} />
            <Selecao aria-label="Bairro" opcoes={(cidadeSel?.bairros ?? []).map((b) => [b, b] as [string, string])} vazio="Todos os bairros" disabled={!cidadeSel} value={f.bairro} onChange={(e) => mudar({ bairro: e.target.value })} />
          </div>
          {mais && (
            <div className="grid grid-cols-6 gap-3 rounded-md bg-superficie-2 p-3">
              <div>
                <div className="mb-1 text-xs text-texto-2">Preço mínimo</div>
                <CampoMoeda value={f.precoMin} onChange={(e) => mudar({ precoMin: e.target.value })} />
              </div>
              <div>
                <div className="mb-1 text-xs text-texto-2">Preço máximo</div>
                <CampoMoeda value={f.precoMax} onChange={(e) => mudar({ precoMax: e.target.value })} />
              </div>
              <div>
                <div className="mb-1 text-xs text-texto-2">Dormitórios (mín.)</div>
                <Selecao opcoes={[1, 2, 3, 4, 5].map((n) => [String(n), `${n}+`] as [string, string])} vazio="Qualquer" value={f.dormitoriosMin} onChange={(e) => mudar({ dormitoriosMin: e.target.value })} />
              </div>
              <div>
                <div className="mb-1 text-xs text-texto-2">Vagas (mín.)</div>
                <Selecao opcoes={[1, 2, 3, 4].map((n) => [String(n), `${n}+`] as [string, string])} vazio="Qualquer" value={f.vagasMin} onChange={(e) => mudar({ vagasMin: e.target.value })} />
              </div>
              <div>
                <div className="mb-1 text-xs text-texto-2">Finalidade</div>
                <Selecao opcoes={FINALIDADES_IMOVEL} vazio="Todas" value={f.finalidade} onChange={(e) => mudar({ finalidade: e.target.value })} />
              </div>
              <div className="flex items-end">
                <Botao variante="fantasma" icone={<X className="size-4" />} onClick={() => setF(INICIAL)}>
                  Limpar filtros
                </Botao>
              </div>
              <div className="col-span-6">
                <div className="mb-1 text-xs text-texto-2">Características (todas as marcadas)</div>
                <div className="grid grid-cols-5 gap-x-4 gap-y-1">
                  {caracs?.map((c) => (
                    <Caixa
                      key={c.id}
                      rotulo={<span className="text-xs">{c.nome}</span>}
                      checked={f.caracteristicas.includes(c.id)}
                      onChange={(e) => mudar({ caracteristicas: e.target.checked ? [...f.caracteristicas, c.id] : f.caracteristicas.filter((x) => x !== c.id) })}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-texto-2">
            <span className="numeros">{data ? `${data.total} imóvel(is) encontrado(s)` : ' '}</span>
            <div className="flex items-center gap-2">
              <span>Ordenar por</span>
              <Selecao
                className="h-8 w-44 text-xs"
                opcoes={{ codigo: 'Código', recentes: 'Mais recentes', valor_asc: 'Menor valor', valor_desc: 'Maior valor' }}
                value={f.ordenar}
                onChange={(e) => mudar({ ordenar: e.target.value as Filtros['ordenar'] })}
              />
              <div className="flex overflow-hidden rounded-md border border-borda">
                <button type="button" title="Tabela" className={cx('p-1.5', visao === 'tabela' ? 'bg-marca text-marca-texto' : 'text-texto-2')} onClick={() => setVisao('tabela')}>
                  <List className="size-4" />
                </button>
                <button type="button" title="Cards" className={cx('p-1.5', visao === 'cards' ? 'bg-marca text-marca-texto' : 'text-texto-2')} onClick={() => setVisao('cards')}>
                  <LayoutGrid className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
        {error && <div className="p-4 text-sm text-perigo">{(error as Error).message}</div>}
        {visao === 'tabela' ? (
          <Tabela colunas={['', { t: 'Cód.', cls: 'w-14' }, 'Imóvel', 'Localização', 'Venda', 'Locação', 'Corretor']} vazio={data?.itens.length === 0} carregando={isLoading}>
            {data?.itens.map((i) => (
              <tr key={i.id} className="cursor-pointer" onClick={() => nav(`/imoveis/${i.id}`)}>
                <td className="w-16 !py-1.5">
                  <Miniatura src={i.capa} className="h-10 w-14" />
                </td>
                <td className="numeros text-texto-2">{i.codigo}</td>
                <td>
                  <div className="font-medium">{rotuloTipo(i.tipo)}</div>
                  <div className="text-xs text-texto-2">{resumoNumeros(i)}</div>
                </td>
                <td>
                  <div>{i.endereco}</div>
                  <div className="text-xs text-texto-2">
                    {i.bairro} · {i.cidade}/{i.uf}
                  </div>
                </td>
                <td>
                  <Oferta o={i.venda} />
                </td>
                <td>
                  <Oferta o={i.locacao} mensal />
                </td>
                <td className="text-texto-2">{i.corretor ?? '—'}</td>
              </tr>
            ))}
          </Tabela>
        ) : (
          <div className="grid grid-cols-3 gap-4 p-4">
            {data?.itens.map((i) => (
              <button key={i.id} type="button" onClick={() => nav(`/imoveis/${i.id}`)} className="overflow-hidden rounded-lg border border-borda bg-superficie text-left transition hover:shadow-md">
                <Miniatura src={i.capa} className="h-44 w-full rounded-none" />
                <div className="space-y-2 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{rotuloTipo(i.tipo)}</span>
                    <span className="numeros text-xs text-texto-3">#{i.codigo}</span>
                  </div>
                  <div className="text-xs text-texto-2">
                    {i.bairro} · {i.cidade}/{i.uf}
                  </div>
                  <div className="flex gap-3 text-xs text-texto-2 [&_svg]:size-3.5">
                    {i.dormitorios > 0 && (
                      <span className="flex items-center gap-1">
                        <BedDouble /> {i.dormitorios}
                      </span>
                    )}
                    {i.vagas > 0 && (
                      <span className="flex items-center gap-1">
                        <Car /> {i.vagas}
                      </span>
                    )}
                    {(i.areaConstruida ?? i.areaTerreno) && (
                      <span className="flex items-center gap-1">
                        <Ruler /> {formatarArea(i.areaConstruida ?? i.areaTerreno)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 border-t border-borda pt-2">
                    <Oferta o={i.venda} rotulo="Venda" />
                    <Oferta o={i.locacao} rotulo="Locação" mensal />
                  </div>
                </div>
              </button>
            ))}
            {data?.itens.length === 0 && <div className="col-span-3 p-10 text-center text-sm text-texto-3">Nenhum imóvel encontrado.</div>}
          </div>
        )}
        {data && <Paginacao pagina={data.pagina} porPagina={data.porPagina} total={data.total} aoMudar={(p) => mudar({ pagina: p })} />}
      </Cartao>
    </>
  )
}

function resumoNumeros(i: ImovelResumo): string {
  return [i.dormitorios ? `${i.dormitorios} dorm.` : '', i.suites ? `${i.suites} suíte(s)` : '', i.vagas ? `${i.vagas} vaga(s)` : '', i.areaConstruida ? formatarArea(i.areaConstruida) : i.areaTerreno ? formatarArea(i.areaTerreno) : '']
    .filter(Boolean)
    .join(' · ')
}

function Oferta({ o, mensal, rotulo }: { o: ImovelResumo['venda']; mensal?: boolean; rotulo?: string }) {
  if (!o) return <span className="text-xs text-texto-3">{rotulo ? `${rotulo}: —` : '—'}</span>
  return (
    <div>
      {rotulo && <div className="text-[10px] tracking-wide text-texto-3 uppercase">{rotulo}</div>}
      <div className={cx('numeros font-medium', o.situacao === 'INATIVO' && 'text-texto-3 line-through')}>
        {formatarMoeda(o.valorCentavos)}
        {mensal && <span className="text-xs font-normal text-texto-2">/mês</span>}
      </div>
      <SeloSituacao situacao={o.situacao} />
    </div>
  )
}

export function Miniatura({ src, className }: { src: string | null; className?: string }) {
  if (src) return <img src={src} alt="" className={cx('rounded object-cover', className)} draggable={false} />
  return (
    <div className={cx('flex items-center justify-center rounded bg-superficie-2 text-texto-3', className)}>
      <Building2 className="size-5" />
    </div>
  )
}
