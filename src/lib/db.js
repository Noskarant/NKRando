const DB_NAME = 'nkrando'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('routes')) db.createObjectStore('routes', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('activities')) db.createObjectStore('activities', { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function tx(store, mode, fn) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const s = t.objectStore(store)
    const req = fn(s)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const saveRoute = route => tx('routes', 'readwrite', s => s.put(route))
export const deleteRoute = id => tx('routes', 'readwrite', s => s.delete(id))
export const getRoutes = () => tx('routes', 'readonly', s => s.getAll())
export const saveActivity = activity => tx('activities', 'readwrite', s => s.put(activity))
export const getActivities = () => tx('activities', 'readonly', s => s.getAll())
export const getActivity = id => tx('activities', 'readonly', s => s.get(id))
