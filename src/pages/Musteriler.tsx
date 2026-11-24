import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { readSheet } from 'read-excel-file/browser'
import writeExcelFile from 'write-excel-file/browser'
import { db } from '../db'
import { bugunStr, devirKaydet, tumOzetler } from '../lib/cari'
import { kurusa, tl } from '../lib/para'
import { Kutu, Modal, musteriAra, tarihYaz, useBildirim } from '../components/Ortak'
import { MusteriFormu, TIP_ADI, bosMusteri } from '../components/MusteriFormu'
import { useKullaniciAdi, useOturum } from '../lib/oturum'

type Filtre = 'hepsi' | 'borclu' | 'geciken' | 'limit'
type Siralama = 'ad' | 'bakiye' | 'gecikme' | 'son'

export default function Musteriler() {
  const [q, setQ] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('borclu')
  const [sira, setSira] = useState<Siralama>('bakiye')
  const [yeni, setYeni] = useState(false)
  const [devir, setDevir] = useState(false)
  const [pasif, setPasif] = useState(false)
  const nav = useNavigate()
  const veri = useLiveQuery(async () => ({ musteriler: await db.musteriler.toArray(), ozetler: await tumOzetler() }), [])

  const liste = useMemo(() => {
    if (!veri) return []
    let l = musteriAra(
      veri.musteriler.filter((m) => pasif || m.aktif),
      q,
    ).map((m) => ({ m, o: veri.ozetler.get(m.id!) }))
    if (filtre === 'borclu') l = l.filter((x) => (x.o?.bakiye ?? 0) > 0)
    if (filtre === 'geciken') l = l.filter((x) => (x.o?.vadesiGecen ?? 0) > 0)
    if (filtre === 'limit') l = l.filter((x) => x.m.krediLimiti > 0 && (x.o?.bakiye ?? 0) > x.m.krediLimiti)
    const k = {
      ad: (a: (typeof l)[0], b: (typeof l)[0]) => a.m.ad.localeCompare(b.m.ad, 'tr'),
      bakiye: (a: (typeof l)[0], b: (typeof l)[0]) => (b.o?.bakiye ?? 0) - (a.o?.bakiye ?? 0),
      gecikme: (a: (typeof l)[0], b: (typeof l)[0]) => (b.o?.enEskiGecikme ?? 0) - (a.o?.enEskiGecikme ?? 0),
      son: (a: (typeof l)[0], b: (typeof l)[0]) => (b.o?.sonIslem ?? '').localeCompare(a.o?.sonIslem ?? ''),
    }[sira]
    return l.sort(k)
  }, [veri, q, filtre, sira, pasif])

  if (!veri) return null
  const toplam = liste.reduce(
    (t, x) => ({ bakiye: t.bakiye + Math.max(0, x.o?.bakiye ?? 0), gecen: t.gecen + (x.o?.vadesiGecen ?? 0) }),
    { bakiye: 0, gecen: 0 },
  )

  const disaAktar = async () => {
    await writeExcelFile([
      ['Müşteri', 'Telefon', 'Tip', 'Bakiye (₺)', 'Vadesi geçen (₺)', 'En eski gecikme (gün)', 'Son işlem', 'Son ödeme', 'Kredi limiti (₺)'],
      ...liste.map(({ m, o }) => [
        m.ad,
        m.telefon,
        TIP_ADI[m.tip],
        (o?.bakiye ?? 0) / 100,
        (o?.vadesiGecen ?? 0) / 100,
        o?.enEskiGecikme ?? 0,
        tarihYaz(o?.sonIslem),
        tarihYaz(o?.sonOdeme),
        m.krediLimiti / 100,
      ]),
    ]).toFile(`veresiye-listesi-${bugunStr()}.xlsx`)
  }

  return (
    <div className="sayfa">
      <div className="baslik-satir">
        <h1>Veresiye Defteri</h1>
        <div className="butonlar">
          <button className="btn ikincil" onClick={() => setDevir(true)}>
            Eski defteri aktar
          </button>
          <button className="btn ikincil" onClick={() => void disaAktar()}>
            Excel'e aktar
          </button>
          <button className="btn" onClick={() => setYeni(true)}>
            + Yeni müşteri
          </button>
        </div>
      </div>
      <div className="kutular">
        <Kutu etiket="Listelenen bakiye" deger={tl(toplam.bakiye)} />
        <Kutu etiket="Vadesi geçen" deger={tl(toplam.gecen)} ton={toplam.gecen ? 'kirmizi' : undefined} />
        <Kutu etiket="Müşteri" deger={liste.length} />
      </div>
      <div className="kart">
        <div className="filtreler">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Müşteri adı veya telefon" aria-label="Müşteri ara" autoFocus />
          <select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)} aria-label="Filtre">
            <option value="hepsi">Tüm müşteriler</option>
            <option value="borclu">Borcu olanlar</option>
            <option value="geciken">Vadesi geçenler</option>
            <option value="limit">Limiti aşanlar</option>
          </select>
          <select value={sira} onChange={(e) => setSira(e.target.value as Siralama)} aria-label="Sıralama">
            <option value="bakiye">En çok borçlu</option>
            <option value="gecikme">En uzun gecikme</option>
            <option value="son">Son işlem</option>
            <option value="ad">Ada göre</option>
          </select>
          <label className="onay">
            <input type="checkbox" checked={pasif} onChange={(e) => setPasif(e.target.checked)} /> Pasifleri göster
          </label>
        </div>
        <table className="tablo">
          <thead>
            <tr>
              <th>Müşteri</th>
              <th className="sag">Bakiye</th>
              <th className="sag gizle-mobil">Vadesi geçen</th>
              <th className="sag gizle-mobil">Son işlem</th>
            </tr>
          </thead>
          <tbody>
            {liste.map(({ m, o }) => (
              <tr key={m.id} className="tiklanir" onClick={() => nav(`/musteri/${m.id}`)}>
                <td>
                  <Link to={`/musteri/${m.id}`} onClick={(e) => e.stopPropagation()}>
                    {m.ad}
                  </Link>
                  {!m.aktif && <span className="rozet">pasif</span>}
                  {m.krediLimiti > 0 && (o?.bakiye ?? 0) > m.krediLimiti && <span className="rozet kirmizi">limit aşıldı</span>}
                  <div className="soluk kucuk">{m.telefon}</div>
                </td>
                <td className={`sag ${(o?.bakiye ?? 0) < 0 ? 'yesil-yazi' : ''}`}>
                  <strong>{tl(o?.bakiye ?? 0)}</strong>
                </td>
                <td className="sag gizle-mobil kirmizi-yazi">
                  {o?.vadesiGecen ? (
                    <>
                      {tl(o.vadesiGecen)} <span className="kucuk">({o.enEskiGecikme} gün)</span>
                    </>
                  ) : (
                    ''
                  )}
                </td>
                <td className="sag gizle-mobil soluk">{tarihYaz(o?.sonIslem)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {liste.length === 0 && <p className="soluk">Bu filtreye uyan müşteri yok.</p>}
      </div>
      {yeni && <MusteriFormu musteri={bosMusteri()} kapat={() => setYeni(false)} kaydedildi={(id) => nav(`/musteri/${id}`)} />}
      {devir && <DevirAktar kapat={() => setDevir(false)} />}
    </div>
  )
}

interface DevirSatiri {
  satir: number
  ad: string
  telefon: string
  bakiye: number
  tarih: string
  vade: string | null
  not: string
  mevcutId: number | null
  hata: string
}

function excelTarih(v: unknown): string | null {
  if (v instanceof Date) return bugunStr(v)
  if (typeof v === 'string' && v.trim()) {
    const m = v.trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    if (/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim()
  }
  return null
}

const DEVIR_BASLIK = ['Müşteri', 'Telefon', 'Bakiye', 'Son İşlem Tarihi', 'Vade', 'Not']

function DevirAktar({ kapat }: { kapat: () => void }) {
  const { yonetici } = useOturum()
  const kullanici = useKullaniciAdi()
  const dosya = useRef<HTMLInputElement>(null)
  const [satirlar, setSatirlar] = useState<DevirSatiri[] | null>(null)
  const [calisiyor, setCalisiyor] = useState(false)
  const { goster, el } = useBildirim()

  const sablon = () =>
    writeExcelFile([DEVIR_BASLIK, ['Ahmet Usta', '0532 000 00 00', 4250.5, '15.10.2026', '15.11.2026', 'Ay başı öder']]).toFile('veresiye-devir-sablonu.xlsx')

  const oku = async (f: File) => {
    const [baslik, ...govde] = await readSheet(f)
    const idx = (ad: string) => baslik.findIndex((b) => String(b ?? '').trim().toLocaleLowerCase('tr-TR') === ad.toLocaleLowerCase('tr-TR'))
    const i = Object.fromEntries(DEVIR_BASLIK.map((b) => [b, idx(b)]))
    if (i['Müşteri'] < 0 || i['Bakiye'] < 0) return goster('İlk satırda "Müşteri" ve "Bakiye" sütunları olmalı. Şablonu kullanın.', 'hata')
    const musteriler = await db.musteriler.toArray()
    const al = (r: unknown[], ad: string) => (i[ad] >= 0 ? r[i[ad]] : null)
    setSatirlar(
      govde
        .filter((r) => r.some((c) => c != null && String(c).trim() !== ''))
        .map((r, n) => {
          const ad = String(al(r, 'Müşteri') ?? '').trim()
          const bakiyeHam = al(r, 'Bakiye')
          const bakiye = bakiyeHam == null || bakiyeHam === '' ? NaN : kurusa(bakiyeHam as string | number)
          const tarih = excelTarih(al(r, 'Son İşlem Tarihi')) ?? bugunStr()
          const mevcut = musteriler.find((m) => m.ad.toLocaleLowerCase('tr-TR') === ad.toLocaleLowerCase('tr-TR'))
          return {
            satir: n + 2,
            ad,
            telefon: String(al(r, 'Telefon') ?? '').trim(),
            bakiye,
            tarih,
            vade: excelTarih(al(r, 'Vade')),
            not: String(al(r, 'Not') ?? '').trim(),
            mevcutId: mevcut?.id ?? null,
            hata: !ad ? 'Ad boş' : Number.isNaN(bakiye) ? 'Bakiye hatalı' : bakiye === 0 ? 'Bakiye sıfır' : '',
          }
        }),
    )
  }

  const kaydet = async () => {
    if (!satirlar) return
    setCalisiyor(true)
    try {
      let n = 0
      for (const s of satirlar.filter((x) => !x.hata)) {
        let id = s.mevcutId
        if (!id) {
          id = (await db.musteriler.add({
            ad: s.ad,
            telefon: s.telefon,
            adres: '',
            tip: 'bireysel',
            krediLimiti: 0,
            vadeGun: 30,
            yetkili: '',
            not: s.not,
            aktif: true,
            olusturma: new Date().toISOString(),
          })) as number
        }
        await devirKaydet({ musteriId: id, tutar: s.bakiye, tarih: s.tarih, vade: s.vade, aciklama: s.not ? `Eski defterden devir — ${s.not}` : '', kullanici })
        n++
      }
      goster(`${n} müşterinin devir bakiyesi aktarıldı`)
      setTimeout(kapat, 1200)
    } catch (e) {
      goster(e instanceof Error ? e.message : String(e), 'hata')
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <Modal baslik="Kâğıt defterdeki veresiyeleri aktar" kapat={kapat} genis>
      {!yonetici ? (
        <p className="uyari">Devir aktarımını sadece yönetici yapabilir.</p>
      ) : !satirlar ? (
        <>
          <p>
            Her müşteri için bugünkü toplam borcu bir satıra yazın. Sütunlar: <strong>{DEVIR_BASLIK.join(', ')}</strong>. Müşteri ve Bakiye zorunlu; diğerleri boş kalabilir.
          </p>
          <p className="soluk">Aynı isimde kayıtlı müşteri varsa bakiye onun hesabına eklenir, yoksa yeni müşteri açılır. Vade boşsa son işlem tarihi vade sayılır.</p>
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
            <span className="rozet yesil">{satirlar.filter((s) => !s.hata && !s.mevcutId).length} yeni müşteri</span>{' '}
            <span className="rozet sari">{satirlar.filter((s) => !s.hata && s.mevcutId).length} mevcut müşteriye eklenecek</span>{' '}
            <span className="rozet kirmizi">{satirlar.filter((s) => s.hata).length} hatalı (atlanacak)</span>
          </p>
          <p>
            Toplam aktarılacak bakiye: <strong>{tl(satirlar.filter((s) => !s.hata).reduce((t, s) => t + s.bakiye, 0))}</strong>
          </p>
          <div className="kaydirma">
            <table className="tablo">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Müşteri</th>
                  <th className="sag">Bakiye</th>
                  <th>Tarih</th>
                  <th>Durum</th>
                </tr>
              </thead>
              <tbody>
                {satirlar.map((s) => (
                  <tr key={s.satir} className={s.hata ? 'satir-hata' : ''}>
                    <td>{s.satir}</td>
                    <td>{s.ad}</td>
                    <td className="sag">{Number.isNaN(s.bakiye) ? '?' : tl(s.bakiye)}</td>
                    <td>{tarihYaz(s.tarih)}</td>
                    <td>{s.hata || (s.mevcutId ? 'Mevcut müşteri' : 'Yeni müşteri')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="butonlar">
            <button className="btn ikincil" onClick={() => setSatirlar(null)}>
              Geri
            </button>
            <button className="btn" disabled={calisiyor} onClick={() => void kaydet()}>
              {calisiyor ? 'Aktarılıyor…' : 'Onayla ve aktar'}
            </button>
          </div>
        </>
      )}
      {el}
    </Modal>
  )
}
