import {
  db,
  simdi,
  type CariHareket,
  type CariKalem,
  type HareketTuru,
  type OdemeSekli,
} from '../db'

export const TUR_ADI: Record<HareketTuru, string> = {
  satis: 'Veresiye satış',
  tahsilat: 'Tahsilat',
  iade: 'İade',
  duzeltme: 'Düzeltme',
  devir: 'Devir bakiyesi',
}

export const ODEME_ADI: Record<OdemeSekli, string> = {
  nakit: 'Nakit',
  kart: 'Kredi kartı',
  havale: 'Havale / EFT',
  cek: 'Çek / senet',
  diger: 'Diğer',
}

export function bugunStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${g}`
}

export function gunEkle(tarih: string, gun: number): string {
  const [y, m, g] = tarih.split('-').map(Number)
  return bugunStr(new Date(y, m - 1, g + gun))
}

export function gunFarki(a: string, b: string): number {
  const [y1, m1, g1] = a.split('-').map(Number)
  const [y2, m2, g2] = b.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, g2) - Date.UTC(y1, m1 - 1, g1)) / 864e5)
}

export interface AcikBorc {
  hareket: CariHareket
  kalan: number
  vade: string
  gecikmeGun: number
}

export interface CariOzet {
  bakiye: number
  vadesiGecen: number
  buHaftaVadesiDolan: number
  buAyAlinan: number
  buAyOdenen: number
  toplamIndirim: number
  toplamAlinan: number
  toplamOdenen: number
  yas: { g0_30: number; g31_60: number; g61_90: number; g90: number }
  acikBorclar: AcikBorc[]
  enEskiGecikme: number
  sonIslem: string | null
  sonOdeme: string | null
}

/**
 * Bir müşterinin hareketlerinden özet çıkarır. Ödemeler en eski vadeli borca sayılır (FIFO).
 * Bakiye hiçbir yerde ayrıca saklanmaz; her seferinde hareketlerden hesaplanır.
 */
export function ozetHesapla(hareketler: CariHareket[], bugun = bugunStr()): CariOzet {
  const gecerli = hareketler.filter((h) => !h.iptal)
  const ayBasi = bugun.slice(0, 7)
  const haftaSonu = gunEkle(bugun, 7)

  let bakiye = 0
  let buAyAlinan = 0
  let buAyOdenen = 0
  let toplamIndirim = 0
  let toplamAlinan = 0
  let toplamOdenen = 0
  let sonIslem: string | null = null
  let sonOdeme: string | null = null

  const borclar: { hareket: CariHareket; kalan: number; vade: string }[] = []
  let alacak = 0

  for (const h of gecerli) {
    bakiye += h.borcEtkisi
    if (!sonIslem || h.tarih > sonIslem) sonIslem = h.tarih
    if (h.tur === 'satis') {
      toplamIndirim += h.indirim
      toplamAlinan += h.borcEtkisi
      if (h.tarih.slice(0, 7) === ayBasi) buAyAlinan += h.borcEtkisi
    }
    if (h.tur === 'tahsilat') {
      toplamOdenen += -h.borcEtkisi
      if (h.tarih.slice(0, 7) === ayBasi) buAyOdenen += -h.borcEtkisi
      if (!sonOdeme || h.tarih > sonOdeme) sonOdeme = h.tarih
    }
    if (h.borcEtkisi > 0) {
      borclar.push({ hareket: h, kalan: h.borcEtkisi, vade: h.vade ?? h.tarih.slice(0, 10) })
    } else {
      alacak += -h.borcEtkisi
    }
  }

  borclar.sort((a, b) => (a.vade === b.vade ? a.hareket.tarih.localeCompare(b.hareket.tarih) : a.vade.localeCompare(b.vade)))
  for (const b of borclar) {
    if (alacak <= 0) break
    const dus = Math.min(alacak, b.kalan)
    b.kalan -= dus
    alacak -= dus
  }

  const yas = { g0_30: 0, g31_60: 0, g61_90: 0, g90: 0 }
  let vadesiGecen = 0
  let buHaftaVadesiDolan = 0
  let enEskiGecikme = 0
  const acikBorclar: AcikBorc[] = []
  for (const b of borclar) {
    if (b.kalan <= 0) continue
    const gecikmeGun = gunFarki(b.vade, bugun)
    acikBorclar.push({ ...b, gecikmeGun })
    if (gecikmeGun > 0) {
      vadesiGecen += b.kalan
      enEskiGecikme = Math.max(enEskiGecikme, gecikmeGun)
    } else if (b.vade <= haftaSonu) {
      buHaftaVadesiDolan += b.kalan
    }
    const yasGun = gunFarki(b.hareket.tarih.slice(0, 10), bugun)
    if (yasGun <= 30) yas.g0_30 += b.kalan
    else if (yasGun <= 60) yas.g31_60 += b.kalan
    else if (yasGun <= 90) yas.g61_90 += b.kalan
    else yas.g90 += b.kalan
  }

  return {
    bakiye,
    vadesiGecen,
    buHaftaVadesiDolan,
    buAyAlinan,
    buAyOdenen,
    toplamIndirim,
    toplamAlinan,
    toplamOdenen,
    yas,
    acikBorclar,
    enEskiGecikme,
    sonIslem,
    sonOdeme,
  }
}

/** Tüm müşterilerin özetleri tek seferde (liste ekranları için) */
export async function tumOzetler(): Promise<Map<number, CariOzet>> {
  const hepsi = await db.cariHareketler.toArray()
  const grup = new Map<number, CariHareket[]>()
  for (const h of hepsi) {
    const l = grup.get(h.musteriId)
    if (l) l.push(h)
    else grup.set(h.musteriId, [h])
  }
  const sonuc = new Map<number, CariOzet>()
  for (const [id, l] of grup) sonuc.set(id, ozetHesapla(l))
  return sonuc
}

/** Bakiye seyrini (her satırdan sonraki bakiye) hesaplar, tarihe göre artan */
export function bakiyeSeyri(hareketler: CariHareket[]): { hareket: CariHareket; bakiye: number }[] {
  const sirali = [...hareketler].sort((a, b) => a.tarih.localeCompare(b.tarih) || (a.id ?? 0) - (b.id ?? 0))
  let b = 0
  return sirali.map((h) => {
    if (!h.iptal) b += h.borcEtkisi
    return { hareket: h, bakiye: b }
  })
}

async function sayacArttir(anahtar: string, onEk: string): Promise<string> {
  const a = await db.ayarlar.get(anahtar)
  const n = ((a?.deger as number) ?? 0) + 1
  await db.ayarlar.put({ anahtar, deger: n })
  return `${onEk}-${String(n).padStart(6, '0')}`
}

export interface SepetKalemi {
  urunId: number | null
  urunAd: string
  barkod: string
  birim: string
  miktar: number
  listeFiyati: number
  birimFiyat: number
  /** satır indirimi, kuruş */
  indirim: number
}

export function kalemTutari(k: SepetKalemi): number {
  return Math.round(k.miktar * k.birimFiyat) - k.indirim
}

export function sepetHesapla(kalemler: SepetKalemi[], fisIndirimi: number) {
  const araToplam = kalemler.reduce((s, k) => s + Math.round(k.miktar * k.listeFiyati), 0)
  const kalemlerToplami = kalemler.reduce((s, k) => s + kalemTutari(k), 0)
  const net = kalemlerToplami - fisIndirimi
  return { araToplam, kalemlerToplami, net, indirim: araToplam - net }
}

function bosHareket(): Omit<CariHareket, 'musteriId' | 'tur' | 'borcEtkisi' | 'kullanici'> {
  return {
    tarih: simdi(),
    araToplam: 0,
    indirim: 0,
    vade: null,
    odemeSekli: null,
    aciklama: '',
    belgeNo: '',
    iptal: false,
    iptalNedeni: '',
    iptalEden: '',
    iptalTarihi: '',
  }
}

const TABLOLAR = () => [db.cariHareketler, db.cariKalemler, db.urunler, db.stokHareketleri, db.ayarlar, db.islemKayitlari]

async function stokOynat(urunId: number, miktar: number, kaynak: 'satis' | 'iade' | 'iptal', kaynakId: number, kullanici: string, aciklama: string) {
  const u = await db.urunler.get(urunId)
  if (!u) return
  await db.urunler.update(urunId, { stok: Math.round((u.stok + miktar) * 1000) / 1000, guncelleme: simdi() })
  await db.stokHareketleri.add({ urunId, miktar, kaynak, kaynakId, tarih: simdi(), kullanici, aciklama })
}

export async function veresiyeSatisKaydet(p: {
  musteriId: number
  kalemler: SepetKalemi[]
  fisIndirimi: number
  vade: string
  aciklama: string
  kullanici: string
}): Promise<number> {
  if (p.kalemler.length === 0) throw new Error('Sepet boş')
  const h = sepetHesapla(p.kalemler, p.fisIndirimi)
  if (h.net <= 0) throw new Error('Net tutar sıfırdan büyük olmalı')
  return db.transaction('rw', TABLOLAR(), async () => {
    const belgeNo = await sayacArttir('sayac.veresiye', 'V')
    const id = (await db.cariHareketler.add({
      ...bosHareket(),
      musteriId: p.musteriId,
      tur: 'satis',
      borcEtkisi: h.net,
      araToplam: h.araToplam,
      indirim: h.indirim,
      vade: p.vade,
      aciklama: p.aciklama,
      kullanici: p.kullanici,
      belgeNo,
    })) as number
    for (const k of p.kalemler) {
      await db.cariKalemler.add({ hareketId: id, ...k, tutar: kalemTutari(k) } satisfies CariKalem)
      if (k.urunId != null) await stokOynat(k.urunId, -k.miktar, 'satis', id, p.kullanici, belgeNo)
    }
    await db.islemKayitlari.add({ tarih: simdi(), kullanici: p.kullanici, islem: 'Veresiye satış', detay: `${belgeNo} müşteri#${p.musteriId} ${h.net}` })
    return id
  })
}

