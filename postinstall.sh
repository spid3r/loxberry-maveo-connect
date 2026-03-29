#!/bin/sh
# After install/update as user loxberry. Args: $1 tmp $2 pluginname $3 plugin root $4 version $5 LBHOMEDIR $6 tmp full
# LF line endings only. Plain log lines (no angle brackets).

echo "INFO: Maveo Connect postinstall start args=$*"

PLUGINDIR="${3:-}"
if [ -z "$PLUGINDIR" ]; then
  echo "ERROR: Maveo Connect postinstall empty arg3 plugin directory"
  exit 1
fi

if [ ! -d "$PLUGINDIR" ]; then
  echo "ERROR: Maveo Connect postinstall not a directory: $PLUGINDIR"
  exit 1
fi

if [ ! -d "$PLUGINDIR/daemon" ]; then
  echo "ERROR: Maveo Connect postinstall missing daemon dir under $PLUGINDIR"
  exit 1
fi

if [ ! -f "$PLUGINDIR/daemon/dist/service.mjs" ]; then
  echo "ERROR: Maveo Connect postinstall missing $PLUGINDIR/daemon/dist/service.mjs"
  exit 1
fi

echo "OK: Maveo Connect postinstall bundled daemon ok"
exit 0
