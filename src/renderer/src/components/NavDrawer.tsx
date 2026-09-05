import type { JSX } from 'react'
import { Box, Chip, Divider, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Tooltip } from '@mui/material'
import SettingsIcon from '@mui/icons-material/Settings'
import ShieldMoonIcon from '@mui/icons-material/ShieldMoon'
import BarChartIcon from '@mui/icons-material/BarChart'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive'
import TimerIcon from '@mui/icons-material/Timer'
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh'
import PetsIcon from '@mui/icons-material/Pets'
import MapIcon from '@mui/icons-material/Map'
import SpaceDashboardIcon from '@mui/icons-material/SpaceDashboard'
import CheckroomIcon from '@mui/icons-material/Checkroom'
import FeedbackIcon from '@mui/icons-material/Feedback'
// Dev-only, and its import goes with it: MUI's icon packages declare `sideEffects: false`, so
// an icon whose only use sits inside a `false &&` branch is tree-shaken out with the branch.
import RuleFolderIcon from '@mui/icons-material/RuleFolder'
import UpdateChip from './UpdateChip'
import { OWNER_TOOLS } from '../devFlags'
import type { PrefsRouting } from '../appRouting'
import { GEAR_AREA_VIEWS, VIEW_LABELS, loadGearTab, type View } from '../appViews'
import { CUSTOMIZABLE_VIEWS } from './navLayout'
import { useNavLayout } from './useNavPrefs'

export const DRAWER_WIDTH = 220

/** A row's fixed metadata — its icon, optional trailing chip, and (for the Gear area) the
 *  several views it stands for plus which one it opens. The row's LABEL comes from VIEW_LABELS
 *  and its ORDER / VISIBILITY are now the user's (useNavPrefs / navLayout). */
interface NavRowMeta {
  icon: JSX.Element
  /** trailing state chip, when a row has one to state */
  badge?: JSX.Element
  /**
   * ONE ROW, SEVERAL VIEWS (JOS-324). A row whose destination is an AREA rather than a single
   * view lists every view drawn inside it here, and reads `selected` while ANY of them is up —
   * so the drawer keeps agreeing with the screen when the in-area tab bar moves you sideways.
   * Absent ⇒ the ordinary rule, and the ordinary rule is still the one nearly every row follows.
   */
  area?: readonly View[]
  /**
   * Which view the row OPENS, when that is not simply its key. The gear row opens the area at the
   * tab you last stood on (appViews.ts `loadGearTab`) — a function rather than a value because
   * that answer is read from localStorage at CLICK time, not at module load.
   */
  opens?: () => View
}

/* State, not process: this tab is newer than the rest, and the chip says exactly how much.
 * "beta" replaced "in dev" for the release-hardening pass (owner directive 2026-08-13): Timers,
 * Buffs and Exaltations graduated with no chip at all, and Gear — the youngest tab — wears the
 * one remaining caveat. Since JOS-324 that row is the whole gear AREA, and the chip stays on it:
 * two of the four tabs behind it are younger than the chip was, and one of them is a placeholder.
 * A chip comes OFF by deleting the badge from its row, never by softening the word. */
const BETA = (
  <Chip
    size="small"
    label="beta"
    variant="outlined"
    sx={{ height: 18, fontSize: 10, color: 'text.secondary', '& .MuiChip-label': { px: 0.75 } }}
  />
)

