// THE SCOPE CONTROL AND THE ROSTER BEHIND IT - docs/plans/group-model.md §3.
//
// One DROPDOWN answering "whose damage am I looking at", and a popover answering the question it
// immediately provokes: "…and who does the app think is in my group, and why?"
//
// IT IS A CONTROL AGAIN (owner, 2026-09-17). JOS-115 took the choice off every combat surface on
// the report that a three-state selector repeated everywhere was clutter, and parked it in
// Preferences > Combat; what stayed here was a read-only word. The owner's reading now is that the
// clutter was the REPETITION, not the control: one selector, on the surface whose rows it filters,
// is the shape that was wanted. So the Combat tab owns the choice and Preferences carries no copy
// of it at all - the surfaces that CANNOT host a control (the Overview card, every floating
// overlay) still only READ the key, which is what keeps JOS-115's actual finding intact.
//
// A DROPDOWN, NOT THE OLD SEGMENTED CHIPS. Three side-by-side buttons is what made the old inline
// control wide, and this bar is the one place in the app that may never wrap (CombatHeader line 2
// is a measured two-rank contract). A select is one chip's worth of width whatever it is showing.
//
// THE CLOSED CONTROL STILL STATES THE FALLBACK, and that is load-bearing rather than cosmetic:
// `chipLabel` spells Group out as `Group (no roster yet)` when no group signal has landed, because
// law 1 says an empty roster must resolve to Everyone, and a meter that narrowed nothing has to be
// able to say why it looks unnarrowed. The MENU shows the three plain words - the fallback is a
// statement about the world, not about the option you are choosing.
//
// THE PROVENANCE IS THE POINT, not decoration. The roster is inferred from lines the game prints
// once, so a member can be there because they joined (the game said so), because they hold the
// leader role, because they are talking to your group, or because you said so. A meter that
// hides a row without being able to say why is a meter you cannot trust - and hiding a real
// group-mate is the exact defect this whole feature exists to fix. So every row states its rung
// and the ones the app is least sure of say so loudest (a STALE row is dimmed and labelled).
//
// AND EVERY ROW IS CORRECTABLE. Remove is the answer to "that person left and the log never
// said so"; the add box is the answer to "we grouped before I opened the app". Neither can lose
// you a number: a removed member's damage is still recorded and still shows under Everyone
// (shared/roster.ts RosterView.admitted says why), so the worst a wrong edit can do is hide a
// row you can bring straight back.
//
// UI CONVENTION (AGENTS.md): state, never process. No captions about how membership is
// detected - the provenance word IS the state, and the tooltip carries the rest.

import { useState } from 'react'
import {
  Box,
  Button,
  ClickAwayListener,
  IconButton,
  MenuItem,
  Paper,
  Popper,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import GroupIcon from '@mui/icons-material/Group'
import { Tooltip } from '../../lib/Tooltip'
import { formatDate } from '../../lib/formatDate'
import { useMeterScope } from './useCombatPrefs'
import {
  METER_SCOPES,
  SCOPE_HINT,
  SCOPE_LABEL,
  SOURCE_LABEL,
  chipLabel,
  type MeterScope,
  type RosterMember,
  type RosterSnap,
} from '@shared/roster'

/** One member row: name, provenance, and the remove that hides it. */
function MemberRow({
  m,
  onRemove,
}: {
  m: RosterMember
  onRemove: (name: string) => void
}): React.JSX.Element {
  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 0.25 }}>
      <Typography
        variant="body2"
        sx={{ flexGrow: 1, minWidth: 0, color: m.stale ? 'text.disabled' : 'text.primary' }}
      >
        {m.name}
      </Typography>
      {/* STALE is its own word, not just a dimmer row: the app is saying "I have not heard from
          this group since you were last offline", and EQ drops groups silently on camp. The row
          is still counted — hiding a real member is the worse error. */}
      {m.stale && (
        <Tooltip title="No signal since you were last offline. Still counted - EQ never says when a group breaks.">
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>
            stale
          </Typography>
        </Tooltip>
      )}
      <Tooltip title={`Since ${formatDate(m.sinceTs)}`}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {SOURCE_LABEL[m.source]}
        </Typography>
      </Tooltip>
      <Tooltip title="Hide this row from the Group scope. Their damage stays recorded, and stays visible under Everyone.">
        <IconButton
          size="small"
          aria-label={`Remove ${m.name}`}
          onClick={() => onRemove(m.name)}
          sx={{ p: 0.25 }}
        >
          <CloseIcon sx={{ fontSize: 13 }} />
        </IconButton>
      </Tooltip>
    </Stack>
  )
}

