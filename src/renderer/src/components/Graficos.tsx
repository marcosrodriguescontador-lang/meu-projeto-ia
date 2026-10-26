// Gráficos em SVG: colunas agrupadas e linha, com dica ao passar o mouse/foco, legenda e tabela equivalente.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Table2 } from 'lucide-react'
import { cx } from './ui'

export interface Serie {
  nome: string
  cor: 1 | 2
  valores: number[]
  /** Parcela prevista (não realizada), empilhada acima do realizado com hachura. */
  previstos?: number[]
}

const ALTURA = 220
const MARGEM = { topo: 12, dir: 12, base: 28, esq: 64 }

function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(600)
  useEffect(() => {
    if (!ref.current) return
    const o = new ResizeObserver(([e]) => e && setW(Math.max(280, Math.floor(e.contentRect.width))))
    o.observe(ref.current)
    return () => o.disconnect()
  }, [])
  return [ref, w] as const
}

/** Escala "redonda" para o eixo Y (0, 1, 2, 2.5, 5 × 10^n), sempre incluindo o zero. */
function escala(min: number, max: number, alvo = 4) {
  const lo = Math.min(0, min)
  const hi = Math.max(0, max)
  if (lo === hi) return { lo: 0, hi: 1, ticks: [0] }
  const bruto = (hi - lo) / alvo
  const mag = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto)!
  const ini = Math.floor(lo / passo) * passo
  const fim = Math.ceil(hi / passo) * passo
  const ticks: number[] = []
  for (let v = ini; v <= fim + passo / 2; v += passo) ticks.push(Math.round(v))
  return { lo: ini, hi: fim, ticks }
}