// THE DRAWER IS USER-ORDERED NOW (see components/navLayout.ts). Overview is still pinned first —
// it is DEFAULT_VIEW and a launch must land on a visible row — and Preferences / "Send feedback"
// are still pinned in the bottom block. Everything between them is `CUSTOMIZABLE_VIEWS`: the user
// picks the order and can move any of them into the "More" collapse. The editorial defaults that
// used to live in this array's order (Overview leads; Loot beside Mobs — JOS-324's One Coin Four
// Faces put Gear next; Timers beside Buffs) are the DEFAULT of CUSTOMIZABLE_VIEWS, which is what
// a fresh install and "Reset to default" both produce. The law that survives unchanged: a row is
// a DESTINATION — one nav row per real place you can go, and the Gear row is still one row over
// an in-area tab bar (JOS-324), moved and hidden as a unit.
const ROW_META: Record<Extract<View, 'overview'> | (typeof CUSTOMIZABLE_VIEWS)[number], NavRowMeta> = {
  overview: { icon: <SpaceDashboardIcon /> },
  combat: { icon: <BarChartIcon /> },
  mobs: { icon: <PetsIcon /> },
  loot: { icon: <ReceiptLongIcon /> },
  gear: { icon: <CheckroomIcon />, badge: BETA, area: GEAR_AREA_VIEWS, opens: loadGearTab },
  maps: { icon: <MapIcon /> },
  bosses: { icon: <EmojiEventsIcon /> },
  posky: { icon: <ShieldMoonIcon /> },
  alerts: { icon: <NotificationsActiveIcon /> },
  leveling: { icon: <TrendingUpIcon /> },
  buffs: { icon: <AutoFixHighIcon /> },
  timers: { icon: <TimerIcon /> }
}

/** One nav row. `data-testid="nav-<view>"` is the stable handle the e2e clicks. `compact` draws
 *  the icon-only rail (Task 6 wires it; always `false` here). */
function NavRowButton({
  view,
  meta,
  current,
  compact,
  onSelect
}: {
  view: View
  meta: NavRowMeta
  current: View
  compact: boolean
  onSelect: (v: View) => void
}): JSX.Element {
  const button = (
    <ListItemButton
      data-testid={`nav-${view}`}
      selected={meta.area ? meta.area.includes(current) : current === view}
      onClick={() => onSelect(meta.opens ? meta.opens() : view)}
      sx={compact ? { justifyContent: 'center', px: 1 } : undefined}
    >
      <ListItemIcon sx={compact ? { minWidth: 0 } : undefined}>{meta.icon}</ListItemIcon>
      {!compact && <ListItemText primary={VIEW_LABELS[view]} />}
      {!compact && meta.badge}
    </ListItemButton>
  )
  return compact ? (
    <Tooltip title={VIEW_LABELS[view]} placement="right">
      {button}
    </Tooltip>
  ) : (
    button
  )
}

/** The customizable middle of the drawer: Overview pinned first, then the user's `main` order,
 *  then the owner-only triage row. Split out of `NavDrawer` to keep each function small. */
function NavMainList({
  view,
  onSelect
}: {
  view: View
  onSelect: (v: View) => void
}): JSX.Element {
  const { main } = useNavLayout()
  return (
    <List>
      <NavRowButton view="overview" meta={ROW_META.overview} current={view} compact={false} onSelect={onSelect} />
      {main.map((v) => (
        <NavRowButton
          key={v}
          view={v}
          meta={ROW_META[v as keyof typeof ROW_META]}
          current={view}
          compact={false}
          onSelect={onSelect}
        />
      ))}
      {/* UNRELEASED (JOS-45) USED TO HAVE A ROW HERE, and JOS-324 moved it INTO the gear area:
          the character sheet is now the area's last TAB, gated by the same `UNRELEASED` flag in
          the same way (appViews.ts drops `character` from `KNOWN_VIEWS` in a build without it,
          and `GEAR_AREA_VIEWS` is derived from that list, so the tab is absent from the bar and
          the view is absent from the bundle). The gate itself is untouched and still measured —
          `tests/e2e/character-sheet.e2e.mts` now asserts the TAB is absent in a production-shaped
          build, which is a stronger reading than the old row check because the bar it looks at is
          demonstrably mounted at the time. JOS-327 graduates it by deleting the flag. */}
      {/* OWNER-ONLY: the feedback-triage tab. `OWNER_TOOLS` (JOS-72) is `DEV_TOOLS` AND the
          `EQ_OWNER_TOOLS=1` opt-in, so this row is absent from a fresh checkout's `npm run
          dev` as well as from every build — the tab reads the owner's AWS backlog, and a
          self-compiled copy of this public repo used to show it. `DEV_TOOLS` is still the
          left-hand term, so in `electron-vite build` this reads `false && …` and rollup
          deletes the branch: the row, its label, its chip and its icon are not in the shipped
          bundle at all. Built INSIDE the branch rather than hoisted to a module const on
          purpose: a top-level `jsx()` call is not something rollup can prove is side-effect
          free, and it would keep the strings alive. The e2e suite asserts `nav-triage` is
          ABSENT in a production-shaped build. */}
      {OWNER_TOOLS && (
        <NavRowButton
          view="triage"
          meta={{
            icon: <RuleFolderIcon />,
            badge: (
              <Chip
                size="small"
                label="owner only"
                variant="outlined"
                color="warning"
                sx={{ height: 18, fontSize: 10, '& .MuiChip-label': { px: 0.75 } }}
              />
            )
          }}
          current={view}
          compact={false}
          onSelect={onSelect}
        />
      )}
    </List>
  )
}