export async function iadeKaydet(p: {
  musteriId: number
  kalemler: SepetKalemi[]
  aciklama: string
  kullanici: string
  stogaDondur: boolean
}): Promise<number> {
  const h = sepetHesapla(p.kalemler, 0)
  if (h.net <= 0) throw new Error('İade tutarı sıfırdan büyük olmalı')
  return db.transaction('rw', TABLOLAR(), async () => {
    const belgeNo = await sayacArttir('sayac.iade', 'I')
    const id = (await db.cariHareketler.add({
      ...bosHareket(),
      musteriId: p.musteriId,
      tur: 'iade',
      borcEtkisi: -h.net,
      araToplam: h.araToplam,
      indirim: h.indirim,
      aciklama: p.aciklama,
      kullanici: p.kullanici,
      belgeNo,
    })) as number
    for (const k of p.kalemler) {
      await db.cariKalemler.add({ hareketId: id, ...k, tutar: kalemTutari(k) })
      if (p.stogaDondur && k.urunId != null) await stokOynat(k.urunId, k.miktar, 'iade', id, p.kullanici, belgeNo)
    }
    await db.islemKayitlari.add({ tarih: simdi(), kullanici: p.kullanici, islem: 'İade', detay: `${belgeNo} müşteri#${p.musteriId} ${h.net}` })
    return id
  })
}

