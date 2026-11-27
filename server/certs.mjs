import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import selfsigned from 'selfsigned'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const CERT_DIR = path.join(__dirname, 'certs')
export const KEY_PATH = path.join(CERT_DIR, 'key.pem')
export const CERT_PATH = path.join(CERT_DIR, 'cert.pem')

export function ensureCerts() {
  fs.mkdirSync(CERT_DIR, { recursive: true })
  if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
    return {
      key: fs.readFileSync(KEY_PATH),
      cert: fs.readFileSync(CERT_PATH),
    }
  }

  const attrs = [{ name: 'commonName', value: 'FrameFlash Booth' }]
  const pems = selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
        ],
      },
    ],
  })

  fs.writeFileSync(KEY_PATH, pems.private)
  fs.writeFileSync(CERT_PATH, pems.cert)
  return { key: pems.private, cert: pems.cert }
}
