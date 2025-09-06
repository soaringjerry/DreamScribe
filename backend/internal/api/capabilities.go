package api

import (
    "context"
    "encoding/json"
    "log"
    "net/http"
    "sync"
    "time"

    "github.com/gin-gonic/gin"
    "github.com/google/uuid"
    "github.com/pcas/dreams-cli/backend/internal/config"
    "github.com/pcas/dreams-cli/backend/internal/pcas"
)

// sessionManager manages in-memory generic streams bridged to PCAS
type sessionManager struct {
    mu       sync.RWMutex
    sessions map[string]*session
}

type session struct {
    id      string
    in      chan []byte
    out     chan []byte
    cancel  context.CancelFunc
    created time.Time
}

func newSessionManager() *sessionManager {
    return &sessionManager{sessions: make(map[string]*session)}
}

func (m *sessionManager) create(id string, s *session) {
    m.mu.Lock(); defer m.mu.Unlock()
    m.sessions[id] = s
}

func (m *sessionManager) get(id string) (*session, bool) {
    m.mu.RLock(); defer m.mu.RUnlock()
    s, ok := m.sessions[id]
    return s, ok
}

func (m *sessionManager) delete(id string) {
    m.mu.Lock(); defer m.mu.Unlock()
    delete(m.sessions, id)
}

// capabilityHandler wires HTTP routes to PCAS streams via sessionManager
type capabilityHandler struct {
    cfg   *config.Config
    sm    *sessionManager
}

func newCapabilityHandler(cfg *config.Config) *capabilityHandler {
    return &capabilityHandler{cfg: cfg, sm: newSessionManager()}
}

func (h *Handler) registerCapabilities(router *gin.Engine) {
    ch := newCapabilityHandler(h.config)

    router.POST("/api/translate/start", ch.startTranslate)
    router.GET("/api/translate/stream", ch.streamSSE)
    router.POST("/api/translate/run", ch.runTranslate)

    router.POST("/api/summarize/start", ch.startSummarize)
    router.GET("/api/summarize/stream", ch.streamSSE)
    router.POST("/api/summarize/run", ch.runSummarize)

    router.POST("/api/streams/:id/send", ch.sendToStream)
    router.POST("/api/streams/:id/commit", ch.commitStream)
    router.DELETE("/api/streams/:id", ch.closeStream)

    // Chat: one-shot stream, stream response in this request via SSE
    router.POST("/api/chat", ch.chatOnce)
}

type startReq struct {
    SessionID string            `json:"sessionId"`
    TargetLang string           `json:"targetLang"` // translate
    Mode      string            `json:"mode"`       // summarize: rolling|final
    Attrs     map[string]string `json:"attrs"`
}

type startResp struct {
    StreamID string `json:"streamId"`
}

type runReq struct {
    SessionID string            `json:"sessionId"`
    Text      string            `json:"text"`
    TargetLang string           `json:"targetLang"`
    Mode      string            `json:"mode"`
    Attrs     map[string]string `json:"attrs"`
}

func (ch *capabilityHandler) startTranslate(c *gin.Context) {
    var req startReq
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "invalid request"}})
        return
    }
    attrs := map[string]string{}
    if req.TargetLang != "" { attrs["target_lang"] = req.TargetLang }
    for k, v := range req.Attrs { attrs[k] = v }
    // Provide sensible defaults so testers don't have to hand-write attrs JSON
    if _, ok := attrs["system"]; !ok {
        attrs["system"] = "You are a translator. Translate all user input to English."
    }
    if _, ok := attrs["model"]; !ok {
        attrs["model"] = "gpt-5-mini"
    }
    ch.startGeneric(c, ch.cfg.PCAS.TranslateEventType, attrs)
}

func (ch *capabilityHandler) startSummarize(c *gin.Context) {
    var req startReq
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "invalid request"}})
        return
    }
    attrs := map[string]string{}
    if req.Mode != "" { attrs["mode"] = req.Mode }
    for k, v := range req.Attrs { attrs[k] = v }
    if _, ok := attrs["system"]; !ok {
        attrs["system"] = "Summarize the user input in 3 concise bullet points."
    }
    if _, ok := attrs["model"]; !ok {
        attrs["model"] = "gpt-5-mini"
    }
    ch.startGeneric(c, ch.cfg.PCAS.SummarizeEventType, attrs)
}

