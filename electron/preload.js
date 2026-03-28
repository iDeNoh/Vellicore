const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('tavern', {
  // ── Config ────────────────────────────────────────────────────────────────
  config: {
    load: () => ipcRenderer.invoke('config:load'),
    save: (config) => ipcRenderer.invoke('config:save', config),
    getUserDataPath: () => ipcRenderer.invoke('config:get-user-data-path'),
  },

  // ── DB: Campaigns ─────────────────────────────────────────────────────────
  campaigns: {
    all:    ()         => ipcRenderer.invoke('db:campaigns:all'),
    get:    (id)       => ipcRenderer.invoke('db:campaigns:get', id),
    create: (data)     => ipcRenderer.invoke('db:campaigns:create', data),
    update: (id, data) => ipcRenderer.invoke('db:campaigns:update', id, data),
    delete: (id)       => ipcRenderer.invoke('db:campaigns:delete', id),
  },

  // ── DB: Characters ────────────────────────────────────────────────────────
  characters: {
    byCampaign: (campaignId)   => ipcRenderer.invoke('db:characters:by-campaign', campaignId),
    get:        (id)            => ipcRenderer.invoke('db:characters:get', id),
    create:     (data)          => ipcRenderer.invoke('db:characters:create', data),
    update:     (id, data)      => ipcRenderer.invoke('db:characters:update', id, data),
  },

  // ── DB: Messages ──────────────────────────────────────────────────────────
  messages: {
    byCampaign: (campaignId, limit, offset) =>
      ipcRenderer.invoke('db:messages:by-campaign', campaignId, limit, offset),
    create:     (data) => ipcRenderer.invoke('db:messages:create', data),
    bulkCreate: (msgs) => ipcRenderer.invoke('db:messages:bulk-create', msgs),
  },

  // ── DB: Sessions ──────────────────────────────────────────────────────────
  sessions: {
    byCampaign: (campaignId)        => ipcRenderer.invoke('db:sessions:by-campaign', campaignId),
    create:     (data)               => ipcRenderer.invoke('db:sessions:create', data),
    end:        (id, summary)        => ipcRenderer.invoke('db:sessions:end', id, summary),
  },

  // ── DB: World state ───────────────────────────────────────────────────────
  world: {
    get: (campaignId)                => ipcRenderer.invoke('db:world:get', campaignId),
    set: (campaignId, world, story)  => ipcRenderer.invoke('db:world:set', campaignId, world, story),
  },

  // ── DB: NPCs ──────────────────────────────────────────────────────────────
  npcs: {
    byCampaign: (campaignId) => ipcRenderer.invoke('db:npcs:by-campaign', campaignId),
    upsert:     (data)        => ipcRenderer.invoke('db:npcs:upsert', data),
  },

  // ── DB path (legacy) ──────────────────────────────────────────────────────
  db: {
    getPath: () => ipcRenderer.invoke('db:get-path'),
  },

  // ── File system ───────────────────────────────────────────────────────────
  fs: {
    saveAsset:    (opts)      => ipcRenderer.invoke('fs:save-asset', opts),
    readAsset:    (filePath)  => ipcRenderer.invoke('fs:read-asset', filePath),
    openExternal: (url)       => ipcRenderer.invoke('fs:open-external', url),
  },

  // ── Health checks ─────────────────────────────────────────────────────────
  health: {
    checkOllama:      (url) => ipcRenderer.invoke('health:check-ollama', url),
    checkSdnext:      (url) => ipcRenderer.invoke('health:check-sdnext', url),
    checkKokoro:      (url) => ipcRenderer.invoke('health:check-kokoro', url),
    checkLmStudio:    (url) => ipcRenderer.invoke('health:check-lmstudio', url),
    checkChatterbox:  (url) => ipcRenderer.invoke('health:check-chatterbox', url),
  },

  // ── Dialogs ───────────────────────────────────────────────────────────────
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  },

  // ── SDNext proxy ──────────────────────────────────────────────────────────
  // Routes image generation through main process to bypass renderer CORS
  sdnext: {
    generate: (url, payload) => ipcRenderer.invoke('sdnext:generate', { url, payload }),
  },

  // ── Image proxy ───────────────────────────────────────────────────────────
  // Routes SDNext calls through main process to bypass renderer CORS
  image: {
    generate: (opts) => ipcRenderer.invoke('image:generate', opts),
  },

  // ── LLM proxy ─────────────────────────────────────────────────────────────
  // Routes LLM HTTP calls through main process to bypass renderer CORS
  llm: {
    send: (opts) => ipcRenderer.invoke('llm:send', opts),
  },

  // ── TTS proxy ─────────────────────────────────────────────────────────────
  // Routes Kokoro TTS calls through main process to bypass renderer CORS
  tts: {
    speak: (opts) => ipcRenderer.invoke('tts:speak', opts),
  },

  // ── RAG proxy ──────────────────────────────────────────────────────────────
  rag: {
    request: (opts) => ipcRenderer.invoke('rag:request', opts),
    embed:   (opts) => ipcRenderer.invoke('rag:embed',   opts),
  },

  // ── Session log ───────────────────────────────────────────────────────────
  // Renderer → log file passthrough. Use for boot events and app-level errors
  // that don't go through an IPC handler (which are logged automatically).
  log: {
    write:   (level, cat, msg) => ipcRenderer.invoke('log:write', { level, cat, msg }),
    getPath: ()                => ipcRenderer.invoke('log:get-path'),
  },

  // ── App info ──────────────────────────────────────────────────────────────
  app: {
    version:  process.env.npm_package_version || '0.1.0',
    platform: process.platform,
  },
})
