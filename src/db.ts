import Dexie, { type EntityTable } from 'dexie'

/** Tüm para tutarları KURUŞ cinsinden tam sayıdır (12,50 TL = 1250). */

export type Rol = 'yonetici' | 'personel'

export interface Kullanici {
  id?: number
  ad: string
  pin: string
  rol: Rol
  aktif: boolean
}

export interface Urun {
  id?: number
  barkod: string
  kod: string
  ad: string
  birim: string
  alisFiyati: number
  satisFiyati: number
  stok: number
  minStok: number
  /** "1 top = 100 metre" gibi: irsaliyede gelen birim -> stok birimi çarpanı */
  birimCevrimleri: { birim: string; carpan: number }[]
  not: string
  olusturma: string
  guncelleme: string
}

export interface UrunGorseli {
  id?: number
  urunId: number
  blob: Blob
  sira: number
  ekleyen: string
  tarih: string
}

export type MusteriTipi = 'bireysel' | 'usta' | 'muteahhit' | 'firma'

export interface Musteri {
  id?: number
  ad: string
  telefon: string
  adres: string
  tip: MusteriTipi
  krediLimiti: number
  vadeGun: number
  yetkili: string
  not: string
  aktif: boolean
  olusturma: string
}

export type HareketTuru = 'satis' | 'tahsilat' | 'iade' | 'duzeltme' | 'devir'
export type OdemeSekli = 'nakit' | 'kart' | 'havale' | 'cek' | 'diger'

export interface CariHareket {
  id?: number
  musteriId: number
  /** ISO tarih-saat */
  tarih: string
  tur: HareketTuru
  /** Borca etkisi: + borç artar, - borç azalır */
  borcEtkisi: number
  /** İndirim öncesi tutar (satış/iade) */
  araToplam: number
  /** Toplam indirim tutarı */
  indirim: number
  /** YYYY-MM-DD; sadece borç artıran hareketlerde */
  vade: string | null
  odemeSekli: OdemeSekli | null
  aciklama: string
  kullanici: string
  belgeNo: string
  iptal: boolean
  iptalNedeni: string
  iptalEden: string
  iptalTarihi: string
}

export interface CariKalem {
  id?: number
  hareketId: number
  urunId: number | null
  urunAd: string
  barkod: string
  miktar: number
  birim: string
  listeFiyati: number
  birimFiyat: number
  indirim: number
  tutar: number
}

export type IrsaliyeDurum = 'taslak' | 'onaylandi'

export interface Irsaliye {
  id?: number
  tedarikci: string
  irsaliyeNo: string
  tarih: string
  fotolar: Blob[]
  durum: IrsaliyeDurum
  kullanici: string
  olusturma: string
  onayTarihi: string
  not: string
}

export interface IrsaliyeKalemi {
  id?: number
  irsaliyeId: number
  okunanAd: string
  okunanKod: string
  urunId: number | null
  miktar: number
  birim: string
  /** stok birimine çevrilmiş miktar */
  stokMiktari: number
  okutulan: number
}

export interface Eslesme {
  id?: number
  /** tedarikci|okunanAd (küçük harf) */
  anahtar: string
  urunId: number
}

export type StokKaynak = 'irsaliye' | 'satis' | 'iade' | 'sayim' | 'iptal' | 'elle'

export interface StokHareketi {
  id?: number
  urunId: number
  miktar: number
  kaynak: StokKaynak
  kaynakId: number | null
  tarih: string
  kullanici: string
  aciklama: string
}

export interface Ayar {
  anahtar: string
  deger: unknown
}

export interface IslemKaydi {
  id?: number
  tarih: string
  kullanici: string
  islem: string
  detay: string
}

export const db = new Dexie('OrtakHayatStok') as Dexie & {
  kullanicilar: EntityTable<Kullanici, 'id'>
  urunler: EntityTable<Urun, 'id'>
  urunGorselleri: EntityTable<UrunGorseli, 'id'>
  musteriler: EntityTable<Musteri, 'id'>
  cariHareketler: EntityTable<CariHareket, 'id'>
  cariKalemler: EntityTable<CariKalem, 'id'>
  irsaliyeler: EntityTable<Irsaliye, 'id'>
  irsaliyeKalemleri: EntityTable<IrsaliyeKalemi, 'id'>
  eslesmeler: EntityTable<Eslesme, 'id'>
  stokHareketleri: EntityTable<StokHareketi, 'id'>
  ayarlar: EntityTable<Ayar, 'anahtar'>
  islemKayitlari: EntityTable<IslemKaydi, 'id'>
}

db.version(1).stores({
  kullanicilar: '++id, ad',
  urunler: '++id, &barkod, kod, ad',
  urunGorselleri: '++id, urunId',
  musteriler: '++id, ad, telefon',
  cariHareketler: '++id, musteriId, tarih, tur, [musteriId+tarih]',
  cariKalemler: '++id, hareketId, urunId',
  irsaliyeler: '++id, irsaliyeNo, tedarikci, tarih, durum',
  irsaliyeKalemleri: '++id, irsaliyeId, urunId',
  eslesmeler: '++id, &anahtar',
  stokHareketleri: '++id, urunId, tarih, [kaynak+kaynakId]',
  ayarlar: '&anahtar',
  islemKayitlari: '++id, tarih',
})

export const simdi = () => new Date().toISOString()

export async function ayarOku<T>(anahtar: string, varsayilan: T): Promise<T> {
  const a = await db.ayarlar.get(anahtar)
  return a ? (a.deger as T) : varsayilan
}

export async function ayarYaz(anahtar: string, deger: unknown) {
  await db.ayarlar.put({ anahtar, deger })
}

export async function kayitEkle(kullanici: string, islem: string, detay = '') {
  await db.islemKayitlari.add({ tarih: simdi(), kullanici, islem, detay })
}
