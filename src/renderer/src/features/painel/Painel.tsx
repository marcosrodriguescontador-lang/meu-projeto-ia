import { useQuery } from '@tanstack/react-query'
import { HardDriveDownload, UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PAPEIS, type Papel } from '@shared/schemas'
import { useSessao } from '@/app/sessao'
import { Aviso, Botao, CabecalhoPagina, Cartao, Indicador } from '@/components/ui'
import { dataHora } from '@/lib/formato'
import { rpc } from '@/lib/rpc'

export function Painel() {
  const { sessao, pode } = useSessao()
  const { data } = useQuery({ queryKey: ['painel'], queryFn: () => rpc('painel.indicadores') })
  const papeis = Object.entries(PAPEIS) as [Papel, string][]
  return (
    <>
      <CabecalhoPagina
        titulo={`Olá, ${sessao?.usuario.nome.split(' ')[0]}`}
        subtitulo="Indicadores calculados a partir dos registros do sistema."
        acoes={
          <>
            {pode('pessoas.criar') && (
              <Link to="/pessoas/nova">
                <Botao variante="primario" icone={<UserPlus className="size-4" />}>
                  Nova pessoa
                </Botao>
              </Link>
            )}
            {pode('backup.executar') && (
              <Link to="/backup">
                <Botao icone={<HardDriveDownload className="size-4" />}>Backup</Botao>
              </Link>
            )}
          </>
        }
      />
      {data?.backupAtrasado && pode('backup.executar') && (
        <div className="mb-4">
          <Aviso tom="alerta" titulo="Backup pendente">
            {data.ultimoBackup ? `Último backup em ${dataHora(data.ultimoBackup.ts)}.` : 'Nenhum backup foi realizado ainda.'} Recomenda-se gerar uma cópia agora.
          </Aviso>
        </div>
      )}
      <div className="grid grid-cols-4 gap-4">
        <Indicador rotulo="Pessoas cadastradas" valor={data?.totalPessoas ?? '—'} icone={<Users className="size-4" />} />
        <Indicador rotulo="Proprietários" valor={data?.pessoasPorPapel.PROPRIETARIO ?? 0} />
        <Indicador rotulo="Locatários" valor={data?.pessoasPorPapel.LOCATARIO ?? 0} />
        <Indicador
          rotulo="Último backup"
          valor={data?.ultimoBackup ? dataHora(data.ultimoBackup.ts) : 'Nunca'}
          tom={data?.backupAtrasado ? 'alerta' : 'destaque'}
          detalhe={data?.backupAtrasado ? 'Atrasado' : 'Em dia'}
        />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-4">
        <Cartao titulo="Pessoas por papel" className="col-span-2">
          <div className="space-y-2">
            {papeis.map(([k, rotulo]) => {
              const n = data?.pessoasPorPapel[k] ?? 0
              const max = Math.max(1, ...Object.values(data?.pessoasPorPapel ?? {}))
              return (
                <div key={k} className="flex items-center gap-3 text-sm">
                  <div className="w-40 text-texto-2">{rotulo}</div>
                  <div className="h-2 flex-1 rounded bg-superficie-2">
                    <div className="h-2 rounded bg-marca" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <div className="numeros w-10 text-right font-medium">{n}</div>
                </div>
              )
            })}
          </div>
        </Cartao>
        <Cartao titulo="Próximas etapas">
          <ul className="space-y-2 text-sm text-texto-2">
            <li>Indicadores de imóveis — Fase 2</li>
            <li>Contratos, aluguéis e repasses — Fase 3</li>
            <li>Saldo, receitas e resultado — Fase 4</li>
            <li>Comissões e funil — Fase 5</li>
          </ul>
          <div className="mt-3 text-xs text-texto-3">Cada indicador aparece aqui quando o módulo correspondente tiver dados reais.</div>
        </Cartao>
      </div>
    </>
  )
}
