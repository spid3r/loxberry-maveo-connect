#!/bin/bash
# Runs AFTER postinstall/postupgrade as root. Args: $1 tmp $2 pluginname $3 plugin folder $4 version $5 LBHOMEDIR $6 staging path
#
# v1.1.0+ layout: LoxBerry already installed `daemon/daemon` as
#   $LBHOMEDIR/system/daemons/plugins/<NAME>
# Our job here is to make sure config dirs exist with the right perms (root can heal
# what loxberry user couldn't), then ask LoxBerry's installed init script to start the
# service. Reboot / next boot the standard LoxBerry init handles the daemon.

if [ -z "${LBHOMEDIR:-}" ]; then
  echo "<WARN> Maveo Connect postroot: LBHOMEDIR unset; skipping config bootstrap"
  exit 0
fi

PFOLDER="$(basename "${3:-maveoconnect}")"
CONFIGDIR="$LBHOMEDIR/config/plugins/$PFOLDER"
LOGDIR="$LBHOMEDIR/log/plugins/$PFOLDER"
INITSCRIPT="$LBHOMEDIR/system/daemons/plugins/$PFOLDER"

mkdir -p "$CONFIGDIR" "$LOGDIR" 2>/dev/null || true
chown -R loxberry:loxberry "$CONFIGDIR" "$LOGDIR" 2>/dev/null || true

# api_token.txt fallback (postinstall already tries; root context is the catch-all).
if [ ! -f "$CONFIGDIR/api_token.txt" ] && command -v openssl >/dev/null 2>&1; then
  if openssl rand -hex 32 >"$CONFIGDIR/api_token.txt" 2>/dev/null; then
    chown loxberry:loxberry "$CONFIGDIR/api_token.txt" 2>/dev/null || true
    chmod 0644 "$CONFIGDIR/api_token.txt" 2>/dev/null || true
    echo "<OK> Maveo Connect postroot: created api_token.txt"
  fi
fi
if [ -f "$CONFIGDIR/api_token.txt" ]; then
  chmod 0644 "$CONFIGDIR/api_token.txt" 2>/dev/null || true
fi
if [ -f "$CONFIGDIR/settings.json" ]; then
  chmod 0640 "$CONFIGDIR/settings.json" 2>/dev/null || true
  chown loxberry:loxberry "$CONFIGDIR/settings.json" 2>/dev/null || true
fi

# Sanity-check the bundled service before kicking the daemon — keeps the WebUI's error
# message (`bin/plugins/maveoconnect/service.mjs missing`) clear instead of just
# "Connection refused".
SERVICE_JS="$LBHOMEDIR/bin/plugins/$PFOLDER/service.mjs"
if [ ! -f "$SERVICE_JS" ]; then
  echo "<WARN> Maveo Connect postroot: missing $SERVICE_JS — daemon will not start. Reinstall the ZIP."
  exit 0
fi

if [ -x "$INITSCRIPT" ]; then
  echo "<INFO> Maveo Connect postroot: starting daemon via $INITSCRIPT restart"
  if bash "$INITSCRIPT" restart; then
    echo "<OK> Maveo Connect postroot: daemon restart OK"
  else
    echo "<WARN> Maveo Connect postroot: daemon restart returned non-zero (check $LOGDIR/daemon.shell.log + daemon.log)"
  fi
else
  # LoxBerry (very rare edge cases) hasn't yet copied the init script — defer.
  echo "<WARN> Maveo Connect postroot: $INITSCRIPT not yet executable; will be picked up on next boot"
fi

echo "<OK> Maveo Connect postroot finished."
exit 0
