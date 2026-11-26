import { whatsappLinki } from './cari'

/**
 * Ekrandaki belgeyi (ekstre, fiş, makbuz) A4 PDF'e çevirir.
 * `.yazdirma` sınıflı öğeler (düğmeler, tarih süzgeçleri) PDF'e girmez.
 */
export async function belgedenPdf(el: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas-pro'), import('jspdf')])
  const tuval = await html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    ignoreElements: (e) => e.classList.contains('yazdirma'),
  })
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const sayfaG = pdf.internal.pageSize.getWidth()
  const sayfaY = pdf.internal.pageSize.getHeight()
  const kenar = 10
  const g = sayfaG - kenar * 2
  const toplamY = (tuval.height * g) / tuval.width
  const resim = tuval.toDataURL('image/jpeg', 0.92)
  // Uzun ekstreler birden fazla sayfaya bölünür.
  const icY = sayfaY - kenar * 2
  for (let y = 0; y < toplamY; y += icY) {
    if (y > 0) pdf.addPage()
    pdf.addImage(resim, 'JPEG', kenar, kenar - y, g, toplamY)
  }
  return pdf.output('blob')
}

export type GonderimSonucu = 'paylasildi' | 'iptal' | 'indirildi'

/**
 * PDF'i WhatsApp'a dosya olarak göndermeye çalışır.
 * 1) Paylaşım menüsü dosya destekliyorsa (telefon, Windows'ta Chrome/Edge uygulaması) açılır, WhatsApp seçilir.
 * 2) Desteklemiyorsa PDF indirilir ve müşterinin WhatsApp sohbeti açılır; dosya sohbete sürüklenir/eklenir.
 */
export async function whatsappDosyaGonder(el: HTMLElement, dosyaAdi: string, telefon: string, mesaj: string): Promise<GonderimSonucu> {
  const blob = await belgedenPdf(el)
  const ad = dosyaAdi.replace(/[\\/:*?"<>|]/g, '-') + '.pdf'
  const dosya = new File([blob], ad, { type: 'application/pdf' })

  if (navigator.canShare?.({ files: [dosya] })) {
    try {
      await navigator.share({ files: [dosya], title: ad, text: mesaj })
      return 'paylasildi'
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'iptal'
      // Başka bir hata olursa indirme yoluna düş.
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = ad
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  if (telefon) window.open(whatsappLinki(telefon, mesaj), '_blank')
  return 'indirildi'
}
