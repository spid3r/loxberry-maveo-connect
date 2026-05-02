#!/bin/bash
# Sichert Nutzerdaten vor dem Upgrade (LoxBerry überschreibt Plugin-Verzeichnisse).
# Gleiches Muster wie loxberry-api-abfall-io: gekoppelt mit postupgrade.sh.
# Args: $1 Staging-ID, $3 Plugin-FOLDER (FOLDER aus plugin.cfg), $5 LBHOMEDIR

ARGV1="$1"
ARGV3="$3"
ARGV5="$5"
PFOLDER="$(basename "${ARGV3%/}")"
if [ -z "$ARGV1" ] || [ -z "$ARGV3" ] || [ -z "$ARGV5" ]; then
  echo "<WARN> Maveo Connect preupgrade: fehlende Parameter; Backup übersprungen"
  exit 0
fi

STASH="/tmp/${ARGV1}_maveoconnect_upgrade"
rm -rf "$STASH"
mkdir -p "$STASH"

backup_kind() {
  local rel="$1"
  local src="${ARGV5}/${rel}/plugins/${PFOLDER}"
  if [ -d "$src" ]; then
    mkdir -p "${STASH}/${rel}"
    if cp -a "$src" "${STASH}/${rel}/" 2>/dev/null; then
      echo "<INFO> Maveo Connect preupgrade: gesichert ${rel}/plugins/${PFOLDER}"
    else
      echo "<WARN> Maveo Connect preupgrade: Backup fehlgeschlagen für ${rel}/plugins/${PFOLDER}"
    fi
  fi
}

backup_kind config
backup_kind log

exit 0
