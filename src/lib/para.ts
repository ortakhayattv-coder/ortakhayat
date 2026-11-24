/** Kuruş -> "1.234,50 ₺" */
export function tl(kurus: number, isaretli = false): string {
  const s = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(kurus) / 100)
  const isaret = kurus < 0 ? '-' : isaretli && kurus > 0 ? '+' : ''
  return `${isaret}${s} ₺`
}

/** Kuruş -> "1234,50" (input alanı için) */
export function tlGirdi(kurus: number): string {
  return (kurus / 100).toFixed(2).replace('.', ',')
}

/** "1.234,50" / "1234.5" / "1234" -> kuruş. Geçersizse NaN. */
export function kurusa(metin: string | number): number {
  if (typeof metin === 'number') return Math.round(metin * 100)
  let s = metin.trim().replace(/\s|₺|tl/gi, '')
  if (!s) return 0
  const virgul = s.lastIndexOf(',')
  const nokta = s.lastIndexOf('.')
  if (virgul > nokta) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (nokta > virgul && virgul >= 0) {
    s = s.replace(/,/g, '')
  } else if (nokta >= 0 && virgul < 0) {
    // Birden fazla nokta varsa binlik ayırıcıdır ("1.234.567"); tek nokta ondalıktır ("1234.5")
    const parcalar = s.split('.')
    if (parcalar.length > 2) s = parcalar.join('')
  }
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) : NaN
}

/** Miktar metnini sayıya çevirir: "2,5" -> 2.5 */
export function sayiya(metin: string | number): number {
  if (typeof metin === 'number') return metin
  const n = Number(metin.trim().replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

export function miktarYaz(n: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(n)
}

/** Yüzde indirim -> kuruş */
export function yuzdeTutar(tutar: number, yuzde: number): number {
  return Math.round((tutar * yuzde) / 100)
}
