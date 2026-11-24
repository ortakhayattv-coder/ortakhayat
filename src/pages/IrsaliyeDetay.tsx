import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Irsaliye, type IrsaliyeKalemi, type Urun } from '../db'
import { birimCarpani, irsaliyeOnayla } from '../lib/stok'
import { miktarYaz, sayiya } from '../lib/para'
import { Modal, UrunGorsel, UrunSecici, tarihYaz, useBildirim, BOS_LISTE } from '../components/Ortak'
import { FotoKucuk } from './Irsaliyeler'
import { useKullaniciAdi } from '../lib/oturum'

export default function IrsaliyeDetay() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const kullanici = useKullaniciAdi()
  const { goster, el } = useBildirim()
  const irs = useLiveQuery(() => db.irsaliyeler.get(id), [id])
  const kalemler = useLiveQuery(() => db.irsaliyeKalemleri.where('irsaliyeId').equals(id).toArray(), [id]) ?? BOS_LISTE
  const urunler = useLiveQuery(async () => {
    const ids = [...new Set(kalemler.map((k) => k.urunId).filter((x): x is number => x != null))]
    const l = await db.urunler.bulkGet(ids)
    return new Map(l.filter((u): u is Urun => !!u).map((u) => [u.id!, u]))
  }, [kalemler])
  const ayniNo = useLiveQuery(
    async () =>
      irs?.irsaliyeNo ? (await db.irsaliyeler.where('irsaliyeNo').equals(irs.irsaliyeNo).toArray()).filter((x) => x.id !== id && x.tedarikci === irs.tedarikci) : [],
    [irs?.irsaliyeNo, irs?.tedarikci, id],
  )
  const [secilecek, setSecilecek] = useState<IrsaliyeKalemi | null>(null)
  const [okutmaModu, setOkutmaModu] = useState(false)
  const bekleyen = useRef(new Set<Promise<unknown>>())

  if (irs === undefined) return <div className="sayfa">Yükleniyor…</div>
  if (!irs) return <div className="sayfa">İrsaliye bulunamadı.</div>
  const taslak = irs.durum === 'taslak'
  const baslikGuncelle = (p: Partial<Irsaliye>) => db.irsaliyeler.update(id, p)
  /**
   * Satırı veritabanındaki EN GÜNCEL hâli üzerinden günceller. Miktar, birim veya ürün değişirse
   * stoğa girecek miktar yeniden hesaplanır (art arda hızlı değişikliklerde eski değer yazılmasın diye).
   */
  const kalemGuncelle = (k: IrsaliyeKalemi, p: Partial<IrsaliyeKalemi>) => {
    const is = db.transaction('rw', db.irsaliyeKalemleri, db.urunler, async () => {
      const guncel = await db.irsaliyeKalemleri.get(k.id!)
      if (!guncel) return
      const y = { ...guncel, ...p }
      if (('miktar' in p || 'birim' in p || 'urunId' in p) && !('stokMiktari' in p)) {
        const u = y.urunId != null ? await db.urunler.get(y.urunId) : undefined
        y.stokMiktari = u ? y.miktar * birimCarpani(u, y.birim) : y.miktar
      }
      await db.irsaliyeKalemleri.put(y)
    })
    bekleyen.current.add(is)
    void is.finally(() => bekleyen.current.delete(is))
    return is
  }

  const urunAta = async (k: IrsaliyeKalemi, u: Urun) => {
    await kalemGuncelle(k, { urunId: u.id! })
    setSecilecek(null)
  }

  const okut = async (u: Urun) => {
    const k = kalemler.find((x) => x.urunId === u.id)
    if (k) {
      await db.irsaliyeKalemleri.where('id').equals(k.id!).modify((x) => void (x.okutulan += 1))
    } else {
      await db.irsaliyeKalemleri.add({ irsaliyeId: id, okunanAd: u.ad, okunanKod: u.kod, urunId: u.id!, miktar: 0, birim: u.birim, stokMiktari: 0, okutulan: 1 })
      goster(`${u.ad} irsaliyede yok — fazla gelen olarak eklendi`, 'hata')
    }
  }

  const onayla = async () => {
    // Henüz bitmemiş satır güncellemeleri varsa önce onların yazılmasını bekle
    await Promise.allSettled([...bekleyen.current])
    const eksikFazla = okutmaModu ? kalemler.filter((k) => k.okutulan !== k.stokMiktari) : []
    if (eksikFazla.length && !confirm(`${eksikFazla.length} satırda okutulan miktar irsaliyeyle tutmuyor. Yine de irsaliyedeki miktarlarla stoğa işlensin mi?`)) return
    if (!confirm(`${kalemler.length} kalem stoğa eklenecek. Onaylıyor musunuz?`)) return
    try {
      await irsaliyeOnayla(id, kullanici)
      goster('İrsaliye stoğa işlendi')
    } catch (e) {
      goster(e instanceof Error ? e.message : String(e), 'hata')
    }
  }

  const eslesen = kalemler.filter((k) => k.urunId != null).length

  return (
    <div className="sayfa">
      <div className="baslik-satir">
        <h1>İrsaliye {irs.irsaliyeNo && `#${irs.irsaliyeNo}`}</h1>
        {taslak ? <span className="rozet sari">Taslak — stoğa işlenmedi</span> : <span className="rozet yesil">Stoğa işlendi {tarihYaz(irs.onayTarihi, true)}</span>}
      </div>

      <section className="kart">
        <div className="izgara-3">
          <label>
            Tedarikçi
            <input value={irs.tedarikci} disabled={!taslak} onChange={(e) => void baslikGuncelle({ tedarikci: e.target.value })} />
          </label>
          <label>
            İrsaliye no
            <input value={irs.irsaliyeNo} disabled={!taslak} onChange={(e) => void baslikGuncelle({ irsaliyeNo: e.target.value })} />
          </label>
          <label>
            Tarih
            <input type="date" value={irs.tarih} disabled={!taslak} onChange={(e) => void baslikGuncelle({ tarih: e.target.value })} />
          </label>
        </div>
        {ayniNo && ayniNo.length > 0 && (
          <div className="uyari-bant">
            Bu tedarikçiden aynı numaralı irsaliye daha önce girilmiş:{' '}
            {ayniNo.map((x) => (
              <Link key={x.id} to={`/irsaliye/${x.id}`}>
                {tarihYaz(x.tarih)} ({x.durum === 'onaylandi' ? 'stoğa işlenmiş' : 'taslak'}){' '}
              </Link>
            ))}
          </div>
        )}
        {irs.not && <div className="not-kutu">Okuma notu: {irs.not}</div>}
        {irs.fotolar.length > 0 && (
          <div className="foto-izgara">
            {irs.fotolar.map((f, i) => (
              <FotoKucuk key={i} blob={f} />
            ))}
          </div>
        )}
      </section>

      {taslak && (
        <section className="kart">
          <label className="onay">
            <input type="checkbox" checked={okutmaModu} onChange={(e) => setOkutmaModu(e.target.checked)} /> Kolilerden çıkan ürünleri barkodla tek tek okutarak kontrol et
          </label>
          {okutmaModu && <UrunSecici sec={(u) => void okut(u)} yerTutucu="Koliden çıkan ürünün barkodunu okutun" />}
        </section>
      )}

      <section className="kart">
        <div className="baslik-satir">
          <h2>
            Kalemler <span className="soluk kucuk">({eslesen}/{kalemler.length} eşleşti)</span>
          </h2>
          {taslak && (
            <button
              className="btn ikincil"
              onClick={() => void db.irsaliyeKalemleri.add({ irsaliyeId: id, okunanAd: '', okunanKod: '', urunId: null, miktar: 1, birim: 'adet', stokMiktari: 1, okutulan: 0 })}
            >
              + Satır ekle
            </button>
          )}
        </div>
        <div className="irs-kalemler">
          {kalemler.map((k) => {
            const u = k.urunId ? urunler?.get(k.urunId) : undefined
            const tutmuyor = okutmaModu && k.okutulan !== k.stokMiktari
            return (
              <div key={k.id} className={`irs-kalem ${u ? 'eslesti' : 'eslesmedi'}`}>
                <div className="irs-okunan">
                  <div className="soluk kucuk">İrsaliyede yazan</div>
                  {taslak ? (
                    <input value={k.okunanAd} placeholder="Ürün adı" onChange={(e) => void kalemGuncelle(k, { okunanAd: e.target.value })} />
                  ) : (
                    <div>{k.okunanAd}</div>
                  )}
                  {k.okunanKod && <div className="soluk kucuk">Kod: {k.okunanKod}</div>}
                </div>
                <div className="irs-urun">
                  <div className="soluk kucuk">Stoktaki ürün</div>
                  {u ? (
                    <div className="secici-satir">
                      <UrunGorsel urunId={u.id} boyut={40} buyutulebilir />
                      <div className="esnek-1">
                        <Link to={`/urun/${u.id}`}>{u.ad}</Link>
                        <div className="soluk kucuk">
                          Mevcut stok {miktarYaz(u.stok)} {u.birim}
                        </div>
                      </div>
                      {taslak && (
                        <button className="btn bag kucuk" onClick={() => setSecilecek(k)}>
                          Değiştir
                        </button>
                      )}
                    </div>
                  ) : (
                    <button className="btn kucuk" onClick={() => setSecilecek(k)}>
                      Ürün seç / eşleştir
                    </button>
                  )}
                </div>
                <div className="irs-miktar">
                  <label>
                    <span className="soluk kucuk">Miktar</span>
                    <div className="secici-satir">
                      <input
                        value={k.miktar}
                        disabled={!taslak}
                        inputMode="decimal"
                        onChange={(e) => {
                          void kalemGuncelle(k, { miktar: sayiya(e.target.value) || 0 })
                        }}
                      />
                      <input
                        value={k.birim}
                        disabled={!taslak}
                        style={{ width: 70 }}
                        onChange={(e) => void kalemGuncelle(k, { birim: e.target.value })}
                        aria-label="Birim"
                      />
                    </div>
                  </label>
                  {u && k.birim.trim().toLocaleLowerCase('tr-TR') !== u.birim.toLocaleLowerCase('tr-TR') && (
                    <label>
                      <span className="soluk kucuk">Stoğa girecek ({u.birim})</span>
                      <input
                        value={k.stokMiktari}
                        disabled={!taslak}
                        inputMode="decimal"
                        onChange={(e) => void kalemGuncelle(k, { stokMiktari: sayiya(e.target.value) || 0 })}
                      />
                    </label>
                  )}
                  {okutmaModu && (
                    <div className={tutmuyor ? 'kirmizi-yazi' : 'yesil-yazi'}>
                      Okutulan: {miktarYaz(k.okutulan)} / {miktarYaz(k.stokMiktari)}
                      {tutmuyor && (k.okutulan < k.stokMiktari ? ' (eksik)' : ' (fazla)')}
                    </div>
                  )}
                </div>
                {taslak && (
                  <button className="btn bag" onClick={() => void db.irsaliyeKalemleri.delete(k.id!)} aria-label="Satırı sil">
                    ✕
                  </button>
                )}
              </div>
            )
          })}
          {kalemler.length === 0 && <p className="soluk">Henüz satır yok. “Satır ekle” ile veya barkod okutarak ekleyin.</p>}
        </div>
      </section>

      {taslak && (
        <div className="butonlar">
          <button
            className="btn bag kirmizi-yazi"
            onClick={async () => {
              if (!confirm('Bu taslak irsaliye silinsin mi? (Stok etkilenmez)')) return
              await db.transaction('rw', db.irsaliyeler, db.irsaliyeKalemleri, async () => {
                await db.irsaliyeKalemleri.where('irsaliyeId').equals(id).delete()
                await db.irsaliyeler.delete(id)
              })
              nav('/irsaliye')
            }}
          >
            Taslağı sil
          </button>
          <button className="btn buyuk" disabled={!kalemler.length || eslesen < kalemler.length} onClick={() => void onayla()}>
            Onayla ve stoğa ekle
          </button>
        </div>
      )}
      {taslak && eslesen < kalemler.length && <p className="soluk">Onaylamak için tüm satırları bir ürünle eşleştirin. Stokta olmayan ürünler için “Ürün seç” penceresinden yeni ürün açabilirsiniz.</p>}

      {secilecek && (
        <Modal baslik={`Eşleştir: ${secilecek.okunanAd || 'yeni satır'}`} kapat={() => setSecilecek(null)} genis>
          <UrunSecici sec={(u) => void urunAta(secilecek, u)} />
          <p className="soluk kucuk">Seçiminiz bu tedarikçi için hatırlanır; bir dahaki irsaliyede otomatik eşleşir.</p>
          <Link className="btn ikincil" to={`/urun/yeni`} target="_blank">
            Listede yok — yeni ürün aç (yeni sekmede)
          </Link>
        </Modal>
      )}
      {el}
    </div>
  )
}
