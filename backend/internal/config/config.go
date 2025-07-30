package config

import (
	"fmt"
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

	return &config, nil
}