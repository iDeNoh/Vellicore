/**
 * Rules Framework — "Three Fates" system
 *
 * A rules-lite d6 dice pool system designed to be fully adjudicable by the AI DM
 * in natural language. No lookup tables. No complex modifiers. Fast and narrative-first.
 *
 * CORE STATS
 *   Body   — physical strength, toughness, endurance
 *   Mind   — intelligence, perception, willpower, magic
 *   Spirit — charisma, luck, speed, intuition
 *
 * RESOLUTION
 *   Roll [stat] d6s. Count successes (5 or 6).
 *   0 = Failure (bad outcome, possible complication)
 *   1 = Partial (success with cost, or weak success)
 *   2 = Success (clean outcome)
 *   3 = Strong success (bonus effect)
 *   4+ = Critical (exceptional outcome, narrative reward)
 *
 * OPPOSED ROLLS
 *   Both sides roll. Higher successes wins. Tie = partial for attacker.
 *
 * COMBAT
 *   Initiative: roll Spirit, act in order of successes (highest first)
 *   Attack: roll Body (melee) or Mind (ranged/magic) vs defender's Body roll
 *   Damage: net successes beyond defense = HP lost
 *   HP: Body × 4
 *
 * ADVANCEMENT
 *   Milestone-based. No XP counting. DM awards at story beats.
 *   Each milestone: increase one stat by 1 (max 5), or gain/improve an ability.
 */

// ── Dice rolling ──────────────────────────────────────────────────────────────

/**
 * Roll n d6s and return full result breakdown.
 */
export function rollDice(n) {
  if (n < 1) return { rolls: [], successes: 0, result: 'failure', n: 0 }

  const rolls = Array.from({ length: n }, () => Math.floor(Math.random() * 6) + 1)
  const successes = rolls.filter(d => d >= 5).length

  return {
    rolls,
    successes,
    result: getResultTier(successes),
    n,
  }
}

/**
 * Opposed roll — attacker vs defender.
 */
export function opposedRoll(attackerStat, defenderStat) {
  const attacker = rollDice(attackerStat)
  const defender = rollDice(defenderStat)
  const net = attacker.successes - defender.successes

  let outcome
  if (net <= 0) outcome = 'defender_wins'
  else if (net === 1) outcome = 'attacker_partial'
  else outcome = 'attacker_wins'

  return { attacker, defender, net, outcome }
}

export function getResultTier(successes) {
  if (successes === 0) return 'failure'
  if (successes === 1) return 'partial'
  if (successes === 2) return 'success'
  if (successes === 3) return 'strong'
  return 'critical'
}

export const RESULT_LABELS = {
  failure:  { label: 'Failure',         color: 'crimson', description: 'Something goes wrong or doesn\'t work.' },
  partial:  { label: 'Partial success', color: 'gold',    description: 'You succeed, but at a cost or complication.' },
  success:  { label: 'Success',         color: 'forest',  description: 'You accomplish what you set out to do.' },
  strong:   { label: 'Strong success',  color: 'arcane',  description: 'You succeed with a bonus or extra effect.' },
  critical: { label: 'Critical!',       color: 'arcane',  description: 'Exceptional result — narrative reward granted.' },
}

// ── Character traits ──────────────────────────────────────────────────────────

export const CHARACTER_TRAITS = {
  personality: {
    label: 'Personality',
    description: 'How you move through the world.',
    traits: [
      'earnest', 'brooding', 'cheerful', 'cautious', 'reckless',
      'curious', 'reserved', 'bold', 'gentle', 'sarcastic',
      'cynical', 'idealistic', 'pragmatic', 'compassionate', 'proud',
      'stubborn', 'haunted', 'warm', 'restless', 'methodical',
      'impulsive', 'quiet', 'intense', 'dry-witted', 'empathetic',
      'irreverent', 'dignified', 'theatrical', 'self-deprecating', 'guarded',
      'open-hearted', 'calculating', 'instinctive', 'melancholic', 'wry',
      'disciplined', 'chaotic', 'nurturing', 'blunt', 'poetic',
      'superstitious', 'logical', 'spontaneous', 'deliberate', 'charming',
      'prickly', 'generous', 'private', 'expressive', 'stoic',
    ],
  },
  flaw: {
    label: 'Flaw',
    description: 'What gets you into trouble. The DM will use this.',
    traits: [
      'greedy — always wants more than the share',
      'prideful — cannot admit to being wrong',
      'cowardly — hesitates when it costs something',
      'vengeful — remembers injuries and does something about them',
      'distrustful — assumes the worst without evidence',
      'secretive — withholds information that would help',
      'hot-tempered — reacts before thinking',
      'paranoid — sees threats that may not exist',
      'obsessive — cannot let a problem alone',
      'naive — believes what they want to believe',
      'gullible — trusts too readily',
      'bitter — old wounds drive current decisions',
      'self-destructive — courts risks that aren\'t necessary',
      'envious — wants what others have',
      'dishonest — defaults to deception even when unnecessary',
      'reckless — comfort with risk that isn\'t always warranted',
      'manipulative — treats people as means',
      'avoidant — retreats from conflict past the point of usefulness',
      'impulsive — commits before thinking',
      'self-righteous — certain of being right in ways that close doors',
      'addictive — substance, behavior, or relationship that costs them',
      'arrogant — underestimates others consistently',
      'indecisive — freezes when clarity is needed',
      'overprotective — control framed as care',
      'glory-seeking — needs to be seen doing the thing',
      'nihilistic — struggles to find a reason to try',
      'jealous — romantic or professional rivalry distorts judgment',
      'superstitious — rituals and beliefs that interfere',
      'people-pleasing — cannot say no until it is too late',
      'contrarian — opposes on principle',
    ],
  },
  motivation: {
    label: 'Motivation',
    description: 'What you are actually doing this for.',
    traits: [
      'seeks redemption for a specific past act',
      'craves the kind of glory that gets remembered',
      'pursues justice for someone who cannot pursue it themselves',
      'hunts wealth — enough to never be powerless again',
      'thirsts for knowledge that someone is hiding',
      'protects specific people who cannot protect themselves',
      'escapes a past that keeps following',
      'fulfills an oath made to someone no longer alive',
      'earns freedom from a debt, contract, or obligation',
      'proves themselves to someone who said they couldn\'t',
      'uncovers a truth that powerful people want buried',
      'finds belonging somewhere that will have them',
      'survives — just survives — whatever it takes',
      'gains enough power that no one can hurt them again',
      'atones for harm caused — whether or not they deserve forgiveness',
      'preserves something — a people, a place, an idea — from destruction',
      'understands what happened — the event that broke their world',
      'protects the work — the legacy, the creation, the institution',
      'finds the person — missing, hiding, or taken',
      'finishes the mission — even if the mission no longer makes sense',
      'experiences everything — death is coming and life is short',
      'builds something that lasts — a home, a community, an empire',
      'destroys a specific thing — institution, person, or idea',
      'earns respect — not power, not wealth, just acknowledgment',
      'keeps the secret — whatever the cost',
      'pays the debt — money, obligation, or blood',
      'finds the answer — the philosophical or theological question that drives them',
      'outlasts everyone who said they wouldn\'t make it',
      'honors the dead — specifically, precisely, in the right way',
      'breaks the cycle — for their family, their people, or themselves',
    ],
  },
  bond: {
    label: 'Bond',
    description: 'A specific connection — person, place, or thing. The DM will make this matter.',
    traits: [
      'a sibling they were separated from',
      'a mentor who sacrificed something for them',
      'a home that no longer exists',
      'a promise made to someone dying',
      'a debt owed to someone they haven\'t found yet',
      'a rival who understands them better than anyone',
      'a child or ward they are responsible for',
      'an object that belonged to someone important',
      'a community that still considers them one of their own',
      'a former enemy who became something else',
      'a homeland they were exiled from',
      'a cause they gave years to',
      'a partner or companion animal',
      'a teacher whose lessons they are still arguing with',
      'a place of personal significance — a grave, a building, a crossroads',
      'a friend who chose the other side',
      'a parent whose approval they have not stopped wanting',
      'a creation they are responsible for — object, organization, or living thing',
      'a secret that belongs to someone else',
      'a stranger who showed them kindness at the worst moment',
    ],
  },
  secret: {
    label: 'Secret',
    description: 'Something you have not told anyone. It will come up.',
    traits: [
      'they did something unforgivable and have never admitted it',
      'they are not who they say they are — name, origin, or identity is false',
      'they know something about a powerful person that could destroy them',
      'they carry a condition — physical, mental, or supernatural — they are hiding',
      'they were responsible for an event they let someone else take the blame for',
      'they have a loyalty that conflicts with their stated allegiances',
      'they are being hunted by something they have told no one about',
      'they made a bargain with something and have not told anyone the terms',
      'they failed someone catastrophically and have rebuilt a life around not facing it',
      'they have abilities, memories, or a past they are concealing from the party',
      'they are in contact with someone they should not be in contact with',
      'they know the mission, the contract, or the group is compromised',
      'they have done this before — an earlier version of the same story — and it ended badly',
      'they are protecting someone by keeping a secret that hurts them to keep',
      'they stole something — from someone, from somewhere — that has not been noticed yet',
    ],
  },
}

