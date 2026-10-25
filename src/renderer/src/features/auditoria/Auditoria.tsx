import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Aviso, Botao, CabecalhoPagina, Cartao, Entrada, Paginacao, Selecao, Tabela, useToast } from '@/components/ui'
import { dataHora } from '@/lib/formato'
import { rpc } from '@/lib/rpc'
import { DiferencaAuditoria, rotuloAcao } from './rotulos'

const ENTIDADES = { pessoa: 'Pessoas', usuario: 'Usuários', perfil: 'Perfis', configuracao: 'Configurações', backup: 'Backup', sistema: 'Sistema' }

export function Auditoria() {
  const toast = useToast()
  const [f, setF] = useState({ entidade: '', busca: '', de: '', ate: '', pagina: 1 })
  const [verificacao, setVerificacao] = useState<{ integra: boolean; total: number; primeiroInvalido: number | null } | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['auditoria', f],
    queryFn: () => rpc('auditoria.listar', { entidade: f.entidade || undefined, busca: f.busca || undefined, de: f.de || undefined, ate: f.ate || undefined, pagina: f.pagina, porPagina: 50 }),
    placeholderData: keepPreviousData
  })
  const mudar = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p, pagina: p.pagina ?? 1 }))
  return (
    <>
      <CabecalhoPagina
        titulo="Auditoria"
        subtitulo="Registro imutável das operações. Senhas nunca são registradas; dados bancários aparecem mascarados."
        acoes={
          <Botao
            icone={<ShieldCheck className="size-4" />}
            onClick={async () => {
              try {
                setVerificacao(await rpc('auditoria.verificar'))
              } catch (e) {
                toast.erro(e)
              }
            }}
          >
            Verificar integridade
          </Botao>
        }
      />
      {verificacao && (
        <div className="mb-4">
          {verificacao.integra ? (
            <Aviso tom="sucesso">Cadeia íntegra: {verificacao.total} registros conferidos, nenhuma adulteração detectada.</Aviso>
          ) : (
            <Aviso tom="perigo" titulo="Adulteração detectada">
              A cadeia de auditoria está quebrada a partir do registro #{verificacao.primeiroInvalido}. Preserve este computador e acione o responsável técnico.
            </Aviso>
          )}
        </div>
      )}
      <Cartao semPadding>
        <div className="flex gap-3 border-b border-borda p-4">
          <Entrada className="flex-1" placeholder="Buscar ação ou descrição" value={f.busca} onChange={(e) => mudar({ busca: e.target.value })} />
          <Selecao className="w-44" opcoes={ENTIDADES} vazio="Todas as áreas" value={f.entidade} onChange={(e) => mudar({ entidade: e.target.value })} />
          <Entrada className="w-40" type="date" value={f.de} onChange={(e) => mudar({ de: e.target.value })} title="De" />
          <Entrada className="w-40" type="date" value={f.ate} onChange={(e) => mudar({ ate: e.target.value })} title="Até" />
        </div>
        <Tabela colunas={['#', 'Data', 'Usuário', 'Operação', 'Área', 'Detalhes', 'Estação']} vazio={data?.itens.length === 0} carregando={isLoading}>
          {data?.itens.map((r) => (
            <tr key={r.id} className="align-top">
              <td className="numeros text-texto-3">{r.id}</td>
              <td className="numeros whitespace-nowrap text-texto-2">{dataHora(r.ts)}</td>
              <td>{r.usuarioLogin}</td>
              <td className="whitespace-nowrap font-medium">{rotuloAcao(r.acao)}</td>
              <td className="text-texto-2">
                {ENTIDADES[r.entidade as keyof typeof ENTIDADES] ?? r.entidade}
                {r.entidadeId && <span className="text-texto-3"> #{r.entidadeId}</span>}
              </td>
              <td className="max-w-md text-texto-2">
                {r.descricao}
                <DiferencaAuditoria antes={r.antes} depois={r.depois} />
              </td>
              <td className="text-xs text-texto-3">{r.estacao}</td>
            </tr>
          ))}
        </Tabela>
        {data && <Paginacao pagina={data.pagina} porPagina={data.porPagina} total={data.total} aoMudar={(p) => mudar({ pagina: p })} />}
      </Cartao>
    </>
  )
}
