import type { ReactNode } from 'react'
import { Marca } from '@/components/Marca'
import { useSessao } from '@/app/sessao'

/** Moldura das telas de acesso: painel preto com a marca e área do formulário. */
export function TelaAcesso({ titulo, subtitulo, children, largura = 'max-w-sm' }: { titulo: string; subtitulo?: string; children: ReactNode; largura?: string }) {
  const { estado } = useSessao()
  return (
    <div className="flex h-full">
      <div className="hidden w-[42%] flex-col justify-between bg-black p-12 text-white lg:flex">
        <Marca fundo="escuro" className="h-20 w-auto self-start" />
        <div>
          <div className="text-3xl font-semibold leading-tight tracking-tight">
            Gestão administrativa,
            <br />
            comercial e financeira.
          </div>
          <div className="mt-4 text-sm text-white/50">STATUS ERP IMOBILIÁRIO</div>
        </div>
        <div className="text-xs text-white/40">
          Status Negócios Imobiliários · CRECI {estado?.empresa?.creci ?? '038595-J'} · versão {estado?.versaoApp}
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto bg-fundo p-8">
        <div className={`w-full ${largura}`}>
          <div className="mb-8 lg:hidden">
            <Marca />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-sm text-texto-2">{subtitulo}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
