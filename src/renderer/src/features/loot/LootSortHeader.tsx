// SortHeadCell — one sortable column header of the Loot tables.
//
// THE ICON IS ALWAYS THERE. MUI's TableSortLabel hides an inactive column's arrow until hover, so a
// reader cannot tell which headers sort without sweeping the mouse over them. Here every sortable
// header wears a dim ⇅ (UnfoldMore) at rest; the active column swaps it for MUI's solid ↑/↓.
//
// NO TOOLTIP (JOS-127): this cell sits directly above the first ledger rows, and the ledger mounts
// no popper. The visible label and `aria-sort` (from `sortDirection`) are the whole explanation.
//
// `whiteSpace: nowrap` keeps the extra icon from wrapping a header onto two lines — the fixed
// table layout (LootTables.tsx) takes its geometry from this row.

import type { JSX } from 'react'
import { TableCell, TableSortLabel } from '@mui/material'
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore'
import type { ColumnSort } from './lootSort'

/** The resting ⇅: visible, but quieter than the active column's arrow. */
const INACTIVE_SX = {
  '& .MuiTableSortLabel-icon': { opacity: 0.4 },
  '&:hover .MuiTableSortLabel-icon': { opacity: 0.8 },
} as const

export function SortHeadCell<K extends string>({
  column,
  label,
  sort,
  onSort,
  testId,
  align,
  width,
}: {
  column: K
  label: string
  sort: ColumnSort<K>
  onSort: (k: K) => void
  testId: string
  align?: 'right'
  width?: string
}): JSX.Element {
  const active = sort.key === column
  return (
    <TableCell
      align={align}
      sortDirection={active ? sort.dir : false}
      sx={{ ...(width === undefined ? {} : { width }), whiteSpace: 'nowrap' }}
    >
      <TableSortLabel
        active={active}
        // Inactive: 'desc' so MUI never rotates the ⇅ (it is symmetric, but a rotate transition on
        // hover would read as motion for no reason).
        direction={active ? sort.dir : 'desc'}
        hideSortIcon={false}
        {...(active ? {} : { IconComponent: UnfoldMoreIcon, sx: INACTIVE_SX })}
        onClick={() => onSort(column)}
        data-testid={`${testId}-${column}`}
        data-active={active ? 'true' : 'false'}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  )
}
