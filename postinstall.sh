#!/bin/bash
# Runs as user `loxberry` AFTER LoxBerry copied bin/, daemon/, sudoers/ and others.
# Args: $1 tmp $2 pluginname $3 plugin folder $4 version $5 LBHOMEDIR $6 staging path
#
# v1.1.0+ layout: daemon is the LSB init script under $LBHOMEDIR/system/daemons/plugins/<NAME>;
# this script only seeds config/log directories and an api_token.txt for PHP↔Node auth.
# The daemon itself is started in postroot.sh (root) once everything is in place.

echo "<INFO> Maveo Connect postinstall start args=$*"

PLUGIN_FOLDER_NAME="$(basename "${3:-maveoconnect}")"
LBH="${LBHOMEDIR:-${5:-}}"
if [ -z "$LBH" ] || [ ! -d "$LBH/webfrontend" ]; then
  echo "<ERROR> Maveo Connect postinstall: LBHOMEDIR not usable (got '$LBH')"
  exit 1
fi

CONFIGDIR="$LBH/config/plugins/$PLUGIN_FOLDER_NAME"
LOGDIR="$LBH/log/plugins/$PLUGIN_FOLDER_NAME"

mkdir -p "$CONFIGDIR" "$LOGDIR" 2>/dev/null || true

# api_token.txt is the shared secret PHP UI uses for X-Maveo-Token to call the daemon.
# Also created in postroot.sh as a safety net (root context can always create it),
# but creating here keeps the file owned by `loxberry` so the WebUI can rotate it.
if [ ! -f "$CONFIGDIR/api_token.txt" ]; then
  if command -v openssl >/dev/null 2>&1; then
    if openssl rand -hex 32 >"$CONFIGDIR/api_token.txt" 2>/dev/null; then
      chmod 0644 "$CONFIGDIR/api_token.txt" 2>/dev/null || true
      echo "<INFO> Maveo Connect postinstall created api_token.txt"
    fi
  fi
fi
if [ -f "$CONFIGDIR/api_token.txt" ]; then
  chmod 0644 "$CONFIGDIR/api_token.txt" 2>/dev/null || true
fi

# settings.json (if it survived an upgrade) must stay readable by Node + writable by PHP.
if [ -f "$CONFIGDIR/settings.json" ]; then
  chmod 0640 "$CONFIGDIR/settings.json" 2>/dev/null || true
fi

echo "<OK> Maveo Connect postinstall done; daemon start handled by postroot.sh"
exit 0
