// Ponte mínima: expõe apenas a chamada RPC tipada. Nenhuma API do Node chega à interface.
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('statusErp', {
  rpc: (metodo: string, entrada?: unknown) => ipcRenderer.invoke('rpc', metodo, entrada),
  plataforma: process.platform
})
