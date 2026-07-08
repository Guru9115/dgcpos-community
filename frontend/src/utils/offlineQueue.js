/**
 * Offline Sale Queue — IndexedDB
 *
 * When the network is down, sales are stored locally in IndexedDB.
 * When the connection restores, all queued sales are synced to the backend
 * automatically in the order they were created.
 *
 * Usage (in POS.jsx handleCheckout):
 *   import { queueSale, syncOfflineQueue, isOnline } from '../utils/offlineQueue'
 *
 *   if (!isOnline()) {
 *     await queueSale(salePayload)
 *     toast.success('Saved offline — will sync when connection restores')
 *   }
 */

const DB_NAME    = 'dgc-offline'
const DB_VERSION = 1
const STORE      = 'sale_queue'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'local_id', autoIncrement: true })
        store.createIndex('queued_at', 'queued_at', { unique: false })
      }
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

export function isOnline() {
  return navigator.onLine
}

/**
 * Save a sale payload to the local queue.
 * Returns the local_id assigned by IndexedDB.
 */
export async function queueSale(payload) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const record = {
      ...payload,
      queued_at:  new Date().toISOString(),
      sync_status: 'pending',  // pending | syncing | failed
    }
    const req = store.add(record)
    req.onsuccess = e => resolve(e.target.result)
    req.onerror   = e => reject(e.target.error)
  })
}

/**
 * Return all pending sale records from the queue.
 */
export async function getPendingQueue() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req   = store.getAll()
    req.onsuccess = e => resolve(e.target.result.filter(r => r.sync_status === 'pending'))
    req.onerror   = e => reject(e.target.error)
  })
}

/**
 * Count all pending items (for the badge indicator).
 */
export async function getPendingCount() {
  const items = await getPendingQueue()
  return items.length
}

async function markSynced(localId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const get   = store.get(localId)
    get.onsuccess = e => {
      const record = e.target.result
      if (!record) { resolve(); return }
      store.delete(localId)
    }
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

async function markFailed(localId, error) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const get   = store.get(localId)
    get.onsuccess = e => {
      const record = e.target.result
      if (!record) { resolve(); return }
      record.sync_status = 'failed'
      record.sync_error  = error
      store.put(record)
    }
    tx.oncomplete = resolve
    tx.onerror    = e => reject(e.target.error)
  })
}

/**
 * Sync all pending offline sales to the backend.
 * Call this on app startup and whenever navigator.onLine flips to true.
 *
 * @param {Function} postFn  — async fn(payload) that POSTs to /api/sales/create
 * @param {Function} onSync  — callback(result, localId) called after each success
 * @param {Function} onError — callback(error, localId) called after each failure
 * @returns {Promise<{synced: number, failed: number}>}
 */
export async function syncOfflineQueue(postFn, onSync, onError) {
  if (!isOnline()) return { synced: 0, failed: 0 }

  const pending = await getPendingQueue()
  if (pending.length === 0) return { synced: 0, failed: 0 }

  let synced = 0, failed = 0
  for (const record of pending) {
    const { local_id, queued_at, sync_status, sync_error, ...payload } = record
    try {
      const result = await postFn(payload)
      await markSynced(local_id)
      synced++
      if (onSync) onSync(result, local_id)
    } catch (err) {
      await markFailed(local_id, String(err))
      failed++
      if (onError) onError(err, local_id)
    }
  }
  return { synced, failed }
}

/**
 * Set up automatic re-sync when the browser comes back online.
 * Call once on app mount.
 */
export function setupOnlineListener(postFn, onSync, onError, onStart) {
  const handler = async () => {
    if (onStart) onStart()
    await syncOfflineQueue(postFn, onSync, onError)
  }
  window.addEventListener('online', handler)
  return () => window.removeEventListener('online', handler)
}
