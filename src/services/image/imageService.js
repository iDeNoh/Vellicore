/**
 * Image Service — Module 7
 *
 * Full SDNext image generation pipeline:
 *  - Style presets for every entity type
 *  - Campaign-aware prompt building (tone + world style injected)
 *  - Generation queue (prevents flooding SDNext)
 *  - Asset persistence via Electron fs
 *  - Token crop utility
 *  - Model and sampler configuration
 */

// ── Style presets ─────────────────────────────────────────────────────────────

export const IMAGE_STYLES = {
  portrait: {
    suffix: 'fantasy portrait, solo, looking at viewer, upper body, detailed face, expressive eyes, (masterpiece:1.2), (best quality:1.1), painterly, soft dramatic lighting, intricate details',
    negPrompt: '(worst quality:1.4), (low quality:1.4), blurry, deformed, ugly, extra limbs, bad anatomy, bad hands, missing fingers, extra digit, watermark, text, logo, signature, username, duplicate, mutated, disfigured, cropped, jpeg artifacts',
    width: 512,
    height: 768,
    steps: 28,
    cfgScale: 7,
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
  },
  npc_portrait: {
    suffix: 'fantasy portrait, solo, looking at viewer, upper body, detailed face, expressive, (masterpiece:1.2), (best quality:1.1), painterly, dramatic lighting',
    negPrompt: '(worst quality:1.4), (low quality:1.4), blurry, deformed, ugly, extra limbs, bad anatomy, bad hands, watermark, text, signature, duplicate, mutated',
    width: 512,
    height: 512,
    steps: 25,
    cfgScale: 7,
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
  },
  scene: {
    suffix: 'fantasy environment, detailed background, atmospheric lighting, cinematic, digital painting',
    negPrompt: 'blurry, deformed, people, characters, watermark, text, logo, modern, futuristic',
    width: 768,
    height: 512,
    steps: 28,
    cfgScale: 7.5,
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
  },
  location_interior: {
    suffix: 'interior scene, fantasy setting, atmospheric, warm lighting, highly detailed environment',
    negPrompt: 'blurry, people, characters, watermark, text, modern',
    width: 768,
    height: 512,
    steps: 26,
    cfgScale: 7,
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
  },
  location_exterior: {
    suffix: 'exterior landscape, fantasy world, wide establishing shot, atmospheric perspective, painted',
    negPrompt: 'blurry, people, characters, watermark, text, modern, contemporary',
    width: 768,
    height: 512,
    steps: 26,
    cfgScale: 7,
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
  },
  dungeon: {
    suffix: 'dungeon interior, dark fantasy, torchlight, stone walls, atmospheric shadows, detailed',
    negPrompt: 'blurry, people, characters, watermark, text, bright, cheerful',
    width: 768,
    height: 512,
    steps: 28,
    cfgScale: 7.5,
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
  },
  map: {
    suffix: 'top-down fantasy map, illustrated, cartographic, hand-drawn style, parchment, ink',
    negPrompt: 'blurry, people, characters, 3d, photorealistic, photograph, watermark',
    width: 768,
    height: 768,
    steps: 30,
    cfgScale: 8,
    sampler: 'DPM++ 2M SDE',
    scheduler: 'Karras',
  },
  token: {
    suffix: 'miniature token art, circular portrait, fantasy, clean simple background, game art',
    negPrompt: 'blurry, deformed, text, watermark, complex background',
    width: 256,
    height: 256,
    steps: 20,
    cfgScale: 6,
    sampler: 'Euler a',
    scheduler: 'Automatic',
  },
  item: {
    suffix: 'fantasy item illustration, detailed object, game icon art, clean neutral background, front view',
    negPrompt: 'blurry, characters, people, text, watermark, complex background',
    width: 512,
    height: 512,
    steps: 24,
    cfgScale: 7,
    sampler: 'DPM++ 2M',
    scheduler: 'Karras',
  },
}

// ── Generation queue ──────────────────────────────────────────────────────────

let generationQueue = Promise.resolve()
let queueDepth = 0