export async function tahsilatKaydet(p: {
  musteriId: number
  tutar: number
  odemeSekli: OdemeSekli
  aciklama: string
  kullanici: string
  tarih?: string
}): Promise<number> {
  if (!(p.tutar > 0)) throw new Error('Tutar sıfırdan büyük olmalı')
  return db.transaction('rw', TABLOLAR(), async () => {
    const belgeNo = await sayacArttir('sayac.makbuz', 'M')
    const id = (await db.cariHareketler.add({
      ...bosHareket(),
      tarih: p.tarih ?? simdi(),
      musteriId: p.musteriId,
      tur: 'tahsilat',
      borcEtkisi: -p.tutar,
      odemeSekli: p.odemeSekli,
      aciklama: p.aciklama,
      kullanici: p.kullanici,
      belgeNo,
    })) as number
    await db.islemKayitlari.add({ tarih: simdi(), kullanici: p.kullanici, islem: 'Tahsilat', detay: `${belgeNo} müşteri#${p.musteriId} ${p.tutar}` })
    return id
  })
}

/** Yönetici düzeltmesi: tutar + ise borç artar, - ise azalır (ör. sonradan indirim) */
export async function duzeltmeKaydet(p: { musteriId: number; tutar: number; aciklama: string; kullanici: string; vade: string | null }) {
  if (!p.tutar) throw new Error('Tutar sıfır olamaz')
  if (!p.aciklama.trim()) throw new Error('Düzeltme için açıklama zorunlu')
  return db.transaction('rw', TABLOLAR(), async () => {
    const belgeNo = await sayacArttir('sayac.duzeltme', 'D')
    const id = await db.cariHareketler.add({
      ...bosHareket(),
      musteriId: p.musteriId,
      tur: 'duzeltme',
      borcEtkisi: p.tutar,
      indirim: p.tutar < 0 ? -p.tutar : 0,
      vade: p.tutar > 0 ? p.vade : null,
      aciklama: p.aciklama,
      kullanici: p.kullanici,
      belgeNo,
    })
    await db.islemKayitlari.add({ tarih: simdi(), kullanici: p.kullanici, islem: 'Düzeltme', detay: `${belgeNo} müşteri#${p.musteriId} ${p.tutar} ${p.aciklama}` })
    return id
  })
}

