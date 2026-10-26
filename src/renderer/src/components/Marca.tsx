// Logotipo oficial. Os arquivos originais devem ser colocados em assets/brand/ (não são redesenhados aqui):
//   logo.svg|png         — versão para fundo claro
//   logo-negativo.svg|png — versão para fundo escuro (opcional)
// Enquanto os arquivos não forem fornecidos, exibe apenas o nome da empresa em texto.
import { cx } from './ui'

const arquivos = import.meta.glob('../../../../assets/brand/*.{svg,png,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

function buscar(nome: string): string | undefined {
  return Object.entries(arquivos).find(([k]) => k.split('/').pop()!.replace(/\.\w+$/, '') === nome)?.[1]
}

export const LOGO = buscar('logo')
export const LOGO_NEGATIVO = buscar('logo-negativo')

export function Marca({ fundo = 'claro', className, compacta }: { fundo?: 'claro' | 'escuro'; className?: string; compacta?: boolean }) {
  const src = fundo === 'escuro' ? (LOGO_NEGATIVO ?? LOGO) : LOGO
  if (src) return <img src={src} alt="Status Negócios Imobiliários" className={cx('object-contain', className)} draggable={false} />
  return (
    <div className={cx('leading-none', fundo === 'escuro' ? 'text-white' : 'text-texto', className)} title="Logotipo oficial pendente (assets/brand)">
      <div className={cx('font-bold tracking-[0.25em]', compacta ? 'text-base' : 'text-2xl')}>STATUS</div>
      {!compacta && <div className="mt-1 text-[10px] tracking-[0.2em] uppercase opacity-70">Negócios Imobiliários</div>}
    </div>
  )
}
