import { db, simdi, type Urun } from '../db'

export function bosUrun(barkod = ''): Urun {
  return {
    barkod,
    kod: '',
    ad: '',
    birim: 'adet',
    alisFiyati: 0,
    satisFiyati: 0,
    stok: 0,
    minStok: 0,
    birimCevrimleri: [],
    not: '',
    olusturma: simdi(),
    guncelleme: simdi(),
  }
}

export const BIRIMLER = ['adet', 'metre', 'kutu', 'paket', 'top', 'kg', 'takım', 'rulo']

/** Barkod, kod veya addan ürün bulur. Tam barkod/kod eşleşmesi öncelikli. */
export async function urunBul(metin: string): Promise<Urun | undefined> {
  const s = metin.trim()
  if (!s) return undefined
  const b = await db.urunler.where('barkod').equals(s).first()
  if (b) return b
  const k = await db.urunler.where('kod').equalsIgnoreCase(s).first()
  return k
}

const normal = (s: string) => s.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim()

export function urunAra(urunler: Urun[], metin: string, limit = 30): Urun[] {
  const q = normal(metin)
  if (!q) return urunler.slice(0, limit)
  const kelimeler = q.split(' ')
  const puanli: { u: Urun; p: number }[] = []
  for (const u of urunler) {
    const ad = normal(u.ad)
    const kod = normal(u.kod)
    let p = 0
    if (u.barkod === metin.trim()) p += 100
    if (kod === q) p += 80
    if (kod.startsWith(q)) p += 30
    if (ad.startsWith(q)) p += 20
    if (kelimeler.every((k) => ad.includes(k) || kod.includes(k) || u.barkod.includes(k))) p += 10
    if (p > 0) puanli.push({ u, p })
  }
  return puanli.sort((a, b) => b.p - a.p).slice(0, limit).map((x) => x.u)
}

export function birimCarpani(u: Urun, birim: string): number {
  const b = normal(birim)
  if (!b || b === normal(u.birim)) return 1
  const c = u.birimCevrimleri.find((x) => normal(x.birim) === b)
  return c ? c.carpan : 1
}

export async function elleStokDuzelt(urunId: number, yeniStok: number, kullanici: string, aciklama: string) {
  await db.transaction('rw', db.urunler, db.stokHareketleri, db.islemKayitlari, async () => {
    const u = await db.urunler.get(urunId)
    if (!u) throw new Error('Ürün bulunamadı')
    const fark = Math.round((yeniStok - u.stok) * 1000) / 1000
    if (fark === 0) return
    await db.urunler.update(urunId, { stok: yeniStok, guncelleme: simdi() })
    await db.stokHareketleri.add({ urunId, miktar: fark, kaynak: 'sayim', kaynakId: null, tarih: simdi(), kullanici, aciklama })
    await db.islemKayitlari.add({ tarih: simdi(), kullanici, islem: 'Stok sayım düzeltmesi', detay: `${u.ad}: ${u.stok} -> ${yeniStok}` })
  })
}

export const eslesmeAnahtari = (tedarikci: string, okunanAd: string) => `${normal(tedarikci)}|${normal(okunanAd)}`

export async function irsaliyeOnayla(irsaliyeId: number, kullanici: string) {
  await db.transaction('rw', [db.irsaliyeler, db.irsaliyeKalemleri, db.urunler, db.stokHareketleri, db.eslesmeler, db.islemKayitlari], async () => {
    const irs = await db.irsaliyeler.get(irsaliyeId)
    if (!irs) throw new Error('İrsaliye bulunamadı')
    if (irs.durum === 'onaylandi') throw new Error('Bu irsaliye zaten stoğa işlendi')
    const kalemler = await db.irsaliyeKalemleri.where('irsaliyeId').equals(irsaliyeId).toArray()
    const eksik = kalemler.filter((k) => k.urunId == null)
    if (eksik.length) throw new Error(`${eksik.length} satır bir ürünle eşleştirilmedi`)
    for (const k of kalemler) {
      const u = await db.urunler.get(k.urunId!)
      if (!u) throw new Error(`Ürün bulunamadı: ${k.okunanAd}`)
      await db.urunler.update(u.id!, { stok: Math.round((u.stok + k.stokMiktari) * 1000) / 1000, guncelleme: simdi() })
      await db.stokHareketleri.add({
        urunId: u.id!,
        miktar: k.stokMiktari,
        kaynak: 'irsaliye',
        kaynakId: irsaliyeId,
        tarih: simdi(),
        kullanici,
        aciklama: `${irs.tedarikci} ${irs.irsaliyeNo}`,
      })
      if (k.okunanAd.trim() && irs.tedarikci.trim()) {
        const anahtar = eslesmeAnahtari(irs.tedarikci, k.okunanAd)
        const var_ = await db.eslesmeler.where('anahtar').equals(anahtar).first()
        if (var_) await db.eslesmeler.update(var_.id!, { urunId: u.id! })
        else await db.eslesmeler.add({ anahtar, urunId: u.id! })
      }
    }
    await db.irsaliyeler.update(irsaliyeId, { durum: 'onaylandi', onayTarihi: simdi() })
    await db.islemKayitlari.add({ tarih: simdi(), kullanici, islem: 'İrsaliye stoğa işlendi', detay: `${irs.tedarikci} ${irs.irsaliyeNo} (${kalemler.length} kalem)` })
  })
}
