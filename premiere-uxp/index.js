const { entrypoints, storage } = require('uxp')
const premierepro = require('premierepro')

const CONFIG_KEY = 'frameflash-config'
const DEFAULT_RELAY = 'https://127.0.0.1:8787'

entrypoints.setup({
  panels: {
    frameflashPanel: {
      show() {
        bindUi()
        restoreConfig()
        startPolling()
      },
    },
  },
})

let pollTimer = null

function $(id) {
  return document.getElementById(id)
}

function setStatus(text) {
  const el = $('status')
  if (el) el.textContent = text
}

function bindUi() {
  $('saveConfig')?.addEventListener('click', saveConfig)
  $('refresh')?.addEventListener('click', () => {
    void refreshBooth()
  })
  $('importBatch')?.addEventListener('click', () => {
    void importCurrentBooth()
  })
  $('clearBatch')?.addEventListener('click', () => {
    void clearBooth()
  })
}

async function restoreConfig() {
  try {
    const raw = await storage.secureStorage.getItem(CONFIG_KEY)
    if (!raw) {
      $('relayUrl').value = DEFAULT_RELAY
      return
    }
    const cfg = JSON.parse(raw)
    $('relayUrl').value = cfg.relayUrl || DEFAULT_RELAY
    if (cfg.supabaseUrl) $('supabaseUrl').value = cfg.supabaseUrl
    if (cfg.supabaseKey) $('supabaseKey').value = cfg.supabaseKey
  } catch {
    $('relayUrl').value = DEFAULT_RELAY
  }
}

async function saveConfig() {
  const cfg = {
    relayUrl: $('relayUrl').value.trim().replace(/\/$/, '') || DEFAULT_RELAY,
    supabaseUrl: $('supabaseUrl').value.trim().replace(/\/$/, ''),
    supabaseKey: $('supabaseKey').value.trim(),
  }
  await storage.secureStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  setStatus('Saved. Polling laptop relay for new photos…')
}

function getRelay() {
  return ($('relayUrl').value.trim().replace(/\/$/, '') || DEFAULT_RELAY)
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer)
  void refreshBooth()
  pollTimer = setInterval(() => {
    void refreshBooth(true)
  }, 3000)
}

async function refreshBooth(silent) {
  try {
    const res = await fetch(`${getRelay()}/api/booth`)
    if (!res.ok) throw new Error(`Relay HTTP ${res.status}`)
    const data = await res.json()
    renderBooth(data.booth)
    if (!silent) {
      setStatus(data.booth ? 'New photos available' : 'Inbox empty — waiting for iPad…')
    }
  } catch (err) {
    if (!silent) {
      setStatus(
        err instanceof Error
          ? err.message
          : 'Cannot reach laptop relay. Run npm run server.',
      )
    }
  }
}

function renderBooth(booth) {
  const box = $('boothCard')
  const btn = $('importBatch')
  if (!booth) {
    box.innerHTML = '<p class="muted">No photos in inbox. Capture on the iPad, then Send to laptop.</p>'
    btn.disabled = true
    return
  }

  box.innerHTML = `
    <p><strong>${booth.frameCount || 5} photos</strong></p>
    <p class="muted">${booth.status} · ${new Date(booth.createdAt).toLocaleString()}</p>
    <p class="muted">Session ${booth.sessionId}</p>
  `
  btn.disabled = false
  btn.dataset.sessionId = booth.sessionId
}

async function importCurrentBooth() {
  setStatus('Fetching photos from laptop inbox…')
  try {
    const res = await fetch(`${getRelay()}/api/booth`)
    if (!res.ok) throw new Error(`Relay HTTP ${res.status}`)
    const data = await res.json()
    const booth = data.booth
    if (!booth?.frameFiles?.length) {
      setStatus('No photos to import.')
      return
    }

    const paths = booth.frameFiles.map((f) => f.absolutePath)
    await importPathsIntoPremiere(paths)

    await fetch(`${getRelay()}/api/booth/imported`, { method: 'POST' })
    setStatus('Imported into Premiere. Export GIF on iPad to clear inbox for the next set.')
    void refreshBooth(true)
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Import failed')
  }
}

async function clearBooth() {
  try {
    await fetch(`${getRelay()}/api/booth`, { method: 'DELETE' })
    setStatus('Inbox cleared. Ready for the next iPad capture.')
    void refreshBooth(true)
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Clear failed')
  }
}

async function importPathsIntoPremiere(nativePaths) {
  const project = await premierepro.Project.getActiveProject()
  if (!project) throw new Error('Open a Premiere Pro project first.')

  const ok = await project.importFiles(nativePaths, true, nativePaths.length > 1)
  if (!ok) throw new Error('Premiere rejected the import.')

  try {
    const clips = []
    for (const path of nativePaths) {
      const found = await premierepro.ClipProjectItem.findItemsMatchingMediaPath(path, true)
      if (found && found.length) clips.push(found[0])
    }
    if (clips.length) {
      const name = `FrameFlash ${new Date().toLocaleTimeString()}`
      await project.createSequenceFromMedia(name, clips)
    }
  } catch {
    // import still ok
  }
}
