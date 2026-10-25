import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, Paperclip, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { AnexoDto } from '@shared/dto'
import { useSessao } from '@/app/sessao'
import { Botao, Cartao, Confirmacao, Selecao, Tabela, useToast } from '@/components/ui'
import { dataHora, tamanhoArquivo } from '@/lib/formato'
import { rpc } from '@/lib/rpc'

const CATEGORIAS = ['Documento de identificação', 'Comprovante de endereço', 'Comprovante de renda', 'Contrato social', 'Certidão', 'Procuração', 'Outros']

export function Documentos({ pessoaId }: { pessoaId: number }) {
  const { pode } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const [categoria, setCategoria] = useState(CATEGORIAS[0]!)
  const [enviando, setEnviando] = useState(false)
  const [remover, setRemover] = useState<AnexoDto | null>(null)
  const chave = ['anexos', pessoaId]
  const { data, isLoading } = useQuery({ queryKey: chave, queryFn: () => rpc('anexos.listar', { entidade: 'pessoa', entidadeId: pessoaId }) })
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
        pode('pessoas.documentos.gerenciar') && (
          <>
            <Selecao className="h-8 w-56 text-xs" opcoes={CATEGORIAS.map((c) => [c, c] as [string, string])} value={categoria} onChange={(e) => setCategoria(e.target.value)} />
            <Botao
              tamanho="sm"
              variante="primario"
              icone={<Paperclip className="size-3.5" />}
              carregando={enviando}
              onClick={() =>
                acao(async () => {
                  setEnviando(true)
                  try {
                    qc.setQueryData(chave, await rpc('anexos.adicionar', { entidade: 'pessoa', entidadeId: pessoaId, categoria }))
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
              <Botao tamanho="sm" variante="fantasma" icone={<Download className="size-3.5" />} onClick={() => acao(async () => (await rpc('anexos.salvarComo', { id: a.id })) && toast.sucesso('Arquivo salvo.'))} />
              {pode('pessoas.documentos.gerenciar') && <Botao tamanho="sm" variante="fantasma" icone={<Trash2 className="size-3.5" />} onClick={() => setRemover(a)} />}
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
