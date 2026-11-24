import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { readSheet } from 'read-excel-file/browser'
import writeExcelFile from 'write-excel-file/browser'
import { db, kayitEkle, simdi } from '../db'
import { bosUrun, urunAra } from '../lib/stok'
import { kurusa, sayiya, tl, miktarYaz } from '../lib/para'
import { UrunGorsel, Modal, useBildirim, BOS_LISTE } from '../components/Ortak'
import { useKullaniciAdi, useOturum } from '../lib/oturum'

const BASLIKLAR = ['Barkod', 'Kod', 'Ürün Adı', 'Birim', 'Alış Fiyatı', 'Satış Fiyatı', 'Stok', 'Min Stok']

export default function Urunler() {
  const [q, setQ] = useState('')
  const [azalan, setAzalan] = useState(false)
  const [ice, setIce] = useState(false)
  const nav = useNavigate()
  const urunler = useLiveQuery(() => db.urunler.orderBy('ad').toArray(), []) ?? BOS_LISTE
  const liste = useMemo(() => {
    let l = q.trim() ? urunAra(urunler, q, 500) : urunler
    if (azalan) l = l.filter((u) => u.minStok > 0 && u.stok <= u.minStok)
    return l
  }, [urunler, q, azalan])

  const disaAktar = async () => {
    await writeExcelFile([
      BASLIKLAR,
      ...urunler.map((u) => [u.barkod, u.kod, u.ad, u.birim, u.alisFiyati / 100, u.satisFiyati / 100, u.stok, u.minStok]),
    ]).toFile(`urunler-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div className="sayfa">
      <div className="baslik-satir">
        <h1>Ürünler</h1>
        <div className="butonlar">
          <button className="btn ikincil" onClick={() => setIce(true)}>
            Excel'den yükle
          </button>
          <button className="btn ikincil" onClick={() => void disaAktar()}>
            Excel'e aktar
          </button>
          <button className="btn" onClick={() => nav('/urun/yeni')}>
            + Yeni ürün
          </button>
        </div>
      </div>
      <div className="kart">
        <div className="secici-satir">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ad, kod veya barkod ile ara" aria-label="Ürün ara" />
          <label className="onay">
            <input type="checkbox" checked={azalan} onChange={(e) => setAzalan(e.target.checked)} /> Sadece stoğu azalanlar
          </label>
        </div>
        <p className="soluk kucuk">{liste.length} ürün</p>
        <table className="tablo">
          <thead>
            <tr>
              <th></th>
              <th>Ürün</th>
              <th className="sag">Stok</th>
              <th className="sag">Satış</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((u) => (
              <tr key={u.id} className="tiklanir" onClick={() => nav(`/urun/${u.id}`)}>
                <td style={{ width: 48 }}>
                  <UrunGorsel urunId={u.id} boyut={40} />
                </td>
                <td>
                  <Link to={`/urun/${u.id}`} onClick={(e) => e.stopPropagation()}>
                    {u.ad}
                  </Link>
                  <div className="soluk kucuk">
                    {u.kod && `${u.kod} · `}
                    {u.barkod}
                  </div>
                </td>
                <td className={`sag ${u.minStok > 0 && u.stok <= u.minStok ? 'kirmizi-yazi' : ''}`}>
                  {miktarYaz(u.stok)} {u.birim}
                </td>
                <td className="sag">{tl(u.satisFiyati)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ice && <ExcelIceAktar kapat={() => setIce(false)} />}
    </div>
  )
}

interface Onizleme {
  satir: number
  barkod: string
  kod: string
  ad: string
  birim: string
  alis: number
  satis: number
  stok: number
  minStok: number
  durum: 'yeni' | 'guncelle' | 'hata'
  hata?: string
}

function ExcelIceAktar({ kapat }: { kapat: () => void }) {
  const { yonetici } = useOturum()
  const kullanici = useKullaniciAdi()
  const dosya = useRef<HTMLInputElement>(null)
  const [satirlar, setSatirlar] = useState<Onizleme[] | null>(null)
  const [stokEkle, setStokEkle] = useState(true)
  const { goster, el } = useBildirim()

  const sablon = () => writeExcelFile([BASLIKLAR, ['8690000000001', 'NYA-2.5', 'NYA 2,5 mm kablo', 'metre', 4.5, 7.25, 0, 100]]).toFile('urun-sablonu.xlsx')

  const oku = async (f: File) => {
    const veri = await readSheet(f)
    const [baslik, ...govde] = veri
    const idx = (ad: string) => baslik.findIndex((b) => String(b ?? '').trim().toLocaleLowerCase('tr-TR') === ad.toLocaleLowerCase('tr-TR'))
    const i = Object.fromEntries(BASLIKLAR.map((b) => [b, idx(b)]))
    if (i['Barkod'] < 0 || i['Ürün Adı'] < 0) {
      goster('İlk satırda en az "Barkod" ve "Ürün Adı" sütunları olmalı. Şablonu indirip kullanın.', 'hata')
      return
    }
    const mevcut = new Set((await db.urunler.toArray()).map((u) => u.barkod))
    const gorulen = new Set<string>()
    const al = (r: unknown[], ad: string) => (i[ad] >= 0 ? r[i[ad]] : null)
    const sonuc: Onizleme[] = govde
      .filter((r) => r.some((c) => c != null && String(c).trim() !== ''))
      .map((r, n) => {
        const barkod = String(al(r, 'Barkod') ?? '').trim()
        const ad = String(al(r, 'Ürün Adı') ?? '').trim()
        const sayi = (v: unknown) => (v == null || v === '' ? 0 : typeof v === 'number' ? v : sayiya(String(v)))
        const para = (v: unknown) => (v == null || v === '' ? 0 : kurusa(v as string | number))
        const o: Onizleme = {
          satir: n + 2,
          barkod,
          kod: String(al(r, 'Kod') ?? '').trim(),
          ad,
          birim: String(al(r, 'Birim') ?? 'adet').trim() || 'adet',
          alis: para(al(r, 'Alış Fiyatı')),
          satis: para(al(r, 'Satış Fiyatı')),
          stok: sayi(al(r, 'Stok')),
          minStok: sayi(al(r, 'Min Stok')),
          durum: mevcut.has(barkod) ? 'guncelle' : 'yeni',
        }
        if (!barkod) Object.assign(o, { durum: 'hata', hata: 'Barkod boş' })
        else if (!ad) Object.assign(o, { durum: 'hata', hata: 'Ürün adı boş' })
        else if (gorulen.has(barkod)) Object.assign(o, { durum: 'hata', hata: 'Barkod dosyada tekrar ediyor' })
        else if ([o.alis, o.satis, o.stok, o.minStok].some((x) => Number.isNaN(x))) Object.assign(o, { durum: 'hata', hata: 'Sayı alanı hatalı' })
        gorulen.add(barkod)
        return o
      })
    setSatirlar(sonuc)
  }

  const kaydet = async () => {
    if (!satirlar) return
    const gecerli = satirlar.filter((s) => s.durum !== 'hata')
    await db.transaction('rw', db.urunler, db.stokHareketleri, db.islemKayitlari, async () => {
      for (const s of gecerli) {
        const var_ = await db.urunler.where('barkod').equals(s.barkod).first()
        if (var_) {
          const yeniStok = stokEkle ? var_.stok + s.stok : var_.stok
          await db.urunler.update(var_.id!, {
            kod: s.kod || var_.kod,
            ad: s.ad,
            birim: s.birim,
            alisFiyati: s.alis || var_.alisFiyati,
            satisFiyati: s.satis || var_.satisFiyati,
            minStok: s.minStok || var_.minStok,
            stok: yeniStok,
            guncelleme: simdi(),
          })
          if (stokEkle && s.stok)
            await db.stokHareketleri.add({ urunId: var_.id!, miktar: s.stok, kaynak: 'elle', kaynakId: null, tarih: simdi(), kullanici, aciklama: 'Excel yükleme' })
        } else {
          const id = (await db.urunler.add({
            ...bosUrun(s.barkod),
            kod: s.kod,
            ad: s.ad,
            birim: s.birim,
            alisFiyati: s.alis,
            satisFiyati: s.satis,
            stok: s.stok,
            minStok: s.minStok,
          })) as number
          if (s.stok) await db.stokHareketleri.add({ urunId: id, miktar: s.stok, kaynak: 'elle', kaynakId: null, tarih: simdi(), kullanici, aciklama: 'Excel yükleme (açılış)' })
        }
      }
      await db.islemKayitlari.add({ tarih: simdi(), kullanici, islem: 'Excel ürün yükleme', detay: `${gecerli.length} satır` })
    })
    await kayitEkle(kullanici, 'Excel ürün yükleme tamamlandı')
    kapat()
  }

  return (
    <Modal baslik="Excel'den ürün yükle" kapat={kapat} genis>
      {!yonetici ? (
        <p className="uyari">Toplu ürün yüklemeyi sadece yönetici yapabilir.</p>
      ) : !satirlar ? (
        <>
          <p>
            Sütunlar: <strong>{BASLIKLAR.join(', ')}</strong>. Barkod ve Ürün Adı zorunlu. Kayıtlı barkodlar güncellenir, yeniler eklenir.
          </p>
          <div className="butonlar">
            <button className="btn ikincil" onClick={() => void sablon()}>
              Şablonu indir
            </button>
            <input ref={dosya} type="file" accept=".xlsx" hidden onChange={(e) => e.target.files?.[0] && void oku(e.target.files[0])} />
            <button className="btn" onClick={() => dosya.current?.click()}>
              Dosya seç
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            <span className="rozet yesil">{satirlar.filter((s) => s.durum === 'yeni').length} yeni</span>{' '}
            <span className="rozet sari">{satirlar.filter((s) => s.durum === 'guncelle').length} güncellenecek</span>{' '}
            <span className="rozet kirmizi">{satirlar.filter((s) => s.durum === 'hata').length} hatalı (atlanacak)</span>
          </p>
          <label className="onay">
            <input type="checkbox" checked={stokEkle} onChange={(e) => setStokEkle(e.target.checked)} /> Kayıtlı ürünlerde Stok sütununu mevcut stoğun üstüne ekle
          </label>
          <div className="kaydirma">
            <table className="tablo">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Barkod</th>
                  <th>Ad</th>
                  <th className="sag">Satış</th>
                  <th className="sag">Stok</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s) => (
                  <tr key={s.satir} className={s.durum === 'hata' ? 'satir-hata' : ''}>
                    <td>{s.satir}</td>
                    <td>{s.barkod}</td>
                    <td>{s.ad}</td>
                    <td className="sag">{Number.isNaN(s.satis) ? '?' : tl(s.satis)}</td>
                    <td className="sag">{s.stok}</td>
                    <td>{s.durum === 'hata' ? s.hata : s.durum === 'yeni' ? 'Yeni' : 'Güncelle'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="butonlar">
            <button className="btn ikincil" onClick={() => setSatirlar(null)}>
              Geri
            </button>
            <button className="btn" onClick={() => void kaydet()}>
              Onayla ve kaydet
            </button>
          </div>
        </>
      )}
      {el}
    </Modal>
  )
}
