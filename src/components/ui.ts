/**
 * The shared look of every piece of UI: the HUD panels, the info cards, the tooltip and
 * the leaderboard. Kept in one place so a new screen picks these up rather than inventing
 * its own surface, button or caption.
 */

// One surface for every piece of UI, so the panel, the cards and the tooltip all read as
// the same system. SURFACE carries the shape; SURFACE_DARK adds the dark fill, while
// accent controls take SURFACE and bring their own background and border colour.
// Trying the UI flat: put `shadow-xl shadow-black/40` back here to restore the lift
// under every panel, card, pill and tooltip at once.
export const SURFACE = 'rounded-xl border backdrop-blur-md';
export const SURFACE_DARK = `${SURFACE} bg-slate-900/85 border-slate-700/70`;

// Caption above a control: the all-caps instruction text ("Chances left", "Ready to
// play?"). Set to read at the same size as the values underneath rather
// than shrinking away from them - it is what tells the player what to do.
export const PANEL_LABEL = 'mb-2 text-2xl uppercase tracking-widest font-semibold text-slate-200';

// Read-only field: the country box.
export const PANEL_FIELD = `${SURFACE_DARK} w-64 h-12 px-4 flex items-center space-x-2 text-base text-slate-100`;

// Control: Start, Restart, the round counter. Colours come from the caller, and which
// set it uses is what tells the three kinds of pill apart at a glance:
//   solid fill + dark text -> a live action (Start, Restart, an available difficulty)
//   dark fill + outline    -> not an action (the round counter, a difficulty that is not
//                             wired up yet)
// Anything clickable takes the solid treatment, or it reads as disabled.
export const PANEL_PILL = `${SURFACE} w-32 h-14 flex items-center justify-center text-base font-semibold uppercase tracking-widest`;

// The press feel every live pill shares.
const PILL_ACTION = 'border-transparent text-slate-950 active:scale-95 transition duration-200 cursor-pointer';

// The solid colour of each kind of live pill. Written out in full because Tailwind only
// keeps classes it can see as complete strings.
export const PILL_START = `${PANEL_PILL} ${PILL_ACTION} bg-sky-400/90 hover:bg-sky-300`;
export const PILL_PRIMARY = `${PANEL_PILL} ${PILL_ACTION} bg-amber-400/90 hover:bg-amber-300`;
export const PILL_LEADERBOARD = `${PANEL_PILL} ${PILL_ACTION} bg-violet-400/90 hover:bg-violet-300`;
// A primary pill that can be switched off, e.g. Save before the name is complete.
export const PILL_PRIMARY_DISABLABLE = `${PILL_PRIMARY} disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-amber-400/90 disabled:active:scale-100`;
