import cors from 'cors'
import express from 'express'
import fs from 'node:fs'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureCerts } from './certs.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.BOOTH_PORT || 8787)
const CONFIG_FILE = path.join(__dirname, 'config.json')
const DEFAULT_OUTPUT_DIR = path.join('E:\\Adobe integration', 'test photos')

const app = express()
app.use(cors())
app.use(express.json({ limit: '40mb' }))

const sseClients = new Set()

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    }
  } catch {
    // fall through
  }
  return { outputDir: DEFAULT_OUTPUT_DIR }
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2))
}

function getOutputDir() {
  const dir = readConfig().outputDir || DEFAULT_OUTPUT_DIR
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function metaPath() {
  // Keep metadata out of the photo inbox folder
  return path.join(__dirname, 'booth-meta.json')
}

function readMeta() {
  const file = metaPath()
  if (!fs.existsSync(file)) return null
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function writeMeta(meta) {
  fs.writeFileSync(metaPath(), JSON.stringify(meta, null, 2))
}

function tryUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
    return true
  } catch (err) {
    // Windows locks files open in the IDE / Explorer preview (EBUSY / EPERM)
    console.warn(`Could not delete ${filePath}:`, err.code || err.message)
    return false
  }
}

function clearPhotoFiles() {
  const dir = getOutputDir()
  for (const name of fs.readdirSync(dir)) {
    tryUnlink(path.join(dir, name))
  }
  tryUnlink(metaPath())
}

function writePhoto(filePath, buf) {
  try {
    fs.writeFileSync(filePath, buf)
    return filePath
  } catch (err) {
    if (err.code !== 'EBUSY' && err.code !== 'EPERM') throw err
    // Locked file: write beside it, then replace when possible
    const alt = `${filePath}.new`
    fs.writeFileSync(alt, buf)
    try {
      fs.renameSync(alt, filePath)
      return filePath
    } catch {
      console.warn(`Wrote locked photo as ${alt} — close the open preview and retry`)
      return alt
    }
  }
}

function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of sseClients) {
    res.write(payload)
  }
}

function lanAddresses() {
  const nets = os.networkInterfaces()
  const out = []
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

app.get('/api/health', (_req, res) => {
  const outputDir = getOutputDir()
  res.json({
    ok: true,
    role: 'laptop-booth-relay',
    https: true,
    outputDir,
    lan: lanAddresses(),
  })
})

app.get('/api/config', (_req, res) => {
  res.json(readConfig())
})

app.put('/api/config', (req, res) => {
  const outputDir = String(req.body?.outputDir || DEFAULT_OUTPUT_DIR).trim()
  if (!outputDir) {
    res.status(400).json({ error: 'outputDir is required' })
    return
  }
  try {
    fs.mkdirSync(outputDir, { recursive: true })
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Cannot create output directory',
    })
    return
  }
  const cfg = { ...readConfig(), outputDir }
  writeConfig(cfg)
  res.json({ ok: true, ...cfg })
})

app.get('/api/booth', (_req, res) => {
  const meta = readMeta()
  const outputDir = getOutputDir()
  if (!meta) {
    res.json({ booth: null, outputDir })
    return
  }
  res.json({
    outputDir,
    booth: {
      ...meta,
      frameFiles: (meta.frameFiles || []).map((f) => ({
        name: f.name,
        absolutePath: path.join(outputDir, f.name),
      })),
    },
  })
})

app.post('/api/booth', (req, res) => {
  const frames = req.body?.frames
  if (!Array.isArray(frames) || frames.length !== 5) {
    res.status(400).json({ error: 'Exactly 5 frame data URLs/base64 images required' })
    return
  }

  const outputDir = getOutputDir()
  clearPhotoFiles()
  fs.mkdirSync(outputDir, { recursive: true })

  const sessionId = crypto.randomUUID()
  const frameFiles = []

  frames.forEach((dataUrl, index) => {
    const name = `frame_${String(index + 1).padStart(2, '0')}.jpg`
    const base64 = String(dataUrl).includes(',')
      ? String(dataUrl).split(',')[1]
      : String(dataUrl)
    const buf = Buffer.from(base64, 'base64')
    const savedAs = writePhoto(path.join(outputDir, name), buf)
    frameFiles.push({ name: path.basename(savedAs), bytes: buf.length })
  })

  if (req.body?.gifBase64) {
    const gifBuf = Buffer.from(
      String(req.body.gifBase64).includes(',')
        ? String(req.body.gifBase64).split(',')[1]
        : String(req.body.gifBase64),
      'base64',
    )
    writePhoto(path.join(outputDir, 'booth.gif'), gifBuf)
  }

  const meta = {
    sessionId,
    createdAt: new Date().toISOString(),
    status: 'premiere_pending',
    frameCount: 5,
    frameFiles,
    hasGif: Boolean(req.body?.gifBase64),
    outputDir,
  }
  writeMeta(meta)
  broadcast('booth', meta)

  res.json({
    ok: true,
    sessionId,
    status: meta.status,
    outputDir,
    message: `5 photos saved to ${outputDir}`,
  })
})

app.post('/api/booth/imported', (_req, res) => {
  const meta = readMeta()
  if (!meta) {
    res.status(404).json({ error: 'No booth batch to mark' })
    return
  }
  meta.status = 'in_premiere'
  meta.importedAt = new Date().toISOString()
  writeMeta(meta)
  broadcast('booth', meta)
  res.json({ ok: true, booth: meta })
})

app.delete('/api/booth', (_req, res) => {
  clearPhotoFiles()
  broadcast('booth', null)
  res.json({ ok: true, cleared: true, outputDir: getOutputDir() })
})

app.get('/api/booth/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()
  res.write(`event: booth\ndata: ${JSON.stringify(readMeta())}\n\n`)
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

const { key, cert } = ensureCerts()
getOutputDir()

https.createServer({ key, cert }, app).listen(PORT, '0.0.0.0', () => {
  const lans = lanAddresses()
  const outputDir = getOutputDir()
  console.log(`\nFrameFlash laptop relay (HTTPS) on https://0.0.0.0:${PORT}`)
  console.log(`Photo directory: ${outputDir}`)
  if (lans.length) {
    console.log('iPad should use one of these laptop IPs:')
    for (const ip of lans) {
      console.log(`  Booth UI : https://${ip}:5173`)
      console.log(`  Relay API: https://${ip}:${PORT}`)
    }
  }
  console.log('Accept the self-signed certificate warning in the browser.\n')
})
