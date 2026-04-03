import { create } from 'zustand'

const usePetricoreStore = create((set, get) => ({

  // ── Dataset name ───────────────────────────────────────────────────────────
  datasetName: 'My Dataset',
  setDatasetName: (name) => set({ datasetName: name }),

  // ── Plan config ────────────────────────────────────────────────────────────
  plan: {
    tags: {
      VOICE:        { enabled: true,  targetCount: 300, minPerExample: 1, maxPerExample: 4 },
      NPC_UPDATE:   { enabled: true,  targetCount: 200, minPerExample: 1, maxPerExample: 2 },
      ROLL:         { enabled: true,  targetCount: 200, minPerExample: 1, maxPerExample: 1 },
      ROLL_RESULTS: { enabled: true,  targetCount: 200, minPerExample: 1, maxPerExample: 1 },
      IMAGE:        { enabled: true,  targetCount: 150, minPerExample: 1, maxPerExample: 2 },
      FLAG:         { enabled: true,  targetCount: 150, minPerExample: 1, maxPerExample: 3 },
      QUEST:        { enabled: true,  targetCount: 100, minPerExample: 1, maxPerExample: 1 },
      QUEST_UPDATE: { enabled: true,  targetCount: 80,  minPerExample: 1, maxPerExample: 1 },
      QUEST_DONE:   { enabled: true,  targetCount: 60,  minPerExample: 1, maxPerExample: 1 },
      LOCATION:     { enabled: true,  targetCount: 100, minPerExample: 1, maxPerExample: 1 },
      LORE:         { enabled: true,  targetCount: 80,  minPerExample: 1, maxPerExample: 1 },
      COMBAT:       { enabled: true,  targetCount: 100, minPerExample: 1, maxPerExample: 3 },
      ACT_ADVANCE:  { enabled: true,  targetCount: 50,  minPerExample: 1, maxPerExample: 1 },
      OOC:          { enabled: true,  targetCount: 40,  minPerExample: 1, maxPerExample: 1 },
      GAME_OVER:    { enabled: true,  targetCount: 40,  minPerExample: 1, maxPerExample: 1 },
    },
    genres: {
      classic_fantasy:      { enabled: true, weight: 1 },
      dark_fantasy:         { enabled: true, weight: 1 },
      sword_and_sorcery:    { enabled: true, weight: 1 },
      mythic:               { enabled: true, weight: 1 },
      fairy_tale:           { enabled: true, weight: 1 },
      wuxia:                { enabled: true, weight: 1 },
      steampunk:            { enabled: true, weight: 1 },
      cosmic_horror:        { enabled: true, weight: 1 },
      gothic_horror:        { enabled: true, weight: 1 },
      survival_horror:      { enabled: true, weight: 1 },
      psychological_horror: { enabled: true, weight: 1 },
      folk_horror:          { enabled: true, weight: 1 },
      southern_gothic:      { enabled: true, weight: 1 },
      space_opera:          { enabled: true, weight: 1 },
      cyberpunk:            { enabled: true, weight: 1 },
      post_apocalyptic:     { enabled: true, weight: 1 },
      dystopian:            { enabled: true, weight: 1 },
      dungeon_crawler:      { enabled: true, weight: 1 },
      solarpunk:            { enabled: true, weight: 1 },
      biopunk:              { enabled: true, weight: 1 },
      noir_mystery:         { enabled: true, weight: 1 },
      political_intrigue:   { enabled: true, weight: 1 },
      swashbuckling:        { enabled: true, weight: 1 },
      heist_crime:          { enabled: true, weight: 1 },
      war:                  { enabled: true, weight: 1 },
      espionage:            { enabled: true, weight: 1 },
      weird_fiction:        { enabled: true, weight: 1 },
      cosmic_weird:         { enabled: true, weight: 1 },
      cozy:                 { enabled: true, weight: 1 },
      isekai:               { enabled: true, weight: 1 },
      mythpunk:             { enabled: true, weight: 1 },
      magical_realism:      { enabled: true, weight: 1 },
    },
    length: {
      minExchanges: 2,
      maxExchanges: 7,
      tierWeights: { terse: 20, normal: 50, extended: 30 },
    },
    dialogue: {
      noDialogue:     15,
      singleNpcOne:   25,
      singleNpcMulti: 25,
      multiNpc:       20,
      withParaling:   15,
    },
    namePool: {
      totalNames: 200,
      generated: false,
      names: [],
    },
    storyStyles: {
      living_world: { enabled: true, weight: 1 },
      guided_fate:  { enabled: true, weight: 1 },
      open_road:    { enabled: true, weight: 1 },
    },
    additionalNotes: '',
    outputFormat: 'sharegpt',
    totalExamples: 3000,
  },

  // ── Generation state ───────────────────────────────────────────────────────
  generation: {
    running: false,
    paused: false,
    progress: 0,
    generated: 0,
    failed: 0,
    rejected: 0,
    currentExample: null,
    errors: [],
    callDelay: 500,
  },

  // ── Viewer filters ─────────────────────────────────────────────────────────
  viewerFilters: {
    genre: null,
    tags: [],
    npcName: null,
    exchangeCount: null,
    responseLength: null,
    dialogueStructure: null,
    status: 'all',
    sortBy: 'created_at',
    sortDir: 'desc',
    page: 0,
    pageSize: 20,
  },

  // ── Coverage ───────────────────────────────────────────────────────────────
  coverage: {
    total: 0, accepted: 0, rejected: 0, pending: 0, withErrors: 0,
    byTag: {}, byGenre: {}, byLength: {}, byDialogue: {}, byStyle: {}, byExchange: {},
    totalTokens: 0,
  },

  // ── Actions ────────────────────────────────────────────────────────────────
  setPlan: (updates) => set(s => ({ plan: { ...s.plan, ...updates } })),

  setTagConfig: (tag, config) => set(s => ({
    plan: { ...s.plan, tags: { ...s.plan.tags, [tag]: { ...s.plan.tags[tag], ...config } } }
  })),

  setGenreConfig: (genre, config) => set(s => ({
    plan: { ...s.plan, genres: { ...s.plan.genres, [genre]: { ...s.plan.genres[genre], ...config } } }
  })),

  setGeneration: (updates) => set(s => ({ generation: { ...s.generation, ...updates } })),

  setCoverage: (coverage) => set({ coverage }),

  setViewerFilters: (filters) => set(s => ({
    viewerFilters: { ...s.viewerFilters, ...filters, page: 0 }
  })),

  setViewerPage: (page) => set(s => ({ viewerFilters: { ...s.viewerFilters, page } })),

  setNamePool: (namePool) => set(s => ({ plan: { ...s.plan, namePool } })),
}))

export default usePetricoreStore
