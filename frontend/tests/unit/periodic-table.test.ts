import { describe, expect, it } from 'vitest'
import {
  getPeriodicElementGridPosition,
  getPeriodicElementSeries,
  searchPeriodicElements,
  validatePeriodicElementCatalog,
  PERIODIC_ELEMENT_CATALOG,
} from '../../core/periodic-table'

describe('periodic table core', () => {
  it('contains the 118 uniquely addressable elements', () => {
    const validation = validatePeriodicElementCatalog()

    expect(validation.ok).toBe(true)
    expect(PERIODIC_ELEMENT_CATALOG).toHaveLength(118)
    expect(new Set(PERIODIC_ELEMENT_CATALOG.map((element) => element.atomicNumber)).size).toBe(118)
    expect(new Set(PERIODIC_ELEMENT_CATALOG.map((element) => element.symbol)).size).toBe(118)
  })

  it('supports exact atomic number, symbol and name searches', () => {
    expect(searchPeriodicElements({ query: '8' }).map((element) => element.symbol)).toEqual(['O'])
    expect(searchPeriodicElements({ query: 'Fe' }).map((element) => element.nameZh)).toEqual(['铁'])
    expect(searchPeriodicElements({ query: '氧' }).map((element) => element.symbol)).toEqual(['O'])
    expect(searchPeriodicElements({ query: 'oxygen' }).map((element) => element.symbol)).toEqual(['O'])
  })

  it('combines category, block and state filters', () => {
    expect(searchPeriodicElements({ category: 'noble-gas' }).map((element) => element.symbol)).toEqual([
      'He', 'Ne', 'Ar', 'Kr', 'Xe', 'Rn', 'Og',
    ])
    expect(searchPeriodicElements({ block: 'f', state: 'solid' })).toHaveLength(28)
    expect(searchPeriodicElements({ category: 'halogen', state: 'gas' }).map((element) => element.symbol)).toEqual([
      'F', 'Cl',
    ])
  })

  it('keeps main table and f-block positions stable', () => {
    const hydrogen = PERIODIC_ELEMENT_CATALOG.find((element) => element.symbol === 'H')!
    const lanthanum = PERIODIC_ELEMENT_CATALOG.find((element) => element.symbol === 'La')!
    const cerium = PERIODIC_ELEMENT_CATALOG.find((element) => element.symbol === 'Ce')!
    const actinium = PERIODIC_ELEMENT_CATALOG.find((element) => element.symbol === 'Ac')!

    expect(getPeriodicElementGridPosition(hydrogen)).toEqual({ area: 'main', row: 1, column: 1 })
    expect(getPeriodicElementGridPosition(lanthanum)).toEqual({ area: 'main', row: 6, column: 3 })
    expect(getPeriodicElementGridPosition(cerium)).toEqual({ area: 'lanthanides', row: 1, column: 2 })
    expect(getPeriodicElementGridPosition(actinium)).toEqual({ area: 'main', row: 7, column: 3 })
    expect(getPeriodicElementSeries('lanthanides')).toHaveLength(15)
    expect(getPeriodicElementSeries('actinides')).toHaveLength(15)
  })

  it('preserves source notation for intervals and bracketed masses', () => {
    expect(PERIODIC_ELEMENT_CATALOG.find((element) => element.symbol === 'H')?.atomicWeight).toBe('[1.00784, 1.00811]')
    expect(PERIODIC_ELEMENT_CATALOG.find((element) => element.symbol === 'Tc')?.atomicWeight).toBe('[97]')
    expect(PERIODIC_ELEMENT_CATALOG.find((element) => element.symbol === 'Fe')?.atomicWeight).toBe('55.845')
  })
})
