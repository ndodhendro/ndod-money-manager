import { registerSW } from 'virtual:pwa-register'

type Listener = (needRefresh: boolean) => void

let needRefresh = false
const listeners = new Set<Listener>()
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined

function notify(value: boolean) {
  needRefresh = value
  listeners.forEach((listener) => listener(value))
}

export function initPwaUpdate() {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      notify(true)
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return

      const checkForUpdate = () => {
        void registration.update()
      }

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate()
      })

      // Cek berkala saat app tetap terbuka.
      window.setInterval(checkForUpdate, 60 * 60 * 1000)
    },
  })
}

export function subscribePwaNeedRefresh(listener: Listener) {
  listeners.add(listener)
  listener(needRefresh)
  return () => {
    listeners.delete(listener)
  }
}

export function applyPwaUpdate() {
  void updateSW?.(true)
}
