/** Node 20 has no global WebSocket; supabase-js still constructs RealtimeClient. */
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class {
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
  } as unknown as typeof WebSocket
}