/**
 * Queue a generation request. Serialises calls to SDNext so it isn't flooded.
 * Returns a promise that resolves when this request completes.
 */
function enqueue(fn) {
  queueDepth++
  generationQueue = generationQueue
    .then(fn)
    .finally(() => { queueDepth-- })
  return generationQueue
}

export function getQueueDepth() { return queueDepth }

// ── Core generation function ──────────────────────────────────────────────────

/**
 * Generate an image via SDNext.
 *
 * @param {object} opts
 * @param {string}  opts.prompt       - Main description
 * @param {string}  opts.type         - Key from IMAGE_STYLES
 * @param {string}  opts.sdnextUrl    - SDNext base URL
 * @param {string}  [opts.model]      - Checkpoint model override
 * @param {string}  [opts.style]      - Campaign style suffix (from config)
 * @param {string}  [opts.negPrompt]  - Additional negative prompt
 * @param {boolean} [opts.queued]     - Whether to serialise via queue (default true)
 * @returns {Promise<string>}         - Base64 PNG
 */
export async function generateImage({
  prompt,
  type = 'scene',
  sdnextUrl,
  model,
  style = '',
  negPrompt = '',
  queued = true,
  overrides = {},
}) {
  const fn = () => _generate({ prompt, type, sdnextUrl, model, style, negPrompt, overrides })
  return queued ? enqueue(fn) : fn()
}