// ── Character stats ───────────────────────────────────────────────────────────

export const STAT_KEYS = ['body', 'mind', 'spirit']
export const STAT_MIN = 1
export const STAT_MAX = 5

export const STAT_INFO = {
  body: {
    label: 'Body',
    icon: '⚔',
    description: 'Strength, toughness, physical endurance',
    examples: 'Melee attacks, lifting, resisting poison, taking hits',
  },
  mind: {
    label: 'Mind',
    icon: '✦',
    description: 'Intelligence, perception, willpower, arcane power',
    examples: 'Ranged attacks, magic, noticing things, resisting fear',
  },
  spirit: {
    label: 'Spirit',
    icon: '◈',
    description: 'Charisma, luck, speed, intuition',
    examples: 'Initiative, persuasion, sneaking, avoiding danger',
  },
}

export function calcMaxHp(body) {
  return body * 4
}

export function calcStartingStats() {
  // Default spread: 2/2/2 — players distribute 3 bonus points at creation
  return { body: 2, mind: 2, spirit: 2 }
}

export const CREATION_BONUS_POINTS = 3
export const CREATION_POINT_CAP = 4  // no single stat above 4 at start

// ── Ancestry groups ───────────────────────────────────────────────────────────

export const ANCESTRY_GROUPS = [
  { label: 'Common',           keys: ['human', 'elf', 'dwarf', 'halfling', 'gnome', 'orc', 'half_elf', 'half_orc'] },
  { label: 'Touched',          keys: ['tiefling', 'aasimar', 'dhampir', 'fey_touched', 'void_touched', 'shadow_born', 'storm_touched'] },
  { label: 'Beastkin',         keys: ['leonin', 'kenku', 'tabaxi', 'lizardfolk', 'tortle', 'minotaur', 'owlin'] },
  { label: 'Constructed',      keys: ['automaton', 'golem_born', 'synth'] },
  { label: 'Uncommon',         keys: ['goblin', 'kobold', 'bugbear', 'changeling', 'revenant', 'dragonborn', 'deep_one'] },
  { label: 'Setting-Specific', keys: ['survivor', 'mutant', 'netrunner', 'void_walker', 'custom'] },
]

// ── Ancestries ────────────────────────────────────────────────────────────────

