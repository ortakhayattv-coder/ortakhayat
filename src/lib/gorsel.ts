/** Fotoğrafı en uzun kenarı `maks` piksel olacak şekilde küçültüp JPEG'e çevirir. */
export async function gorselKucult(dosya: Blob, maks = 1000, kalite = 0.82): Promise<Blob> {
  const bmp = await createImageBitmap(dosya)
  const oran = Math.min(1, maks / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * oran)
  const h = Math.round(bmp.height * oran)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  return new Promise((ok, hata) =>
    canvas.toBlob((b) => (b ? ok(b) : hata(new Error('Görsel işlenemedi'))), 'image/jpeg', kalite),
  )
}

export function blobBase64(blob: Blob): Promise<string> {
  return new Promise((ok, hata) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1] ?? '')
    r.onerror = () => hata(r.error)
    r.readAsDataURL(blob)
  })
}

export async function base64Blob(b64: string, tip: string): Promise<Blob> {
  const res = await fetch(`data:${tip};base64,${b64}`)
  return res.blob()
}
