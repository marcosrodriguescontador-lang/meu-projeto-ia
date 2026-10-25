import { useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, HardDriveDownload, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import type { ResumoBackup } from '@shared/dto'
import { useSessao } from '@/app/sessao'
import { ResumoBackupView } from '@/features/inicial/ConfiguracaoInicial'
import { Aviso, Botao, CabecalhoPagina, Cartao, Confirmacao, Dialogo, Entrada, Selo, Tabela, useToast } from '@/components/ui'
import { dataHora, tamanhoArquivo } from '@/lib/formato'
import { rpc } from '@/lib/rpc'

const TIPOS = { MANUAL: 'Manual', AUTOMATICO: 'Automático', PRE_RESTAURACAO: 'Pré-restauração' }

export function Backup() {
  const { pode } = useSessao()
  const toast = useToast()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['backups'], queryFn: () => rpc('backup.listar') })
  const { data: config } = useQuery({ queryKey: ['config'], queryFn: () => rpc('config.obter') })
  const [destino, setDestino] = useState<string | null>(null)
  const [executando, setExecutando] = useState(false)
  const [restaurar, setRestaurar] = useState(false)

  const executar = async () => {
    setExecutando(true)
    try {
      const r = await rpc('backup.executar', { destino })
      toast.sucesso(`Backup gerado e validado: ${r.arquivo}`)
      void qc.invalidateQueries({ queryKey: ['backups'] })
      void qc.invalidateQueries({ queryKey: ['painel'] })
    } catch (e) {
      toast.erro(e)
      void qc.invalidateQueries({ queryKey: ['backups'] })
    } finally {
      setExecutando(false)
    }
  }

  return (
    <>
      <CabecalhoPagina
        titulo="Backup e restauração"
        subtitulo="Cópias cifradas contendo banco de dados, documentos anexados e configurações."
        acoes={
          pode('backup.restaurar') && (
            <Botao icone={<RotateCcw className="size-4" />} onClick={() => setRestaurar(true)}>
              Restaurar backup…
            </Botao>
          )
        }
      />
      <div className="mb-6 grid grid-cols-3 gap-4">
        <Cartao titulo="Gerar backup agora" className="col-span-2">
          <div className="space-y-3">
            <div className="flex gap-2">
              <Entrada readOnly value={destino ?? config?.backup.destino ?? `${config?.caminhoDados ?? ''}/backups (padrão)`} />
              <Botao icone={<FolderOpen className="size-4" />} onClick={async () => setDestino((await rpc('backup.escolherDestino')) ?? destino)}>
                Destino…
              </Botao>
            </div>
            <p className="text-xs text-texto-3">Recomendado: salve também em unidade externa (pendrive/HD) ou pasta de rede, e guarde fora do escritório periodicamente.</p>
            <Botao variante="primario" icone={<HardDriveDownload className="size-4" />} carregando={executando} onClick={executar}>
              Gerar backup
            </Botao>
          </div>
        </Cartao>
        <Cartao titulo="Backup automático">
          {config && (
            <div className="space-y-1 text-sm">
              <div>
                Situação: <strong>{config.backup.automatico ? 'Ativado' : 'Desativado'}</strong>
              </div>
              <div className="text-texto-2">A cada {config.backup.intervaloHoras} h · mantém {config.backup.reterQuantidade} cópias</div>
              <div className="text-xs text-texto-3">Altere em Configurações.</div>
            </div>
          )}
        </Cartao>
      </div>
      <Cartao titulo="Histórico de cópias" semPadding>
        <Tabela colunas={['Data', 'Tipo', 'Arquivo', 'Tamanho', 'Resultado']} vazio={data?.length === 0} carregando={isLoading}>
          {data?.map((b) => (
            <tr key={b.id}>
              <td className="numeros whitespace-nowrap">{dataHora(b.ts)}</td>
              <td>{TIPOS[b.tipo]}</td>
              <td className="max-w-md truncate text-xs text-texto-2" title={b.arquivo}>
                {b.arquivo}
              </td>
              <td className="numeros text-texto-2">{b.tamanho ? tamanhoArquivo(b.tamanho) : '—'}</td>
              <td>
                {b.resultado === 'SUCESSO' ? (
                  <Selo tom="destaque">Validado</Selo>
                ) : b.resultado === 'RESTAURADO' ? (
                  <Selo tom="escuro">Restaurado</Selo>
                ) : (
                  <span title={b.mensagem ?? ''}>
                    <Selo tom="perigo">Falhou</Selo>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </Tabela>
      </Cartao>
      {restaurar && <DialogoRestaurar aoFechar={() => setRestaurar(false)} />}
    </>
  )
}

function DialogoRestaurar({ aoFechar }: { aoFechar: () => void }) {
  const [arquivo, setArquivo] = useState<string | null>(null)
  const [senha, setSenha] = useState('')
  const [resumo, setResumo] = useState<ResumoBackup | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  return (
    <Dialogo
      aberto
      titulo="Restauração assistida"
      aoFechar={aoFechar}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          {!resumo ? (
            <Botao
              variante="primario"
              disabled={!arquivo || !senha}
              carregando={carregando}
              onClick={async () => {
                setFalha(null)
                setCarregando(true)
                try {
                  setResumo(await rpc('backup.inspecionar', { arquivo: arquivo!, senha }))
                } catch (e) {
                  setFalha(e instanceof Error ? e.message : String(e))
                } finally {
                  setCarregando(false)
                }
              }}
            >
              1. Validar
            </Botao>
          ) : (
            <Botao variante="perigo" onClick={() => setConfirmar(true)}>
              2. Restaurar
            </Botao>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Aviso tom="alerta">
          Os dados atuais serão substituídos pelo conteúdo do backup. Antes disso, o sistema gera automaticamente uma cópia de segurança do estado atual. O aplicativo será reiniciado.
        </Aviso>
        <div className="flex gap-2">
          <Entrada readOnly value={arquivo ?? ''} placeholder="Selecione o arquivo .sbak" />
          <Botao
            onClick={async () => {
              const a = await rpc('backup.escolherArquivo')
              if (a) {
                setArquivo(a)
                setResumo(null)
              }
            }}
          >
            Selecionar…
          </Botao>
        </div>
        <Entrada type="password" placeholder="Senha de backup" value={senha} onChange={(e) => (setSenha(e.target.value), setResumo(null))} />
        {resumo && <ResumoBackupView r={resumo} />}
        {falha && <Aviso tom="perigo">{falha}</Aviso>}
      </div>
      <Confirmacao
        aberto={confirmar}
        titulo="Confirmar restauração"
        perigo
        palavraChave="RESTAURAR"
        textoConfirmar="Restaurar e reiniciar"
        mensagem={`Restaurar o backup de ${dataHora(resumo?.criadoEm)}? Esta operação substitui todos os dados atuais.`}
        aoFechar={() => setConfirmar(false)}
        aoConfirmar={async () => {
          await rpc('backup.restaurar', { arquivo: arquivo!, senha, confirmacao: 'RESTAURAR' })
        }}
      />
    </Dialogo>
  )
}
