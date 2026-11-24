import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ayarOku, db, type CariHareket, type Musteri, type OdemeSekli } from '../db'
import {
  ODEME_ADI,
  TUR_ADI,
  bakiyeSeyri,
  bugunStr,
  duzeltmeKaydet,
  gunEkle,
  hareketIptal,
  iadeKaydet,
  ozetHesapla,
  sepetHesapla,
  tahsilatKaydet,
  whatsappLinki,
  type SepetKalemi,
} from '../lib/cari'
import { kurusa, miktarYaz, sayiya, tl, tlGirdi } from '../lib/para'
import { Kutu, Modal, UrunGorsel, UrunSecici, tarihYaz, useBildirim, BOS_LISTE } from '../components/Ortak'
import { MusteriFormu, TIP_ADI } from '../components/MusteriFormu'
import { useKullaniciAdi, useOturum } from '../lib/oturum'

type Aralik = 'hepsi' | 'buay' | 'gecenay' | '3ay' | 'ozel'

export default function MusteriDetay() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const { yonetici } = useOturum()
  const kullaniciAdi = useKullaniciAdi()
  const { goster, el } = useBildirim()
  const musteri = useLiveQuery(() => db.musteriler.get(id), [id])
  const hareketler = useLiveQuery(() => db.cariHareketler.where('musteriId').equals(id).toArray(), [id]) ?? BOS_LISTE
  const kalemler = useLiveQuery(async () => {
    const ids = (await db.cariHareketler.where('musteriId').equals(id).primaryKeys()) as number[]
    return db.cariKalemler.where('hareketId').anyOf(ids).toArray()
  }, [id]) ?? BOS_LISTE
  const dukkan = useLiveQuery(() => ayarOku('dukkan', { ad: '' }), [])

  const [modal, setModal] = useState<'tahsilat' | 'duzeltme' | 'iade' | 'duzenle' | null>(null)
  const [acikSatir, setAcikSatir] = useState<number | null>(null)
  const [sekme, setSekme] = useState<'hareket' | 'urun'>('hareket')
  const [aralik, setAralik] = useState<Aralik>('hepsi')
  const [tur, setTur] = useState<string>('hepsi')
  const [ozel, setOzel] = useState({ bas: gunEkle(bugunStr(), -30), son: bugunStr() })
  const [iptalleriGoster, setIptalleriGoster] = useState(true)

  const ozet = useMemo(() => ozetHesapla(hareketler), [hareketler])
  const seyir = useMemo(() => bakiyeSeyri(hareketler), [hareketler])
  const kalemGrup = useMemo(() => {
    const g = new Map<number, typeof kalemler>()
    for (const k of kalemler) g.set(k.hareketId, [...(g.get(k.hareketId) ?? BOS_LISTE), k])
    return g
  }, [kalemler])

  const filtreli = useMemo(() => {
    const bugun = bugunStr()
    const [bas, son] =
      aralik === 'buay'
        ? [bugun.slice(0, 7) + '-01', bugun]
        : aralik === 'gecenay'
          ? (() => {
              const d = new Date()
              d.setDate(0)
              const s = bugunStr(d)
              return [s.slice(0, 7) + '-01', s]
            })()
          : aralik === '3ay'
            ? [gunEkle(bugun, -90), bugun]
            : aralik === 'ozel'
              ? [ozel.bas, ozel.son]
              : ['0000', '9999']
    return seyir
      .filter(({ hareket: h }) => {
        const t = bugunStr(new Date(h.tarih))
        return t >= bas && t <= son && (tur === 'hepsi' || h.tur === tur) && (iptalleriGoster || !h.iptal)
      })
      .reverse()
  }, [seyir, aralik, ozel, tur, iptalleriGoster])

  const urunGecmisi = useMemo(() => {
    const iptalli = new Set(hareketler.filter((h) => h.iptal).map((h) => h.id))
    const turu = new Map(hareketler.map((h) => [h.id, h]))
    const m = new Map<string, { urunId: number | null; ad: string; birim: string; miktar: number; tutar: number; son: string; adet: number }>()
    for (const k of kalemler) {
      const h = turu.get(k.hareketId)
      if (!h || iptalli.has(k.hareketId)) continue
      const isaret = h.tur === 'iade' ? -1 : 1
      const anahtar = k.urunId != null ? `u${k.urunId}` : `a${k.urunAd}`
      const o = m.get(anahtar) ?? { urunId: k.urunId, ad: k.urunAd, birim: k.birim, miktar: 0, tutar: 0, son: '', adet: 0 }
      o.miktar += isaret * k.miktar
      o.tutar += isaret * k.tutar
      if (h.tur === 'satis') {
        o.adet++
        if (h.tarih > o.son) o.son = h.tarih
      }
      m.set(anahtar, o)
    }
    return [...m.values()].sort((a, b) => b.son.localeCompare(a.son))
  }, [kalemler, hareketler])

  if (musteri === undefined) return <div className="sayfa">Yükleniyor…</div>
  if (!musteri) return <div className="sayfa">Müşteri bulunamadı.</div>

  const hatirlatma = () => {
    const ad = dukkan?.ad || 'dükkânımız'
    const metin =
      ozet.vadesiGecen > 0
        ? `Merhaba ${musteri.ad}, ${ad} olarak hatırlatmak isteriz: güncel bakiyeniz ${tl(ozet.bakiye)}, bunun ${tl(ozet.vadesiGecen)} tutarının vadesi geçmiştir. İyi günler dileriz.`
        : `Merhaba ${musteri.ad}, ${ad} olarak bilginize: güncel bakiyeniz ${tl(ozet.bakiye)}. İyi günler dileriz.`
    window.open(whatsappLinki(musteri.telefon, metin), '_blank')
  }

  const iptal = async (h: CariHareket) => {
    const neden = prompt(`${h.belgeNo} (${TUR_ADI[h.tur]}, ${tl(h.borcEtkisi)}) iptal edilecek. İptal nedeni:`)
    if (neden === null) return
    try {
      await hareketIptal(h.id!, neden, kullaniciAdi)
      goster('Kayıt iptal edildi')
    } catch (e) {
      goster(e instanceof Error ? e.message : String(e), 'hata')
    }
  }

  const limitAsildi = musteri.krediLimiti > 0 && ozet.bakiye > musteri.krediLimiti

  return (
    <div className="sayfa">
      <div className="baslik-satir">
        <div>
          <h1>
            {musteri.ad} {!musteri.aktif && <span className="rozet">pasif</span>}
          </h1>
          <div className="musteri-bilgi">
            {musteri.telefon && (
              <a href={`tel:${musteri.telefon.replace(/\s/g, '')}`} className="btn bag">
                📞 {musteri.telefon}
              </a>
            )}
            <span className="rozet">{TIP_ADI[musteri.tip]}</span>
            {musteri.krediLimiti > 0 && <span className={`rozet ${limitAsildi ? 'kirmizi' : ''}`}>Limit {tl(musteri.krediLimiti)}</span>}
            <span className="soluk">Vade {musteri.vadeGun} gün</span>
          </div>
          {musteri.adres && <div className="soluk">{musteri.adres}</div>}
          {musteri.yetkili && <div className="soluk">Yetkili / kefil: {musteri.yetkili}</div>}
          {musteri.not && <div className="not-kutu">{musteri.not}</div>}
        </div>
        <button className="btn bag" onClick={() => setModal('duzenle')}>
          Düzenle
        </button>
      </div>

      <div className="butonlar hizli">
        <button className="btn yesil" onClick={() => setModal('tahsilat')}>
          💵 Tahsilat al
        </button>
        <button className="btn" onClick={() => nav(`/satis/${id}`)}>
          🧾 Yeni veresiye
        </button>
        <button className="btn ikincil" onClick={() => setModal('iade')}>
          ↩ İade
        </button>
        <Link className="btn ikincil" to={`/ekstre/${id}`} target="_blank">
          📄 Ekstre / PDF
        </Link>
        {musteri.telefon && (
          <button className="btn ikincil" onClick={hatirlatma}>
            💬 WhatsApp hatırlat
          </button>
        )}
        {yonetici && (
          <button className="btn ikincil" onClick={() => setModal('duzeltme')}>
            ✎ Düzeltme / indirim
          </button>
        )}
      </div>

      <div className="kutular">
        <Kutu
          etiket="Toplam borç"
          deger={tl(ozet.bakiye)}
          ton={ozet.bakiye < 0 ? 'yesil' : limitAsildi ? 'kirmizi' : undefined}
          alt={ozet.bakiye < 0 ? 'Müşteri alacaklı' : limitAsildi ? 'Kredi limiti aşıldı' : undefined}
        />
        <Kutu etiket="Vadesi geçen" deger={tl(ozet.vadesiGecen)} ton={ozet.vadesiGecen ? 'kirmizi' : undefined} alt={ozet.enEskiGecikme ? `En eski ${ozet.enEskiGecikme} gün` : undefined} />
        <Kutu etiket="Bu ay alınan" deger={tl(ozet.buAyAlinan)} />
        <Kutu etiket="Bu ay ödenen" deger={tl(ozet.buAyOdenen)} ton="yesil" />
        <Kutu etiket="Toplam indirim" deger={tl(ozet.toplamIndirim)} alt={`Toplam alınan ${tl(ozet.toplamAlinan)}`} />
      </div>

      {ozet.bakiye > 0 && (
        <div className="kart yas">
          <strong>Borç yaşı:</strong>
          <span>0–30 gün: {tl(ozet.yas.g0_30)}</span>
          <span>31–60 gün: {tl(ozet.yas.g31_60)}</span>
          <span className={ozet.yas.g61_90 ? 'kirmizi-yazi' : ''}>61–90 gün: {tl(ozet.yas.g61_90)}</span>
          <span className={ozet.yas.g90 ? 'kirmizi-yazi' : ''}>90+ gün: {tl(ozet.yas.g90)}</span>
        </div>
      )}

      <div className="sekmeler">
        <button className={sekme === 'hareket' ? 'aktif' : ''} onClick={() => setSekme('hareket')}>
          Hesap hareketleri ({hareketler.length})
        </button>
        <button className={sekme === 'urun' ? 'aktif' : ''} onClick={() => setSekme('urun')}>
          Aldığı ürünler ({urunGecmisi.length})
        </button>
      </div>

      {sekme === 'hareket' ? (
        <div className="kart">
          <div className="filtreler">
            <select value={aralik} onChange={(e) => setAralik(e.target.value as Aralik)} aria-label="Tarih aralığı">
              <option value="hepsi">Tüm zamanlar</option>
              <option value="buay">Bu ay</option>
              <option value="gecenay">Geçen ay</option>
              <option value="3ay">Son 3 ay</option>
              <option value="ozel">Tarih seç</option>
            </select>
            {aralik === 'ozel' && (
              <>
                <input type="date" value={ozel.bas} onChange={(e) => setOzel({ ...ozel, bas: e.target.value })} aria-label="Başlangıç" />
                <input type="date" value={ozel.son} onChange={(e) => setOzel({ ...ozel, son: e.target.value })} aria-label="Bitiş" />
              </>
            )}
            <select value={tur} onChange={(e) => setTur(e.target.value)} aria-label="Hareket türü">
              <option value="hepsi">Tüm hareketler</option>
              {Object.entries(TUR_ADI).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <label className="onay">
              <input type="checkbox" checked={iptalleriGoster} onChange={(e) => setIptalleriGoster(e.target.checked)} /> İptalleri göster
            </label>
          </div>
          <table className="tablo hareketler">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>İşlem</th>
                <th className="sag">Tutar</th>
                <th className="sag gizle-mobil">İndirim</th>
                <th className="gizle-mobil">Vade</th>
                <th className="sag">Bakiye</th>
              </tr>
            </thead>
            <tbody>
              {filtreli.map(({ hareket: h, bakiye }) => {
                const kl = kalemGrup.get(h.id!) ?? BOS_LISTE
                const acik = acikSatir === h.id
                return (
                  <Fragment key={h.id}>
                    <tr className={`tiklanir ${h.iptal ? 'iptal' : ''}`} onClick={() => setAcikSatir(acik ? null : h.id!)}>
                      <td>{tarihYaz(h.tarih, true)}</td>
                      <td>
                        <span className={`tur tur-${h.tur}`}>{TUR_ADI[h.tur]}</span> <span className="soluk kucuk">{h.belgeNo}</span>
                        {h.iptal && <span className="rozet kirmizi">İPTAL</span>}
                        <div className="soluk kucuk">
                          {kl.length > 0 && `${kl.length} kalem · `}
                          {h.odemeSekli && `${ODEME_ADI[h.odemeSekli]} · `}
                          {h.aciklama}
                        </div>
                      </td>
                      <td className={`sag ${h.borcEtkisi < 0 ? 'yesil-yazi' : ''}`}>{tl(h.borcEtkisi, true)}</td>
                      <td className="sag gizle-mobil soluk">{h.indirim ? tl(h.indirim) : ''}</td>
                      <td className="gizle-mobil">{h.vade ? tarihYaz(h.vade) : ''}</td>
                      <td className="sag">
                        <strong>{tl(bakiye)}</strong>
                      </td>
                    </tr>
                    {acik && (
                      <tr className="detay-satir">
                        <td colSpan={6}>
                          {kl.length > 0 && (
                            <table className="tablo ic">
                              <thead>
                                <tr>
                                  <th></th>
                                  <th>Ürün</th>
                                  <th className="sag">Miktar</th>
                                  <th className="sag">Fiyat</th>
                                  <th className="sag">İndirim</th>
                                  <th className="sag">Tutar</th>
                                </tr>
                              </thead>
                              <tbody>
                                {kl.map((k) => (
                                  <tr key={k.id}>
                                    <td style={{ width: 44 }}>
                                      <UrunGorsel urunId={k.urunId} boyut={36} buyutulebilir />
                                    </td>
                                    <td>
                                      {k.urunAd}
                                      <div className="soluk kucuk">{k.barkod}</div>
                                    </td>
                                    <td className="sag">
                                      {miktarYaz(k.miktar)} {k.birim}
                                    </td>
                                    <td className="sag">
                                      {tl(k.birimFiyat)}
                                      {k.birimFiyat !== k.listeFiyati && <div className="soluk kucuk cizili">{tl(k.listeFiyati)}</div>}
                                    </td>
                                    <td className="sag">{k.indirim ? tl(k.indirim) : ''}</td>
                                    <td className="sag">{tl(k.tutar)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <div className="detay-alt">
                            <span className="soluk kucuk">
                              İşlemi yapan: {h.kullanici}
                              {h.araToplam > 0 && ` · Liste toplamı ${tl(h.araToplam)} · İndirim ${tl(h.indirim)} · Net ${tl(Math.abs(h.borcEtkisi))}`}
                            </span>
                            {h.iptal && (
                              <span className="kirmizi-yazi kucuk">
                                İptal: {h.iptalEden}, {tarihYaz(h.iptalTarihi, true)} — {h.iptalNedeni}
                              </span>
                            )}
                            <span className="butonlar">
                              {(h.tur === 'satis' || h.tur === 'tahsilat') && (
                                <Link className="btn bag kucuk" to={`/fis/${h.id}`} target="_blank">
                                  {h.tur === 'tahsilat' ? 'Makbuz yazdır' : 'Fiş yazdır'}
                                </Link>
                              )}
                              {yonetici && !h.iptal && (
                                <button className="btn bag kucuk kirmizi-yazi" onClick={() => void iptal(h)}>
                                  İptal et
                                </button>
                              )}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {filtreli.length === 0 && <p className="soluk">Bu aralıkta hareket yok.</p>}
        </div>
      ) : (
        <div className="kart">
          <table className="tablo">
            <thead>
              <tr>
                <th></th>
                <th>Ürün</th>
                <th className="sag">Toplam miktar</th>
                <th className="sag gizle-mobil">Toplam tutar</th>
                <th className="sag">Son alış</th>
              </tr>
            </thead>
            <tbody>
              {urunGecmisi.map((u) => (
                <tr key={`${u.urunId}-${u.ad}`}>
                  <td style={{ width: 44 }}>
                    <UrunGorsel urunId={u.urunId} boyut={36} buyutulebilir />
                  </td>
                  <td>
                    {u.urunId ? <Link to={`/urun/${u.urunId}`}>{u.ad}</Link> : u.ad}
                    <div className="soluk kucuk">{u.adet} kez alındı</div>
                  </td>
                  <td className="sag">
                    {miktarYaz(u.miktar)} {u.birim}
                  </td>
                  <td className="sag gizle-mobil">{tl(u.tutar)}</td>
                  <td className="sag soluk">{tarihYaz(u.son)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === 'tahsilat' && <TahsilatModal musteri={musteri} bakiye={ozet.bakiye} kapat={() => setModal(null)} bildir={goster} />}
      {modal === 'duzeltme' && <DuzeltmeModal musteri={musteri} kapat={() => setModal(null)} bildir={goster} />}
      {modal === 'iade' && <IadeModal musteri={musteri} kapat={() => setModal(null)} bildir={goster} />}
      {modal === 'duzenle' && <MusteriFormu musteri={musteri} kapat={() => setModal(null)} />}
      {el}
    </div>
  )
}

type Bildir = (m: string, t?: 'ok' | 'hata') => void

function TahsilatModal({ musteri, bakiye, kapat, bildir }: { musteri: Musteri; bakiye: number; kapat: () => void; bildir: Bildir }) {
  const kullanici = useKullaniciAdi()
  const [tutar, setTutar] = useState('')
  const [sekil, setSekil] = useState<OdemeSekli>('nakit')
  const [aciklama, setAciklama] = useState('')
  const [tarih, setTarih] = useState(bugunStr())
  const [makbuz, setMakbuz] = useState(true)
  const [hata, setHata] = useState('')
  const [calisiyor, setCalisiyor] = useState(false)
  const k = kurusa(tutar)

  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (Number.isNaN(k) || k <= 0) return setHata('Geçerli bir tutar girin')
    if (k > bakiye && bakiye > 0 && !confirm(`Tahsilat (${tl(k)}) borçtan (${tl(bakiye)}) fazla. Fazlası müşterinin alacağı olarak kalacak. Devam edilsin mi?`)) return
    setCalisiyor(true)
    try {
      const id = await tahsilatKaydet({
        musteriId: musteri.id!,
        tutar: k,
        odemeSekli: sekil,
        aciklama,
        kullanici,
        tarih: tarih === bugunStr() ? undefined : new Date(tarih + 'T12:00:00').toISOString(),
      })
      bildir(`${tl(k)} tahsilat kaydedildi`)
      if (makbuz) window.open(`#/fis/${id}`, '_blank')
      kapat()
    } catch (err) {
      setHata(err instanceof Error ? err.message : String(err))
    } finally {
      setCalisiyor(false)
    }
  }

  return (
    <Modal baslik={`Tahsilat — ${musteri.ad}`} kapat={kapat}>
      <form className="form" onSubmit={kaydet}>
        <p>
          Güncel borç: <strong>{tl(bakiye)}</strong>
          {bakiye > 0 && (
            <button type="button" className="btn bag kucuk" onClick={() => setTutar(tlGirdi(bakiye))}>
              Tamamını yaz
            </button>
          )}
        </p>
        <label>
          Tutar (₺)
          <input value={tutar} onChange={(e) => setTutar(e.target.value)} inputMode="decimal" autoFocus className="buyuk-girdi" />
        </label>
        <div className="secenekler">
          {(Object.keys(ODEME_ADI) as OdemeSekli[]).map((s) => (
            <button type="button" key={s} className={`btn ${sekil === s ? '' : 'ikincil'}`} onClick={() => setSekil(s)}>
              {ODEME_ADI[s]}
            </button>
          ))}
        </div>
        <div className="izgara-2">
          <label>
            Tarih
            <input type="date" value={tarih} max={bugunStr()} onChange={(e) => setTarih(e.target.value)} />
          </label>
          <label>
            Açıklama
            <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
          </label>
        </div>
        <label className="onay">
          <input type="checkbox" checked={makbuz} onChange={(e) => setMakbuz(e.target.checked)} /> Kaydettikten sonra makbuzu aç
        </label>
        {!Number.isNaN(k) && k > 0 && <p>Kalan borç: <strong>{tl(bakiye - k)}</strong></p>}
        {hata && <p className="uyari">{hata}</p>}
        <button className="btn yesil" disabled={calisiyor}>
          Tahsilatı kaydet
        </button>
      </form>
    </Modal>
  )
}

function DuzeltmeModal({ musteri, kapat, bildir }: { musteri: Musteri; kapat: () => void; bildir: Bildir }) {
  const kullanici = useKullaniciAdi()
  const [yon, setYon] = useState<'azalt' | 'arttir'>('azalt')
  const [tutar, setTutar] = useState('')
  const [aciklama, setAciklama] = useState('')
  const [hata, setHata] = useState('')
  const kaydet = async (e: React.FormEvent) => {
    e.preventDefault()
    const k = kurusa(tutar)
    if (Number.isNaN(k) || k <= 0) return setHata('Geçerli bir tutar girin')
    try {
      await duzeltmeKaydet({
        musteriId: musteri.id!,
        tutar: yon === 'azalt' ? -k : k,
        aciklama,
        kullanici,
        vade: gunEkle(bugunStr(), musteri.vadeGun),
      })
      bildir('Düzeltme kaydedildi')
      kapat()
    } catch (err) {
      setHata(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <Modal baslik={`Düzeltme — ${musteri.ad}`} kapat={kapat}>
      <form className="form" onSubmit={kaydet}>
        <div className="secenekler">
          <button type="button" className={`btn ${yon === 'azalt' ? '' : 'ikincil'}`} onClick={() => setYon('azalt')}>
            Borcu azalt (indirim)
          </button>
          <button type="button" className={`btn ${yon === 'arttir' ? '' : 'ikincil'}`} onClick={() => setYon('arttir')}>
            Borcu arttır
          </button>
        </div>
        <label>
          Tutar (₺)
          <input value={tutar} onChange={(e) => setTutar(e.target.value)} inputMode="decimal" autoFocus />
        </label>
        <label>
          Açıklama (zorunlu)
          <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} placeholder="Ör. yuvarlama indirimi, eski defter farkı" />
        </label>
        {hata && <p className="uyari">{hata}</p>}
        <button className="btn">Kaydet</button>
      </form>
    </Modal>
  )
}

function IadeModal({ musteri, kapat, bildir }: { musteri: Musteri; kapat: () => void; bildir: Bildir }) {
  const kullanici = useKullaniciAdi()
  const [kalemler, setKalemler] = useState<SepetKalemi[]>([])
  const [aciklama, setAciklama] = useState('')
  const [stoga, setStoga] = useState(true)
  const [hata, setHata] = useState('')
  // Müşterinin son satış fiyatlarını öner
  const sonFiyatlar = useLiveQuery(async () => {
    const satislar = await db.cariHareketler.where('musteriId').equals(musteri.id!).filter((h) => h.tur === 'satis' && !h.iptal).toArray()
    const kl = await db.cariKalemler.where('hareketId').anyOf(satislar.map((s) => s.id!)).toArray()
    const m = new Map<number, number>()
    for (const k of kl) if (k.urunId != null) m.set(k.urunId, k.miktar ? Math.round((k.tutar / k.miktar)) : k.birimFiyat)
    return m
  }, [musteri.id])
  const h = sepetHesapla(kalemler, 0)

  const kaydet = async () => {
    try {
      await iadeKaydet({ musteriId: musteri.id!, kalemler, aciklama, kullanici, stogaDondur: stoga })
      bildir(`${tl(h.net)} iade kaydedildi`)
      kapat()
    } catch (e) {
      setHata(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal baslik={`İade — ${musteri.ad}`} kapat={kapat} genis>
      <UrunSecici
        sec={(u) =>
          setKalemler((l) => {
            const i = l.findIndex((k) => k.urunId === u.id)
            if (i >= 0) return l.map((k, j) => (j === i ? { ...k, miktar: k.miktar + 1 } : k))
            const fiyat = sonFiyatlar?.get(u.id!) ?? u.satisFiyati
            return [...l, { urunId: u.id!, urunAd: u.ad, barkod: u.barkod, birim: u.birim, miktar: 1, listeFiyati: fiyat, birimFiyat: fiyat, indirim: 0 }]
          })
        }
      />
      <p className="soluk kucuk">Fiyat olarak müşterinin bu ürünü son aldığı (indirimli) birim fiyat önerilir.</p>
      <table className="tablo">
        <tbody>
          {kalemler.map((k, i) => (
            <tr key={i}>
              <td>{k.urunAd}</td>
              <td style={{ width: 90 }}>
                <input
                  value={k.miktar}
                  inputMode="decimal"
                  onChange={(e) => setKalemler(kalemler.map((x, j) => (j === i ? { ...x, miktar: sayiya(e.target.value) || 0 } : x)))}
                  aria-label="Miktar"
                />
              </td>
              <td style={{ width: 120 }}>
                <input
                  defaultValue={tlGirdi(k.birimFiyat)}
                  inputMode="decimal"
                  onBlur={(e) => {
                    const v = kurusa(e.target.value)
                    if (!Number.isNaN(v)) setKalemler(kalemler.map((x, j) => (j === i ? { ...x, birimFiyat: v, listeFiyati: v } : x)))
                  }}
                  aria-label="Birim fiyat"
                />
              </td>
              <td className="sag">{tl(Math.round(k.miktar * k.birimFiyat))}</td>
              <td>
                <button className="btn bag" onClick={() => setKalemler(kalemler.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <label>
        Açıklama
        <input value={aciklama} onChange={(e) => setAciklama(e.target.value)} />
      </label>
      <label className="onay">
        <input type="checkbox" checked={stoga} onChange={(e) => setStoga(e.target.checked)} /> İade edilen ürünler stoğa geri girsin
      </label>
      <p>
        İade tutarı: <strong>{tl(h.net)}</strong> (borçtan düşülecek)
      </p>
      {hata && <p className="uyari">{hata}</p>}
      <button className="btn" disabled={!kalemler.length} onClick={() => void kaydet()}>
        İadeyi kaydet
      </button>
    </Modal>
  )
}