export const ANCESTRIES = {
  human: {
    label: 'Human',
    description: 'Adaptable, ambitious, and remarkably good at convincing themselves they know what they\'re doing. Bonus: one extra ability at creation.',
    statBonus: {},
    bonusAbility: true,
    flavorTraits: ['ambitious', 'resilient', 'social', 'adaptable'],
    settingTags: ['all'],
    rarity: 'common',
  },
  elf: {
    label: 'Elf',
    description: 'Ancient and perceptive. They have watched empires rise and fall, and have opinions about both. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'keen_senses',
    flavorTraits: ['perceptive', 'graceful', 'long-memoried', 'patient'],
    settingTags: ['fantasy'],
    rarity: 'common',
  },
  dwarf: {
    label: 'Dwarf',
    description: 'Resilient, stubborn, and deeply offended by shoddy craftsmanship. +1 Body.',
    statBonus: { body: 1 },
    ability: 'stone_endurance',
    flavorTraits: ['stubborn', 'crafty', 'honorable', 'blunt'],
    settingTags: ['fantasy'],
    rarity: 'common',
  },
  halfling: {
    label: 'Halfling',
    description: 'Small, quick, and statistically improbable survivors. The universe seems reluctant to let them die. +1 Spirit.',
    statBonus: { spirit: 1 },
    ability: 'lucky',
    flavorTraits: ['cheerful', 'nimble', 'curious', 'underestimated'],
    settingTags: ['fantasy'],
    rarity: 'common',
  },
  gnome: {
    label: 'Gnome',
    description: 'Inventive, excitable, and genuinely convinced that this version of the device will not explode. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'tinker',
    flavorTraits: ['inventive', 'curious', 'excitable', 'easily distracted'],
    settingTags: ['fantasy', 'steampunk'],
    rarity: 'common',
  },
  orc: {
    label: 'Orc',
    description: 'Fierce, direct, and possessed of a clarity about violence that others find uncomfortable. +1 Body.',
    statBonus: { body: 1 },
    ability: 'battle_fury',
    flavorTraits: ['fierce', 'direct', 'honorbound', 'proud'],
    settingTags: ['fantasy'],
    rarity: 'common',
  },
  half_elf: {
    label: 'Half-Elf',
    description: 'Belongs to two worlds and is fully accepted by neither. Has learned to find that useful. +1 Spirit.',
    statBonus: { spirit: 1 },
    ability: 'silver_tongue',
    flavorTraits: ['adaptable', 'diplomatic', 'quietly resentful', 'charming'],
    settingTags: ['fantasy'],
    rarity: 'common',
  },
  half_orc: {
    label: 'Half-Orc',
    description: 'Spent a lifetime being underestimated. Has learned to weaponize that. +1 Body.',
    statBonus: { body: 1 },
    ability: 'intimidating_presence',
    flavorTraits: ['resilient', 'determined', 'observant', 'guarded'],
    settingTags: ['fantasy'],
    rarity: 'common',
  },
  tiefling: {
    label: 'Tiefling',
    description: 'Infernal heritage, unasked for. They have spent their life being perceived as a threat. Some of them decided to become one. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'shadow_sense',
    flavorTraits: ['perceptive', 'resilient', 'mysterious', 'self-reliant'],
    settingTags: ['fantasy'],
    rarity: 'common',
  },
  aasimar: {
    label: 'Aasimar',
    description: 'Touched by divine light. The expectations that come with it are exhausting. +1 Spirit.',
    statBonus: { spirit: 1 },
    ability: 'divine_grace',
    flavorTraits: ['compassionate', 'luminous', 'duty-bound', 'burdened'],
    settingTags: ['fantasy', 'mythic'],
    rarity: 'common',
  },
  dhampir: {
    label: 'Dhampir',
    description: 'Half-mortal, half-undead. Perpetually hungry, perpetually restrained, perpetually aware of both. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'blood_sense',
    flavorTraits: ['predatory', 'restrained', 'haunted', 'precise'],
    settingTags: ['fantasy', 'horror'],
    rarity: 'uncommon',
  },
  fey_touched: {
    label: 'Fey-Touched',
    description: 'Something from the other side left a mark. They are not entirely sure what was taken in exchange. +1 Spirit.',
    statBonus: { spirit: 1 },
    ability: 'glamour',
    flavorTraits: ['mercurial', 'enchanting', 'unreliable', 'beautiful'],
    settingTags: ['fantasy', 'weird'],
    rarity: 'uncommon',
  },
  void_touched: {
    label: 'Void-Touched',
    description: 'Something reached out from the dark between stars and left fingerprints on their soul. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'void_sight',
    flavorTraits: ['detached', 'perceptive', 'unsettling', 'calm'],
    settingTags: ['horror', 'scifi', 'weird'],
    rarity: 'rare',
  },
  shadow_born: {
    label: 'Shadow-Born',
    description: 'Born in darkness, between worlds, or at a moment when the boundary thinned. Shadows remember them. +1 Spirit.',
    statBonus: { spirit: 1 },
    ability: 'shadow_step',
    flavorTraits: ['quiet', 'watchful', 'nocturnal', 'uncomfortable in crowds'],
    settingTags: ['fantasy', 'horror'],
    rarity: 'uncommon',
  },
  storm_touched: {
    label: 'Storm-Touched',
    description: 'Lightning struck them, or they were born in the eye of something catastrophic. Either way, the weather has opinions about them now. +1 Body.',
    statBonus: { body: 1 },
    ability: 'storm_call',
    flavorTraits: ['volatile', 'electric', 'restless', 'drawn to high places'],
    settingTags: ['fantasy', 'mythic'],
    rarity: 'rare',
  },
  leonin: {
    label: 'Leonin',
    description: 'Lion-aspect. Regal, territorial, and possessed of a roar that stops fights before they start. +1 Body.',
    statBonus: { body: 1 },
    ability: 'fearsome_roar',
    flavorTraits: ['proud', 'protective', 'territorial', 'commanding'],
    settingTags: ['fantasy', 'mythic'],
    rarity: 'uncommon',
  },
  kenku: {
    label: 'Kenku',
    description: 'Crow-aspect. They lost something — their original voice, their wings, their name. They have been collecting replacements ever since. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'mimicry',
    flavorTraits: ['clever', 'acquisitive', 'melancholic', 'creative'],
    settingTags: ['fantasy'],
    rarity: 'uncommon',
  },
  tabaxi: {
    label: 'Tabaxi',
    description: 'Cat-aspect. Intensely curious, intermittently attentive, and faster than anything has a right to be. +1 Spirit.',
    statBonus: { spirit: 1 },
    ability: 'cats_grace',
    flavorTraits: ['curious', 'playful', 'easily distracted', 'surprisingly fast'],
    settingTags: ['fantasy'],
    rarity: 'uncommon',
  },
  lizardfolk: {
    label: 'Lizardfolk',
    description: 'Patient, practical, and operating on a moral framework that makes complete sense if you are a lizard. +1 Body.',
    statBonus: { body: 1 },
    ability: 'hold_breath',
    flavorTraits: ['patient', 'practical', 'alien', 'honest'],
    settingTags: ['fantasy'],
    rarity: 'uncommon',
  },
  tortle: {
    label: 'Tortle',
    description: 'They carry their home with them. This is a philosophical position as much as a physical one. +1 Body.',
    statBonus: { body: 1 },
    ability: 'shell_defense',
    flavorTraits: ['serene', 'grounded', 'philosophical', 'unhurried'],
    settingTags: ['fantasy'],
    rarity: 'uncommon',
  },
  minotaur: {
    label: 'Minotaur',
    description: 'Powerful, determined, and very tired of labyrinth jokes. +1 Body.',
    statBonus: { body: 1 },
    ability: 'gore',
    flavorTraits: ['determined', 'proud', 'direct', 'surprisingly gentle'],
    settingTags: ['fantasy', 'mythic'],
    rarity: 'uncommon',
  },
  owlin: {
    label: 'Owlin',
    description: 'Owl-aspect. They observe. They remember. They ask questions that take time to understand. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'silent_flight',
    flavorTraits: ['observant', 'quiet', 'patient', 'unsettling in the dark'],
    settingTags: ['fantasy', 'weird'],
    rarity: 'uncommon',
  },
  automaton: {
    label: 'Automaton',
    description: 'Built, not born. Does not sleep, does not bleed, does not entirely understand why the others keep doing both. +1 Body.',
    statBonus: { body: 1 },
    ability: 'unbreakable',
    flavorTraits: ['methodical', 'curious-about-life', 'loyal', 'literal'],
    settingTags: ['fantasy', 'steampunk', 'scifi'],
    rarity: 'uncommon',
  },
  golem_born: {
    label: 'Golem-Born',
    description: 'Made of stranger stuff than metal — clay, crystal, bone, or something that doesn\'t have a name. Animated by something that isn\'t quite magic. +1 Body.',
    statBonus: { body: 1 },
    ability: 'material_resistance',
    flavorTraits: ['patient', 'massive', 'slowly awakening', 'literal'],
    settingTags: ['fantasy', 'weird'],
    rarity: 'rare',
  },
  synth: {
    label: 'Synth',
    description: 'Artificial human — biological or mechanical or somewhere between. Built to pass. Increasingly unsure whether they want to. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'system_interface',
    flavorTraits: ['analytical', 'identity-questioning', 'precise', 'observant'],
    settingTags: ['scifi', 'cyberpunk'],
    rarity: 'uncommon',
  },
  goblin: {
    label: 'Goblin',
    description: 'Small, resourceful, and operating at a frequency others find difficult to track. Underestimated their entire life. Done with that. +1 Spirit.',
    statBonus: { spirit: 1 },
    ability: 'scavenger',
    flavorTraits: ['resourceful', 'cunning', 'chaotic', 'underestimated'],
    settingTags: ['fantasy'],
    rarity: 'uncommon',
  },
  kobold: {
    label: 'Kobold',
    description: 'Small, trap-minded, and operating on the principle that preparation beats power every time. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'trap_sense',
    flavorTraits: ['meticulous', 'paranoid', 'clever', 'pack-oriented'],
    settingTags: ['fantasy'],
    rarity: 'uncommon',
  },
  bugbear: {
    label: 'Bugbear',
    description: 'Large, quiet, and startling. They move surprisingly softly for something their size. People find this unsettling. They find that useful. +1 Body.',
    statBonus: { body: 1 },
    ability: 'surprise_attack',
    flavorTraits: ['stealthy', 'practical', 'lazy when possible', 'dangerous when not'],
    settingTags: ['fantasy'],
    rarity: 'uncommon',
  },
  changeling: {
    label: 'Changeling',
    description: 'Master of faces and forms. Has worn so many faces they sometimes forget which one is theirs. +1 Spirit.',
    statBonus: { spirit: 1 },
    ability: 'shift_form',
    flavorTraits: ['adaptable', 'enigmatic', 'observant', 'untethered'],
    settingTags: ['fantasy', 'espionage'],
    rarity: 'uncommon',
  },
  revenant: {
    label: 'Revenant',
    description: 'Dead, but with unfinished business. The unfinished business is the only thing keeping them here. It had better be worth it. +1 Body.',
    statBonus: { body: 1 },
    ability: 'undying',
    flavorTraits: ['focused', 'fading', 'purposeful', 'increasingly detached'],
    settingTags: ['fantasy', 'horror'],
    rarity: 'rare',
  },
  dragonborn: {
    label: 'Dragonborn',
    description: 'Draconic heritage runs in their blood. So does the pride, the hunger, and the long memory. +1 Body.',
    statBonus: { body: 1 },
    ability: 'dragon_breath',
    flavorTraits: ['proud', 'fierce', 'honorable', 'acquisitive'],
    settingTags: ['fantasy', 'mythic'],
    rarity: 'uncommon',
  },
  deep_one: {
    label: 'Deep One',
    description: 'Something from the deep water. Not entirely human, not entirely other. The transformation is ongoing. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'deep_call',
    flavorTraits: ['ancient', 'patient', 'drawn to water', 'otherly beautiful'],
    settingTags: ['horror', 'weird', 'mythic'],
    rarity: 'rare',
  },
  survivor: {
    label: 'Survivor',
    description: 'Just a person. The dungeon, the apocalypse, the disaster — it found them and they kept going. No special powers. Just the particular competence of someone who has refused to die. +1 Body or Mind (choose at creation).',
    statBonus: {},
    ability: 'grit',
    flavorTraits: ['resilient', 'practical', 'haunted', 'quietly furious'],
    settingTags: ['dungeon_crawler', 'postapoc', 'survival_horror'],
    rarity: 'setting-specific',
    settingNote: 'Best for: Dungeon Crawler, Post-Apocalyptic, Survival Horror',
  },
  mutant: {
    label: 'Mutant',
    description: 'The radiation, the pathogen, the experimental compound — something changed them. The change is not done yet. +1 Body.',
    statBonus: { body: 1 },
    ability: 'adaptive_mutation',
    flavorTraits: ['changed', 'stigmatized', 'adaptable', 'unpredictable'],
    settingTags: ['postapoc', 'biopunk', 'dungeon_crawler'],
    rarity: 'setting-specific',
    settingNote: 'Best for: Post-Apocalyptic, Biopunk, Dungeon Crawler',
  },
  netrunner: {
    label: 'Netrunner',
    description: 'Half in the physical world, half in the network. The boundary is getting thinner. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'jack_in',
    flavorTraits: ['analytical', 'distracted', 'fast in the digital', 'slow in the physical'],
    settingTags: ['cyberpunk', 'scifi'],
    rarity: 'setting-specific',
    settingNote: 'Best for: Cyberpunk, Dystopian',
  },
  void_walker: {
    label: 'Void-Walker',
    description: 'They have spent time in the space between stars — physically, psychologically, or both. They came back changed. Scale means nothing to them anymore. +1 Mind.',
    statBonus: { mind: 1 },
    ability: 'void_adaptation',
    flavorTraits: ['perspective-shifted', 'calm', 'occasionally incomprehensible', 'fearless of the dark'],
    settingTags: ['scifi', 'cosmic_horror', 'weird'],
    rarity: 'setting-specific',
    settingNote: 'Best for: Space Opera, Cosmic Horror, Weird Fiction',
  },
  custom: {
    label: 'Custom',
    description: 'Define your own ancestry with the DM\'s help. Any origin is possible.',
    statBonus: {},
    flavorTraits: [],
    settingTags: ['all'],
    rarity: 'common',
  },
}

