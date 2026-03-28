import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist, createJSONStorage } from 'zustand/middleware'

// ── App store (global, non-game state) ───────────────────────────────────────

export const useAppStore = create(
  immer((set, get) => ({
    // Config loaded from electron
    config: null,
    setConfig: (config) => set((s) => { s.config = config }),

    // First run state
    isFirstRun: false,
    setFirstRun: (val) => set((s) => { s.isFirstRun = val }),

    // RAG availability (set on boot by health check)
    ragAvailable: false,
    setRagAvailable: (val) => set((s) => { s.ragAvailable = val }),

    // Active campaign and character IDs
    activeCampaignId: null,
    activeCharacterId: null,
    setActiveCampaign: (id) => set((s) => { s.activeCampaignId = id }),
    setActiveCharacter: (id) => set((s) => { s.activeCharacterId = id }),

    // UI state
    ui: {
      sidebarOpen: true,
      activePanel: 'chat',   // 'chat' | 'map' | 'character' | 'inventory'
      settingsOpen: false,
    },
    setUi: (key, value) => set((s) => { s.ui[key] = value }),
    toggleSidebar: () => set((s) => { s.ui.sidebarOpen = !s.ui.sidebarOpen }),
    setActivePanel: (panel) => set((s) => { s.ui.activePanel = panel }),

    // Save config back to electron (or localStorage in browser mode)
    saveConfig: async (partial) => {
      const current = get().config
      const updated = { ...current, ...partial }
      set((s) => { s.config = updated })
      if (window.tavern) {
        await window.tavern.config.save(updated)
      } else {
        localStorage.setItem('tavern-config', JSON.stringify(updated))
      }
    },
  }))
)

// ── Game store (active session state) ────────────────────────────────────────

