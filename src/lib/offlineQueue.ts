import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

/**
 * Offline-first write queue (foundation for part 5).
 *
 * Mutations that happen while offline are appended here and replayed against
 * Supabase when connectivity returns. This module provides the durable store;
 * the sync loop + optimistic UI get wired into the mutation hooks in part 5.
 */

export type QueuedOp = 'insert' | 'update' | 'delete' | 'rpc'

export interface QueuedMutation {
  id: string
  op: QueuedOp
  /** table name, or RPC function name when op === 'rpc' */
  target: string
  payload: unknown
  createdAt: number
}

interface StashDB extends DBSchema {
  outbox: {
    key: string
    value: QueuedMutation
    indexes: { 'by-createdAt': number }
  }
}

let dbPromise: Promise<IDBPDatabase<StashDB>> | null = null

function db() {
  if (!dbPromise) {
    dbPromise = openDB<StashDB>('stash', 1, {
      upgrade(database) {
        const store = database.createObjectStore('outbox', { keyPath: 'id' })
        store.createIndex('by-createdAt', 'createdAt')
      },
    })
  }
  return dbPromise
}

export async function enqueue(mutation: Omit<QueuedMutation, 'id' | 'createdAt'>) {
  const record: QueuedMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  }
  await (await db()).put('outbox', record)
  return record
}

export async function pending(): Promise<QueuedMutation[]> {
  return (await db()).getAllFromIndex('outbox', 'by-createdAt')
}

export async function remove(id: string) {
  await (await db()).delete('outbox', id)
}

export async function pendingCount(): Promise<number> {
  return (await db()).count('outbox')
}
