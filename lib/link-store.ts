// Where the sample keeps linked Ring accounts: a JSON file readable only by you (mode 600), ignored by git.
// Swap this for your database in a real app.

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LinkRecord } from './account-linking'

const FILE = process.env.RING_LINK_STORE || join(process.cwd(), '.ring-links.json')

export function loadLinks(): LinkRecord[] {
  try {
    return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, 'utf8')) as LinkRecord[]) : []
  } catch {
    return []
  }
}

export function saveLinks(records: LinkRecord[]): void {
  writeFileSync(FILE, JSON.stringify(records, null, 2), { mode: 0o600 })
}

/** Keeps one record per Ring account; the newest wins. */
export function upsertLink(rec: LinkRecord): void {
  saveLinks(loadLinks().filter((r) => r.accountId !== rec.accountId).concat(rec))
}
