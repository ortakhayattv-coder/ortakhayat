import { db, ayarYaz, simdi } from '../db'
import { base64Blob, blobBase64 } from './gorsel'

const SURUM = 1

type Tablo = (typeof db.tables)[number]

async function satirDisaAktar(satir: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sonuc: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(satir)) {
    if (v instanceof Blob) sonuc[k] = { __blob: await blobBase64(v), tip: v.type }
    else if (Array.isArray(v) && v.some((x) => x instanceof Blob))
      sonuc[k] = await Promise.all(v.map(async (x) => (x instanceof Blob ? { __blob: await blobBase64(x), tip: x.type } : x)))
    else sonuc[k] = v
  }
  return sonuc
}

async function degerIceAktar(v: unknown): Promise<unknown> {
  if (v && typeof v === 'object' && '__blob' in v) {
    const o = v as { __blob: string; tip: string }
    return base64Blob(o.__blob, o.tip || 'image/jpeg')
  }
  if (Array.isArray(v)) return Promise.all(v.map(degerIceAktar))
  return v
}

export async function yedekOlustur(): Promise<Blob> {
  const veri: Record<string, unknown[]> = {}
  for (const t of db.tables as Tablo[]) {
    const satirlar = await t.toArray()
    veri[t.name] = await Promise.all(satirlar.map((s) => satirDisaAktar(s as Record<string, unknown>)))
  }
  const json = JSON.stringify({ uygulama: 'ortakhayat-stok', surum: SURUM, tarih: simdi(), veri })
  return new Blob([json], { type: 'application/json' })
}

export async function yedekIndir() {
  const blob = await yedekOlustur()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ortakhayat-yedek-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  await ayarYaz('sonYedek', simdi())
}

export async function yedekYukle(dosya: File) {
  const metin = await dosya.text()
  const json = JSON.parse(metin) as { uygulama?: string; veri?: Record<string, Record<string, unknown>[]> }
  if (json.uygulama !== 'ortakhayat-stok' || !json.veri) throw new Error('Bu dosya bu uygulamaya ait bir yedek değil.')
  const veri = json.veri
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables as Tablo[]) {
      await t.clear()
      const satirlar = veri[t.name] ?? []
      const donusmus = await Promise.all(
        satirlar.map(async (s) => {
          const o: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(s)) o[k] = await degerIceAktar(v)
          return o
        }),
      )
      if (donusmus.length) await t.bulkAdd(donusmus)
    }
  })
}