/** The add box — the member whose join message the log never carried. */
function AddMember({ onAdd }: { onAdd: (name: string) => void }): React.JSX.Element {
  const [text, setText] = useState('')
  const submit = (): void => {
    const name = text.trim()
    if (name === '') return
    onAdd(name)
    setText('')
  }
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.75 }}>
      <TextField
        size="small"
        variant="outlined"
        placeholder="Add a name"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        slotProps={{
          htmlInput: {
            'aria-label': 'Add a group member by name',
            style: { fontSize: 12, padding: '4px 8px' },
          },
        }}
        sx={{ flexGrow: 1 }}
      />
      <Button size="small" onClick={submit} sx={{ fontSize: 11, minWidth: 0, px: 1 }}>
        Add
      </Button>
    </Stack>
  )
}

/** The popover body: the roster, or the honest empty state. */
function RosterPanel({
  roster,
  onAdd,
  onRemove,
}: {
  roster: RosterSnap
  onAdd: (name: string) => void
  onRemove: (name: string) => void
}): React.JSX.Element {
  return (
    <Box sx={{ p: 1.25, width: 260 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>
        Group roster
      </Typography>
      {roster.members.length === 0 ? (
        // NOT a zeroed list, and NOT one sentence. `seen` is the difference between two empty
        // rosters that mean opposite things, and the Group scope behaves differently in each —
        // so saying the same words for both would make one of them a lie:
        //
        //   seen: false  we have been told NOTHING. Group falls back to Everyone (law 1 —
        //                unknown must not hide people), so the meter really is showing all.
        //   seen: true   we were told, and the group is over. Group means just you now, and
        //                it is genuinely filtering.
        <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', mt: 0.5 }}>
          {roster.seen
            ? 'Nobody on the roster right now - the Group scope is showing you and your pets.'
            : 'No group signal yet this session - the Group scope is showing everyone.'}
        </Typography>
      ) : (
        <Box sx={{ mt: 0.5 }}>
          {roster.members.map((m) => (
            <MemberRow key={m.key} m={m} onRemove={onRemove} />
          ))}
        </Box>
      )}
      <AddMember onAdd={onAdd} />
    </Box>
  )
}

/**
 * EVERY WORD THIS CONTROL OFFERS, so it can be sized to the widest of them once and never move
 * again. DERIVED, NOT LISTED: adding a scope or renaming one carries the width with it, and there
 * is no measured pixel count here to go stale when a font or a word changes.
 *
 * THE LAW-1 FALLBACK IS DELIBERATELY NOT IN THIS SET, and that is a measured decision rather than
 * an oversight. `Group (no roster yet)` is two and a half times the width of the longest thing you
 * can actually pick, and sizing to it pushed this bar 41px past its own edge at the 720px window
 * the headless harness measures (e2e run 2026-09-18, `[narrow (720)] … cut off horizontally`).
 * That bar may not wrap and may not clip, so the sentence has to give way somewhere: it still
 * RENDERS in full and ellipsizes (`Group (no roster …`), which is enough to see at a glance that
 * this is not a plain Group scope, the native title carries the whole of it, and the roster
 * popover one click to the right states it properly. What is NOT negotiable is the width, because
 * that swap lands mid-session on nothing the user did - the roster is inferred from lines the game
 * prints once - and a bar that reflows while you are reading numbers off it is the defect.
 */
const SCOPE_WIDTH_PROBES: readonly string[] = METER_SCOPES.map((sc) => SCOPE_LABEL[sc])

/**
 * THE DROPDOWN, on its own because the component below sits at the 100-line-per-function ceiling
 * once this is inlined into it - the repo's answer there is to split, never to ratchet. It reads
 * as the one thing it is: the scope, offered.
 */
function ScopeSelect({
  scope,
  roster,
}: {
  scope: MeterScope
  roster: RosterSnap
}): React.JSX.Element {
  // THE VALUE ARRIVES AS A PROP, THE WRITE IS TAKEN FROM THE STORE. CombatView reads the scope once
  // and hands that same value to this header AND to the meters below it, so the word and the rows
  // can never disagree about which scope is in force; there is nothing for a second read to add.
  // The SETTER has no such reader to agree with, so it comes straight off `useMeterScope` here
  // rather than down four levels of callback prop - the same shortcut this component's sibling
  // takes with `window.eq.setRosterEdit`, and for the same reason.
  const [, setScope] = useMeterScope()
  return (
    <Select
      size="small"
      value={scope}
      data-testid="meter-scope-select"
      onChange={(e) => setScope(e.target.value as MeterScope)}
      // The CLOSED control says `chipLabel`, which spells the law-1 fallback out
      // (`Group (no roster yet)`); the menu items below say the three plain words. The testid
      // stays on the WORD rather than on the Select, so every spec that read this readout
      // before it was a control still reads exactly the same text node.
      //
      // AND IT IS ONE WIDTH WHATEVER IT SAYS (owner, 2026-09-17). A select sizes to its own
      // displayed value, so this control used to grow and shrink under its own words - `You` to
      // `Everyone` on a click, `Group` to `Group (no roster yet)` on nothing the user did at all
      // - and everything to its right stepped sideways each time. A meter you are reading is the
      // worst possible place for that.
      //
      // The width comes from STACKED GHOSTS rather than a measured constant: every word the
      // control OFFERS is rendered into the same grid cell, hidden and zero-height, so the cell
      // is as wide as the widest of them and the visible label sits in it. It is the same answer
      // a hard-coded pixel width gives, except the browser does the measuring - which is what
      // makes it survive a font change, a renamed scope and a fourth one without anybody
      // remembering this line exists. `SCOPE_WIDTH_PROBES` says why the fallback sentence is not
      // in that set and ellipsizes instead.
      renderValue={(v) => (
        <Box sx={{ position: 'relative', display: 'grid' }}>
          {SCOPE_WIDTH_PROBES.map((t) => (
            <Box
              key={t}
              component="span"
              aria-hidden
              sx={{ gridArea: '1 / 1', visibility: 'hidden', whiteSpace: 'nowrap' }}
            >
              {t}
            </Box>
          ))}
          {/* OUT OF FLOW, which is the half that makes the ghosts mean anything. A grid column is
              as wide as the widest thing IN it, so a visible label sharing the cell would simply
              push the column back out to its own width and the ghosts would be a floor rather
              than a size - measured, and that is exactly what the first cut did (Group came back
              at 144px while the other two sat at 85px). Absolute, it contributes nothing to the
              sizing, fills whatever the ghosts settled on, and ellipsizes inside it. */}
          <Box
            component="span"
            data-testid="meter-scope-label"
            sx={{
              position: 'absolute',
              inset: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {chipLabel(v, roster)}
          </Box>
        </Box>
      )}
      // The menu is anchored under the control and never flipped onto the fight picker above
      // it - the no-popper law this bar keeps (CombatHeader, JOS-143) is about HOVER surfaces
      // stealing clicks, and a menu that only exists after a deliberate click is the opposite
      // case, but it still has no business opening upward over the selector.
      //
      // IT OPENS SOLID, WITH NO FADE (owner, 2026-09-18: "the options should not be
      // transparent"). MUI grows a menu in over ~250ms, and for every one of those frames the
      // paper really is semi-transparent - which anywhere else is a flourish nobody reads, and
      // here is three words sitting on top of a gold damage bar and a live dps figure, so the
      // options come up smeared over the numbers they are about. MEASURED rather than assumed:
      // at rest the paper computes to an opaque rgb(23, 26, 33), and the see-through capture was
      // taken mid-transition (probe, 2026-09-18). So the fade is the whole defect, and the fix is
      // to not have one - a three-item menu has nothing to animate anyway.
      //
      // The BORDER is the other half. The menu's paper and the meter card underneath it are both
      // `background.paper`, separated only by the dark theme's elevation wash; a real edge is
      // what makes a small menu read as a surface above the page rather than as a patch of it.
      // Same outline the roster popover one click to the right already wears.
      MenuProps={{
        anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
        transformOrigin: { vertical: 'top', horizontal: 'left' },
        transitionDuration: 0,
        slotProps: {
          paper: {
            elevation: 8,
            sx: { border: '1px solid', borderColor: 'divider' },
          },
        },
      }}
      // A NATIVE TITLE, NOT A TOOLTIP — the law this bar keeps (CombatHeader, JOS-143). A MUI
      // tooltip flips to `top` when the window has no room below it, which on line 2 means
      // opening onto the fight picker's trigger and taking its clicks; that mattered when this
      // was a passive chip and it matters more now that the thing it would cover sits directly
      // above a control the user has to hit. Same words on hover, no DOM node, no hit area.
      // The label is the one that can outrun its box (see `SCOPE_WIDTH_PROBES`), so when it
      // does, the title leads with the whole of it - the house rule for any ellipsized string -
      // and the hint follows. In the ordinary case the label is fully visible and repeating it
      // on hover would be noise, so the hint stands alone.
      SelectDisplayProps={{
        title:
          chipLabel(scope, roster) === SCOPE_LABEL[scope]
            ? SCOPE_HINT[scope]
            : `${chipLabel(scope, roster)} - ${SCOPE_HINT[scope]}`,
        'aria-label': 'Whose damage the meters show',
      }}
      // CHIP-SCALE, and `flexShrink: 0` because the width above is the whole point: a control
      // that is allowed to shrink out of a tight bar is a control whose width depends on the
      // window, which is the same layout shift by another route. This line's overflow is
      // absorbed by the passive readout at its right edge instead, which is what CombatHeader
      // already says it is for - and the bar's two-rank height is a contract the headless
      // harness measures at every width down to 720px.
      sx={{
        flexShrink: 0,
        height: 22,
        fontSize: 11,
        fontWeight: 600,
        '& .MuiSelect-select': { py: 0, pl: 0.875, minHeight: 0 },
        '& .MuiSelect-icon': { fontSize: 16, right: 2 },
      }}
    >
      {METER_SCOPES.map((s) => (
        <MenuItem key={s} value={s} data-testid={`meter-scope-${s}`} sx={{ fontSize: 12 }}>
          {SCOPE_LABEL[s]}
        </MenuItem>
      ))}
    </Select>
  )
}

/**
 * The control itself: the scope this meter filters by, offered as a dropdown, with the group icon
 * beside it opening the roster. Two controls, two different acts - CHOOSING a scope and CORRECTING
 * a mis-inferred group - and they have always belonged side by side, where the missing rows are.
 */
export function ScopeControl({
  scope,
  roster,
}: {
  scope: MeterScope
  roster: RosterSnap
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const add = (name: string): void => {
    void window.eq.setRosterEdit({ name, action: 'add' })
  }
  const remove = (name: string): void => {
    void window.eq.setRosterEdit({ name, action: 'remove' })
  }

  return (
    <>
      <ScopeSelect scope={scope} roster={roster} />
      <Tooltip title="Who the app thinks is in your group, and why">
        <IconButton
          size="small"
          data-testid="roster-open"
          aria-label="Show the group roster"
          onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
          sx={{ p: 0.25 }}
        >
          <GroupIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Tooltip>
      {anchor && (
        <ClickAwayListener
          onClickAway={(e) => {
            // Ignore the click that is closing us by toggling the trigger — otherwise the
            // trigger would close and immediately reopen (the FightPicker precedent).
            if (e.target instanceof Node && anchor.contains(e.target)) return
            setAnchor(null)
          }}
        >
          <Popper open anchorEl={anchor} placement="bottom-start" sx={{ zIndex: 1300 }}>
            <Paper variant="outlined" data-testid="roster-popover" elevation={8}>
              <RosterPanel roster={roster} onAdd={add} onRemove={remove} />
            </Paper>
          </Popper>
        </ClickAwayListener>
      )}
    </>
  )
}
