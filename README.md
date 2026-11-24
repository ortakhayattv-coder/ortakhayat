# Ortak Hayat — Stok ve Veresiye

Elektrik malzemeleri dükkânı için stok, barkod, veresiye defteri ve irsaliyeden toplu stok girişi uygulaması.
Telefonda ve bilgisayarda tarayıcıdan açılır; kurulum gerektirmez.

## Özellikler

### Veresiye Defteri
- **Müşteri kartı:** ad, telefon (dokununca arar), adres, müşteri tipi (bireysel / usta / müteahhit / firma), kredi limiti, varsayılan vade, yetkili/kefil, not.
- **Veresiye satış:** müşteri adını veya telefonunu yazın, ürünleri barkodla okutun (USB okuyucu veya telefon kamerası) ya da kodunu/adını yazın.
  Satır indirimi ve fiş indirimi `%` veya `₺` olarak girilir; fiyat elle düşürülürse o da indirim sayılır. Vade tarihi müşterinin vadesine göre otomatik gelir.
- **Müşteri detay ekranı:** toplam borç, vadesi geçen tutar, bu ay alınan / ödenen, toplam indirim, borç yaşı (0–30, 31–60, 61–90, 90+ gün),
  tarih ve türe göre süzülebilen hesap hareketleri, her fişin ürünleri (görselleriyle), müşterinin şimdiye kadar aldığı ürünler.
- **Tahsilat** (nakit, kart, havale, çek), **iade** (stoğa geri döner), **düzeltme / sonradan indirim** (yönetici).
- **Ödemeler en eski vadeli borca sayılır**; vadesi geçen tutar ve gecikme günü buna göre hesaplanır.
- **Kayıtlar silinmez:** hatalı kayıt yönetici tarafından nedeni yazılarak iptal edilir, stok etkisi geri alınır. Her işlem kim yaptıysa onun adıyla kaydedilir.
- **Bakiye hiçbir yerde elle tutulmaz**, her seferinde hareketlerden hesaplanır. Tutarlar kuruş cinsinden tam sayı saklanır (yuvarlama hatası olmaz).
- **Çıktılar:** hesap ekstresi (tarih aralıklı), veresiye satış fişi, numaralı tahsilat makbuzu — yazdırılır veya PDF olarak kaydedilir.
- **WhatsApp hatırlatma:** tek tuşla hazır bakiye mesajı.
- **Eski defteri aktarma:** kâğıt defterdeki bakiyeler Excel şablonuyla tek seferde yüklenir.
- Müşteri listesi Excel'e aktarılır.

### İrsaliyeden toplu stok girişi
1. İrsaliyenin fotoğrafını çekin (birden fazla sayfa olabilir).
2. Yapay zekâ tedarikçiyi, irsaliye numarasını ve her satırı (ad, kod, miktar, birim) okur.
3. Satırlar stoktaki ürünlerle eşleştirilir. Eşleşmeyenleri siz seçersiniz; seçim tedarikçiye göre hatırlanır.
4. İsterseniz kolilerden çıkan ürünleri barkodla okutun; eksik/fazla gösterilir.
5. **Onaylamadan stok değişmez.** Aynı irsaliye numarası ikinci kez girilirse uyarı verilir.
- Birim dönüşümü: ürün kartında “1 top = 100 metre” gibi tanımlanır.
- API anahtarı yoksa satırlar elle veya barkodla girilebilir.

### Ürünler ve görseller
- Barkod sorgu: okutunca büyük ürün görseli, fiyat, stok ve bu ürünü veresiyeyle alan müşteriler.
- Görseli olmayan ürüne telefonla o an fotoğraf eklenir; görseller otomatik küçültülür.
- Excel'den toplu ürün yükleme / Excel'e aktarma, minimum stok uyarısı, sayım düzeltmesi, stok hareket geçmişi.

### Kullanıcılar
- PIN ile giriş. **Personel:** satış, tahsilat, iade, irsaliye. **Yönetici:** ayrıca iptal, düzeltme, fiyat değişikliği,
  belirlenen orandan yüksek indirim, toplu yükleme ve ayarlar.

## Verilerin saklanması — önemli

Veriler **uygulamanın açıldığı cihazın tarayıcısında** (IndexedDB) saklanır; internete gönderilmez
(yalnızca irsaliye okuturken fotoğraf yapay zekâya gönderilir).

- **Düzenli yedek alın:** Ayarlar → *Yedek al*. Dosyayı telefonunuza, e-postanıza veya USB belleğe kopyalayın. Panel, 7 günden eski yedekte uyarır.
- Tarayıcı verilerini temizlemek uygulama verilerini de siler.
- Şu an her cihazın verisi ayrıdır. Birden fazla cihazdan aynı deftere erişim (bulut senkronizasyonu) sonraki adımdır.

## İrsaliye okuma (yapay zekâ)

Ayarlar → *Anthropic API anahtarı*. Anahtar [console.anthropic.com](https://console.anthropic.com) adresinden alınır, yalnızca o cihazda saklanır.
Harcama limiti düşük bir anahtar kullanın.

## Geliştirme

```bash
npm install
npm run dev      # geliştirme sunucusu
npm test         # veresiye ve para hesap testleri
npm run build    # dist/ klasörüne derler
```

Teknoloji: React + TypeScript + Vite, Dexie (IndexedDB), @zxing/browser (barkod), Anthropic SDK (irsaliye okuma).

## Yayınlama (GitHub Pages)

`main` dalına her gönderimde `.github/workflows/yayinla.yml` uygulamayı derleyip GitHub Pages'e yükler.
İlk sefer için deponun **Settings → Pages → Build and deployment → Source** ayarını **GitHub Actions** yapın.
Adres: `https://<kullanıcı-adı>.github.io/ortakhayat/`
