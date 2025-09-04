package config

import (
    "fmt"
    "os"
    "github.com/spf13/viper"
)

type Config struct {
	Server ServerConfig `mapstructure:"server"`
	PCAS   PCASConfig   `mapstructure:"pcas"`
	User   UserConfig   `mapstructure:"user"`
}

type ServerConfig struct {
	Host string `mapstructure:"host"`
	Port string `mapstructure:"port"`
}

type PCASConfig struct {
    Address   string `mapstructure:"address"`
    EventType string `mapstructure:"eventType"`
    // Optional per-capability event types (fallback to defaults if empty)
    TranslateEventType string `mapstructure:"translateEventType"`
    SummarizeEventType string `mapstructure:"summarizeEventType"`
    ChatEventType      string `mapstructure:"chatEventType"`
    AdminToken         string `mapstructure:"adminToken"`
}

type UserConfig struct {
	ID string `mapstructure:"id"`
}

func LoadConfig(path string) (*Config, error) {
    viper.SetConfigFile(path)
    viper.SetConfigType("yaml")

	if err := viper.ReadInConfig(); err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

    var config Config
    if err := viper.Unmarshal(&config); err != nil {
        return nil, fmt.Errorf("failed to unmarshal config: %w", err)
    }

    // Apply sensible defaults for optional PCAS event types
    if config.PCAS.TranslateEventType == "" {
        config.PCAS.TranslateEventType = "capability.streaming.translate.v1"
    }
    if config.PCAS.SummarizeEventType == "" {
        config.PCAS.SummarizeEventType = "capability.streaming.summarize.v1"
    }
    if config.PCAS.ChatEventType == "" {
        config.PCAS.ChatEventType = "capability.streaming.chat.v1"
    }

    // Allow environment override for admin token
    if envTok := os.Getenv("PCAS_ADMIN_TOKEN"); envTok != "" {
        config.PCAS.AdminToken = envTok
    }

    return &config, nil
}