/** Kâğıt defterden aktarılan eski bakiye */
export async function devirKaydet(p: { musteriId: number; tutar: number; tarih: string; vade: string | null; aciklama: string; kullanici: string }) {
  return db.transaction('rw', TABLOLAR(), async () => {
    const id = await db.cariHareketler.add({
      ...bosHareket(),
      tarih: new Date(p.tarih + 'T12:00:00').toISOString(),
      musteriId: p.musteriId,
      tur: 'devir',
      borcEtkisi: p.tutar,
      vade: p.tutar > 0 ? (p.vade ?? p.tarih) : null,
      aciklama: p.aciklama || 'Eski defterden devir',
      kullanici: p.kullanici,
      belgeNo: 'DEVIR',
    })
    await db.islemKayitlari.add({ tarih: simdi(), kullanici: p.kullanici, islem: 'Devir', detay: `müşteri#${p.musteriId} ${p.tutar}` })
    return id
  })
}

/** Hareket silinmez; iptal edilir. Satış/iade iptalinde stok geri alınır. */
export async function hareketIptal(hareketId: number, neden: string, kullanici: string) {
  if (!neden.trim()) throw new Error('İptal nedeni zorunlu')
  await db.transaction('rw', TABLOLAR(), async () => {
    const h = await db.cariHareketler.get(hareketId)
    if (!h) throw new Error('Kayıt bulunamadı')
    if (h.iptal) throw new Error('Bu kayıt zaten iptal edilmiş')
    await db.cariHareketler.update(hareketId, { iptal: true, iptalNedeni: neden, iptalEden: kullanici, iptalTarihi: simdi() })
    if (h.tur === 'satis' || h.tur === 'iade') {
      const stokHareketleri = await db.stokHareketleri.where('[kaynak+kaynakId]').equals([h.tur, hareketId]).toArray()
      for (const s of stokHareketleri) {
        await stokOynat(s.urunId, -s.miktar, 'iptal', hareketId, kullanici, `${h.belgeNo} iptali`)
      }
    }
    await db.islemKayitlari.add({ tarih: simdi(), kullanici, islem: 'İptal', detay: `${h.belgeNo} (${TUR_ADI[h.tur]}) neden: ${neden}` })
  })
}

export function whatsappLinki(telefon: string, mesaj: string): string {
  let t = telefon.replace(/\D/g, '')
  if (t.startsWith('0')) t = '9' + t
  else if (t.length === 10) t = '90' + t
  return `https://wa.me/${t}?text=${encodeURIComponent(mesaj)}`
}
