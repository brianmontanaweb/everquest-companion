// DRIVING THE COMBAT PREFERENCES FROM THE REAL UI (JOS-115, then owner 2026-09-17).
//
// The You / Group / Everyone scope used to be a chip on every combat surface; JOS-115 made it ONE
// preference in Preferences > Combat, read by the Combat tab, the Overview card and every floating
// overlay. On 2026-09-17 the owner moved the CONTROL back onto the Combat tab as a dropdown and
// deleted the Preferences card: what JOS-115 actually retired was the repetition, and that half
// stands — the Overview card and the overlays still only read the key. So "set it" is a click on
// the Combat tab now, and the door is still here because most callers are asserting on some OTHER
// surface (an overlay window, the Overview card) and have to walk to that one control first.
//
// IT CLICKS THE ACTUAL CONTROL, never `localStorage.setItem`. The write path is half the claim —
// a preference that persists but does not APPLY is the defect this ticket exists to avoid — and
// the cross-window half (the overlay hearing about it through the DOM's own 'storage' event, no
// IPC involved) can only be exercised by a real write from the main window's document.
//
// Its own module because combatSteps.mts and every e2e spec that would otherwise host it sit at
// or near the repo's max-lines budget: split, never ratchet (drill.mts set the precedent).

import type { Page } from 'playwright-core'
import { settle, settleGone } from './appHarness.mjs'

/** The three scopes, exactly as `shared/roster.METER_SCOPES` spells them. */
export type Scope = 'you' | 'group' | 'everyone'

/**
 * The WORD the Combat tab's scope control is currently showing. It kept this testid across both
 * moves — the read-only chip JOS-115 left behind, and the dropdown that replaced it in 2026-09-17 —
 * because every caller here is asking the same question of it either way: what does this surface
 * say it is showing? The label is `chipLabel`, so Group spells its no-roster fallback out.
 */
export const SCOPE_LABEL_SEL = '[data-testid="meter-scope-label"]'
/** The three-chip inline control JOS-115 deleted. Its replacement is a dropdown, not this — so it
 *  is still asserted ABSENT, and never used. */
export const RETIRED_SCOPE_CHIP = '[data-testid="meter-scope-chip"]'
/** …and its overlay twin. */
export const RETIRED_OVERLAY_CHIP = '[data-testid="overlay-scope-chip"]'
/**
 * The overlay header's read-only twin of SCOPE_LABEL_SEL, which JOS-115 kept in the TITLE BAR.
 * JOS-121 took it out of there; asserted ABSENT now, never read.
 */
export const RETIRED_OVERLAY_HEADER_LABEL = '[data-testid="overlay-scope-label"]'
/**
 * Where the overlay's scope word lives since JOS-121: understated background text on the METER
 * PANEL FLOOR (src/renderer/src/overlay/scopeFloor.tsx), out of the title bar so the fight
 * selector and the drag surface can have that width. Same sentence, same `chipLabel` helper.
 */
export const OVERLAY_SCOPE_FLOOR = '[data-testid="overlay-scope-floor"]'

/** The dropdown itself — the one writer of `eq.combat.meterScope` since 2026-09-17. */
export const SCOPE_SELECT_SEL = '[data-testid="meter-scope-select"]'

/**
 * Set the meter scope through the Combat tab's own dropdown and return the app to `back`.
 *
 * `back` is a nav testid rather than "wherever we were": a caller always knows which surface it
 * is about to assert on, and guessing would leave the app somewhere the next step did not expect.
 * Callers that are ALREADY on the Combat tab pass `nav-combat` and pay one idempotent click.
 *
 * THE SELECTOR ONLY EXISTS ON THE DASHBOARD, OUTGOING — the Incoming list is always "what is
 * hitting You" and is not scoped, so the control is not rendered there. This helper waits for it
 * rather than assuming it: a caller that left the tab on Timeline or on Incoming gets a timeout
 * naming the missing control, which is a truer failure than a click into empty space.
 */
