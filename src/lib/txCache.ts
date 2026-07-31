/**
 * เติมแถวที่เพิ่งบันทึกลง cache ของหน้าแรก เพื่อไม่ให้ผู้ใช้เห็นชุดข้อมูลก่อนหน้า
 * ค้างอยู่ระหว่างรอ refetch. ไม่ใช่ optimistic update — แถวที่ส่งเข้ามาคือแถวจริง
 * ที่เซิร์ฟเวอร์คืนกลับมาแล้ว ทั้งสองฟังก์ชันเป็น pure ทดสอบได้โดยไม่ต้องต่อเน็ต.
 *
 * lib/ เดินทางเดียว ห้าม import จาก hooks/ (§3) → รับรูปร่างขั้นต่ำแบบ structural
 * ไม่ต้องรู้จัก RecentRow / MonthRow.
 */

/** เรียงลง (desc) แบบ lexicographic ล้วน — ไม่แปลงเป็น Date (convention 17 · §9). */
function cmpDesc(a: string, b: string): number {
  return a < b ? 1 : a > b ? -1 : 0
}

/**
 * เรียงเหมือน useRecentTransactions เป๊ะ: date desc, created_at desc.
 *
 * ต้องเรียง ไม่ใช่แค่ prepend — AddPage ย้อนวันที่ได้ ถ้า prepend เฉย ๆ รายการ
 * เดือนก่อนจะไปโผล่บนสุดจนกว่า refetch จะมาแก้. เทียบ string ตรง ๆ ได้เพราะ
 * date เป็น YYYY-MM-DD และ created_at เป็น ISO offset +00:00 เสมอจาก PostgREST
 * ทั้งคู่เรียง lexicographic ตรงกับเวลาจริง. dedupe ด้วย id (กันเขียนซ้ำ) แล้ว
 * ตัดที่ limit หลังเรียง. คืนอาเรย์ใหม่เสมอ ไม่ mutate prev.
 */
export function insertRecent<T extends { id: string; date: string; created_at: string }>(
  prev: T[],
  row: T,
  limit: number,
): T[] {
  const merged = prev.filter((r) => r.id !== row.id)
  merged.push(row)
  merged.sort((a, b) =>
    a.date !== b.date ? cmpDesc(a.date, b.date) : cmpDesc(a.created_at, b.created_at),
  )
  return merged.slice(0, limit)
}

/**
 * ใส่เฉพาะเมื่อวันที่อยู่ในช่วง [startInclusive, endExclusive) ที่ query นั้นดึงมา
 * (เดือนก่อน+เดือนนี้ ตาม useMonthTransactions). นอกช่วง → คืนอาเรย์เดิม ไม่แตะ.
 *
 * ไม่ dedupe: MonthRow ไม่มี id และ background refetch จาก invalidateQueries จะทับ
 * ทั้งอาเรย์ภายในไม่กี่ร้อย ms อยู่แล้ว การเติมนี้แค่กันแว่บของข้อมูลเก่าชั่วครู่.
 * ลำดับไม่สำคัญ (ปลายทางรวมยอดเอง). คืนอาเรย์ใหม่เมื่อเติม ไม่ mutate prev.
 */
export function insertMonth<T extends { date: string }>(
  prev: T[],
  row: T,
  startInclusive: string,
  endExclusive: string,
): T[] {
  if (row.date < startInclusive || row.date >= endExclusive) return prev
  return [...prev, row]
}
