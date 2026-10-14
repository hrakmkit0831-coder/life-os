// IndexedDB ラッパー。データはこの端末のブラウザ内にのみ保存され、外部には送信しない。
import { STORE_KEYS, STORE_NAMES, type DataSet, type StoreName } from './types'

export const DB_NAME = 'life-os'
export const SCHEMA_VERSION = 1

/**
 * マイグレーション: oldVersion から順に適用する。
 * スキーマを変えるときはここに追記し、既存ストアを削除しないこと（データ消失防止）。
 */
const MIGRATIONS: Record<number, (db: IDBDatabase, tx: IDBTransaction) => void> = {
  1: (db) => {
    for (const name of STORE_NAMES) {
      if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: STORE_KEYS[name] })
    }
  },
}

let dbPromise: Promise<IDBDatabase> | null = null

export function openDB(factory: IDBFactory = indexedDB): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, SCHEMA_VERSION)
    req.onupgradeneeded = (e) => {
      const db = req.result
      const tx = req.transaction!
      for (let v = e.oldVersion + 1; v <= SCHEMA_VERSION; v++) MIGRATIONS[v]?.(db, tx)
    }
    req.onsuccess = () => {
      const db = req.result
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    req.onerror = () => {
      dbPromise = null
      reject(req.error ?? new Error('データベースを開けませんでした'))
    }
    req.onblocked = () => reject(new Error('別のタブで LIFE OS が開いているため更新できません。他のタブを閉じてください'))
  })
  return dbPromise
}

/** テスト用: 接続をリセット */
export function resetConnection() {
  dbPromise?.then((db) => db.close()).catch(() => {})
  dbPromise = null
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('保存に失敗しました'))
    tx.onabort = () => reject(tx.error ?? new Error('保存が中断されました（容量不足の可能性があります）'))
  })
}

/** 書き込み中に同期例外（キー不正など）が出たらトランザクションごと取り消す */
function runOrAbort(tx: IDBTransaction, done: Promise<void>, fn: () => void) {
  try {
    fn()
  } catch (e) {
    done.catch(() => {})
    tx.abort()
    throw e
  }
}

export async function loadAll(): Promise<DataSet> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAMES, 'readonly')
  const out = {} as Record<StoreName, unknown[]>
  await Promise.all(
    STORE_NAMES.map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const r = tx.objectStore(name).getAll()
          r.onsuccess = () => {
            out[name] = r.result
            resolve()
          }
          r.onerror = () => reject(r.error)
        }),
    ),
  )
  return out as unknown as DataSet
}

export interface WriteOp {
  store: StoreName
  put?: unknown
  delete?: IDBValidKey
}

/** 複数の書き込みを1トランザクションで実行（すべて成功 or すべて失敗） */
export async function writeOps(ops: WriteOp[]): Promise<void> {
  if (ops.length === 0) return
  const db = await openDB()
  const stores = [...new Set(ops.map((o) => o.store))]
  const tx = db.transaction(stores, 'readwrite')
  const done = txDone(tx)
  runOrAbort(tx, done, () => {
    for (const op of ops) {
      const s = tx.objectStore(op.store)
      if (op.put !== undefined) s.put(op.put)
      if (op.delete !== undefined) s.delete(op.delete)
    }
  })
  await done
}

/** 全データを置き換える（インポート用）。1トランザクションなので途中失敗時は元のデータが残る */
export async function replaceAll(data: DataSet): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAMES, 'readwrite')
  const done = txDone(tx)
  runOrAbort(tx, done, () => {
    for (const name of STORE_NAMES) {
      const s = tx.objectStore(name)
      s.clear()
      for (const rec of data[name] ?? []) s.put(rec)
    }
  })
  await done
}

export async function clearAll(): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAMES, 'readwrite')
  const done = txDone(tx)
  for (const name of STORE_NAMES) tx.objectStore(name).clear()
  await done
}
