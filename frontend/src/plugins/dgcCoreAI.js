import { registerPlugin } from '@capacitor/core'

const DgcCoreAI = registerPlugin('DgcCoreAI', {
  web: () => import('./dgcCoreAI.web').then((m) => new m.DgcCoreAIWeb()),
})

export default DgcCoreAI

export function base64FromBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export function blobFromBase64(base64, mimeType = 'image/jpeg') {
  const raw = base64.includes(',') ? base64.split(',')[1] : base64
  const bytes = atob(raw)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i += 1) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mimeType })
}