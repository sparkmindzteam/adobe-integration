import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import selfsigned from 'selfsigned'
import { defineConfig } from 'vite'

const root = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.join(root, 'server', 'certs')
const keyPath = path.join(certDir, 'key.pem')
const certPath = path.join(certDir, 'cert.pem')

function loadHttps() {
  fs.mkdirSync(certDir, { recursive: true })
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    const pems = selfsigned.generate([{ name: 'commonName', value: 'FrameFlash Booth' }], {
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
    fs.writeFileSync(keyPath, pems.private)
    fs.writeFileSync(certPath, pems.cert)
  }
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    https: loadHttps(),
    // iPad only talks to :5173 — Vite forwards /api to the laptop relay
    // so we don't need a second trusted cert for :8787
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
