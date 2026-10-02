# Used by Debian packaging (dh_auto_install passes DESTDIR). For a manual
# install use install.sh, which needs no build tools.
UUID := magic-mirror@zniszczynski.pl
PREFIX ?= /usr
EXTENSION_DIR := $(DESTDIR)$(PREFIX)/share/gnome-shell/extensions/$(UUID)

all:

check:
	gjs -m tests/displayConfig.test.js

install:
	./scripts/copy-files.sh "$(EXTENSION_DIR)"

uninstall:
	rm -rf "$(EXTENSION_DIR)"

.PHONY: all check install uninstall