// ── Backgrounds ───────────────────────────────────────────────────────────────

export const BACKGROUNDS = {
  soldier: {
    label: 'Soldier',
    bonus: 'body',
    description: 'Trained in warfare. +1 to combat rolls in open battle.',
    skill: 'Combat tactics and weapon proficiency',
    contact: 'A former commanding officer or unit comrade',
    hook: 'A war you fought in left something unresolved',
  },
  mercenary: {
    label: 'Mercenary',
    bonus: 'body',
    description: 'Fought for coin, not cause. Knows the value of information before a contract.',
    skill: 'Evaluating threats, negotiating rates, knowing when to walk away',
    contact: 'A fixer or broker who still sends work',
    hook: 'A job gone wrong that you\'ve never explained to anyone',
  },
  gladiator: {
    label: 'Gladiator',
    bonus: 'body',
    description: 'Trained to fight and entertain simultaneously. Knows how to read a crowd as well as an opponent.',
    skill: 'Performance combat, crowd management, reading body language in a fight',
    contact: 'A trainer, rival, or fan with influence in the arena circuit',
    hook: 'Your freedom cost someone else theirs',
  },
  guard: {
    label: 'Guard',
    bonus: 'body',
    description: 'Protected people, places, or caravans. Knows the difference between a real threat and posturing.',
    skill: 'Threat assessment, patrol patterns, staying awake',
    contact: 'A merchant or noble whose property you once protected',
    hook: 'Something got through on your watch',
  },
  scholar: {
    label: 'Scholar',
    bonus: 'mind',
    description: 'Studied history and lore. Can identify most things.',
    skill: 'History, languages, identifying artifacts and phenomena',
    contact: 'A mentor at an academy or library who still answers letters',
    hook: 'A theory you proved that someone powerful wants disproved',
  },
  physician: {
    label: 'Physician',
    bonus: 'mind',
    description: 'Healer of wounds and disease. Can stabilise the dying with basic tools.',
    skill: 'Medicine, anatomy, diagnosing conditions and poisons',
    contact: 'A hospital, healer\'s guild, or desperate family that owes you',
    hook: 'A patient you couldn\'t save — or shouldn\'t have',
  },
  witch: {
    label: 'Witch',
    bonus: 'mind',
    description: 'Keeper of folk magic and herb lore. Can brew potions and read omens.',
    skill: 'Herbalism, divination, low magic, reading signs',
    contact: 'A coven, wise-woman network, or hedge-magic community',
    hook: 'Something you summoned or cursed that hasn\'t finished with you',
  },
  cartographer: {
    label: 'Cartographer',
    bonus: 'mind',
    description: 'Mapped the known world and beyond. Never truly lost.',
    skill: 'Navigation, surveying, recalling geographic and political detail',
    contact: 'A patron, explorer\'s guild, or rival mapmaker',
    hook: 'A map you made that led to something terrible',
  },
  alchemist: {
    label: 'Alchemist',
    bonus: 'mind',
    description: 'Transforms materials and brews the improbable. The workshop explosions were all educational.',
    skill: 'Potion-making, identifying substances, improvised compounds',
    contact: 'A supplier, competitor, or former employer in the trade',
    hook: 'A formula you sold that you shouldn\'t have',
  },
  sage: {
    label: 'Sage',
    bonus: 'mind',
    description: 'Deep expertise in one narrow field. Knows more about one thing than anyone you\'ll ever meet.',
    skill: 'Specialist knowledge (choose field), research, cross-referencing obscure sources',
    contact: 'A peer in the field, or an institution that funds your work',
    hook: 'What you know about your subject is dangerous to the wrong person',
  },
  artisan: {
    label: 'Artisan',
    bonus: 'mind',
    description: 'Master of a craft. Can create and repair equipment.',
    skill: 'Crafting, appraising quality, improvised repairs',
    contact: 'A guild, workshop, or wealthy patron',
    hook: 'A piece you made that ended up somewhere it shouldn\'t',
  },
  merchant: {
    label: 'Merchant',
    bonus: 'spirit',
    description: 'Sharp trader. Better prices and rumor-gathering.',
    skill: 'Negotiation, valuation, supply chains and market knowledge',
    contact: 'A trade partner, creditor, or competitor in multiple cities',
    hook: 'A deal that made you rich but cost someone else more',
  },
  innkeeper: {
    label: 'Innkeeper',
    bonus: 'spirit',
    description: 'Heard every secret whispered over ale. +1 to gathering information.',
    skill: 'Reading people, managing conflict, local knowledge and gossip',
    contact: 'Regular customers across the region who still pass through',
    hook: 'Something overheard that you\'ve been pretending you didn\'t hear',
  },
  farmer: {
    label: 'Farmer',
    bonus: 'body',
    description: 'Hard work and practical wisdom. Knows weather, plants, and animals.',
    skill: 'Animal handling, agriculture, weather reading, practical problem-solving',
    contact: 'A neighboring community or family still working the land',
    hook: 'What drove you off the land — or what you left behind when you went',
  },
  sailor: {
    label: 'Sailor',
    bonus: 'body',
    description: 'Weathered voyager. +1 on sea and storm challenges.',
    skill: 'Navigation, knot-work, weather, surviving at sea',
    contact: 'A captain, port authority, or crew still on the water',
    hook: 'Something that happened at sea that no one would believe',
  },
  rogue: {
    label: 'Rogue',
    bonus: 'spirit',
    description: 'Life in the shadows. +1 to stealth and deception.',
    skill: 'Lockpicking, sleight of hand, moving unseen',
    contact: 'A fence, guild, or partner in a previous operation',
    hook: 'A score that went wrong and left someone else holding it',
  },
  criminal: {
    label: 'Criminal',
    bonus: 'spirit',
    description: 'Knows the underworld. Contacts in most cities.',
    skill: 'Underworld navigation, contraband, recognizing heat',
    contact: 'A boss, colleague, or someone you informed on',
    hook: 'A debt or grudge still outstanding',
  },
  spy: {
    label: 'Spy',
    bonus: 'spirit',
    description: 'Trained in intelligence work. Knows how to disappear and how to listen.',
    skill: 'Surveillance, disguise, information extraction, cover identities',
    contact: 'A handler, a burned asset, or an enemy who knows your face',
    hook: 'An operation that went off-script in a way that can\'t be officially acknowledged',
  },
  smuggler: {
    label: 'Smuggler',
    bonus: 'spirit',
    description: 'Moves things across borders that aren\'t supposed to move. Knows every checkpoint and every blind eye.',
    skill: 'Hidden compartments, border crossings, bribery, route knowledge',
    contact: 'A network of people who owe you or who you owe',
    hook: 'A shipment you took that someone very serious wants back',
  },
  noble: {
    label: 'Noble',
    bonus: 'spirit',
    description: 'Born to privilege. +1 to social rolls with aristocrats.',
    skill: 'Etiquette, heraldry, political maneuvering, managing estates',
    contact: 'Family connections, a political ally, or a dangerous rival',
    hook: 'Something about your house, your name, or your inheritance that you haven\'t disclosed',
  },
  priest: {
    label: 'Priest',
    bonus: 'mind',
    description: 'Devoted servant. +1 to healing and warding.',
    skill: 'Theology, ritual, counseling, identifying divine or unholy phenomena',
    contact: 'A temple hierarchy, a congregation, or a superior who sent you somewhere',
    hook: 'A crisis of faith — or something you witnessed that your faith hasn\'t explained',
  },
  performer: {
    label: 'Performer',
    bonus: 'spirit',
    description: 'Storyteller, musician, or actor. Knows how to hold a room and work a crowd.',
    skill: 'Performance, mimicry, crowd-reading, spreading information as entertainment',
    contact: 'A patron, a troupe, or a venue that still books you',
    hook: 'A performance — or a rumor spread — that had real consequences',
  },
  monk: {
    label: 'Monk',
    bonus: 'mind',
    description: 'Trained in discipline, contemplation, and often combat. Carries stillness into chaos.',
    skill: 'Unarmed combat, meditation, resisting mental influence',
    contact: 'A monastery, an order, or a master whose teaching you are still working through',
    hook: 'Why you left — and whether you\'re supposed to go back',
  },
  ranger: {
    label: 'Ranger',
    bonus: 'body',
    description: 'Wilderness survivor. +1 to tracking and nature.',
    skill: 'Tracking, survival, terrain reading, moving without leaving sign',
    contact: 'A warden, a wilderness community, or someone you guide through dangerous land',
    hook: 'Something in the wild that you\'ve been watching — or that has been watching you',
  },
  hunter: {
    label: 'Hunter',
    bonus: 'body',
    description: 'Tracks prey through any terrain. +1 to pursuit and ambush.',
    skill: 'Hunting, trapping, reading animal behavior, patience',
    contact: 'A village that relies on you, or a buyer for unusual specimens',
    hook: 'A creature you tracked that you didn\'t — couldn\'t — kill',
  },
  nomad: {
    label: 'Nomad',
    bonus: 'spirit',
    description: 'Never stayed anywhere long enough to call it home. Knows more roads than most people know cities.',
    skill: 'Overland travel, reading strangers, cultural adaptability',
    contact: 'A network of people met on the road — loose, but wide',
    hook: 'Something you are traveling toward, or away from',
  },
  crawler: {
    label: 'Dungeon Crawler',
    bonus: 'body',
    description: 'Delved into ruins, vaults, and places that wanted to kill them. Still here.',
    skill: 'Trap detection, dungeon navigation, looting efficiently, staying calm underground',
    contact: 'A crew, a cartographer, or a fence who handles what comes out of the deep',
    hook: 'Something down there you left behind — or that followed you out',
    settingNote: 'Best for: Dungeon Crawler, Fantasy Adventure',
  },
  streamer: {
    label: 'Streamer',
    bonus: 'spirit',
    description: 'Built an audience watching them survive things. The audience is always watching. That\'s either a resource or a problem.',
    skill: 'Broadcasting, audience management, staying entertaining under pressure',
    contact: 'A fanbase, a sponsor, or a competitor with a grudge',
    hook: 'Something caught on broadcast that someone wants deleted',
    settingNote: 'Best for: Near-Future, Cyberpunk, Post-Apocalyptic',
  },
  hacker: {
    label: 'Hacker',
    bonus: 'mind',
    description: 'Systems are just puzzles. Some puzzles have consequences.',
    skill: 'Network intrusion, data recovery, system analysis, covering tracks',
    contact: 'A collective, a client, or someone whose system you were inside',
    hook: 'Something you found in a system that you weren\'t supposed to find',
    settingNote: 'Best for: Cyberpunk, Sci-Fi, Near-Future',
  },
  corporate: {
    label: 'Corporate',
    bonus: 'spirit',
    description: 'Operated inside a large institution. Knows how power moves through bureaucracy.',
    skill: 'Corporate politics, resource allocation, reading people in professional contexts',
    contact: 'A former superior, a lateral ally, or someone you outmaneuvered',
    hook: 'Why you\'re no longer inside — and whether they want you back or want you gone',
    settingNote: 'Best for: Cyberpunk, Dystopian, Corporate Thriller',
  },
  cultist: {
    label: 'Cultist',
    bonus: 'mind',
    description: 'Was part of something. May still be. The ideology leaves marks even after the organization doesn\'t.',
    skill: 'Ritual knowledge, recognizing true believers, group psychology',
    contact: 'Former members — some who got out, some who didn\'t',
    hook: 'What you did while you believed, and whether you\'ve come to terms with it',
    settingNote: 'Best for: Horror, Weird Fiction, Fantasy',
  },
  exile: {
    label: 'Exile',
    bonus: 'spirit',
    description: 'Expelled from somewhere — a nation, a family, an order, a people. Carries the weight of what was lost.',
    skill: 'Survival outside normal support structures, reading new environments quickly',
    contact: 'Someone from before the exile — an ally who stayed, or an enemy who drove you out',
    hook: 'The reason for the exile, and whether it was just',
  },
  custom: {
    label: 'Custom',
    bonus: null,
    description: 'Define your own background with the DM.',
    skill: null,
    contact: null,
    hook: null,
  },
}

