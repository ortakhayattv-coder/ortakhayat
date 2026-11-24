import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db'
import { bosUrun } from './stok'
import { kurusa, tl } from './para'
import {
  hareketIptal,
  iadeKaydet,
  ozetHesapla,
  sepetHesapla,
  tahsilatKaydet,
  veresiyeSatisKaydet,
  devirKaydet,
  type SepetKalemi,
} from './cari'

describe('para', () => {
  it('Türkçe tutarları kuruşa çevirir', () => {
    expect(kurusa('1.234,50')).toBe(123450)
    expect(kurusa('1234,5')).toBe(123450)
    expect(kurusa('1234.5')).toBe(123450)
    expect(kurusa('1.234.567')).toBe(123456700)
    expect(kurusa('12')).toBe(1200)
    expect(kurusa('0,1')).toBe(10)
    expect(kurusa('abc')).toBeNaN()
    expect(kurusa(7.25)).toBe(725)
  })
  it('kuruşu biçimler', () => {
    expect(tl(123450).replace(/\s/g, ' ')).toBe('1.234,50 ₺')
    expect(tl(-500)).toContain('-5,00')
  })
})

const kalem = (p: Partial<SepetKalemi>): SepetKalemi => ({
  urunId: null, urunAd: 'x', barkod: '', birim: 'adet', miktar: 1, listeFiyati: 1000, birimFiyat: 1000, indirim: 0, ...p,
})

describe('sepet', () => {
  it('fiyat düşürme, satır ve fiş indirimini toplam indirime katar', () => {
    const h = sepetHesapla(
      [kalem({ miktar: 2, listeFiyati: 1000, birimFiyat: 900 }), kalem({ miktar: 1, listeFiyati: 500, birimFiyat: 500, indirim: 50 })],
      100,
    )
    expect(h.araToplam).toBe(2500)
    expect(h.net).toBe(1800 + 450 - 100)
    expect(h.indirim).toBe(2500 - 2150)
  })
})

describe('veresiye akışı', () => {
  let urunId: number
  let musteriId: number
  beforeEach(async () => {
    await Promise.all(db.tables.map((t) => t.clear()))
    urunId = (await db.urunler.add({ ...bosUrun('869001'), ad: 'Sigorta', satisFiyati: 15000, stok: 10 })) as number
    musteriId = (await db.musteriler.add({
      ad: 'Ahmet Usta', telefon: '05320000000', adres: '', tip: 'usta', krediLimiti: 0, vadeGun: 30, yetkili: '', not: '', aktif: true, olusturma: '',
    })) as number
  })

  it('satış borcu arttırır ve stoğu düşer; tahsilat borcu azaltır', async () => {
    await veresiyeSatisKaydet({
      musteriId, kalemler: [kalem({ urunId, miktar: 3, listeFiyati: 15000, birimFiyat: 15000 })], fisIndirimi: 5000, vade: '2099-01-01', aciklama: '', kullanici: 't',
    })
    expect((await db.urunler.get(urunId))!.stok).toBe(7)
    let o = ozetHesapla(await db.cariHareketler.toArray())
    expect(o.bakiye).toBe(40000)
    expect(o.toplamIndirim).toBe(5000)
    await tahsilatKaydet({ musteriId, tutar: 15000, odemeSekli: 'nakit', aciklama: '', kullanici: 't' })
    o = ozetHesapla(await db.cariHareketler.toArray())
    expect(o.bakiye).toBe(25000)
    expect(o.vadesiGecen).toBe(0)
  })

  it('iptal satışı geri alır ve stoğu iade eder', async () => {
    const id = await veresiyeSatisKaydet({
      musteriId, kalemler: [kalem({ urunId, miktar: 2, listeFiyati: 15000, birimFiyat: 15000 })], fisIndirimi: 0, vade: '2099-01-01', aciklama: '', kullanici: 't',
    })
    await hareketIptal(id, 'yanlış müşteri', 't')
    expect((await db.urunler.get(urunId))!.stok).toBe(10)
    expect(ozetHesapla(await db.cariHareketler.toArray()).bakiye).toBe(0)
    await expect(hareketIptal(id, 'tekrar', 't')).rejects.toThrow()
  })

  it('iade stoğa döner ve borcu düşer', async () => {
    await veresiyeSatisKaydet({
      musteriId, kalemler: [kalem({ urunId, miktar: 2, listeFiyati: 15000, birimFiyat: 15000 })], fisIndirimi: 0, vade: '2099-01-01', aciklama: '', kullanici: 't',
    })
    await iadeKaydet({ musteriId, kalemler: [kalem({ urunId, miktar: 1, listeFiyati: 15000, birimFiyat: 15000 })], aciklama: '', kullanici: 't', stogaDondur: true })
    expect((await db.urunler.get(urunId))!.stok).toBe(9)
    expect(ozetHesapla(await db.cariHareketler.toArray()).bakiye).toBe(15000)
  })

  it('ödemeyi en eski vadeye sayar (FIFO) ve gecikmeyi hesaplar', async () => {
    await devirKaydet({ musteriId, tutar: 10000, tarih: '2026-01-01', vade: '2026-01-31', aciklama: '', kullanici: 't' })
    await devirKaydet({ musteriId, tutar: 20000, tarih: '2026-03-01', vade: '2026-03-31', aciklama: '', kullanici: 't' })
    await tahsilatKaydet({ musteriId, tutar: 12000, odemeSekli: 'nakit', aciklama: '', kullanici: 't' })
    const o = ozetHesapla(await db.cariHareketler.toArray(), '2026-03-10')
    expect(o.bakiye).toBe(18000)
    // ilk borç tamamen kapandı, ikinci borcun vadesi henüz gelmedi
    expect(o.vadesiGecen).toBe(0)
    expect(o.acikBorclar).toHaveLength(1)
    expect(o.acikBorclar[0].kalan).toBe(18000)
    const o2 = ozetHesapla(await db.cariHareketler.toArray(), '2026-04-10')
    expect(o2.vadesiGecen).toBe(18000)
    expect(o2.enEskiGecikme).toBe(10)
  })

  it('sıfır/negatif tutarları reddeder', async () => {
    await expect(tahsilatKaydet({ musteriId, tutar: 0, odemeSekli: 'nakit', aciklama: '', kullanici: 't' })).rejects.toThrow()
    await expect(veresiyeSatisKaydet({ musteriId, kalemler: [], fisIndirimi: 0, vade: '', aciklama: '', kullanici: 't' })).rejects.toThrow()
  })
})
