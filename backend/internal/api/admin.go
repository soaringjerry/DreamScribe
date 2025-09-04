package api

import (
    "net/http"

    "github.com/gin-gonic/gin"
    "github.com/pcas/dreams-cli/backend/internal/pcas"
)

type addRuleReq struct {
    EventType      string `json:"event_type" binding:"required"`
    Provider       string `json:"provider" binding:"required"`
    PromptTemplate string `json:"prompt_template"`
    Name           string `json:"name"`
}

func (h *Handler) registerAdmin(router *gin.Engine) {
    router.POST("/api/admin/policy/add_rule", h.handleAdminAddRule)
}

func (h *Handler) handleAdminAddRule(c *gin.Context) {
    var req addRuleReq
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": gin.H{"message": "invalid request"}})
        return
    }
    gw, err := pcas.NewGateway(h.config.PCAS.Address)
    if err != nil {
        c.JSON(http.StatusBadGateway, gin.H{"error": gin.H{"message": err.Error()}})
        return
    }
    defer gw.Close()

    adminToken := h.config.PCAS.AdminToken
    if err := gw.publisher.PublishAdminPolicyAddRule(c.Request.Context(), adminToken, req.EventType, req.Provider, req.PromptTemplate, req.Name); err != nil {
        c.JSON(http.StatusBadGateway, gin.H{"error": gin.H{"message": err.Error()}})
        return
    }
    c.JSON(http.StatusOK, gin.H{"ok": true})
}

