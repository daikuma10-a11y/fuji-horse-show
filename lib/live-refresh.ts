// Serialize reads and collapse a burst of database notifications into one fetch.
// There is no periodic data polling: only startup, changes and reconnection read data.
export function startLiveRefresh(load: () => Promise<unknown>, delay = 150) {
  let stopped = false, running = false, queued = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const run = async () => {
    timer = undefined
    if (stopped) return
    if (running) { queued = true; return }
    running = true
    try { await load() }
    finally {
      running = false
      if (queued && !stopped) { queued = false; refresh() }
    }
  }
  const refresh = () => {
    if (stopped) return
    if (running) { queued = true; return }
    if (!timer) timer = setTimeout(() => { void run() }, delay)
  }
  refresh()
  return { refresh, stop: () => { stopped = true; if (timer) clearTimeout(timer) } }
}

// Public notifications contain no records, names, fees or authentication tokens.
// All actual data continues to be fetched through the existing authorized REST API.
export function subscribeToEventChanges(url: string, key: string, eventId: string,
  refresh: () => void, status: (connected: boolean) => void) {
  let stopped = false, attempt = 0, ref = 0
  let socket: WebSocket | undefined
  let retry: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let pendingHeartbeat: string | undefined
  const topic = `realtime:fhs-event-${eventId}`
  const clearTimers = () => {
    if (heartbeat) clearInterval(heartbeat)
    if (watchdog) clearTimeout(watchdog)
    pendingHeartbeat = undefined
  }
  const connect = () => {
    if (stopped) return
    const ws = new WebSocket(`${url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`)
    socket = ws
    const joinRef = String(++ref)
    const send = (event: string, payload: unknown, target = topic) => {
      const messageRef = String(++ref)
      ws.send(JSON.stringify({ topic: target, event, payload, ref: messageRef, join_ref: target === topic ? joinRef : null }))
      return messageRef
    }
    watchdog = setTimeout(() => ws.close(), 15000)
    ws.onopen = () => {
      ws.send(JSON.stringify({ topic, event: 'phx_join', payload: { config: { broadcast: { ack: false, self: false }, presence: { enabled: false }, private: false } }, ref: joinRef, join_ref: joinRef }))
    }
    ws.onmessage = event => {
      if (stopped || socket !== ws) return
      let message: { topic?: string; event?: string; ref?: string; payload?: { status?: string; event?: string } }
      try { message = JSON.parse(event.data) } catch { return }
      if (message.event === 'phx_reply' && message.ref === pendingHeartbeat) pendingHeartbeat = undefined
      if (message.topic !== topic) return
      if (message.event === 'phx_reply' && message.ref === joinRef) {
        if (message.payload?.status !== 'ok') { ws.close(); return }
        if (watchdog) clearTimeout(watchdog)
        attempt = 0; status(true); refresh()
        heartbeat = setInterval(() => {
          if (pendingHeartbeat) { ws.close(); return }
          if (ws.readyState === WebSocket.OPEN) pendingHeartbeat = send('heartbeat', {}, 'phoenix')
        }, 25000)
      }
      if (message.event === 'broadcast' && message.payload?.event === 'changed') refresh()
      if (message.event === 'phx_error' || message.event === 'phx_close') ws.close()
    }
    ws.onerror = () => ws.close()
    ws.onclose = () => {
      clearTimers()
      if (stopped || socket !== ws) return
      status(false)
      retry = setTimeout(connect, Math.min(30000, 1000 * 2 ** attempt++))
    }
  }
  connect()
  return () => { stopped = true; if (retry) clearTimeout(retry); clearTimers(); socket?.close() }
}