/** Valores em centavos → rótulo compacto do eixo (R$ 12 mil, R$ 1,2 mi). */
export function moedaCompacta(centavos: number) {
  const r = centavos / 100
  const a = Math.abs(r)
  if (a >= 1_000_000) return `R$ ${(r / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1_000) return `R$ ${(r / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return `R$ ${r.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
}

const corSerie = (c: 1 | 2) => (c === 1 ? 'var(--serie-1)' : 'var(--serie-2)')

function Legenda({ series, extra }: { series: { nome: string; cor: 1 | 2; linha?: boolean }[]; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-texto-2">
      {series.map((s) => (
        <span key={s.nome} className="inline-flex items-center gap-1.5">
          {s.linha ? <span className="h-0.5 w-4 rounded" style={{ background: corSerie(s.cor) }} /> : <span className="size-2.5 rounded-sm" style={{ background: corSerie(s.cor) }} />}
          {s.nome}
        </span>
      ))}
      {extra}
    </div>
  )
}

function Dica({ x, largura, titulo, linhas }: { x: number; largura: number; titulo: string; linhas: { nome: string; valor: string; cor: 1 | 2 }[] }) {
  const esquerda = x > largura - 180
  return (
    <div className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-md border border-borda bg-superficie px-3 py-2 text-xs shadow-lg" style={esquerda ? { right: largura - x + 8 } : { left: x + 8 }}>
      <div className="mb-1 text-texto-2">{titulo}</div>
      {linhas.map((l) => (
        <div key={l.nome} className="flex items-center gap-2">
          <span className="h-0.5 w-3 rounded" style={{ background: corSerie(l.cor) }} />
          <span className="numeros font-semibold text-texto">{l.valor}</span>
          <span className="text-texto-2">{l.nome}</span>
        </div>
      ))}
    </div>
  )
}

function TabelaDados({ categorias, series, formatar }: { categorias: string[]; series: { nome: string; valores: number[] }[]; formatar: (v: number) => string }) {
  return (
    <div className="mt-3 max-h-64 overflow-auto rounded border border-borda">
      <table className="w-full text-xs">
        <thead className="bg-superficie-2 text-texto-2">
          <tr>
            <th className="px-2 py-1 text-left font-medium">Período</th>
            {series.map((s) => (
              <th key={s.nome} className="px-2 py-1 text-right font-medium">
                {s.nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categorias.map((c, i) => (
            <tr key={c} className="border-t border-borda">
              <td className="px-2 py-1">{c}</td>
              {series.map((s) => (
                <td key={s.nome} className="numeros px-2 py-1 text-right">
                  {formatar(s.valores[i] ?? 0)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Moldura({ titulo, legenda, children, tabela }: { titulo: string; legenda: ReactNode; children: ReactNode; tabela: ReactNode }) {
  const [verTabela, setVerTabela] = useState(false)
  return (
    <figure aria-label={titulo}>
      <div className="mb-2 flex items-center justify-between gap-3">
        {legenda}
        <button type="button" className={cx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-texto-2 hover:bg-superficie-2', verTabela && 'bg-superficie-2 text-texto')} onClick={() => setVerTabela((v) => !v)} aria-pressed={verTabela}>
          <Table2 className="size-3.5" /> Tabela
        </button>
      </div>
      {children}
      {verTabela && tabela}
    </figure>
  )
}

/** Colunas agrupadas por período. A parcela prevista de cada coluna aparece hachurada, acima da realizada. */
export function GraficoColunas({ titulo, categorias, series, formatar }: { titulo: string; categorias: string[]; series: Serie[]; formatar: (v: number) => string }) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [foco, setFoco] = useState<number | null>(null)
  const id = useId().replace(/:/g, '')
  const total = (s: Serie, i: number) => (s.valores[i] ?? 0) + (s.previstos?.[i] ?? 0)
  const todos = series.flatMap((s) => s.valores.map((_, i) => total(s, i)))
  const temPrevisto = series.some((s) => s.previstos?.some((v) => v !== 0))
  const { lo, hi, ticks } = escala(Math.min(0, ...todos), Math.max(0, ...todos))
  const w = largura - MARGEM.esq - MARGEM.dir
  const h = ALTURA - MARGEM.topo - MARGEM.base
  const y = (v: number) => MARGEM.topo + h - ((v - lo) / (hi - lo)) * h
  const banda = w / Math.max(1, categorias.length)
  const barra = Math.min(24, (banda * 0.7 - 2 * (series.length - 1)) / series.length)
  const grupo = barra * series.length + 2 * (series.length - 1)
  const passoRotulo = Math.ceil(categorias.length / Math.max(1, Math.floor(w / 56)))
  return (
    <Moldura
      titulo={titulo}
      legenda={<Legenda series={series} extra={temPrevisto && <span className="inline-flex items-center gap-1.5"><svg width="10" height="10" aria-hidden><rect width="10" height="10" rx="2" fill={`url(#h-${id}-1)`} /></svg>Previsto</span>} />}
      tabela={<TabelaDados categorias={categorias} series={series.flatMap((s) => (s.previstos ? [{ nome: `${s.nome} realizadas`, valores: s.valores }, { nome: `${s.nome} previstas`, valores: s.previstos }] : [s]))} formatar={formatar} />}
    >
      <div ref={ref} className="relative" onPointerLeave={() => setFoco(null)}>
        <svg width={largura} height={ALTURA} role="img" aria-label={titulo} className="block">
          <defs>
            {([1, 2] as const).map((c) => (
              <pattern key={c} id={`h-${id}-${c}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill={corSerie(c)} opacity="0.25" />
                <line x1="0" y1="0" x2="0" y2="5" stroke={corSerie(c)} strokeWidth="2.5" />
              </pattern>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGEM.esq} x2={largura - MARGEM.dir} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--texto-3)' : 'var(--grade)'} strokeWidth="1" />
              <text x={MARGEM.esq - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-texto-3 text-[10px]">
                {moedaCompacta(t)}
              </text>
            </g>
          ))}
          {categorias.map((c, i) => {
            const x0 = MARGEM.esq + i * banda + (banda - grupo) / 2
            return (
              <g key={c} tabIndex={0} onPointerEnter={() => setFoco(i)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)} className="outline-none" aria-label={`${c}: ${series.map((s) => `${s.nome} ${formatar(total(s, i))}`).join(', ')}`}>
                <rect x={MARGEM.esq + i * banda} y={MARGEM.topo} width={banda} height={h} fill={foco === i ? 'var(--superficie-2)' : 'transparent'} />
                {series.map((s, k) => {
                  const x = x0 + k * (barra + 2)
                  const real = s.valores[i] ?? 0
                  const prev = s.previstos?.[i] ?? 0
                  // Segmentos: realizado a partir do zero; previsto empilhado, separado por 2px de superfície.
                  const segs = [
                    { de: 0, ate: real, hachura: false },
                    { de: real, ate: real + prev, hachura: true }
                  ].filter((g) => g.ate !== g.de)
                  return segs.map((g, n) => {
                    const ponta = n === segs.length - 1
                    const y1 = y(Math.max(g.de, g.ate))
                    const y2 = y(Math.min(g.de, g.ate))
                    const gap = n > 0 ? 2 : 0
                    const topo = g.ate > 0 ? y1 : y1 + gap
                    const alt = Math.max(1, y2 - y1 - gap)
                    const r = ponta ? Math.min(4, alt, barra / 2) : 0
                    const d =
                      g.ate > 0
                        ? `M${x},${topo + alt}V${topo + r}q0,-${r} ${r},-${r}h${barra - 2 * r}q${r},0 ${r},${r}V${topo + alt}Z`
                        : `M${x},${topo}V${topo + alt - r}q0,${r} ${r},${r}h${barra - 2 * r}q${r},0 ${r},-${r}V${topo}Z`
                    return <path key={`${s.nome}-${n}`} d={d} fill={g.hachura ? `url(#h-${id}-${s.cor})` : corSerie(s.cor)} />
                  })
                })}
                {i % passoRotulo === 0 && (
                  <text x={MARGEM.esq + i * banda + banda / 2} y={ALTURA - 8} textAnchor="middle" className="fill-texto-2 text-[10px]">
                    {c}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
        {foco !== null && (
          <Dica
            x={MARGEM.esq + foco * banda + banda / 2}
            largura={largura}
            titulo={categorias[foco]!}
            linhas={series.flatMap((s) =>
              s.previstos?.[foco] ? [{ nome: `${s.nome} realizadas`, cor: s.cor, valor: formatar(s.valores[foco] ?? 0) }, { nome: `${s.nome} previstas`, cor: s.cor, valor: formatar(s.previstos[foco]!) }] : [{ nome: s.nome, cor: s.cor, valor: formatar(s.valores[foco] ?? 0) }]
            )}
          />
        )}
      </div>
    </Moldura>
  )
}

/** Linha única com marcador no último ponto realizado; trecho projetado tracejado. */
export function GraficoLinha({ titulo, categorias, valores, nome, projetadoDesde, formatar }: { titulo: string; categorias: string[]; valores: number[]; nome: string; projetadoDesde?: number; formatar: (v: number) => string }) {
  const [ref, largura] = useLargura<HTMLDivElement>()
  const [foco, setFoco] = useState<number | null>(null)
  const { lo, hi, ticks } = escala(Math.min(0, ...valores), Math.max(0, ...valores))
  const w = largura - MARGEM.esq - MARGEM.dir
  const h = ALTURA - MARGEM.topo - MARGEM.base
  const n = valores.length
  const x = (i: number) => MARGEM.esq + (n <= 1 ? w / 2 : (i / (n - 1)) * w)
  const y = (v: number) => MARGEM.topo + h - ((v - lo) / (hi - lo)) * h
  const corte = projetadoDesde ?? n
  const caminho = (de: number, ate: number) => valores.slice(de, ate).map((v, k) => `${k ? 'L' : 'M'}${x(de + k)},${y(v)}`).join('')
  const ultimo = Math.min(corte, n) - 1
  const passoRotulo = Math.ceil(n / Math.max(1, Math.floor(w / 56)))
  const mover = (ev: React.PointerEvent) => {
    const r = (ev.currentTarget as HTMLElement).getBoundingClientRect()
    const i = Math.round(((ev.clientX - r.left - MARGEM.esq) / w) * (n - 1))
    setFoco(Math.max(0, Math.min(n - 1, i)))
  }
  return (
    <Moldura titulo={titulo} legenda={<Legenda series={[]} extra={corte < n && <span className="inline-flex items-center gap-1.5"><svg width="16" height="4" aria-hidden><line x1="0" x2="16" y1="2" y2="2" stroke="var(--serie-1)" strokeWidth="2" strokeDasharray="4 3" /></svg>Projetado</span>} />} tabela={<TabelaDados categorias={categorias.map((c, i) => (i >= corte ? `${c} (projetado)` : c))} series={[{ nome, valores }]} formatar={formatar} />}>
      <div ref={ref} className="relative" onPointerMove={mover} onPointerLeave={() => setFoco(null)} tabIndex={0} onKeyDown={(e) => {
        if (e.key === 'ArrowRight') setFoco((f) => Math.min(n - 1, (f ?? -1) + 1))
        if (e.key === 'ArrowLeft') setFoco((f) => Math.max(0, (f ?? n) - 1))
      }} onBlur={() => setFoco(null)} aria-label={titulo}>
        <svg width={largura} height={ALTURA} role="img" aria-label={titulo} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGEM.esq} x2={largura - MARGEM.dir} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--texto-3)' : 'var(--grade)'} strokeWidth="1" />
              <text x={MARGEM.esq - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-texto-3 text-[10px]">
                {moedaCompacta(t)}
              </text>
            </g>
          ))}
          {categorias.map((c, i) => i % passoRotulo === 0 && (
            <text key={c} x={x(i)} y={ALTURA - 8} textAnchor="middle" className="fill-texto-2 text-[10px]">
              {c}
            </text>
          ))}
          {foco !== null && <line x1={x(foco)} x2={x(foco)} y1={MARGEM.topo} y2={MARGEM.topo + h} stroke="var(--texto-3)" strokeWidth="1" />}
          <path d={caminho(0, corte)} fill="none" stroke="var(--serie-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {corte < n && <path d={caminho(Math.max(0, corte - 1), n)} fill="none" stroke="var(--serie-1)" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />}
          {ultimo >= 0 && <circle cx={x(ultimo)} cy={y(valores[ultimo]!)} r="4.5" fill="var(--serie-1)" stroke="var(--superficie)" strokeWidth="2" />}
          {foco !== null && <circle cx={x(foco)} cy={y(valores[foco]!)} r="4.5" fill="var(--serie-1)" stroke="var(--superficie)" strokeWidth="2" />}
        </svg>
        {foco !== null && <Dica x={x(foco)} largura={largura} titulo={`${categorias[foco]}${foco >= corte ? ' · projetado' : ''}`} linhas={[{ nome, cor: 1, valor: formatar(valores[foco]!) }]} />}
      </div>
    </Moldura>
  )
}
