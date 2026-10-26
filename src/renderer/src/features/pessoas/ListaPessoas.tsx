import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Search, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PAPEIS, SITUACOES_PESSOA, type Papel } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { Botao, CabecalhoPagina, Cartao, Entrada, Paginacao, Selecao, Selo, Tabela } from '@/components/ui'
import { formatarDocumento, telefone } from '@/lib/formato'
import { rpc } from '@/lib/rpc'

export function ListaPessoas() {
  const { pode } = useSessao()
  const nav = useNavigate()
  const [busca, setBusca] = useState('')
  const [papel, setPapel] = useState<Papel | ''>('')
  const [situacao, setSituacao] = useState('')
  const [pagina, setPagina] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['pessoas', busca, papel, situacao, pagina],
    queryFn: () => rpc('pessoas.listar', { busca: busca || undefined, papel: papel || undefined, situacao: (situacao || undefined) as never, pagina, porPagina: 50 }),
    placeholderData: keepPreviousData
  })
  return (
    <>
      <CabecalhoPagina
        titulo="Pessoas"
        subtitulo="Cadastro único de pessoas físicas e jurídicas. Uma pessoa pode ter vários papéis."
        acoes={
          pode('pessoas.criar') && (
            <Link to="/pessoas/nova">
              <Botao variante="primario" icone={<UserPlus className="size-4" />}>
                Nova pessoa
              </Botao>
            </Link>
          )
        }
      />
      <Cartao semPadding>
        <div className="flex gap-3 border-b border-borda p-4">
          <div className="relative flex-1">
            <Search className="absolute top-2.5 left-3 size-4 text-texto-3" />
            <Entrada
              className="pl-9"
              placeholder="Buscar por nome, CPF/CNPJ ou código"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
            />
          </div>
          <Selecao className="w-52" opcoes={PAPEIS} vazio="Todos os papéis" value={papel} onChange={(e) => (setPapel(e.target.value as Papel), setPagina(1))} />
          <Selecao className="w-40" opcoes={SITUACOES_PESSOA} vazio="Todas as situações" value={situacao} onChange={(e) => (setSituacao(e.target.value), setPagina(1))} />
        </div>
        <Tabela colunas={[{ t: 'Cód.', cls: 'w-16' }, 'Nome', 'CPF/CNPJ', 'Papéis', 'Contato', 'Cidade', 'Situação']} vazio={data?.itens.length === 0} carregando={isLoading}>
          {data?.itens.map((p) => (
            <tr key={p.id} className="cursor-pointer" onClick={() => nav(`/pessoas/${p.id}`)}>
              <td className="numeros text-texto-2">{p.codigo}</td>
              <td>
                <div className="font-medium">{p.nome}</div>
                {p.nomeFantasia && <div className="text-xs text-texto-2">{p.nomeFantasia}</div>}
              </td>
              <td className="numeros whitespace-nowrap">{formatarDocumento(p.documento)}</td>
              <td>
                <div className="flex flex-wrap gap-1">
                  {p.papeis.map((x) => (
                    <Selo key={x}>{PAPEIS[x]}</Selo>
                  ))}
                </div>
              </td>
              <td className="whitespace-nowrap text-texto-2">{p.contatoPrincipal ? (p.contatoPrincipal.includes('@') ? p.contatoPrincipal : telefone(p.contatoPrincipal)) : '—'}</td>
              <td className="text-texto-2">{p.cidadeUf ?? '—'}</td>
              <td>
                <Selo tom={p.situacao === 'ATIVO' ? 'destaque' : p.situacao === 'BLOQUEADO' ? 'perigo' : 'neutro'}>{SITUACOES_PESSOA[p.situacao as keyof typeof SITUACOES_PESSOA]}</Selo>
              </td>
            </tr>
          ))}
        </Tabela>
        {data && <Paginacao pagina={data.pagina} porPagina={data.porPagina} total={data.total} aoMudar={setPagina} />}
      </Cartao>
    </>
  )
}
