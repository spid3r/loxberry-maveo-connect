#!/bin/sh
# Plugin update only, user loxberry. LF only.

echo "INFO: Maveo Connect postupgrade start v${4:-?} args=$*"

PLUGINDIR="${3:-}"
if [ -z "$PLUGINDIR" ]; then
  echo "WARN: Maveo Connect postupgrade empty arg3"
  exit 0
fi

if [ ! -f "$PLUGINDIR/daemon/dist/service.mjs" ]; then
  echo "ERROR: Maveo Connect postupgrade missing $PLUGINDIR/daemon/dist/service.mjs"
  exit 1
fi

echo "OK: Maveo Connect postupgrade ok"
exit 0
