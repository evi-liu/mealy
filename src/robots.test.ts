import { describe, expect, it } from 'vitest'
import { refusal, robotsPolicy } from '../supabase/functions/_shared/robots'

// Shapes taken from real robots.txt files, shortened.
const wordpress = `
# Prevent Crawling Unnecessary Endpoints
User-agent: *
Disallow: /wp-admin/
Disallow: /*?s=

User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php

User-agent: GPTBot
Disallow: /
`
const noScraping = `
#Use of any crawler or other tool, device, or process to data mine or scrape the
#content on this website using automated means for any purpose other than
#directing traffic to this website is prohibited without prior written permission.
User-agent: *
Disallow: /cook/
`

describe('robots.txt policy', () => {
  it('applies the "*" groups with longest-match and Allow on ties', () => {
    const policy = robotsPolicy(wordpress)
    expect(policy.allows('/chicken-chow-mein/')).toBe(true)
    expect(policy.allows('/wp-admin/options.php')).toBe(false)
    expect(policy.allows('/wp-admin/admin-ajax.php')).toBe(true)
    expect(policy.allows('/?s=noodles')).toBe(false)
    expect(refusal(policy)).toBeNull()
  })

  it('follows a group naming this importer over the "*" group', () => {
    const policy = robotsPolicy(
      `User-agent: *\nDisallow:\n\nUser-agent: MealyHouseholdPlanner\nDisallow: /`,
    )
    expect(policy.allows('/anything/')).toBe(false)
    expect(refusal(policy)).toMatch(/does not allow automated importers/)
  })

  it('refuses a site whose robots.txt comments prohibit scraping', () => {
    const policy = robotsPolicy(noScraping)
    expect(policy.allows('/recipe/123/')).toBe(true)
    expect(policy.allows('/cook/abc')).toBe(false)
    expect(policy.notice).toMatch(/scrape the content/)
    expect(refusal(policy)).toMatch(/automated scraping is prohibited/)
  })

  it('allows everything when there are no rules', () => {
    const policy = robotsPolicy('')
    expect(policy.allows('/')).toBe(true)
    expect(refusal(policy)).toBeNull()
  })
})
