package distiller

import (
	"strings"
	"sync"
)

type Distiller struct {
	buffer strings.Builder
	mu     sync.Mutex
}

func NewDistiller() *Distiller {
	return &Distiller{}
}

func (d *Distiller) Process(text string) string {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.buffer.WriteString(text)
	content := d.buffer.String()

	runes := []rune(content)
	for i := len(runes) - 1; i >= 0; i-- {
		if runes[i] == '。' || runes[i] == '？' || runes[i] == '！' {
			sentenceRunes := runes[:i+1]
			sentence := string(sentenceRunes)
			d.buffer.Reset()
			if i+1 < len(runes) {
				d.buffer.WriteString(string(runes[i+1:]))
			}
			return sentence
		}
	}

	return ""
}