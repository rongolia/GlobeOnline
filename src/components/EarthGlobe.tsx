import React, { useEffect, useRef, useState } from 'react';
import {
  EarthScene,
  GameState,
  MAX_MISTAKES,
  LANDING_MESSAGE_MS,
  FIND_MESSAGE_MS,
  GAME_BRIEF_VISIBLE_MS,
} from '../scene/EarthScene';
import { CountryInfo } from '../utils/geo';
import { getCountryDescription, COUNTRY_GROUPS, DIFFICULTIES } from '../data/countries';
import type { Difficulty } from '../data/countries';
import { NAME_LENGTH, saveScoreToFirestore, cleanName } from '../data/leaderboard';
import { Leaderboard, LeaderboardButton } from './Leaderboard';
import type { LeaderboardStatus, YourScore } from './Leaderboard';
import { SURFACE_DARK, PANEL_LABEL, PANEL_FIELD, PANEL_PILL, PILL_START, PILL_PRIMARY, PILL_PRIMARY_DISABLABLE } from './ui';

// Every panel hugs its corner at inset-3 (0.75rem). The inset is written out per corner
// rather than shared as a margin, because a margin would fight the -translate-x-1/2 that
// centres the country box. The surfaces, captions and pills themselves are shared with
// the leaderboard and live in ./ui.ts.

// The modes, in the order they are shown after Start. Each plays its own group plus every
// easier one, so the pool grows as the clues get harder.
//
// `offered` is what puts a mode in the picker, and `ready` is whether it can be played
// once it is there - a mode that is shown but not ready renders dimmed and unclickable.
// Impossible is finished and working: its group, its pools, its suppressed post-game
// beacons and its place in the clue order are all still here, and the scene will still
// run it if asked. It is simply held back from the picker, so putting it back in is a
// matter of setting `offered` to true and nothing else.
//
// `on`/`off` are written out in full because Tailwind only keeps classes it can see
// as complete strings - building them from the hue at runtime would purge them.
const DIFFICULTY_OPTIONS: {
  id: Difficulty;
  label: string;
  /** Shown in the picker at all. */
  offered: boolean;
  /** Clickable once shown. */
  ready: boolean;
  on: string;
  off: string;
}[] = [
  {
    id: 'easy',
    label: 'Easy',
    offered: true,
    ready: true,
    on: 'bg-emerald-400/90 border-transparent hover:bg-emerald-300 text-slate-950',
    off: 'bg-slate-900/85 border-emerald-400/30 text-emerald-200/40',
  },
  {
    id: 'medium',
    label: 'Medium',
    offered: true,
    ready: true,
    on: 'bg-amber-400/90 border-transparent hover:bg-amber-300 text-slate-950',
    off: 'bg-slate-900/85 border-amber-400/30 text-amber-200/40',
  },
  {
    id: 'hard',
    label: 'Hard',
    offered: true,
    ready: true,
    on: 'bg-rose-400/90 border-transparent hover:bg-rose-300 text-slate-950',
    off: 'bg-slate-900/85 border-rose-400/30 text-rose-200/40',
  },
  {
    id: 'impossible',
    label: 'Impossible',
    offered: false, // built and working, just not on the menu for now
    ready: true,
    on: 'bg-fuchsia-400/90 border-transparent hover:bg-fuchsia-300 text-slate-950',
    off: 'bg-slate-900/85 border-fuchsia-400/30 text-fuchsia-200/40',
  },
];


/** One card in the info stack: colour strip + content. All cards share this look. */
/**
 * The outcome of an attempt, as a shape rather than a sentence: a filled disc with a
 * tick or a cross. It is the first thing to land on screen, so it is what tells the
 * player how they did before they have read a word of the message under it.
 */
const VerdictBadge: React.FC<{ correct: boolean }> = ({ correct }) => (
  <div
    className={`mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full text-white ring-8 ${
      correct ? 'bg-emerald-500 ring-emerald-400/30' : 'bg-rose-500 ring-rose-400/30'
    }`}
  >
    {/* Drawn rather than typed: an emoji tick renders differently on every platform and
        would land in whatever colour that platform's font chose. */}
    <svg
      viewBox="0 0 24 24"
      className="h-14 w-14"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {correct ? <path d="M4 12.5 L9.5 18 L20 7" /> : <path d="M6 6 L18 18 M18 6 L6 18" />}
    </svg>
  </div>
);

/**
 * One card in the info stack. `color` draws the country's polygon colour as a strip
 * along the top; only the name card carries it, so the strip reads as "this is that
 * country" rather than as decoration repeated down the stack.
 */
