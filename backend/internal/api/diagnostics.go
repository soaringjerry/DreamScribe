package api

import (
    "context"
    "net/http"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/pcas/dreams-cli/backend/internal/pcas"
)

// registerDiagnostics exposes a minimal test page and a health endpoint
func (h *Handler) registerDiagnostics(router *gin.Engine) {
    router.GET("/api/health", h.handleHealth)
    router.GET("/test", h.handleTestPage)
}

type healthStatus struct {
    Server string `json:"server"`
    PCAS   struct {
        Address    string `json:"address"`
        Transcribe status `json:"transcribe"`
        Translate  status `json:"translate"`
        Summarize  status `json:"summarize"`
        Chat       status `json:"chat"`
    } `json:"pcas"`
}

type status struct {
    Ok    bool   `json:"ok"`
    Error string `json:"error,omitempty"`
}

func (h *Handler) handleHealth(c *gin.Context) {
    s := healthStatus{Server: "ok"}
    s.PCAS.Address = h.config.PCAS.Address

    check := func(evt string) status {
        ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
        defer cancel()
        gw, err := pcas.NewGateway(h.config.PCAS.Address)
        if err != nil {
            return status{Ok: false, Error: err.Error()}
        }
        defer gw.Close()
        if err := gw.CheckReady(ctx, evt, map[string]string{"probe": "true"}); err != nil {
            return status{Ok: false, Error: err.Error()}
        }
        return status{Ok: true}
    }

    s.PCAS.Transcribe = check(h.config.PCAS.EventType)
    s.PCAS.Translate = check(h.config.PCAS.TranslateEventType)
    s.PCAS.Summarize = check(h.config.PCAS.SummarizeEventType)
    s.PCAS.Chat = check(h.config.PCAS.ChatEventType)

    c.JSON(http.StatusOK, s)
}