async function _generate({ prompt, type, sdnextUrl, model, style, negPrompt, overrides = {} }) {
  const preset = IMAGE_STYLES[type] || IMAGE_STYLES.scene

  const fullPrompt = [prompt, preset.suffix, style]
    .filter(s => s && s.trim())
    .join(', ')

  const fullNeg = overrides.negPromptOverride != null
    ? overrides.negPromptOverride
    : [preset.negPrompt, negPrompt].filter(s => s && s.trim()).join(', ')

  const payload = {
    prompt: fullPrompt,
    negative_prompt: fullNeg,
    width: overrides.width ?? preset.width,
    height: overrides.height ?? preset.height,
    steps: overrides.steps ?? preset.steps,
    cfg_scale: overrides.cfgScale ?? preset.cfgScale ?? 7,
    sampler_name: overrides.sampler ?? preset.sampler ?? 'Euler',
    scheduler: overrides.scheduler ?? preset.scheduler ?? 'Automatic',
    batch_size: 1,
    n_iter: 1,
    send_images: true,
    save_images: false,
  }

  if (model) {
    payload.override_settings = { sd_model_checkpoint: model }
    payload.override_settings_restore_afterwards = true
  }

  // Route through Electron main process to avoid CORS (renderer acts like a browser)
  if (typeof window !== 'undefined' && window.tavern?.image) {
    const url = `${(sdnextUrl || 'http://localhost:7860').replace(/\/$/, '')}/sdapi/v1/txt2img`
    const result = await window.tavern.image.generate({ url, payload })
    if (!result.ok) throw new Error(`SDNext error ${result.status || ''}: ${result.error || 'generation failed'}`)
    if (!result.images?.[0]) throw new Error('SDNext returned no images')
    return result.images[0]
  }

  // Direct fetch fallback (dev/browser mode)
  const res = await fetch(`${sdnextUrl}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(180_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText)
    throw new Error(`SDNext error ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  if (!data.images?.[0]) throw new Error('SDNext returned no images')
  return data.images[0]
}

// ── Campaign-aware prompt builders ────────────────────────────────────────────

/**
 * Build a full prompt for a player character portrait.
 */
export function buildCharacterPrompt(character, campaign) {
  const parts = [
    character.portraitPrompt || '',
    character.ancestry ? `${character.ancestry} person` : '',
    character.background ? `${character.background} background` : '',
  ].filter(Boolean)

  if (campaign?.tone) parts.push(toneToArtStyle(campaign.tone))
  return parts.join(', ')
}

/**
 * Build a prompt for an NPC portrait.
 */
export function buildNpcPrompt(npc, campaign) {
  const parts = [
    npc.portraitPrompt || '',
    npc.appearance || '',
    npc.ancestry ? `${npc.ancestry} person` : '',
    npc.role || '',
  ].filter(Boolean)

  if (campaign?.tone) parts.push(toneToArtStyle(campaign.tone))
  return parts.join(', ')
}

/**
 * Build a prompt for a location scene.
 */
export function buildLocationPrompt(location, campaign) {
  const parts = [
    location.imagePrompt || '',
    location.name || '',
    location.atmosphere || '',
  ].filter(Boolean)

  // Infer type-appropriate style preset
  const styleKey = inferLocationStyle(location.type)

  if (campaign?.tone) parts.push(toneToArtStyle(campaign.tone))
  return { prompt: parts.join(', '), styleKey }
}

/**
 * Build a prompt for a scene described in a DM [IMAGE:] tag.
 */
export function buildDmTagPrompt(tag, campaign) {
  const parts = [tag.description].filter(Boolean)
  if (campaign?.tone) parts.push(toneToArtStyle(campaign.tone))

  const type = tag.type?.toLowerCase() || 'scene'
  const styleKey = type.includes('portrait') ? 'npc_portrait'
    : type.includes('map') ? 'map'
    : type.includes('item') ? 'item'
    : type.includes('dungeon') ? 'dungeon'
    : type.includes('interior') ? 'location_interior'
    : type.includes('exterior') ? 'location_exterior'
    : 'scene'

  return { prompt: parts.join(', '), styleKey }
}

// ── NPC auto-portrait generation ──────────────────────────────────────────────

/**
 * Generate a portrait for an NPC that doesn't have one yet.
 * Called when an NPC first becomes relevant in the story.
 */
export async function generateNpcPortrait({ npc, campaign, config }) {
  if (!config.image?.enabled) return null

  try {
    const prompt = buildNpcPrompt(npc, campaign)
    const base64 = await generateImage({
      prompt,
      type: 'npc_portrait',
      sdnextUrl: config.image.sdnextUrl,
      model: config.image.defaultModel,
      style: config.image.style,
    })

    const tokenBase64 = await cropToToken(base64, npcBorderColor(npc.disposition))

    // Save to disk if in Electron
    if (window.tavern?.fs) {
      await window.tavern.fs.saveAsset({
        data: base64,
        filename: `${npc.id}_portrait.png`,
        subfolder: 'portraits',
      })
      await window.tavern.fs.saveAsset({
        data: tokenBase64,
        filename: `${npc.id}_token.png`,
        subfolder: 'portraits',
      })
    }

    return { portraitBase64: base64, tokenBase64 }
  } catch (err) {
    console.warn('[ImageService] NPC portrait failed:', npc.name, err.message)
    return null
  }
}

/**
 * Generate portraits for all NPCs in the world that don't have one.
 * Queued — processes one at a time in the background.
 */
export async function generateMissingNpcPortraits({ world, campaign, config, onComplete }) {
  if (!config.image?.enabled) return

  const npcsWithoutPortraits = Object.values(world.npcs || {})
    .filter(npc => !npc.portraitBase64 && !npc.portraitPath)

  for (const npc of npcsWithoutPortraits) {
    const result = await generateNpcPortrait({ npc, campaign, config })
    if (result) onComplete?.({ npcId: npc.id, ...result })
  }
}

/**
 * Generate an image for a location that doesn't have one.
 */
export async function generateLocationImage({ location, campaign, config }) {
  if (!config.image?.enabled) return null

  try {
    const { prompt, styleKey } = buildLocationPrompt(location, campaign)
    const base64 = await generateImage({
      prompt,
      type: styleKey,
      sdnextUrl: config.image.sdnextUrl,
      model: config.image.defaultModel,
      style: config.image.style,
    })

    return base64
  } catch (err) {
    console.warn('[ImageService] Location image failed:', location.name, err.message)
    return null
  }
}

// ── Token crop ────────────────────────────────────────────────────────────────

/**
 * Crop a portrait to a circular 128px token with a coloured border.
 */
export function cropToToken(base64Image, borderColor = '#d4a520') {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => {
      const size = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')

      // Circular clip
      ctx.beginPath()
      ctx.arc(64, 64, 62, 0, Math.PI * 2)
      ctx.clip()

      // Centred crop
      const sx = (img.width - size) / 2
      const sy = (img.height - size) / 2
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 128, 128)

      // Coloured border
      ctx.restore?.()
      ctx.beginPath()
      ctx.arc(64, 64, 60, 0, Math.PI * 2)
      ctx.strokeStyle = borderColor
      ctx.lineWidth = 5
      ctx.stroke()

      resolve(canvas.toDataURL('image/png').split(',')[1])
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = `data:image/png;base64,${base64Image}`
  })
}