export async function setMeterScope(page: Page, scope: Scope, back: string): Promise<void> {
  await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
  await page.waitForSelector(SCOPE_SELECT_SEL, { timeout: 20_000 })
  await page.click(SCOPE_SELECT_SEL)
  const option = `[data-testid="meter-scope-${scope}"]`
  await page.waitForSelector(option, { timeout: 20_000 })
  await page.click(option)
  // The CONDITION the click produces: the closed control now says the scope it was given. The word
  // is `chipLabel`, so Group has two legal spellings and this matches on the PREFIX — which of the
  // two a log produces is the caller's business, never this door's. Never a sleep.
  await settle(
    async () => (await page.textContent(SCOPE_LABEL_SEL))?.trim() ?? '',
    (t) => t.toLowerCase().startsWith(scope === 'everyone' ? 'everyone' : scope),
    { timeoutMs: 8_000 },
  )
  // The menu is a portal that outlives its click; leave nothing over the surface under test.
  await settleGone(page, '[role="listbox"]', { timeoutMs: 8_000 })
  await page.click(`[data-testid="${back}"]`, { timeout: 30_000 })
}

/** The pet-nesting switch — 'Show your pet inside your damage' (features/preferences). */
const COMBINE_PET = '[data-testid="pref-combine-pet"] input'

/**
 * Turn the PET NESTING preference on or off through Preferences > Combat, and return to `back`.
 *
 * The same two-window act as the scope above, and for the same reason it CLICKS THE CONTROL: this
 * preference reaches four surfaces through localStorage plus the DOM's own 'storage' event, and a
 * `setItem` from the test would exercise none of that path. It is also the exact route JOS-170's
 * owner took — flip it in Preferences, come back to a Combat tab that has meanwhile unmounted and
 * re-hydrated its drill — which is what makes the number's staleness observable at all.
 *
 * Idempotent: asking for the state it is already in clicks nothing and still waits for the
 * control to agree, so a caller may state what it wants rather than track what it did.
 */
export async function setCombinePet(page: Page, on: boolean, back: string): Promise<boolean> {
  await page.click('[data-testid="nav-preferences"]', { timeout: 30_000 })
  await page.waitForSelector('[data-testid="prefs-rail-combat"]', { timeout: 20_000 })
  await page.click('[data-testid="prefs-rail-combat"]')
  await page.waitForSelector(COMBINE_PET, { timeout: 20_000 })
  const isOn = (): Promise<boolean> =>
    page.$eval(COMBINE_PET, (el) => (el as HTMLInputElement).checked)
  if ((await isOn()) !== on) await page.click(COMBINE_PET, { timeout: 15_000 })
  // The CONDITION the click produces — the checkbox agreeing it took the value, never a sleep.
  const settled = await settle(isOn, (v) => v === on, { timeoutMs: 8_000 })
  await page.click(`[data-testid="${back}"]`, { timeout: 30_000 })
  return settled === on
}

/**
 * Which scope the CONTROL holds, read by opening its menu and asking which item is marked chosen —
 * not from the store, and not from the word on the closed control.
 *
 * It is the second witness the readout alone cannot be. The closed control renders `chipLabel`,
 * which is a sentence about the WORLD (Group spells out its no-roster fallback); the menu's
 * checked item is the VALUE. A build where those two drift is a build where the meter is filtering
 * by one scope and telling you another, which is the exact lie this surface exists to prevent.
 *
 * The app is left on the Combat tab with the menu closed, ready for the next assertion.
 */
export async function scopeFromControl(page: Page): Promise<string> {
  await page.click('[data-testid="nav-combat"]', { timeout: 30_000 })
  await page.waitForSelector(SCOPE_SELECT_SEL, { timeout: 20_000 })
  await page.click(SCOPE_SELECT_SEL)
  const chosen = await settle(
    () =>
      page.evaluate(() => {
        const on = document.querySelector('[role="listbox"] .Mui-selected')
        return on?.getAttribute('data-testid')?.replace('meter-scope-', '') ?? ''
      }),
    (v) => v !== '',
    { timeoutMs: 8_000 },
  )
  await page.keyboard.press('Escape')
  await settleGone(page, '[role="listbox"]', { timeoutMs: 8_000 })
  return chosen
}