/**
 * The permanent left nav: one row per destination — usually a view, and since JOS-324 once an
 * AREA of four (see `ROW_META`) — with the row ORDER and VISIBILITY now user-owned (navLayout.ts),
 * Overview pinned first, Preferences bottom-aligned and the ambient update chip beneath it.
 *
 * Frameless: the drawer is a normal in-flow child (no fixed OS bar above it), so it fills
 * the space under the title bar — `position: relative` + `height: 100%` keeps it inside
 * the flex row.
 */
export default function NavDrawer({
  view,
  onSelect,
  onSendFeedback,
  prefs
}: {
  view: View
  onSelect: (v: View) => void
  /** Opens the feedback DIALOG (Task #65). Feedback is not a view — appViews.ts is untouched —
   *  so this row carries a callback instead of a `View`, and never shows a selected state. */
  onSendFeedback: () => void
  /** The Preferences SECTION router (JOS-254), for the patch-notes icon beside the version
   *  number in the chip below. A section is not a view, so it cannot travel through `onSelect`
   *  — and the drawer names its own destination the way `BottomStrips` does in App.tsx rather
   *  than taking one opaque callback per section a future row might want. */
  prefs: PrefsRouting
}): JSX.Element {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box',
          position: 'relative',
          height: '100%',
          borderTop: 'none'
        }
      }}
    >
      <NavMainList view={view} onSelect={onSelect} />

      {/* Bottom-aligned Preferences (Task #55) — replaces the old update-channel block. */}
      <Box sx={{ mt: 'auto' }}>
        <Divider />
        <List disablePadding>
          {/* Send feedback (Task #65): a dialog, so it is a plain action row — no `selected`
              state to own, because nothing in the nav stays "on" while it is open. */}
          <ListItemButton data-testid="nav-feedback" onClick={onSendFeedback}>
            <ListItemIcon>
              <FeedbackIcon />
            </ListItemIcon>
            <ListItemText primary="Send feedback" />
          </ListItemButton>
          <NavRowButton
            view="preferences"
            meta={{ icon: <SettingsIcon /> }}
            current={view}
            compact={false}
            onSelect={onSelect}
          />
        </List>
        {/* …and directly beneath it, the AMBIENT update affordance (Task #60):
            a gold "Restart to update" chip when a build is downloaded and
            staged, otherwise a muted "checked 2h ago" line. Never a nag —
            ignoring it just means apply-on-quit does the work silently.
            That muted line is also where the app states the version you are
            running, so it carries the patch-notes icon (JOS-254). */}
        <UpdateChip onWhatsNew={() => prefs.openSection('whatsnew')} />
      </Box>
    </Drawer>
  )
}
