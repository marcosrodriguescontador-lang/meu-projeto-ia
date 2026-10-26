// Processamento de imagens (miniaturas). A implementação real usa o nativeImage do Electron;
// fora do Electron (testes) a imagem original é usada como miniatura.

export interface ProcessadorImagem {
  miniatura(dados: Buffer, mime: string, larguraMaxima: number): Promise<{ dados: Buffer; mime: string }>
}

export const processadorSemRedimensionar: ProcessadorImagem = {
  miniatura: async (dados, mime) => ({ dados, mime })
}