// ── Abilities ─────────────────────────────────────────────────────────────────

export const ABILITIES = {
  // ── Combat ──────────────────────────────────────────────────────────────────
  cleave: {
    label: 'Cleave',
    type: 'combat',
    description: 'On a strong success in melee, hit an adjacent enemy too.',
    settingTags: ['all'],
  },
  shield_wall: {
    label: 'Shield Wall',
    type: 'combat',
    description: 'When defending, add +1 die to defense rolls.',
    settingTags: ['all'],
  },
  battle_fury: {
    label: 'Battle Fury',
    type: 'combat',
    description: 'After taking damage, gain +1 die on your next attack.',
    settingTags: ['all'],
  },
  precise_shot: {
    label: 'Precise Shot',
    type: 'combat',
    description: 'Ranged attacks ignore cover on a success.',
    settingTags: ['all'],
  },
  two_weapon: {
    label: 'Two-Weapon Fighting',
    type: 'combat',
    description: 'When fighting with two weapons, reroll one die per attack.',
    settingTags: ['all'],
  },
  defensive_stance: {
    label: 'Defensive Stance',
    type: 'combat',
    description: 'Spend your action to gain +2 dice to all defense rolls until your next turn.',
    settingTags: ['all'],
  },
  dirty_fighting: {
    label: 'Dirty Fighting',
    type: 'combat',
    description: 'Once per scene, impose a condition on an opponent on any success (not just strong).',
    settingTags: ['all'],
  },
  counter_strike: {
    label: 'Counter-Strike',
    type: 'combat',
    description: 'When you defend successfully against a melee attack, immediately make a free attack against that opponent.',
    settingTags: ['all'],
  },
  called_shot: {
    label: 'Called Shot',
    type: 'combat',
    description: 'Declare a target location before rolling. On a strong success, apply a specific condition (disarmed, blinded, slowed).',
    settingTags: ['all'],
  },
  executioner: {
    label: 'Executioner',
    type: 'combat',
    description: 'Attacks against stunned or incapacitated targets deal +2 damage.',
    settingTags: ['all'],
  },
  berserker: {
    label: 'Berserker',
    type: 'combat',
    description: 'While below half HP, gain +2 dice on attacks. You cannot retreat voluntarily while in this state.',
    settingTags: ['all'],
  },
  intimidating_presence: {
    label: 'Intimidating Presence',
    type: 'combat',
    description: 'Once per scene, force an enemy to make a Spirit roll or lose their next action to fear.',
    settingTags: ['all'],
  },
  dragon_breath: {
    label: 'Dragon Breath',
    type: 'combat',
    description: 'Once per scene: breathe elemental fire in a cone (roll Body, 1 damage per success to all in area).',
    settingTags: ['fantasy', 'mythic'],
  },
  fearsome_roar: {
    label: 'Fearsome Roar',
    type: 'combat',
    description: 'Once per scene: roar to shake all enemies in earshot. They lose 1 die on their next roll.',
    settingTags: ['fantasy', 'mythic'],
  },
  gore: {
    label: 'Gore',
    type: 'combat',
    description: 'Can make a charging horn attack that deals +2 damage and knocks the target prone.',
    settingTags: ['fantasy', 'mythic'],
  },
  surprise_attack: {
    label: 'Surprise Attack',
    type: 'combat',
    description: 'When attacking from stealth or ambush, add +2 dice to the first attack roll.',
    settingTags: ['all'],
  },

  // ── Magic ────────────────────────────────────────────────────────────────────
  arcane_bolt: {
    label: 'Arcane Bolt',
    type: 'magic',
    description: 'Mind-based ranged attack dealing 2 damage on success.',
    settingTags: ['fantasy', 'mythic', 'weird'],
  },
  mend: {
    label: 'Mend',
    type: 'magic',
    description: 'Restore 1d6 HP to a touched target (roll Mind).',
    settingTags: ['fantasy', 'mythic'],
  },
  ward: {
    label: 'Ward',
    type: 'magic',
    description: 'Create a protective barrier — +2 dice to one defense roll.',
    settingTags: ['fantasy', 'mythic'],
  },
  illusion: {
    label: 'Illusion',
    type: 'magic',
    description: 'Create a convincing visual illusion (roll Mind).',
    settingTags: ['fantasy', 'weird'],
  },
  divine_grace: {
    label: 'Divine Grace',
    type: 'magic',
    description: 'Once per scene: channel celestial power to heal 3 HP to any touched target, or add +2 dice to one roll.',
    settingTags: ['fantasy', 'mythic'],
  },
  elemental_burst: {
    label: 'Elemental Burst',
    type: 'magic',
    description: 'Unleash a burst of elemental energy in a small area. Roll Mind — 1 damage per success to all targets in range.',
    settingTags: ['fantasy', 'mythic', 'weird'],
  },
  summon: {
    label: 'Summon',
    type: 'magic',
    description: 'Call a bound entity or elemental to serve for one scene (roll Mind — higher successes = stronger entity).',
    settingTags: ['fantasy', 'mythic', 'horror'],
  },
  curse: {
    label: 'Curse',
    type: 'magic',
    description: 'Lay a persistent debuff on a target. Roll Mind opposed by their Spirit. On success, they suffer -1 die to a specific stat until the curse is lifted.',
    settingTags: ['fantasy', 'horror', 'weird'],
  },
  blood_magic: {
    label: 'Blood Magic',
    type: 'magic',
    description: 'Spend HP to boost a spell. Every 2 HP sacrificed adds +1 die to a magic roll.',
    settingTags: ['fantasy', 'horror'],
  },
  divination: {
    label: 'Divination',
    type: 'magic',
    description: 'Ask the DM one yes/no question about the current situation. The answer is true (roll Mind — partial success gives a vague answer).',
    settingTags: ['fantasy', 'mythic', 'horror'],
  },
  enchant: {
    label: 'Enchant',
    type: 'magic',
    description: 'Temporarily imbue a weapon or object with magical properties for one scene (roll Mind).',
    settingTags: ['fantasy', 'mythic'],
  },
  void_sight: {
    label: 'Void Sight',
    type: 'magic',
    description: 'See things that should not be visible — entities, portals, psychic residue, the shape of things to come.',
    settingTags: ['horror', 'scifi', 'weird', 'cosmic_horror'],
  },
  storm_call: {
    label: 'Storm Call',
    type: 'magic',
    description: 'Once per scene: call a localized storm. All outdoor rolls gain or lose 1 die depending on DM\'s interpretation of chaos.',
    settingTags: ['fantasy', 'mythic'],
  },
  jack_in: {
    label: 'Jack In',
    type: 'magic',
    description: 'Interface directly with digital systems. Roll Mind to hack, extract data, or disable networked devices.',
    settingTags: ['cyberpunk', 'scifi'],
  },
  system_interface: {
    label: 'System Interface',
    type: 'magic',
    description: 'Communicate with and command electronic or networked systems without physical input.',
    settingTags: ['scifi', 'cyberpunk'],
  },

  // ── Survival & Exploration ──────────────────────────────────────────────────
  keen_senses: {
    label: 'Keen Senses',
    type: 'utility',
    description: 'Never surprised. +1 die to perception and detection.',
    settingTags: ['all'],
  },
  dark_sight: {
    label: 'Dark Sight',
    type: 'utility',
    description: 'See clearly in total darkness. Immune to blindness effects from darkness.',
    settingTags: ['all'],
  },
  trap_sense: {
    label: 'Trap Sense',
    type: 'utility',
    description: '+1 die to detecting and disabling traps. Can intuit danger in prepared environments.',
    settingTags: ['all'],
  },
  scavenger: {
    label: 'Scavenger',
    type: 'utility',
    description: 'Find useful materials in unlikely places. Once per scene, locate a needed mundane item with a Mind roll.',
    settingTags: ['all'],
  },
  navigation: {
    label: 'Navigation',
    type: 'utility',
    description: 'Never lost. +1 die to all travel and wayfinding rolls. Can estimate position from stars, landmarks, or dead reckoning.',
    settingTags: ['all'],
  },
  lockpicking: {
    label: 'Lockpicking',
    type: 'utility',
    description: '+1 die to opening locks, mechanisms, and secured containers without the key.',
    settingTags: ['all'],
  },
  climbing: {
    label: 'Climbing',
    type: 'utility',
    description: '+1 die to climbing and vertical movement. Can free-climb surfaces others would need equipment for.',
    settingTags: ['all'],
  },
  swimming: {
    label: 'Swimming',
    type: 'utility',
    description: '+1 die to all water movement. Can hold breath for extended periods and navigate underwater.',
    settingTags: ['all'],
  },
  foraging: {
    label: 'Foraging',
    type: 'utility',
    description: 'Find food, water, and medicinal plants in the wild. The party never goes hungry in natural environments.',
    settingTags: ['all'],
  },
  field_medicine: {
    label: 'Field Medicine',
    type: 'utility',
    description: 'Stabilize a dying character without supplies. Restore 1d4 HP once per scene with available materials.',
    settingTags: ['all'],
  },
  crafting: {
    label: 'Crafting',
    type: 'utility',
    description: 'Create or significantly repair equipment given time and materials. +1 die to all construction tasks.',
    settingTags: ['all'],
  },
  tinker: {
    label: 'Tinker',
    type: 'utility',
    description: '+1 die when working with mechanical or magical devices. Can jury-rig repairs with scavenged parts.',
    settingTags: ['fantasy', 'steampunk', 'scifi'],
  },
  hold_breath: {
    label: 'Hold Breath',
    type: 'utility',
    description: 'Can hold breath for extraordinary durations. +1 die to all aquatic and suffocation challenges.',
    settingTags: ['all'],
  },
  shell_defense: {
    label: 'Shell Defense',
    type: 'utility',
    description: 'Once per scene, withdraw into shell: +3 dice to defense but cannot attack or move until next turn.',
    settingTags: ['fantasy'],
  },
  grit: {
    label: 'Grit',
    type: 'utility',
    description: 'Once per session, succeed on a roll that would have failed — the margin of survival that experience provides.',
    settingTags: ['all'],
  },
  adaptive_mutation: {
    label: 'Adaptive Mutation',
    type: 'utility',
    description: 'Once per session, gain a temporary physical adaptation relevant to the current challenge (DM describes the form).',
    settingTags: ['postapoc', 'biopunk', 'dungeon_crawler'],
  },
  void_adaptation: {
    label: 'Void Adaptation',
    type: 'utility',
    description: 'Unaffected by vacuum, extreme pressure, or environmental extremes. +1 die to all survival rolls in hostile environments.',
    settingTags: ['scifi', 'cosmic_horror', 'weird'],
  },
  unbreakable: {
    label: 'Unbreakable',
    type: 'utility',
    description: 'Once per scene, ignore the first Wounded or Stunned condition inflicted on you.',
    settingTags: ['all'],
  },
  undying: {
    label: 'Undying',
    type: 'utility',
    description: 'When reduced to 0 HP, make a Body roll. On any success, remain at 1 HP instead. (Once per session.)',
    settingTags: ['fantasy', 'horror'],
  },
  lucky: {
    label: 'Lucky',
    type: 'utility',
    description: 'Once per session, reroll any one die.',
    settingTags: ['all'],
  },
  material_resistance: {
    label: 'Material Resistance',
    type: 'utility',
    description: 'Reduce all physical damage by 1. Immune to conditions caused by the material you are made from.',
    settingTags: ['fantasy', 'weird'],
  },
  nature_bond: {
    label: 'Nature Bond',
    type: 'utility',
    description: '+1 die to nature and animal-handling rolls. Wild animals will not attack you unprovoked.',
    settingTags: ['fantasy', 'mythic'],
  },

  // ── Stealth & Deception ─────────────────────────────────────────────────────
  shadow_sense: {
    label: 'Shadow Sense',
    type: 'stealth',
    description: 'Sense lies, hidden creatures, and magical auras.',
    settingTags: ['all'],
  },
  shadow_step: {
    label: 'Shadow Step',
    type: 'stealth',
    description: 'Once per scene, teleport between shadows up to 30 feet apart.',
    settingTags: ['fantasy', 'horror'],
  },
  shift_form: {
    label: 'Shift Form',
    type: 'stealth',
    description: 'Once per hour, perfectly mimic the appearance of any humanoid you have seen.',
    settingTags: ['fantasy', 'espionage'],
  },
  blood_sense: {
    label: 'Blood Sense',
    type: 'stealth',
    description: 'Sense the heartbeat and location of living creatures within the same room or space.',
    settingTags: ['fantasy', 'horror'],
  },
  stone_endurance: {
    label: 'Stone Endurance',
    type: 'utility',
    description: 'Once per scene, reduce incoming damage by 2.',
    settingTags: ['fantasy'],
  },
  mimicry: {
    label: 'Mimicry',
    type: 'stealth',
    description: 'Perfectly reproduce any sound or voice you have heard. +1 die to deception rolls using sound.',
    settingTags: ['all'],
  },
  cats_grace: {
    label: 'Cat\'s Grace',
    type: 'stealth',
    description: '+1 die to all agility, balance, and stealth rolls. Never take fall damage from heights up to 30 feet.',
    settingTags: ['all'],
  },
  silent_flight: {
    label: 'Silent Flight',
    type: 'stealth',
    description: 'Move through the air without sound. +2 dice to stealth while airborne.',
    settingTags: ['fantasy', 'weird'],
  },
  deep_call: {
    label: 'Deep Call',
    type: 'stealth',
    description: 'Communicate telepathically with aquatic creatures. Sense water sources and ocean depth.',
    settingTags: ['horror', 'weird', 'mythic'],
  },

  // ── Social ──────────────────────────────────────────────────────────────────
  silver_tongue: {
    label: 'Silver Tongue',
    type: 'social',
    description: '+1 die on all persuasion and deception rolls.',
    settingTags: ['all'],
  },
  inspire: {
    label: 'Inspire',
    type: 'social',
    description: 'Grant an ally +1 die on their next roll.',
    settingTags: ['all'],
  },
  streetwise: {
    label: 'Streetwise',
    type: 'social',
    description: 'Know the layout of any city, who to bribe, and who to avoid. +1 die to urban survival.',
    settingTags: ['all'],
  },
  healer: {
    label: 'Healer',
    type: 'social',
    description: 'Stabilise a dying character with basic supplies. Restore 1d4 HP once per scene without rolling.',
    settingTags: ['all'],
  },
  command: {
    label: 'Command',
    type: 'social',
    description: 'Issue an order that NPCs with lower social standing must roll Spirit to refuse.',
    settingTags: ['all'],
  },
  read_the_room: {
    label: 'Read the Room',
    type: 'social',
    description: 'Once per scene, ask the DM the current emotional disposition of everyone present.',
    settingTags: ['all'],
  },
  contacts: {
    label: 'Contacts',
    type: 'social',
    description: 'In any settlement, you can locate a useful contact with a Spirit roll. They may want something in return.',
    settingTags: ['all'],
  },
  propaganda: {
    label: 'Propaganda',
    type: 'social',
    description: 'Spread a narrative through a community. Given time, shift public opinion on one topic (roll Spirit).',
    settingTags: ['all'],
  },
  leadership: {
    label: 'Leadership',
    type: 'social',
    description: 'When you lead a group action, all participants gain +1 die. Your presence steadies allies under pressure.',
    settingTags: ['all'],
  },
  empathy: {
    label: 'Empathy',
    type: 'social',
    description: 'Read the true emotional state of anyone you speak with. +1 die to all social rolls once you know what they want.',
    settingTags: ['all'],
  },
  glamour: {
    label: 'Glamour',
    type: 'social',
    description: 'Once per scene, make yourself or another seem captivating or forgettable at will. +1 die to related rolls.',
    settingTags: ['fantasy', 'weird'],
  },

  // ── Passive ─────────────────────────────────────────────────────────────────
  pain_tolerance: {
    label: 'Pain Tolerance',
    type: 'passive',
    description: 'The Wounded condition does not reduce your dice until you are at half HP or lower.',
    settingTags: ['all'],
  },
  photographic_memory: {
    label: 'Photographic Memory',
    type: 'passive',
    description: 'Recall anything you have seen, heard, or read with perfect accuracy. +1 die to any roll requiring prior knowledge.',
    settingTags: ['all'],
  },
  ambidextrous: {
    label: 'Ambidextrous',
    type: 'passive',
    description: 'No penalty for off-hand actions. Can perform two fine-motor tasks simultaneously.',
    settingTags: ['all'],
  },
  light_sleeper: {
    label: 'Light Sleeper',
    type: 'passive',
    description: 'Always wake at the slightest threat. The party is never ambushed while you are on watch.',
    settingTags: ['all'],
  },
  iron_stomach: {
    label: 'Iron Stomach',
    type: 'passive',
    description: 'Immune to ingested poisons and diseases. Can eat things that would kill most people.',
    settingTags: ['all'],
  },
  danger_sense: {
    label: 'Danger Sense',
    type: 'passive',
    description: 'The DM will warn you when you are about to do something that will trigger a trap or ambush.',
    settingTags: ['all'],
  },
  quick_learner: {
    label: 'Quick Learner',
    type: 'passive',
    description: 'After failing a roll, gain +1 die the next time you attempt the same type of action in the same session.',
    settingTags: ['all'],
  },
  scent: {
    label: 'Scent',
    type: 'passive',
    description: 'Track by smell. Identify individuals, substances, and emotions by scent. +1 die to tracking rolls.',
    settingTags: ['all'],
  },
  broadcast_appeal: {
    label: 'Broadcast Appeal',
    type: 'passive',
    description: 'Your presence on camera or stream generates goodwill. +1 die to social rolls when an audience is watching.',
    settingTags: ['scifi', 'cyberpunk', 'postapoc'],
  },
  nature_bond_passive: {
    label: 'Nature Bond',
    type: 'passive',
    description: '+1 die to nature and animal-handling rolls. Wild animals will not attack you unprovoked.',
    settingTags: ['fantasy', 'mythic'],
  },
}