/**
 * Resize a base64 image to a max dimension, preserving aspect ratio.
 */
export function resizeImage(base64, maxDim = 512) {
  return new Promise((resolve) => {
    const img = new window.Image()
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.9).split(',')[1])
    }
    img.src = `data:image/png;base64,${base64}`
  })
}

// ── SDNext model info ─────────────────────────────────────────────────────────

/**
 * Fetch available models from SDNext.
 */
export async function fetchSdnextModels(sdnextUrl) {
  try {
    const res = await fetch(`${sdnextUrl}/sdapi/v1/sd-models`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()
    return data.map(m => ({ name: m.model_name, title: m.title, hash: m.hash }))
  } catch {
    return []
  }
}

/**
 * Fetch available samplers from SDNext.
 */
export async function fetchSdnextSamplers(sdnextUrl) {
  try {
    const res = await fetch(`${sdnextUrl}/sdapi/v1/samplers`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()
    return data.map(s => s.name)
  } catch {
    return Object.values(IMAGE_STYLES).map(s => s.sampler).filter((v, i, a) => a.indexOf(v) === i)
  }
}

/**
 * Get the currently loaded model from SDNext.
 */
export async function getCurrentModel(sdnextUrl) {
  try {
    const res = await fetch(`${sdnextUrl}/sdapi/v1/options`, {
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json()
    return data.sd_model_checkpoint || null
  } catch {
    return null
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function checkSdnext(url) {
  if (typeof window !== 'undefined' && window.tavern?.health) {
    return window.tavern.health.checkSdnext(url)
  }
  try {
    const res = await fetch(`${url}/sdapi/v1/sd-models`, { signal: AbortSignal.timeout(3000) })
    const data = await res.json()
    return { ok: true, models: data.map(m => m.model_name) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toneToArtStyle(tone) {
  const t = (tone || '').toLowerCase()
  if (t.includes('horror') || t.includes('dark')) return 'dark gothic art style'
  if (t.includes('whimsi') || t.includes('fairy')) return 'whimsical storybook illustration'
  if (t.includes('gritty') || t.includes('grim')) return 'gritty realistic illustration'
  if (t.includes('cosmic') || t.includes('weird')) return 'surreal cosmic art'
  if (t.includes('swash') || t.includes('pirate')) return 'swashbuckling adventure art'
  return 'fantasy illustration style'
}

function inferLocationStyle(type) {
  const t = (type || '').toLowerCase()
  if (t.includes('dungeon') || t.includes('cave') || t.includes('crypt')) return 'dungeon'
  if (t.includes('tavern') || t.includes('inn') || t.includes('shop') || t.includes('interior')) return 'location_interior'
  if (t.includes('city') || t.includes('town') || t.includes('village') || t.includes('castle')) return 'location_exterior'
  if (t.includes('wilderness') || t.includes('forest') || t.includes('mountain')) return 'location_exterior'
  return 'scene'
}

function npcBorderColor(disposition) {
  const colors = {
    devoted: '#5dab7a', friendly: '#5dab7a', neutral: '#888',
    suspicious: '#e8c14d', hostile: '#e05c5c', fearful: '#9b7fe8',
  }
  return colors[disposition] || '#888'
}
