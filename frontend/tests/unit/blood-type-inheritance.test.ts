import { describe, expect, it } from 'vitest'

import {
  BLOOD_TYPE_DATASET_METADATA,
  BLOOD_TYPE_OPTIONS,
  getBloodTypeOption,
  getPossibleChildBloodTypes,
  hasCompleteBloodTypeQuery,
  validateBloodTypeCatalog,
} from '../../core/blood-type-inheritance'

describe('blood-type-inheritance core', () => {
  it('contains the confirmed eight common ABO and RhD options', () => {
    expect(BLOOD_TYPE_OPTIONS.map((option) => option.id)).toEqual([
      'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
    ])
    expect(BLOOD_TYPE_DATASET_METADATA.version).toBe('blood-type-inheritance-v1')
    expect(BLOOD_TYPE_DATASET_METADATA.sources).toHaveLength(4)
    expect(validateBloodTypeCatalog()).toEqual({ ok: true, value: true })
  })

  it('calculates representative ABO and RhD inheritance combinations', () => {
    expect(getPossibleChildBloodTypes('O+', 'O+')).toEqual(['O+', 'O-'])
    expect(getPossibleChildBloodTypes('AB-', 'O-')).toEqual(['A-', 'B-'])
    expect(getPossibleChildBloodTypes('A-', 'A-')).toEqual(['A-', 'O-'])
    expect(getPossibleChildBloodTypes('AB+', 'AB+')).toEqual([
      'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-',
    ])
    expect(getPossibleChildBloodTypes('A+', 'B+')).toEqual([
      'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
    ])
  })

  it('keeps the result independent of parent order and removes duplicates', () => {
    const forward = getPossibleChildBloodTypes('A+', 'B-')
    const reverse = getPossibleChildBloodTypes('B-', 'A+')

    expect(forward).toEqual(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    expect(reverse).toEqual(forward)
    expect(new Set(forward).size).toBe(forward.length)
  })

  it('returns no result until both parents are selected', () => {
    expect(getPossibleChildBloodTypes(null, 'A+')).toEqual([])
    expect(getPossibleChildBloodTypes('A+', null)).toEqual([])
    expect(hasCompleteBloodTypeQuery({ parentA: null, parentB: null })).toBe(false)
    expect(hasCompleteBloodTypeQuery({ parentA: 'A+', parentB: null })).toBe(false)
    expect(hasCompleteBloodTypeQuery({ parentA: 'A+', parentB: 'B+' })).toBe(true)
  })

  it('keeps display descriptions aligned with the static option IDs', () => {
    expect(getBloodTypeOption('AB-')).toMatchObject({
      id: 'AB-',
      abo: 'AB',
      rhd: '-',
      labelZh: 'AB−',
    })

    const invalid = validateBloodTypeCatalog([
      {
        ...BLOOD_TYPE_OPTIONS[0]!,
        id: 'broken' as 'A+',
      },
    ])

    expect(invalid).toMatchObject({ ok: false, error: { code: 'invalid-state' } })
  })
})