func (ch *capabilityHandler) startGeneric(c *gin.Context, eventType string, attrs map[string]string) {
    id := uuid.New().String()
    in := make(chan []byte, 16)
    out := make(chan []byte, 16)
    // Use a background context so the stream outlives this HTTP request.
    // The lifecycle is controlled by commit/close.
    ctx, cancel := context.WithCancel(context.Background())

    // bridge to PCAS in background
    go func() {
        gw, err := pcas.NewGateway(ch.cfg.PCAS.Address)
        if err != nil {
            log.Printf("gateway error: %v", err)
            close(out)
            return
        }
        defer gw.Close()
        log.Printf("[stream-start] id=%s eventType=%s attrs=%v", id, eventType, attrs)
        if err := gw.StartGenericStream(ctx, eventType, attrs, in, out); err != nil {
            log.Printf("pcas stream error: %v", err)
        }
    }()

    ch.sm.create(id, &session{id: id, in: in, out: out, cancel: cancel, created: time.Now()})
    c.JSON(http.StatusOK, &startResp{StreamID: id})
}

// SSE stream for either translate or summarize
func (ch *capabilityHandler) streamSSE(c *gin.Context) {
    id := c.Query("streamId")
    s, ok := ch.sm.get(id)
    if !ok {
        c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "stream not found"}})
        return
    }
    w := c.Writer
    c.Header("Content-Type", "text/event-stream")
    c.Header("Cache-Control", "no-cache")
    c.Header("Connection", "keep-alive")
    c.Header("X-Accel-Buffering", "no")

    // Initial comment to open stream
    _, _ = w.Write([]byte(":ok\n\n"))
    w.Flush()

    notify := c.Request.Context().Done()
    for {
        select {
        case b, ok := <-s.out:
            if !ok {
                return
            }
            payload, _ := json.Marshal(gin.H{"text": string(b)})
            _, _ = w.Write([]byte("data: "))
            _, _ = w.Write(payload)
            _, _ = w.Write([]byte("\n\n"))
            w.Flush()
        case <-notify:
            return
        }
    }
}

type sendReq struct {
    Text string `json:"text"`
}

func (ch *capabilityHandler) sendToStream(c *gin.Context) {
    id := c.Param("id")
    s, ok := ch.sm.get(id)
    if !ok {
        c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "stream not found"}})
        return
    }
    var req sendReq
    if err := c.ShouldBindJSON(&req); err != nil || req.Text == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "invalid text"}})
        return
    }
    if len(req.Text) > 0 {
        clip := req.Text
        if len(clip) > 120 { clip = clip[:120] + "..." }
        log.Printf("[stream-send] id=%s bytes=%d preview=%q", id, len(req.Text), clip)
    }
    // Guard against sending after commit (channel closed)
    defer func() {
        if r := recover(); r != nil {
            c.JSON(http.StatusConflict, gin.H{"error": gin.H{"message": "stream already committed/closed"}})
        }
    }()
    s.in <- []byte(req.Text)
    c.JSON(http.StatusOK, gin.H{"ok": true})
}

// commitStream: close input channel to signal ClientEnd but keep stream alive to receive results
func (ch *capabilityHandler) commitStream(c *gin.Context) {
    id := c.Param("id")
    s, ok := ch.sm.get(id)
    if !ok {
        c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "stream not found"}})
        return
    }
    // idempotent close
    defer func() { recover() }()
    close(s.in)
    log.Printf("[stream-commit] id=%s", id)
    c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (ch *capabilityHandler) closeStream(c *gin.Context) {
    id := c.Param("id")
    s, ok := ch.sm.get(id)
    if !ok {
        c.JSON(http.StatusNotFound, gin.H{"error": gin.H{"message": "stream not found"}})
        return
    }
    s.cancel()
    close(s.in)
    ch.sm.delete(id)
    c.JSON(http.StatusOK, gin.H{"ok": true})
}

// Chat: one-shot request that streams AI response over SSE in the same HTTP response
type chatReq struct {
    SessionID string            `json:"sessionId"`
    Message   string            `json:"message"`
    Refs      []map[string]any  `json:"refs"`
    Attrs     map[string]string `json:"attrs"`
}

func (ch *capabilityHandler) chatOnce(c *gin.Context) {
    var req chatReq
    if err := c.ShouldBindJSON(&req); err != nil || req.Message == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "invalid request"}})
        return
    }

    w := c.Writer
    c.Header("Content-Type", "text/event-stream")
    c.Header("Cache-Control", "no-cache")
    c.Header("Connection", "keep-alive")
    c.Header("X-Accel-Buffering", "no")

    _, _ = w.Write([]byte(":ok\n\n"))
    w.Flush()

    in := make(chan []byte, 4)
    out := make(chan []byte, 16)
    ctx, cancel := context.WithCancel(c.Request.Context())
    defer cancel()

    go func() {
        gw, err := pcas.NewGateway(ch.cfg.PCAS.Address)
        if err != nil {
            log.Printf("gateway error: %v", err)
            close(out)
            return
        }
        defer gw.Close()
        attrs := map[string]string{"session_id": req.SessionID}
        for k, v := range req.Attrs { attrs[k] = v }
        if _, ok := attrs["system"]; !ok {
            attrs["system"] = "You are a helpful assistant."
        }
        if _, ok := attrs["model"]; !ok {
            attrs["model"] = "gpt-5"
        }
        if err := gw.StartGenericStream(ctx, ch.cfg.PCAS.ChatEventType, attrs, in, out); err != nil {
            log.Printf("pcas chat error: %v", err)
        }
    }()

    // send raw message bytes then close input (provider aggregates raw prompt and starts after ClientEnd)
    log.Printf("[chat] session=%s bytes=%d", req.SessionID, len(req.Message))
    in <- []byte(req.Message)
    close(in)

    notify := c.Request.Context().Done()
    for {
        select {
        case b, ok := <-out:
            if !ok { return }
            payload, _ := json.Marshal(gin.H{"text": string(b)})
            _, _ = w.Write([]byte("data: "))
            _, _ = w.Write(payload)
            _, _ = w.Write([]byte("\n\n"))
            w.Flush()
        case <-notify:
            return
        }
    }
}