const InfoCard: React.FC<{ color?: string; className?: string; children: React.ReactNode }> = ({
  color,
  className = '',
  children,
}) => (
  <div className={`${SURFACE_DARK} overflow-hidden ${className}`}>
    {color && <div className="h-1" style={{ backgroundColor: color }} />}
    <div className="px-3 py-2">{children}</div>
  </div>
);

/**
 * What each mode asks you to find: its own group plus every easier one. Easy is the ten
 * easiest countries; impossible is everything on the globe. Built once, outside the
 * component, because it never changes.
 */
const TARGET_POOLS: Record<Difficulty, string[]> = (() => {
  const pools = {} as Record<Difficulty, string[]>;
  const running: string[] = [];
  for (const difficulty of DIFFICULTIES) {
    running.push(...COUNTRY_GROUPS[difficulty].map((d) => d.name));
    pools[difficulty] = [...running];
  }
  return pools;
})();

/**
 * What each mode shows afterwards: its own group and nothing below it. A game of hard
 * draws its countries from easy, medium and hard, but the scene that follows is about the
 * hard ten - the easier groups have had their own modes and would only pad it out.
 */
const LEVEL_POOLS: Record<Difficulty, string[]> = DIFFICULTIES.reduce((acc, difficulty) => {
  acc[difficulty] = COUNTRY_GROUPS[difficulty].map((d) => d.name);
  return acc;
}, {} as Record<Difficulty, string[]>);

/** One step of the clue ladder. */
type ClueRung ={ kind: 'symbol' } | { kind: 'fact'; index: number } | { kind: 'flag' } | { kind: 'name' };

/**
 * The order a country's clues are uncovered in, hardest first: the country's emblem
 * emoji (a pizza, a maple leaf) for the few that have one, then the flag, then the
 * well-known clue fact (funFacts[0]), then the name, which is the answer. Every miss
 * uncovers one more rung. A country with no emblem simply starts at the flag.
 *
 * Only the first fact is ever a clue. The third is the reward, shown once the country
 * is found (see REWARD_FACT_INDEX), so it never appears on the ladder; the second, the
 * lesser-known one, is only on the info cards before and after the game.
 */
const CLUE_LADDER: ClueRung[] = [
  { kind: 'symbol' },
  { kind: 'flag' },
  { kind: 'fact', index: 0 },
  { kind: 'name' },
];

/** Which fun fact is held back as the reward for finding the country. */
const REWARD_FACT_INDEX = 2;

