import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarClock, Home, ListTodo } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { adicionarDias, hojeIso } from '@shared/financeiro/datas'
import { SITUACOES_VISITA } from '@shared/schemas-crm'
import { useSessao } from '@/app/sessao'
import { Botao, CabecalhoPagina, Caixa, Cartao, cx, Selecao, Selo } from '@/components/ui'
import { rpc } from '@/lib/rpc'
import { DialogoConcluir } from './comum'

const PERIODOS = { HOJE: 'Hoje', '7': 'Próximos 7 dias', '30': 'Próximos 30 dias' } as const

/** Tarefas e visitas do corretor (atrasadas aparecem sempre). */
export function Agenda() {
  const { pode } = useSessao()
  const [periodo, setPeriodo] = useState<keyof typeof PERIODOS>('7')
  const [concluidas, setConcluidas] = useState(false)
  const [usuario, setUsuario] = useState('')
  const [concluir, setConcluir] = useState<{ id: number; titulo: string } | null>(null)
  const hoje = hojeIso()
  const ate = periodo === 'HOJE' ? hoje : adicionarDias(hoje, Number(periodo))
  const { data: usuarios } = useQuery({ queryKey: ['usuarios'], queryFn: () => rpc('usuarios.listar'), enabled: pode('crm.carteira_toda') && pode('usuarios.ver') })
  const entrada = { de: hoje, ate, incluirConcluidas: concluidas, responsavelId: usuario ? Number(usuario) : undefined }
  const { data, isFetching } = useQuery({ queryKey: ['agenda', entrada], queryFn: () => rpc('agenda.listar', entrada), placeholderData: keepPreviousData })
  const dias = new Map<string, NonNullable<typeof data>>()
  for (const i of data ?? []) {
    const d = i.atrasada ? 'atrasadas' : i.quando.slice(0, 10)
    dias.set(d, [...(dias.get(d) ?? []), i])
  }
  const rotuloDia = (d: string) => (d === 'atrasadas' ? 'Atrasadas' : d === hoje ? 'Hoje' : d === adicionarDias(hoje, 1) ? 'Amanhã' : new Date(`${d}T12:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }))
  return (
    <>
      <CabecalhoPagina titulo="Agenda" subtitulo="Tarefas, retornos e visitas. Itens atrasados ficam no topo até serem concluídos." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Selecao aria-label="Período" className="w-48" opcoes={PERIODOS} value={periodo} onChange={(e) => setPeriodo(e.target.value as '7')} />
        {usuarios && <Selecao aria-label="Responsável" className="w-56" opcoes={usuarios.filter((u) => u.ativo).map((u) => [String(u.id), u.nome] as [string, string])} vazio="Todos os responsáveis" value={usuario} onChange={(e) => setUsuario(e.target.value)} />}
        <Caixa rotulo="Mostrar concluídas" checked={concluidas} onChange={(e) => setConcluidas(e.target.checked)} />
      </div>
      <div className={cx('space-y-4 transition-opacity', isFetching && 'opacity-60')}>
        {data?.length === 0 && <div className="rounded-lg border border-dashed border-borda p-8 text-center text-sm text-texto-3">Nada agendado no período.</div>}
        {[...dias].map(([dia, itens]) => (
          <Cartao key={dia} titulo={<span className={cx('capitalize', dia === 'atrasadas' && 'text-perigo')}>{rotuloDia(dia)}</span>} semPadding>
            <ul className="divide-y divide-borda">
              {itens.map((i) => (
                <li key={`${i.tipo}-${i.id}`} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className="text-texto-3">{i.tipo === 'VISITA' ? <Home className="size-4" /> : <ListTodo className="size-4" />}</span>
                  <span className="numeros w-24 text-texto-2">{dia === 'atrasadas' ? `${i.quando.slice(8, 10)}/${i.quando.slice(5, 7)} ${i.quando.slice(11, 16)}` : i.quando.slice(11, 16)}</span>
                  <span className="flex-1">
                    <span className="font-medium">{i.titulo}</span>
                    {i.detalhe && (
                      <span className="text-texto-2">
                        {' · '}
                        {i.negocioId ? (
                          <Link className="hover:underline" to={`/crm/negocios/${i.negocioId}`}>
                            {i.detalhe}
                          </Link>
                        ) : i.leadId ? (
                          <Link className="hover:underline" to={`/crm/leads/${i.leadId}`}>
                            {i.detalhe}
                          </Link>
                        ) : (
                          i.detalhe
                        )}
                      </span>
                    )}
                  </span>
                  {i.responsavel && <span className="text-xs text-texto-3">{i.responsavel}</span>}
                  {i.tipo === 'VISITA' ? (
                    <Selo tom={i.situacao === 'AGENDADA' ? 'alerta' : 'neutro'}>{SITUACOES_VISITA[i.situacao as keyof typeof SITUACOES_VISITA]}</Selo>
                  ) : i.situacao === 'PENDENTE' ? (
                    pode('crm.gerenciar') && (
                      <Botao tamanho="sm" variante="fantasma" icone={<CalendarClock className="size-3.5" />} onClick={() => setConcluir({ id: i.id, titulo: i.titulo })}>
                        Concluir
                      </Botao>
                    )
                  ) : (
                    <Selo tom="destaque">{i.situacao === 'CONCLUIDA' ? 'Concluída' : 'Cancelada'}</Selo>
                  )}
                </li>
              ))}
            </ul>
          </Cartao>
        ))}
      </div>
      {concluir && <DialogoConcluir atividade={concluir} aoFechar={() => setConcluir(null)} />}
    </>
  )
}
