#!/bin/bash
# Runs as user `loxberry` after upgrade (paired with preupgrade.sh). Args:
#   $1 tmp $2 pluginname $3 plugin folder $4 version $5 LBHOMEDIR $6 staging path
#
# v1.1.0+ layout: We just restore user data from the preupgrade stash and refresh
# api_token.txt / settings.json perms. The daemon restart happens in postroot.sh
# (root context) once everything is in place.

echo "<INFO> Maveo Connect postupgrade start v${4:-?} args=$*"

ARGV1="${1:-}"
ARGV3="${3:-}"
ARGV5="${5:-${LBHOMEDIR:-}}"
PFOLDER="$(basename "${ARGV3%/}")"

LBH=""
if [ -n "${LBHOMEDIR:-}" ] && [ -d "${LBHOMEDIR}/webfrontend" ]; then
  LBH="$LBHOMEDIR"
fi
if [ -z "$LBH" ] && [ -n "$ARGV5" ] && [ -d "${ARGV5}/webfrontend" ]; then
  LBH="$ARGV5"
fi

if [ -z "$LBH" ]; then
  echo "<WARN> Maveo Connect postupgrade: LBHOMEDIR unresolvable; skipping restore"
  exit 0
fi

# Restore stashed user data.
if [ -n "$ARGV1" ]; then
  STASH="/tmp/${ARGV1}_maveoconnect_upgrade"
  restore_kind() {
    local rel="$1"
    local src="${STASH}/${rel}/${PFOLDER}"
    local dest="${LBH}/${rel}/plugins/${PFOLDER}"
    if [ -d "$src" ]; then
      mkdir -p "$dest"
      if cp -a "${src}/." "${dest}/" 2>/dev/null; then
        echo "<INFO> Maveo Connect postupgrade: restored ${rel}/plugins/${PFOLDER}"
      else
        echo "<WARN> Maveo Connect postupgrade: restore failed for ${rel}/plugins/${PFOLDER}"
      fi
    fi
  }
  if [ -d "$STASH" ]; then
    restore_kind config
    restore_kind log
    rm -rf "$STASH"
  fi
fi

CONFIGDIR="$LBH/config/plugins/$PFOLDER"
mkdir -p "$CONFIGDIR" 2>/dev/null || true

if [ ! -f "$CONFIGDIR/api_token.txt" ] && command -v openssl >/dev/null 2>&1; then
  if openssl rand -hex 32 >"$CONFIGDIR/api_token.txt" 2>/dev/null; then
    chmod 0644 "$CONFIGDIR/api_token.txt" 2>/dev/null || true
    echo "<INFO> Maveo Connect postupgrade created api_token.txt"
  fi
fi
if [ -f "$CONFIGDIR/api_token.txt" ]; then
  chmod 0644 "$CONFIGDIR/api_token.txt" 2>/dev/null || true
fi
if [ -f "$CONFIGDIR/settings.json" ]; then
  chmod 0640 "$CONFIGDIR/settings.json" 2>/dev/null || true
fi

# Drop legacy v1.0.x pidfile so a stale `/var/run/maveoconnect_node.pid` doesn't fool
# the new init script during the first start after upgrade.
rm -f "/var/run/${PFOLDER}_node.pid" 2>/dev/null || true

echo "<OK> Maveo Connect postupgrade ok; daemon restart in postroot.sh"
exit 0
