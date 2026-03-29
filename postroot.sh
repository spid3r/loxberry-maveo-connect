#!/bin/bash
# Runs as root AFTER postinstall/postupgrade. Args: $1 tmp $2 pluginname $3 plugin root $4 version $5 LBHOMEDIR $6 tmp full
# Ref: LoxBerry wiki — use $LBHOMEDIR from the environment; never hardcode the OS install path.
PLUGINNAME=maveoconnect

if [ -z "$LBHOMEDIR" ]; then
  echo "<WARN> Maveo Connect postroot: LBHOMEDIR unset; skipping config bootstrap"
  exit 0
fi

CONFIGDIR="$LBHOMEDIR/config/plugins/$PLUGINNAME"
if ! mkdir -p "$CONFIGDIR"; then
  echo "<WARN> Maveo Connect postroot: could not mkdir $CONFIGDIR"
  exit 0
fi

if [ ! -f "$CONFIGDIR/api_token.txt" ]; then
  if command -v openssl >/dev/null 2>&1; then
    if openssl rand -hex 32 >"$CONFIGDIR/api_token.txt" 2>/dev/null; then
      chmod 600 "$CONFIGDIR/api_token.txt" || true
      echo "<OK> Maveo Connect postroot: created api_token.txt"
    else
      echo "<WARN> Maveo Connect postroot: openssl rand failed; save Settings in the web UI to create a token"
    fi
  else
    echo "<WARN> Maveo Connect postroot: openssl missing; save Settings in the web UI to create api_token.txt"
  fi
fi

if [ -f "$CONFIGDIR/api_token.txt" ]; then
  chmod 600 "$CONFIGDIR/api_token.txt" || true
fi
if [ -f "$CONFIGDIR/settings.json" ]; then
  chmod 600 "$CONFIGDIR/settings.json" || true
fi

echo "<OK> Maveo Connect postroot finished."
exit 0
