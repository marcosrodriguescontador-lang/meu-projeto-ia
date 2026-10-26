import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, Paperclip, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { EntidadeAnexo } from '@shared/api'
import type { AnexoDto } from '@shared/dto'
import type { Permissao } from '@shared/permissoes'
import { useSessao } from '@/app/sessao'
import { Botao, Cartao, Confirmacao, Selecao, Tabela, useToast } from '@/components/ui'
import { dataHora, tamanhoArquivo } from '@/lib/formato'
import { rpc } from '@/lib/rpc'

const CONFIG: Record<EntidadeAnexo, { categorias: string[]; gerenciar: Permissao }> = {
  pessoa: {
    categorias: ['Documento de identificação', 'Comprovante de endereço', 'Comprovante de renda', 'Contrato social', 'Certidão', 'Procuração', 'Outros'],
    gerenciar: 'pessoas.documentos.gerenciar'
  },
  imovel: {
    categorias: ['Matrícula', 'Escritura', 'Carnê de IPTU', 'Planta', 'Habite-se', 'Laudo / vistoria', 'Autorização de venda/locação', 'Certidão', 'Outros'],
    gerenciar: 'imoveis.documentos.gerenciar'
  },
  contrato: {
    categorias: ['Contrato assinado', 'Laudo de vistoria', 'Apólice de seguro', 'Documentos do fiador', 'Aditivo', 'Distrato / termo de entrega', 'Comprovante', 'Outros'],
    gerenciar: 'locacoes.gerenciar'
  }
}

export function Documentos({ entidade, entidadeId }: { entidade: EntidadeAnexo; entidadeId: number }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const { categorias, gerenciar } = CONFIG[entidade]
  const [categoria, setCategoria] = useState(categorias[0]!)
  const [enviando, setEnviando] = useState(false)
  const [remover, setRemover] = useState<AnexoDto | null>(null)
  const chave = ['anexos', entidade, entidadeId]
  const { data, isLoading } = useQuery({ queryKey: chave, queryFn: () => rpc('anexos.listar', { entidade, entidadeId }) })
  const acao = async (f: () => Promise<unknown>) => {
    try {
      await f()
    } catch (e) {
      toast.erro(e)
    }
  }
  return (
    <Cartao
      titulo="Documentos anexados"
      semPadding
      acoes={
        pode(gerenciar) && (
          <>
            <Selecao className="h-8 w-56 text-xs" opcoes={categorias.map((c) => [c, c] as [string, string])} value={categoria} onChange={(e) => setCategoria(e.target.value)} />
            <Botao
              tamanho="sm"
              variante="primario"
              icone={<Paperclip className="size-3.5" />}
              carregando={enviando}
              onClick={() =>
                acao(async () => {
                  setEnviando(true)
                  try {
                    qc.setQueryData(chave, await rpc('anexos.adicionar', { entidade, entidadeId, categoria }))
                  } finally {
                    setEnviando(false)
                  }
                })
              }
            >
              Anexar…
            </Botao>
          </>
        )
      }
    >
      <Tabela colunas={['Arquivo', 'Categoria', 'Tamanho', 'Anexado em', '']} vazio={data?.length === 0} carregando={isLoading}>
        {data?.map((a) => (
          <tr key={a.id}>
            <td className="font-medium">{a.nomeOriginal}</td>
            <td className="text-texto-2">{a.categoria}</td>
            <td className="numeros text-texto-2">{tamanhoArquivo(a.tamanho)}</td>
            <td className="numeros text-texto-2">{dataHora(a.criadoEm)}</td>
            <td className="text-right whitespace-nowrap">
              <Botao tamanho="sm" variante="fantasma" icone={<ExternalLink className="size-3.5" />} onClick={() => acao(() => rpc('anexos.abrir', { id: a.id }))}>
                Abrir
              </Botao>
              <Botao tamanho="sm" variante="fantasma" icone={<Download className="size-3.5" />} title="Salvar cópia" onClick={() => acao(async () => (await rpc('anexos.salvarComo', { id: a.id })) && toast.sucesso('Arquivo salvo.'))} />
              {pode(gerenciar) && <Botao tamanho="sm" variante="fantasma" icone={<Trash2 className="size-3.5" />} title="Remover" onClick={() => setRemover(a)} />}
            </td>
          </tr>
        ))}
      </Tabela>
      <div className="border-t border-borda px-5 py-3 text-xs text-texto-3">Arquivos cifrados em disco (AES-256). Permitidos: PDF, imagens, DOCX, XLSX, ODT, TXT — até 50 MB.</div>
      <Confirmacao
        aberto={!!remover}
        titulo="Remover documento"
        perigo
        exigirMotivo
        textoConfirmar="Remover"
        mensagem={`Remover "${remover?.nomeOriginal}"? O arquivo é preservado para auditoria e recuperação.`}
        aoFechar={() => setRemover(null)}
        aoConfirmar={async (motivo) => {
          await rpc('anexos.remover', { id: remover!.id, motivo })
          await qc.invalidateQueries({ queryKey: chave })
        }}
      />
    </Cartao>
  )
}