export const EarthGlobe: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<EarthScene | null>(null);

  const [hoveredCountry, setHoveredCountry] = useState<CountryInfo | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  // undefined = no beacon yet this round; null = beacon is over the ocean.
  const [beaconCountry, setBeaconCountry] = useState<CountryInfo | null | undefined>(undefined);
  const [game, setGame] = useState<GameState>({
    active: false,
    phase: 'idle',
    target: null,
    found: 0,
    total: 0,
    mistakes: 0,
    maxMistakes: MAX_MISTAKES,
    countdown: null,
    briefing: false,
    results: {},
    difficulty: 'easy',
    attempt: 0,
    lesserStart: false,
    score: 0,
  });
  // Informational round: country under the screen centre.
  const [focusCountry, setFocusCountry] = useState<CountryInfo | null>(null);
  // While the target glows but is out of sight: the screen direction to turn towards, in
  // radians (0 = right, PI/2 = up). null = in view, or not glowing.
  const [targetOffscreen, setTargetOffscreen] = useState<number | null>(null);

  // End of game: the leaderboard name being typed, and whether it has been entered (or
  // skipped). Both start over with every game.
  const [playerName, setPlayerName] = useState('');
  const [nameEntered, setNameEntered] = useState(false);
  const [isSavingScore, setIsSavingScore] = useState(false);
  // Before a game: whether the Top 10 button has slid the board in. After a game the
  // board is simply part of the final score, so this only matters on the start screen.
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  // How the last save went, shown above the board after a game.
  const [leaderboardStatus, setLeaderboardStatus] = useState<LeaderboardStatus | null>(null);
  // The score just saved, so the leaderboard can mark it out - by its document id, since
  // name and score alone can match an older entry - or show it under the ten if it did
  // not make them.
  const [recentSaved, setRecentSaved] = useState<YourScore | null>(null);
  const toggleLeaderboard = () => setShowLeaderboard((open) => !open);

  // Start pressed: the panel is showing the difficulty choices rather than Start.
  const [choosingDifficulty, setChoosingDifficulty] = useState(false);

  // Centre-screen verdict when a parachute lands. `key` restarts the animation each time.
  const [landing, setLanding] = useState<
    {
      key: number;
      correct: boolean;
      target: string;
      landedOn: string;
      color: string;
      /** The reward fact, on a find; undefined on a miss or a country without one. */
      reward?: string;
      /** How long the message stays up (ms). */
      durationMs: number;
    } | null
  >(null);
  const landingTimer = useRef<number | undefined>(undefined);

  const chooseDifficulty = (id: Difficulty) => {
    setChoosingDifficulty(false);
    sceneRef.current?.startGame(id);
  };

  const restart = () => {
    sceneRef.current?.restart();
  };

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new EarthScene({
      container: mountRef.current,
      onBeaconHit: (country) => setBeaconCountry(country),
      onRoundResult: ({ target, landedOn, correct }) => {
        window.clearTimeout(landingTimer.current);
        const targetInfo = getCountryDescription(target.name);
        const durationMs = correct ? FIND_MESSAGE_MS : LANDING_MESSAGE_MS;
        setLanding({
          key: performance.now(),
          correct,
          target: targetInfo?.displayName ?? target.name,
          // Finding the country pays out its other fun fact.
          reward: correct ? targetInfo?.funFacts[REWARD_FACT_INDEX] : undefined,
          durationMs,
          landedOn: landedOn
            ? (getCountryDescription(landedOn.name)?.displayName ?? landedOn.name)
            : 'the sea',
          // Both outcomes name a place, so both colour it the way the globe does. The
          // verdict itself is carried by the badge and the flash, not by this.
          color: correct ? target.color : (landedOn?.color ?? '#94a3b8'),
        });
        landingTimer.current = window.setTimeout(() => setLanding(null), durationMs);
      },
      onGameStateChange: (state) => {
        setGame(state);
        // Whatever the scene reports, the picker is done with.
        setChoosingDifficulty(false);
        // New attempt or game over: clear the last beacon reading until the beam lands.
        setBeaconCountry(undefined);
        // The opening owns the centre of the screen: drop any result message still up,
        // so the two can never overlap if their timers drift apart by a frame.
        if (state.countdown !== null || state.briefing) {
          window.clearTimeout(landingTimer.current);
          setLanding(null);
        }
      },
      targetPools: TARGET_POOLS,
      postGamePools: LEVEL_POOLS,
      onFocusCountry: (country) => setFocusCountry(country),
      onTargetOffscreen: (angle) => setTargetOffscreen(angle),
      onCountryHover: (country, screenPos) => {
        setHoveredCountry(country);
        setTooltipPos(screenPos);
      },
    });
    sceneRef.current = scene;

    return () => {
      window.clearTimeout(landingTimer.current);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // The country highlighted on the globe right now: hovered before the game, under the
  // beacon during a round, under the centre crosshair in the informational round.
  // During a round `undefined` means the beacon has not reported a hit yet.
  const highlight = game.phase === 'rounds' ? beaconCountry : game.phase === 'learn' ? focusCountry : hoveredCountry;
  // Text for the bottom-centre box; null hides it entirely. Only a round ever puts a
  // placeholder there, because a round's box is also the beacon's status line and has to
  // stay put. Before and after the game the box is purely a readout of what is
  // highlighted, so with nothing highlighted there is nothing to say and it goes away.
  const highlightText = highlight
    ? highlight.name
    : game.phase === 'rounds'
      ? game.countdown !== null || game.briefing
        ? 'Get ready…'
        : beaconCountry === undefined
          ? 'Scanning…'
          : 'Ocean'
      : null;
  const highlightDot = highlight
    ? highlight.color
    : game.phase === 'rounds' && beaconCountry === null
      ? '#194b72'
      : 'transparent';

  // What the round has given away so far.
  //
  // Looked up in the whole dictionary rather than one group, so the ladder works for
  // whichever group a round is drawn from. It is emblem (where there is one), flag,
  // clue fact, name.
  //
  // Every miss repeats the country with one more rung of its ladder uncovered - see
  // CLUE_LADDER above.
  //
  // Reveal order and reading order are deliberately different. The cards are laid out the
  // way the pre-game stack lays them out - flag and name in one box on top, then the
  // emblem, then the facts best-known first - so a country reads the same whichever scene
  // you meet it in. Only
  // which of them are on screen yet depends on how many attempts it has taken.
  const easyInfo = game.target ? getCountryDescription(game.target.name) : undefined;
  const clueFacts = easyInfo?.funFacts ?? [];
  // A few countries per game open one rung harder, on the lesser-known fact (see
  // GameState.lesserStart), and then carry on down the usual ladder.
  const fullLadder: ClueRung[] = game.lesserStart ? [{ kind: 'fact', index: 1 }, ...CLUE_LADDER] : CLUE_LADDER;
  const ladder = easyInfo
    ? fullLadder.filter((r) =>
        r.kind === 'fact' ? r.index < clueFacts.length : r.kind === 'symbol' ? !!easyInfo.symbol : true
      )
    : [];
  const uncovered = ladder.slice(0, Math.max(0, Math.min(game.attempt, ladder.length)));
  const factShown = (i: number) => uncovered.some((r) => r.kind === 'fact' && r.index === i);
  const flagShown = uncovered.some((r) => r.kind === 'flag');
  const symbolShown = uncovered.some((r) => r.kind === 'symbol');
  const nameShown = uncovered.some((r) => r.kind === 'name');
  // The rung that has just landed, which is what the headline announces.
  const newest = uncovered[uncovered.length - 1];
  const newestClue = !easyInfo || !newest
    ? undefined
    : newest.kind === 'fact'
      ? { kind: 'fact' as const, text: clueFacts[newest.index] }
      : newest.kind === 'flag'
        ? { kind: 'flag' as const, text: easyInfo.flag }
        : newest.kind === 'symbol' && easyInfo.symbol
          ? { kind: 'symbol' as const, text: easyInfo.symbol.emoji, label: easyInfo.symbol.label }
          : { kind: 'name' as const, text: easyInfo.displayName };
  const livesLeft = Math.max(0, game.maxMistakes - game.mistakes);

  // Past the end of the ladder: the name was given away and the player still missed, so
  // the country itself is lit up on the globe.
  const glowTarget = game.phase === 'rounds' && ladder.length > 0 && game.attempt > ladder.length;
  useEffect(() => {
    sceneRef.current?.setTargetGlow(glowTarget);
  }, [glowTarget, game.target]);

  // A new game starts the name entry over, so it is ready and empty when this one ends.
  useEffect(() => {
    if (game.phase !== 'rounds') return;
    setPlayerName('');
    setNameEntered(false);
    // ...and the board: put away, with nothing left over from the last game's save.
    setShowLeaderboard(false);
    setLeaderboardStatus(null);
    setRecentSaved(null);
  }, [game.phase]);

  // Info cards: before game -> hovered country; post-game -> country under the screen
  // centre. Both read the full dataset, so every country on the globe has its cards,
  // whatever mode was played.
  const cardCountry = game.phase === 'idle' ? hoveredCountry : game.phase === 'learn' ? focusCountry : null;
  const cardInfo = cardCountry ? getCountryDescription(cardCountry.name) : undefined;
  const showCards = !!cardCountry && !!cardInfo;
  const cardFacts = cardInfo?.funFacts ?? [];

  // Post-game: did DevFest make it to the country under the crosshair?
  // Only the countries that were found say anything. A country that was missed, or that
  // the game never got round to, simply has nothing over it - there is no result to
  // report, and announcing its absence over most of the map was only ever noise.
  const cardVerdict =
    game.phase === 'learn' && cardCountry && cardInfo && game.results[cardCountry.name] === 'found'
      ? { text: 'We love DevFest!', tone: 'text-emerald-300' }
      : undefined;

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-[#0a0e17] select-none touch-none"
      onPointerDown={() => setIsInteracting(true)}
      onPointerUp={() => setIsInteracting(false)}
      onPointerLeave={() => setIsInteracting(false)}
    >
      {/* 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing outline-none"
      />

      {/* Controls, top left: Start (and the difficulty picker) before the game, Restart
          in the post-game scene. Nothing to press mid-round, so the panel is hidden then.
          Progress sits in its own HUD at the top right, the country to find at the top
          centre, and the highlighted country at the bottom centre. */}
      {game.phase !== 'rounds' && (
        <div className="absolute top-3 left-3 flex flex-col items-start" onPointerDown={(e) => e.stopPropagation()}>
          <div className={PANEL_LABEL}>
            {game.phase !== 'learn'
              ? 'Ready to play?'
              : game.difficulty === 'impossible'
                ? 'Explore the globe'
                : 'Explore the beacons'}
          </div>

          {game.phase === 'learn' ? (
            <button type="button" onClick={restart} className={PILL_PRIMARY}>
              Restart
            </button>
          ) : choosingDifficulty ? (
            <div className="flex items-center space-x-2">
              {DIFFICULTY_OPTIONS.filter((d) => d.offered).map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={!d.ready}
                  onClick={() => chooseDifficulty(d.id)}
                  style={{ animationDelay: `${i * 70}ms` }}
                  className={`${PANEL_PILL} difficulty-in transition duration-200 ${
                    d.ready ? `${d.on} active:scale-95 cursor-pointer` : `${d.off} cursor-not-allowed`
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setChoosingDifficulty(true)} className={PILL_START}>
                Start
              </button>
              <LeaderboardButton onClick={toggleLeaderboard} open={showLeaderboard} />
            </div>
          )}
        </div>
      )}

      {/* Cards for the highlighted country, stacked up from the bottom-left corner:
          flag + name, then one card per fun fact. */}
      {showCards && cardCountry && (
        <div className="absolute bottom-3 left-3 w-96 flex flex-col gap-1.5 pointer-events-none">
          <InfoCard color={cardCountry.color}>
            <div className="flex items-center space-x-3 py-1">
              {cardInfo?.flag ? (
                <span className="flag-emoji text-5xl shrink-0">{cardInfo.flag}</span>
              ) : (
                // Stands in for the flag, so it grows with it - a 3-unit dot next to a
                // name this size would read as a stray speck.
                <span
                  className="w-5 h-5 rounded-full ring-1 ring-white/30 shrink-0"
                  style={{ backgroundColor: cardCountry.color }}
                />
              )}
              <span className="text-3xl font-semibold text-slate-100 leading-tight">
                {cardInfo?.displayName ?? cardCountry.name}
              </span>
            </div>
          </InfoCard>

          {cardFacts.map((fact, i) => (
            <InfoCard key={i}>
              <p className="text-base leading-tight text-slate-300">{fact}</p>
            </InfoCard>
          ))}
        </div>
      )}

      {/* Post-game: whether DevFest reached the country under the crosshair. It sits at
          the height the opening briefing rises to, so the scene keeps using one spot for
          the line that says what is going on.

          Position and entrance are split across two elements for the same reason the
          briefing splits them: the outer one owns the centring transform, which leaves
          the inner one's keyframes free to animate transform on the way in. */}
      {cardVerdict && cardCountry && (
        <div className="absolute top-[24%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none">
          <div key={cardCountry.name} className="verdict-in text-center w-max max-w-[90vw] text-balance">
            <div
              className={`text-3xl md:text-5xl font-bold tracking-tight drop-shadow-[0_4px_18px_rgba(0,0,0,0.75)] ${cardVerdict.tone}`}
            >
              {cardVerdict.text}
            </div>
          </div>
        </div>
      )}

      {/* Learning round: crosshair marking the screen-centre pick ray */}
      {game.phase === 'learn' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className="w-3 h-3 rounded-full border-2 border-amber-200 bg-amber-200/30 shadow-[0_0_10px_rgba(253,230,138,0.8)]" />
        </div>
      )}

      {/* The round's clues. Each one arrives as big text at the centre of the screen, then
          hands over to a card in the bottom-left stack - the same stack the pre-game scene
          uses - so every hint revealed so far stays on screen to be re-read. Cards already
          in the stack are left mounted, so only the newest one animates in.

          `attempt` is 0 until the round's first beacon, which is what keeps all of this
          off the screen while the opening count-in still has the centre. */}
      {game.phase === 'rounds' && newestClue && game.target && (
        <>
          <div
            key={`clue-headline:${game.target.name}:${game.attempt}`}
            className="clue-headline absolute top-1/2 left-1/2 z-40 pointer-events-none text-center w-max max-w-[90vw] text-balance"
          >
            {newestClue.kind === 'flag' ? (
              <span
                className="flag-emoji block text-8xl drop-shadow-[0_4px_18px_rgba(0,0,0,0.75)]"
                role="img"
                aria-label="Flag of the country to find"
              >
                {newestClue.text}
              </span>
            ) : newestClue.kind === 'symbol' ? (
              // The emblem on its own, as big as the flag would be: the picture is the clue,
              // so its name is left to the card it hands over to.
              <span
                className="flag-emoji block text-8xl md:text-9xl drop-shadow-[0_4px_18px_rgba(0,0,0,0.75)]"
                role="img"
                aria-label={`Clue: ${newestClue.label}`}
              >
                {newestClue.text}
              </span>
            ) : (
              <div className="text-4xl md:text-6xl font-bold tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.75)]">
                {newestClue.text}
              </div>
            )}
          </div>

          {/* Laid out like the pre-game stack: flag and name share the box on top, then
              the facts best-known first. Cards already on screen are left mounted, so only
              a newly uncovered one animates in. */}
          <div className="absolute bottom-3 left-3 w-96 max-h-[calc(100vh-7rem)] flex flex-col justify-end gap-1.5 overflow-hidden pointer-events-none">
            {flagShown && easyInfo && (
              <div key={`clue-id:${game.target.name}`} className="clue-card-in">
                <InfoCard color={game.target.color}>
                  <div className="flex items-center space-x-3 py-1">
                    <span className="flag-emoji text-5xl shrink-0" role="img" aria-label="Flag of the country to find">
                      {easyInfo.flag}
                    </span>
                    {/* The name is the last rung, and joins the box the flag already made
                        rather than starting one of its own. */}
                    {nameShown && (
                      <span
                        key={`clue-name:${game.target.name}`}
                        className="clue-card-in text-3xl font-semibold text-slate-100 leading-tight"
                      >
                        {easyInfo.displayName}
                      </span>
                    )}
                  </div>
                </InfoCard>
              </div>
            )}

            {symbolShown && easyInfo?.symbol && (
              <div key={`clue-symbol:${game.target.name}`} className="clue-card-in">
                <InfoCard>
                  <div className="flex items-center space-x-3">
                    <span className="flag-emoji text-4xl shrink-0" role="img" aria-hidden="true">
                      {easyInfo.symbol.emoji}
                    </span>
                    <span className="text-xl font-semibold text-slate-100">{easyInfo.symbol.label}</span>
                  </div>
                </InfoCard>
              </div>
            )}

            {clueFacts.map((fact, i) =>
              factShown(i) ? (
                <div key={`clue-fact:${game.target!.name}:${i}`} className="clue-card-in">
                  <InfoCard>
                    <p className="text-base leading-tight text-slate-300">{fact}</p>
                  </InfoCard>
                </div>
              ) : null
            )}
          </div>
        </>
      )}

      {/* The glowing target is round the back of the globe (or off the screen): an arrow
          out towards the rim, on the side it lies, pointing the way to turn. It sits on
          an ellipse around the centre so it reads as "over there, past the edge of the
          globe", and the scene only reports it while the glow is on. */}
      {game.phase === 'rounds' && targetOffscreen !== null && (
        <div
          className="absolute z-30 pointer-events-none -translate-x-1/2 -translate-y-1/2 transition-[left,top] duration-150 ease-out"
          style={{
            left: `calc(50% + ${Math.cos(targetOffscreen) * 40}vw)`,
            top: `calc(50% - ${Math.sin(targetOffscreen) * 38}vh)`,
          }}
          role="status"
          aria-label="The country is round the side of the globe"
        >
          <div className="target-offscreen flex flex-col items-center gap-1">
            <div
              className="w-12 h-12 rounded-full bg-amber-300/90 ring-4 ring-amber-200/40 flex items-center justify-center text-slate-950 shadow-[0_0_18px_rgba(255,224,138,0.8)]"
              style={{ transform: `rotate(${-targetOffscreen}rad)` }}
            >
              <svg viewBox="0 0 24 24" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h13M13 6l6 6-6 6" />
              </svg>
            </div>
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-200 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)] whitespace-nowrap">
              This way
            </span>
          </div>
        </div>
      )}

      {/* Chances left, top centre. */}
      {game.phase === 'rounds' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
          <div className={PANEL_LABEL}>Chances left</div>
          <div
            className={`${SURFACE_DARK} px-5 h-14 flex items-center gap-2.5`}
            title={`${livesLeft} of ${game.maxMistakes} chances left`}
          >
            {Array.from({ length: game.maxMistakes }).map((_, i) => (
              <span
                key={i}
                className={`w-4 h-4 rounded-full ring-1 transition-colors duration-300 ${
                  i < livesLeft ? 'bg-amber-300 ring-amber-200/40' : 'bg-transparent ring-slate-500/60'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* End of the game: the final score as big text at the centre. It holds there with
          the leaderboard name field under it, and only once a name is in (or skipped) is
          it sent up to the top-right panel, the same way a clue is sent to its card. */}
      {game.active && game.phase === 'learn' && (
        <div
          className={`score-headline absolute top-1/2 left-1/2 z-40 text-center w-max ${
            nameEntered ? 'score-headline-send pointer-events-none' : 'score-headline-hold'
          }`}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="text-2xl md:text-3xl uppercase tracking-widest font-semibold text-slate-200 drop-shadow-[0_3px_14px_rgba(0,0,0,0.8)]">
            Final score
          </div>
          <div className="text-8xl md:text-9xl font-bold tabular-nums text-amber-300 drop-shadow-[0_4px_18px_rgba(0,0,0,0.75)]">
            {game.score}
          </div>

          {!nameEntered && (
            <form
              className="mt-6 flex flex-col items-center gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (playerName.length !== NAME_LENGTH || isSavingScore) return;
                setIsSavingScore(true);
                try {
                  const res = await saveScoreToFirestore(playerName, game.score);
                  setRecentSaved({ id: res.id, name: playerName, score: game.score, position: res.position });
                  setLeaderboardStatus(
                    !res.success
                      ? { ok: false, text: 'Couldn’t reach the leaderboard. Your score is kept on this device.' }
                      : res.rank
                        ? { ok: true, text: `Saved. You’re #${res.rank} on the board.` }
                        : { ok: true, text: res.position ? `Saved. You’re #${res.position} overall.` : 'Saved. Not in the top 10 this time.' }
                  );
                  setNameEntered(true);
                } finally {
                  setIsSavingScore(false);
                }
              }}
            >
              <label
                htmlFor="leaderboard-name"
                className="text-base md:text-lg font-semibold text-slate-200 drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]"
              >
                Enter your initials for the leaderboard
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="leaderboard-name"
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={NAME_LENGTH}
                  value={playerName}
                  onChange={(e) =>
                    setPlayerName(cleanName(e.target.value))
                  }
                  placeholder="AAA"
                  aria-label="Three-letter name"
                  className={`${SURFACE_DARK} w-40 h-14 text-center text-4xl font-bold tracking-[0.4em] pl-[0.4em] uppercase text-amber-300 placeholder:text-slate-600 outline-none focus:border-amber-300/80`}
                />
                <button
                  type="submit"
                  disabled={playerName.length !== NAME_LENGTH || isSavingScore}
                  className={PILL_PRIMARY_DISABLABLE}
                >
                  {isSavingScore ? 'Saving…' : 'Save'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => setNameEntered(true)}
                className="text-sm text-slate-400 hover:text-slate-200 underline underline-offset-4 cursor-pointer"
              >
                Skip
              </button>
            </form>
          )}
        </div>
      )}

      {/* Score, top right. It stays up in the post-game scene as the final score, and is
          remounted then (the key) so it can fade back in as the headline above lands.
          After a game it waits for the name to be entered, since that is what sends the
          headline its way - and the Top 10 comes in with it, stacked underneath, so the
          final score and where it stands are read together. */}
      {game.active && (game.phase !== 'learn' || nameEntered) && (
        <div
          key={game.phase === 'learn' ? 'score-final' : 'score'}
          className={`absolute top-3 right-3 flex flex-col items-end pointer-events-none ${
            game.phase === 'learn' ? 'score-final-in' : ''
          }`}
        >
          <div className={PANEL_LABEL}>{game.phase === 'learn' ? 'Final score' : 'Score'}</div>
          <div
            className={`${SURFACE_DARK} px-5 h-14 flex items-center text-3xl font-semibold text-amber-300 tabular-nums whitespace-nowrap`}
          >
            {game.score}
          </div>
          {game.phase === 'learn' && (
            <div className="mt-5">
              <Leaderboard active you={recentSaved} status={leaderboardStatus} />
            </div>
          )}
        </div>
      )}

      {/* Before a game: the same board in the same corner, slid in and out by the Top 10
          button. It stays mounted while away, parked off the right edge, so it can slide
          out as well as in, and is inert then. */}
      {!game.active && (
        <div
          aria-hidden={!showLeaderboard}
          inert={!showLeaderboard}
          className={`absolute top-3 right-3 pointer-events-none transition-transform duration-300 ease-out motion-reduce:transition-none ${
            showLeaderboard ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'
          }`}
        >
          <Leaderboard active={showLeaderboard} />
        </div>
      )}

      {/* Opening briefing. It takes the centre of the screen on its own, then rises out
          of the way as the 3-2-1 starts and stays up above it for the rest of the count.

          Both stages are one mounted element, so the fade-in plays once and the text
          carries straight on rather than re-animating at the handover. The animation is
          told how long that whole span is, so its fade-out lands on the unmount.

          Position and entrance are split across two elements on purpose: the move is a
          transition on the outer one's `top`, which leaves the inner one's keyframes
          free to own `transform` for the fade-in. Both on one element and the two would
          overwrite each other. */}
      {(game.briefing || game.countdown !== null) && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none transition-[top] duration-[420ms] ease-out motion-reduce:transition-none ${
            game.countdown !== null ? 'top-[24%]' : 'top-1/2'
          }`}
        >
          <div
            className="game-brief text-center w-max max-w-[90vw] text-balance"
            style={{ animationDuration: `${GAME_BRIEF_VISIBLE_MS}ms` }}
          >
            <div className="text-3xl md:text-5xl font-bold tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.75)]">
              DevFest is coming to these countries
            </div>
            <div className="mt-3 text-xl md:text-2xl font-semibold text-amber-300 drop-shadow-[0_3px_14px_rgba(0,0,0,0.8)]">
              They need supplies — turn the globe and catch each crate on the right one.
            </div>
          </div>
        </div>
      )}

      {/* Start of the game: 3-2-1 at the screen centre, before the first beacon drops.
          Keying on the number restarts the pop animation for each one. */}
      {game.countdown !== null && (
        <div
          key={game.countdown}
          className="countdown-pop absolute top-1/2 left-1/2 pointer-events-none z-40 text-center"
        >
          <div className="text-[8rem] md:text-[11rem] font-bold leading-none tabular-nums text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
            {game.countdown}
          </div>
        </div>
      )}

      {/* Parachute landed: how the attempt went, at the screen centre.

          Three cues fire together, so the outcome reads from across the room and before
          any of the words are: the whole frame flashes green or red, a tick or cross disc
          lands at the centre, and a miss shakes. Keying all of them on landing.key
          restarts them for every attempt, including a repeat of the same country. */}
      {landing && (
        <>
          <div
            key={`flash:${landing.key}`}
            className={`landing-flash absolute inset-0 pointer-events-none z-30 ${
              landing.correct ? 'landing-flash-ok' : 'landing-flash-bad'
            }`}
          />

          <div
            key={landing.key}
            role="status"
            className="landing-pop absolute top-1/2 left-1/2 pointer-events-none z-40 text-center w-max max-w-[90vw] text-balance"
            // A find stays up longer, to leave time to read its reward fact. Only the hold
            // stretches: the pop in and fade out run at the same speed whatever the length.
            style={{ '--landing-ms': `${landing.durationMs}ms` } as React.CSSProperties}
          >
            {/* The shake is on its own element: the wrapper's keyframes already own
                `transform` for the pop, and one element cannot run both. */}
            <div className={landing.correct ? undefined : 'landing-shake'}>
              <VerdictBadge correct={landing.correct} />

              <div className="text-4xl md:text-6xl font-bold tracking-tight text-white drop-shadow-[0_4px_18px_rgba(0,0,0,0.75)]">
                {landing.correct ? (
                  <>
                    {/* Deliberately the briefing's own words: the opening promises
                        DevFest is coming to these countries, and each landing is one of
                        them made good. */}
                    DevFest is coming to{' '}
                    <span style={{ color: landing.color }}>{landing.target}</span>
                    {/* The reward: the fun fact that was held back from the clues. It is
                        the payoff of the find, so it gets a lit panel of its own rather
                        than sitting as a caption under the headline. */}
                    {landing.reward && (
                      <span className="block mx-auto mt-6 max-w-3xl rounded-2xl border-2 border-amber-300/70 bg-slate-950/80 px-6 py-5 md:px-8 md:py-6 shadow-[0_0_40px_rgba(252,211,77,0.35)] backdrop-blur-sm text-2xl md:text-4xl font-semibold leading-snug tracking-normal text-white">
                        <span className="block mb-2 text-base md:text-xl font-bold uppercase tracking-widest text-amber-300">
                          Did you know?
                        </span>
                        {landing.reward}
                      </span>
                    )}
                  </>
                ) : (
                  // A refusal rather than a statement of fact: the player is told their
                  // answer is wrong, not merely what they happened to land on. What the
                  // miss cost is left to the chances HUD, which is already counting.
                  <>
                    No, it’s not <span style={{ color: landing.color }}>{landing.landedOn}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Floating Hover Country Tooltip ("before game" mode) */}
      {!game.active && hoveredCountry && tooltipPos && !isInteracting && (
        <div
          className="fixed pointer-events-none z-50 transform -translate-x-1/2 -translate-y-full pb-3 transition-opacity duration-150"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
          }}
        >
          <div className={`${SURFACE_DARK} flex items-center space-x-2 px-3.5 py-1.5 text-slate-100 animate-in fade-in zoom-in-95`}>
            <span
              className="w-2.5 h-2.5 rounded-full ring-1 ring-white/30"
              style={{ backgroundColor: hoveredCountry.color }}
            />
            <span className="text-sm font-semibold tracking-wide">
              {hoveredCountry.name}
            </span>
          </div>
        </div>
      )}

      {/* The highlighted country, bottom centre. */}
      {highlightText && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
          <div className={`${PANEL_FIELD} justify-center`}>
            <span
              className="w-2.5 h-2.5 rounded-full ring-1 ring-white/30 shrink-0"
              style={{ backgroundColor: highlightDot }}
            />
            <span className={`truncate ${highlight ? '' : 'text-slate-500'}`}>{highlightText}</span>
          </div>
        </div>
      )}
    </div>
  );
};
