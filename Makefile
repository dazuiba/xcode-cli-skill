SKILL_SRC := $(CURDIR)/skills/xcode-cli
CLAUDE_SKILL_DIR := $(HOME)/.claude/skills/xcode-cli
CODEX_SKILL_DIR := $(HOME)/.codex/skills/xcode-cli

.PHONY: install

install:
	npm install -g .
	mkdir -p $(CLAUDE_SKILL_DIR) $(CODEX_SKILL_DIR)
	ln -sf $(SKILL_SRC)/SKILL.md $(CLAUDE_SKILL_DIR)/SKILL.md
	ln -sf $(SKILL_SRC)/SKILL.md $(CODEX_SKILL_DIR)/SKILL.md
	@echo "Installed xcode-cli and linked SKILL.md to Claude and Codex skill dirs."