// A tiny HTML page with JS helpers to test WS and SSE endpoints
func (h *Handler) handleTestPage(c *gin.Context) {
    const page = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DreamScribe Test Console</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, Arial; margin: 20px; }
    .card { border: 1px solid #ddd; padding: 12px; border-radius: 8px; margin-bottom: 12px; }
    .row { display: flex; gap: 8px; align-items: center; }
    textarea { width: 100%; height: 100px; }
    pre { background: #f7f7f7; padding: 8px; border-radius: 6px; overflow: auto; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  </style>
  <script>
  async function getJSON(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error(await r.text()); return r.json(); }
  function log(el, ...args){ el.textContent += args.join(' ') + "\n"; el.scrollTop = el.scrollHeight; }
  function esc(s){ return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
  </script>
  </head>
<body>
  <h1>DreamScribe Test Console</h1>
  <div class="card">
    <h2>Health</h2>
    <button id="btnHealth">Check /api/health</button>
    <pre id="healthOut"></pre>
  </div>
  <div class="card">
    <h2>WebSocket: /ws/transcribe</h2>
    <div class="row">
      <button id="wsOpen">Open</button>
      <button id="wsClose" disabled>Close</button>
      <span id="wsStatus">closed</span>
    </div>
    <pre id="wsLog"></pre>
  </div>
  <div class="card">
    <h2>Translate SSE</h2>
    <div class="row">
      <input id="trLang" value="en" />
      <button id="trStart">Start</button>
      <button id="trStop" disabled>Stop</button>
    </div>
    <div class="row">
      <input id="trText" placeholder="text to send" style="flex:1" />
      <button id="trSend" disabled>Send</button>
    </div>
    <pre id="trLog"></pre>
  </div>
  <div class="card">
    <h2>Summarize SSE</h2>
    <div class="row">
      <select id="smMode"><option value="rolling">rolling</option><option value="final">final</option></select>
      <button id="smStart">Start</button>
      <button id="smStop" disabled>Stop</button>
    </div>
    <div class="row">
      <input id="smText" placeholder="text to send" style="flex:1" />
      <button id="smSend" disabled>Send</button>
    </div>
    <pre id="smLog"></pre>
  </div>
  <div class="card">
    <h2>Chat (one-shot SSE)</h2>
    <div class="row">
      <input id="chatText" placeholder="message" style="flex:1" />
      <button id="chatSend">Send</button>
    </div>
    <pre id="chatLog"></pre>
  </div>

  <script>
    // Health
    document.getElementById('btnHealth').onclick = async () => {
      const out = document.getElementById('healthOut'); out.textContent = '...';
      try { const j = await getJSON('/api/health'); out.textContent = JSON.stringify(j, null, 2); }
      catch (e) { out.textContent = 'ERR: ' + e.message; }
    };

    // WS
    let ws;
    const wsLog = document.getElementById('wsLog');
    const wsStat = document.getElementById('wsStatus');
    const wsOpenBtn = document.getElementById('wsOpen');
    const wsCloseBtn = document.getElementById('wsClose');
    wsOpenBtn.onclick = () => {
      if (ws && ws.readyState === WebSocket.OPEN) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = proto + '//' + location.host + '/ws/transcribe';
      log(wsLog, 'connecting', url);
      ws = new WebSocket(url);
      ws.onopen = () => { log(wsLog, 'open'); wsStat.textContent='open'; wsCloseBtn.disabled=false; };
      ws.onclose = () => { log(wsLog, 'close'); wsStat.textContent='closed'; wsCloseBtn.disabled=true; };
      ws.onerror = (e) => { log(wsLog, 'error', e?.message||''); };
      ws.onmessage = (ev) => { log(wsLog, 'msg', typeof ev.data, ev.data); };
    };
    wsCloseBtn.onclick = () => { try{ ws && ws.close(); }catch{} };

    // Translate SSE
    let trId = null, trES = null;
    const trLog = document.getElementById('trLog');
    const trSendBtn = document.getElementById('trSend');
    const trStopBtn = document.getElementById('trStop');
    document.getElementById('trStart').onclick = async () => {
      trLog.textContent='';
      try {
        const lang = document.getElementById('trLang').value || 'en';
        const r = await getJSON('/api/translate/start', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({sessionId:'test', targetLang:lang})});
        trId = r.streamId; trES = new EventSource('/api/translate/stream?streamId='+encodeURIComponent(trId));
        trES.onmessage = (ev)=> log(trLog, 'data:', ev.data);
        trES.onerror = (e)=> log(trLog, 'error');
        trSendBtn.disabled = false; trStopBtn.disabled=false;
      } catch(e){ log(trLog, 'ERR', e.message); }
    };
    trStopBtn.onclick = async () => { try{ trES && trES.close(); }catch{} trSendBtn.disabled=true; trStopBtn.disabled=true; };
    trSendBtn.onclick = async () => {
      const txt = document.getElementById('trText').value; if(!trId||!txt) return;
      try{ await getJSON('/api/streams/'+trId+'/send', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text:txt})}); }
      catch(e){ log(trLog, 'ERR', e.message); }
    };

    // Summarize SSE
    let smId = null, smES = null;
    const smLog = document.getElementById('smLog');
    const smSendBtn = document.getElementById('smSend');
    const smStopBtn = document.getElementById('smStop');
    document.getElementById('smStart').onclick = async () => {
      smLog.textContent='';
      try {
        const mode = document.getElementById('smMode').value || 'rolling';
        const r = await getJSON('/api/summarize/start', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({sessionId:'test', mode:mode})});
        smId = r.streamId; smES = new EventSource('/api/summarize/stream?streamId='+encodeURIComponent(smId));
        smES.onmessage = (ev)=> log(smLog, 'data:', ev.data);
        smES.onerror = (e)=> log(smLog, 'error');
        smSendBtn.disabled = false; smStopBtn.disabled=false;
      } catch(e){ log(smLog, 'ERR', e.message); }
    };
    smStopBtn.onclick = async () => { try{ smES && smES.close(); }catch{} smSendBtn.disabled=true; smStopBtn.disabled=true; };
    smSendBtn.onclick = async () => {
      const txt = document.getElementById('smText').value; if(!smId||!txt) return;
      try{ await getJSON('/api/streams/'+smId+'/send', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({text:txt})}); }
      catch(e){ log(smLog, 'ERR', e.message); }
    };

    // Chat
    document.getElementById('chatSend').onclick = async () => {
      const el = document.getElementById('chatLog'); el.textContent='';
      const msg = document.getElementById('chatText').value; if(!msg) return;
      const r = await fetch('/api/chat', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({sessionId:'test', message: msg})});
      const reader = r.body.getReader(); const dec = new TextDecoder(); let buf='';
      while(true){ const {done, value} = await reader.read(); if(done) break; buf += dec.decode(value,{stream:true}); el.textContent = buf; }
    };
  </script>
</body>
</html>`
    c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(page))
}