// runTranslate: one-shot SSE; BFF sends text then ClientEnd automatically
func (ch *capabilityHandler) runTranslate(c *gin.Context) {
    var req runReq
    if err := c.ShouldBindJSON(&req); err != nil || req.Text == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "invalid request"}})
        return
    }

    w := c.Writer
    c.Header("Content-Type", "text/event-stream")
    c.Header("Cache-Control", "no-cache")
    c.Header("Connection", "keep-alive")
    c.Header("X-Accel-Buffering", "no")
    _, _ = w.Write([]byte(":ok\n\n"))
    w.Flush()

    in := make(chan []byte, 4)
    out := make(chan []byte, 16)
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    go func() {
        gw, err := pcas.NewGateway(ch.cfg.PCAS.Address)
        if err != nil { log.Printf("gateway error: %v", err); close(out); return }
        defer gw.Close()
        attrs := map[string]string{}
        if req.TargetLang != "" { attrs["target_lang"] = req.TargetLang }
        for k, v := range req.Attrs { attrs[k] = v }
        if _, ok := attrs["system"]; !ok { attrs["system"] = "You are a translator. Translate all user input to English." }
        if _, ok := attrs["model"]; !ok { attrs["model"] = "gpt-5-mini" }
        if err := gw.StartGenericStream(ctx, ch.cfg.PCAS.TranslateEventType, attrs, in, out); err != nil { log.Printf("pcas translate error: %v", err) }
    }()

    // send input once then commit
    in <- []byte(req.Text)
    close(in)

    notify := c.Request.Context().Done()
    for {
        select {
        case b, ok := <-out:
            if !ok { return }
            payload, _ := json.Marshal(gin.H{"text": string(b)})
            _, _ = w.Write([]byte("data: "))
            _, _ = w.Write(payload)
            _, _ = w.Write([]byte("\n\n"))
            w.Flush()
        case <-notify:
            return
        }
    }
}

// runSummarize: one-shot SSE; BFF sends text then ClientEnd automatically
func (ch *capabilityHandler) runSummarize(c *gin.Context) {
    var req runReq
    if err := c.ShouldBindJSON(&req); err != nil || req.Text == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "invalid request"}})
        return
    }

    w := c.Writer
    c.Header("Content-Type", "text/event-stream")
    c.Header("Cache-Control", "no-cache")
    c.Header("Connection", "keep-alive")
    c.Header("X-Accel-Buffering", "no")
    _, _ = w.Write([]byte(":ok\n\n"))
    w.Flush()

    in := make(chan []byte, 4)
    out := make(chan []byte, 16)
    ctx, cancel := context.WithCancel(context.Background())
    defer cancel()

    go func() {
        gw, err := pcas.NewGateway(ch.cfg.PCAS.Address)
        if err != nil { log.Printf("gateway error: %v", err); close(out); return }
        defer gw.Close()
        attrs := map[string]string{}
        if req.Mode != "" { attrs["mode"] = req.Mode }
        for k, v := range req.Attrs { attrs[k] = v }
        if _, ok := attrs["system"]; !ok { attrs["system"] = "Summarize the user input in 3 concise bullet points." }
        if _, ok := attrs["model"]; !ok { attrs["model"] = "gpt-5-mini" }
        if err := gw.StartGenericStream(ctx, ch.cfg.PCAS.SummarizeEventType, attrs, in, out); err != nil { log.Printf("pcas summarize error: %v", err) }
    }()

    in <- []byte(req.Text)
    close(in)

    notify := c.Request.Context().Done()
    for {
        select {
        case b, ok := <-out:
            if !ok { return }
            payload, _ := json.Marshal(gin.H{"text": string(b)})
            _, _ = w.Write([]byte("data: "))
            _, _ = w.Write(payload)
            _, _ = w.Write([]byte("\n\n"))
            w.Flush()
        case <-notify:
            return
        }
    }
}