export const useGameStore = create(
  immer((set, get) => ({
    // Current campaign metadata
    campaign: null,

    // World state — locations, NPCs, factions discovered so far
    world: {
      currentLocation: null,
      locations: {},
      npcs: {},
      factions: {},
      discoveredLore: [],
    },

    // Active characters (1–4 players)
    characters: {},

    // Story state
    story: {
      currentAct: 1,
      activeQuests: [],
      completedQuests: [],
      globalFlags: {},        // e.g. { 'met_the_king': true, 'castle_burned': false }
    },

    // Chat/narrative log
    messages: [],

    // Raw LLM exchange log (session-only, for Narration tab)
    llmLog: [],

    // Combat state (null when not in combat)
    // When active: { round, activeIndex, combatants[], log[], phase }
    combat: null,

    // Map state
    map: {
      activeMapId: null,
      backgroundImage: null,    // base64 or url for current location
      tokenPositions: {},        // entityId → { x, y, visible }
      revealedCells: {},  // plain object: { 'col,row': true } — avoids Immer Set issues
      fogEnabled: true,
      gridSize: 40,              // px per cell
      mapWidth: 20,              // cells wide
      mapHeight: 15,             // cells tall
      stageX: 0,                 // canvas pan offset
      stageY: 0,
      stageScale: 1,
    },

    // Loading / generation states
    isDmThinking: false,
    isGeneratingImage: false,
    isSpeaking: false,

    // End-of-story state — set when DM emits [GAME_OVER:]
    // { outcome: 'victory'|'defeat'|'ambiguous', epilogue: string }
    gameOver: null,

    // ── Actions ────────────────────────────────────────────────────────────

    setCampaign: (campaign) => set((s) => { s.campaign = campaign }),

    addLlmLogEntry: (entry) => set((s) => {
      s.llmLog.push({ id: crypto.randomUUID(), timestamp: Date.now(), ...entry })
    }),

    clearLlmLog: () => set((s) => { s.llmLog = [] }),

    addMessage: (message) => set((s) => {
      s.messages.push({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        ...message,
      })
    }),

    updateCharacter: (id, partial) => set((s) => {
      if (s.characters[id]) {
        Object.assign(s.characters[id], partial)
      }
    }),

    setCharacters: (characters) => set((s) => { s.characters = characters }),

    updateWorldLocation: (id, data) => set((s) => {
      s.world.locations[id] = { ...s.world.locations[id], ...data }
    }),

    setCurrentLocation: (locationId) => set((s) => {
      s.world.currentLocation = locationId
    }),

    addNpc: (npc) => set((s) => { s.world.npcs[npc.id] = npc }),

    updateNpc: (id, partial) => set((s) => {
      if (s.world.npcs[id]) Object.assign(s.world.npcs[id], partial)
    }),

    setWorld: (world) => set((s) => {
      s.world = {
        ...world,
        currentLocation: world.currentLocation || s.world.currentLocation,
        locations: world.locations || s.world.locations,
        npcs: world.npcs || s.world.npcs,
        factions: world.factions || s.world.factions,
        discoveredLore: world.discoveredLore || s.world.discoveredLore,
      }
    }),

    setStory: (story) => set((s) => {
      s.story = { ...s.story, ...story }
    }),

    addQuest: (quest) => set((s) => {
      s.story.activeQuests = [...(s.story.activeQuests || []), quest]
    }),

    completeQuest: (questId) => set((s) => {
      const quest = (s.story.activeQuests || []).find(q => q.id === questId)
      if (quest) {
        s.story.activeQuests = s.story.activeQuests.filter(q => q.id !== questId)
        s.story.completedQuests = [...(s.story.completedQuests || []), { ...quest, completedAt: Date.now() }]
      }
    }),

    advanceAct: () => set((s) => {
      if (s.story.currentAct < 5) s.story.currentAct += 1
    }),

    addLore: (entry) => set((s) => {
      s.world.discoveredLore = [...(s.world.discoveredLore || []), entry]
    }),

    setGlobalFlag: (key, value) => set((s) => {
      s.story.globalFlags[key] = value
    }),

    setDmThinking: (val) => set((s) => { s.isDmThinking = val }),
    setGeneratingImage: (val) => set((s) => { s.isGeneratingImage = val }),
    setSpeaking: (val) => set((s) => { s.isSpeaking = val }),
    setGameOver: (data) => set((s) => { s.gameOver = data }),
    clearGameOver: () => set((s) => { s.gameOver = null }),

    updateTokenPosition: (entityId, pos) => set((s) => {
      s.map.tokenPositions[entityId] = pos
    }),

    startCombat: (combatants) => set((s) => {
      // Sort by initiative successes descending
      const sorted = [...combatants].sort((a, b) => b.initiativeRoll - a.initiativeRoll)
      s.combat = {
        round: 1,
        activeIndex: 0,
        phase: 'player_action',  // 'player_action' | 'enemy_action' | 'resolving'
        combatants: sorted,
        log: [],
        startedAt: Date.now(),
      }
    }),

    // Legacy compat
    enterCombat: (combatants) => set((s) => {
      const sorted = [...combatants].sort((a, b) => (b.initiativeRoll || 0) - (a.initiativeRoll || 0))
      s.combat = { round: 1, activeIndex: 0, phase: 'player_action', combatants: sorted, log: [], startedAt: Date.now() }
    }),

    endCombat: () => set((s) => { s.combat = null }),

    nextCombatTurn: () => set((s) => {
      if (!s.combat) return
      const next = s.combat.activeIndex + 1
      if (next >= s.combat.combatants.length) {
        s.combat.round += 1
        s.combat.activeIndex = 0
      } else {
        s.combat.activeIndex = next
      }
      // Determine phase based on whose turn it is
      const active = s.combat.combatants[s.combat.activeIndex]
      s.combat.phase = active?.type === 'player' ? 'player_action' : 'enemy_action'
    }),

    setCombatPhase: (phase) => set((s) => {
      if (s.combat) s.combat.phase = phase
    }),

    updateCombatant: (entityId, partial) => set((s) => {
      if (!s.combat) return
      const idx = s.combat.combatants.findIndex(c => c.id === entityId)
      if (idx >= 0) Object.assign(s.combat.combatants[idx], partial)
    }),

    removeCombatant: (entityId) => set((s) => {
      if (!s.combat) return
      s.combat.combatants = s.combat.combatants.filter(c => c.id !== entityId)
      if (s.combat.activeIndex >= s.combat.combatants.length) {
        s.combat.activeIndex = 0
      }
    }),

    addCombatLogEntry: (entry) => set((s) => {
      if (s.combat) s.combat.log.push({ id: crypto.randomUUID(), timestamp: Date.now(), ...entry })
    }),

    setMapBackground: (base64) => set((s) => { s.map.backgroundImage = base64 }),

    setTokenPosition: (entityId, pos) => set((s) => {
      s.map.tokenPositions[entityId] = { ...s.map.tokenPositions[entityId], ...pos }
    }),

    removeToken: (entityId) => set((s) => {
      delete s.map.tokenPositions[entityId]
    }),

    revealCell: (col, row) => set((s) => {
      if (!s.map.revealedCells) s.map.revealedCells = {}
      s.map.revealedCells[`${col},${row}`] = true
    }),

    revealRadius: (col, row, radius) => set((s) => {
      if (!s.map.revealedCells) s.map.revealedCells = {}
      for (let dc = -radius; dc <= radius; dc++) {
        for (let dr = -radius; dr <= radius; dr++) {
          if (dc * dc + dr * dr <= radius * radius) {
            s.map.revealedCells[`${col + dc},${row + dr}`] = true
          }
        }
      }
    }),

    clearFog: () => set((s) => {
      const cells = {}
      for (let c = 0; c < s.map.mapWidth; c++)
        for (let r = 0; r < s.map.mapHeight; r++)
          cells[`${c},${r}`] = true
      s.map.revealedCells = cells
    }),

    setMapStage: (x, y, scale) => set((s) => {
      s.map.stageX = x; s.map.stageY = y; s.map.stageScale = scale
    }),

    toggleFog: () => set((s) => { s.map.fogEnabled = !s.map.fogEnabled }),

    resetMap: () => set((s) => {
      s.map.backgroundImage = null
      s.map.tokenPositions = {}
      s.map.revealedCells = {}
      s.map.stageX = 0; s.map.stageY = 0; s.map.stageScale = 1
    }),

    resetGame: () => set((s) => {
      s.campaign = null
      s.world = { currentLocation: null, locations: {}, npcs: {}, factions: {}, discoveredLore: [] }
      s.characters = {}
      s.story = { currentAct: 1, activeQuests: [], completedQuests: [], globalFlags: {} }
      s.messages = []
      s.llmLog = []
      s.combat = null
      s.gameOver = null
      s.map = {
        activeMapId: null,
        backgroundImage: null,
        tokenPositions: {},
        revealedCells: {},
        fogEnabled: true,
        gridSize: 40,
        mapWidth: 20,
        mapHeight: 15,
        stageX: 0,
        stageY: 0,
        stageScale: 1,
      }
    }),
  }))
)
