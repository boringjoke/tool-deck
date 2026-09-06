import { describe, expect, it } from 'vitest'
import { getPublicRoutePaths } from '../../utils/public-routes'

describe('public route generation', () => {
  it('includes public pages and enabled tools only', () => {
    const routes = getPublicRoutePaths(
      [{ slug: 'developer-text' }, { slug: 'interactive' }],
      [
        { slug: 'published-tool', status: 'enabled' },
        { slug: 'draft-tool', status: 'draft' },
        { slug: 'disabled-tool', status: 'disabled' },
      ],
    )

    expect(routes).toEqual([
      '/',
      '/about',
      '/privacy',
      '/categories/developer-text',
      '/categories/interactive',
      '/tools/published-tool',
    ])
  })
})