// ── Condition system ──────────────────────────────────────────────────────────

export const CONDITIONS = {
  wounded:    { label: 'Wounded',    effect: '-1 die to Body rolls',      duration: 'until healed' },
  shaken:     { label: 'Shaken',     effect: '-1 die to Spirit rolls',    duration: 'until calmed' },
  confused:   { label: 'Confused',   effect: '-1 die to Mind rolls',      duration: 'until cleared' },
  stunned:    { label: 'Stunned',    effect: 'skip next turn',            duration: '1 turn' },
  burning:    { label: 'Burning',    effect: '1 damage per round',        duration: 'until extinguished' },
  poisoned:   { label: 'Poisoned',   effect: '-1 die to all rolls',       duration: 'until cured' },
  inspired:   { label: 'Inspired',   effect: '+1 die to next roll',       duration: '1 roll' },
  hidden:     { label: 'Hidden',     effect: 'unseen, +1 die to attacks', duration: 'until revealed' },
}

// ── DM context string ─────────────────────────────────────────────────────────

/**
 * Returns a concise rules summary for injection into the DM system prompt.
 * Kept short to preserve context window budget.
 */
export function getRulesContextString() {
  return `
RULES SYSTEM (Three Fates):
Stats: Body (physical), Mind (arcane/mental), Spirit (social/speed). Each rated 1–5.
Resolution: Roll [stat] d6s. Each 5 or 6 = success.
  0 successes = Failure | 1 = Partial (success with cost) | 2 = Success | 3 = Strong | 4+ = Critical
Opposed rolls: both sides roll, higher successes wins. Tie favors defender.
Combat: Initiative by Spirit roll. Attack vs defense (opposed Body rolls for melee, Mind for magic/ranged).
  Net successes = HP damage. HP = Body × 4.
Conditions: wounded/shaken/confused (-1 die), stunned (skip turn), burning (1 dmg/round), poisoned (-1 all).
Abilities: characters have 2–3 special abilities from six categories (combat, magic, survival, stealth, social, passive).
Characters have structured traits: personality descriptors, a flaw (active — use it), a motivation (drive decisions toward it), a bond (a specific connection to make matter), and a secret (to surface at the right moment).
Always narrate results in fiction first, mechanics second. Reward creativity over optimal play.
`.trim()
}
