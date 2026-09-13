// PET PRIORITY (owner ruling, 2026-09-12): a pet that hasn't landed a crit this segment sorts
// below every other row in the combat tab's meter lists, regardless of its damage total — the
// combatant list (petRows.meterSources, combine off) and the nested line-item list inside your
// own breakdown (petRows.nestedRows, combine on). Everything else keeps its damage-ranked order.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { meterSources, nestedRows } from '../src/renderer/src/features/combat/petRows'
import { cat, skill, source } from './combatMeterFixture.mts'
import type { SourceView } from '../src/shared/combat'

const YOU = source('you', 'You', 'you', [
  cat('melee', [skill('Melee', { total: 1000, hits: 50, max: 60 })]),
])

// `cat()` hardcodes its own `crits: 0` rather than summing the skills passed to it, so the
// override has to land on the category itself for `source()`'s crit sum to see it.
function pet(id: string, name: string, total: number, crits: number): SourceView {
  const category = {
    ...cat('melee', [skill('Melee', { total, hits: 40, crits, max: 200 })]),
    crits,
  }
  return source(id, name, 'pet', [category])
}

test('meterSources (combine off) drops a crit-less pet below a lower-damage crit-having pet', () => {
  const critless = pet('pet:1', 'Vebarn', 9000, 0)
  const critting = pet('pet:2', 'Garer', 1, 3)
  const rows = meterSources([critless, YOU, critting], false)
  assert.deepEqual(
    rows.map((r) => r.id),
    ['you', 'pet:2', 'pet:1'],
    'the crit-less pet sorts last even though it out-damages everyone',
  )
})

test('meterSources (combine off) returns the same array by reference when no pet is crit-less', () => {
  const critting = pet('pet:1', 'Vebarn', 9000, 5)
  const entities = [critting, YOU]
  const rows = meterSources(entities, false)
  assert.equal(rows, entities, 'nothing needs to move, so no new array is allocated')
})

test('meterSources (combine on, no self) still deprioritizes a crit-less pet', () => {
  const critless = pet('pet:1', 'Vebarn', 9000, 0)
  const critting = pet('pet:2', 'Garer', 1, 3)
  const rows = meterSources([critless, critting], true)
  assert.deepEqual(
    rows.map((r) => r.id),
    ['pet:2', 'pet:1'],
  )
})

test('nestedRows sorts a crit-less pet below a lower-damage skill lane', () => {
  const you = source('you', 'You', 'you', [
    cat('melee', [skill('Melee', { total: 500, hits: 30, crits: 2, max: 80 })]),
  ])
  const critlessPet = pet('pet:1', 'Vebarn', 9000, 0)
  const rows = nestedRows(you, [critlessPet])
  assert.deepEqual(
    rows.map((r) => (r.kind === 'pet' ? r.pet.name : r.skill.name)),
    ['Melee', 'Vebarn'],
    'the crit-less pet drops below the skill lane despite far higher damage',
  )
})

test('nestedRows ranks a crit-having pet by damage as before', () => {
  const you = source('you', 'You', 'you', [
    cat('melee', [skill('Melee', { total: 500, hits: 30, crits: 2, max: 80 })]),
  ])
  const crittingPet = pet('pet:1', 'Vebarn', 9000, 3)
  const rows = nestedRows(you, [crittingPet])
  assert.deepEqual(
    rows.map((r) => (r.kind === 'pet' ? r.pet.name : r.skill.name)),
    ['Vebarn', 'Melee'],
    'a pet that has crit still ranks purely by damage',
  )
})
