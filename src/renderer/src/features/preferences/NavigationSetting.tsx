// NavigationSetting — Preferences → Navigation. Reorder the left nav, move rows into the "More"
// menu, and switch the drawer to a compact icon rail. Machine-class view prefs (localStorage,
// no IPC) — the same idiom as the Gear column/filter pickers.
//
// The descriptor lives with the card (perfSection / graphicsSection pattern): PreferencesView is
// at its factoring ceiling, and the words a user types to find this ("sidebar", "reorder",
// "hide tab", "compact") belong beside the control.
//
// ONE BORDER: PreferencesView wraps each item in an outlined Paper, so this renders bare Stacks.

import type { JSX } from 'react'
import {
  Button, FormControlLabel, IconButton, List, ListItem, ListItemText,
  Radio, RadioGroup, Stack, Switch, Typography
} from '@mui/material'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import ViewSidebarIcon from '@mui/icons-material/ViewSidebar'
import { isDefaultLayout } from '../../components/navLayout'
import { useNavDensity, useNavLayout } from '../../components/useNavPrefs'
import { VIEW_LABELS } from '../../appViews'
import type { PrefSection } from './PreferencesView'

export function navigationSection(): PrefSection {
  return {
    id: 'navigation',
    label: 'Navigation',
    icon: <ViewSidebarIcon fontSize="small" />,
    items: [
      {
        id: 'nav-layout',
        label: 'Side navigation',
        keywords:
          'navigation nav sidebar side bar drawer rail menu rows tabs reorder order arrange move hide show remove tab more overflow customize customise compact icons icon only density collapse layout left',
        content: <NavigationSetting />
      }
    ]
  }
}

export function NavigationSetting(): JSX.Element {
  const { order, hidden, move, toggle, reset } = useNavLayout()
  const [density, setDensity] = useNavDensity()
  const atDefault = isDefaultLayout(order, hidden)

  return (
    <Stack spacing={2} data-testid="pref-navigation">
      <Stack spacing={0.5}>
        <Typography variant="body2">Rows</Typography>
        <Typography variant="caption" color="text.secondary">
          Reorder the left nav, or switch a row off to move it into the “More” menu. Overview,
          Preferences and Send feedback always stay put.
        </Typography>
      </Stack>

      <List disablePadding>
        {order.map((v, i) => {
          const shown = !hidden.includes(v)
          return (
            <ListItem
              key={v}
              data-testid={`nav-cfg-row-${v}`}
              disableGutters
              secondaryAction={
                <Switch
                  size="small"
                  data-testid={`nav-cfg-show-${v}`}
                  checked={shown}
                  onChange={() => toggle(v)}
                  slotProps={{ input: { 'aria-label': `Show ${VIEW_LABELS[v]}` } }}
                />
              }
            >
              <IconButton
                size="small"
                data-testid={`nav-cfg-up-${v}`}
                disabled={i === 0}
                onClick={() => move(v, -1)}
                aria-label={`Move ${VIEW_LABELS[v]} up`}
              >
                <KeyboardArrowUpIcon fontSize="small" />
              </IconButton>
              <IconButton
                size="small"
                data-testid={`nav-cfg-down-${v}`}
                disabled={i === order.length - 1}
                onClick={() => move(v, 1)}
                aria-label={`Move ${VIEW_LABELS[v]} down`}
              >
                <KeyboardArrowDownIcon fontSize="small" />
              </IconButton>
              <ListItemText
                primary={VIEW_LABELS[v]}
                sx={{ pl: 1, opacity: shown ? 1 : 0.5 }}
              />
            </ListItem>
          )
        })}
      </List>

      <Stack spacing={0.5}>
        <Typography variant="body2">Density</Typography>
        <RadioGroup
          row
          data-testid="nav-cfg-density"
          value={density}
          onChange={(e) => setDensity(e.target.value === 'compact' ? 'compact' : 'comfortable')}
        >
          <FormControlLabel value="comfortable" control={<Radio size="small" />} label="Comfortable" />
          <FormControlLabel value="compact" control={<Radio size="small" />} label="Compact (icons only)" />
        </RadioGroup>
      </Stack>

      <Button
        data-testid="nav-cfg-reset"
        size="small"
        variant="outlined"
        disabled={atDefault}
        onClick={reset}
        sx={{ alignSelf: 'flex-start' }}
      >
        Reset to default
      </Button>
    </Stack>
  )
}
