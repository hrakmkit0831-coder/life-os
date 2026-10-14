// 依存なしでアプリアイコン（PNG/SVG）を生成する
import { deflateSync, crc32 } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const BG = [11, 12, 13]
const LIME = [198, 244, 50]

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
  return Buffer.concat([len, td, crc])
}

// 中心の点 + リング + 右上の切れ目（「起動中」の指令室モチーフ）
function coverage(x, y, s) {
  const c = s / 2, dx = x - c, dy = y - c, d = Math.hypot(dx, dy) / s
  const ang = Math.atan2(-dy, dx)
  const inGap = ang > Math.PI / 6 && ang < Math.PI / 2.4
  if (d < 0.085) return 1
  if (d > 0.25 && d < 0.32 && !inGap) return 1
  return 0
}

function png(size) {
  const SS = 4
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      let a = 0
      for (let i = 0; i < SS; i++) for (let j = 0; j < SS; j++) a += coverage((x + (i + 0.5) / SS) , (y + (j + 0.5) / SS), size)
      a /= SS * SS
      const o = y * (size * 3 + 1) + 1 + x * 3
      for (let k = 0; k < 3; k++) raw[o + k] = Math.round(BG[k] * (1 - a) + LIME[k] * a)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', png(192))
writeFileSync('public/icons/icon-512.png', png(512))
writeFileSync('public/icons/apple-touch-icon.png', png(180))
writeFileSync('public/icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0b0c0d"/><circle cx="50" cy="50" r="8.5" fill="#c6f432"/><path d="M50 21.5 A28.5 28.5 0 1 0 75.3 36.9" fill="none" stroke="#c6f432" stroke-width="7"/></svg>`)
console.log('icons generated')
