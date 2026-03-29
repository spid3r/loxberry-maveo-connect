#!/bin/bash
### LoxBerry plugin daemon — Maveo Connect (Node service)
PLUGINNAME=maveoconnect

# Prefer env from LoxBerry; else derive from this script (…/plugins/<name>/daemon.sh → LB root = four levels up).
if [ -z "$LBHOMEDIR" ]; then
  _here=$(cd "$(dirname "$0")" && pwd)
  export LBHOMEDIR=$(cd "$_here/../../../.." && pwd)
fi

if [ -f "$LBHOMEDIR/libs/bashlib/loxberry.sh" ]; then
  # shellcheck source=/dev/null
  . "$LBHOMEDIR/libs/bashlib/loxberry.sh"
fi

LBPPLUGINDIR="${LBPPLUGINDIR:-$LBHOMEDIR/webfrontend/htmlauth/plugins/$PLUGINNAME}"
CONFIGDIR="$LBHOMEDIR/config/plugins/$PLUGINNAME"
LOGDIR="$LBHOMEDIR/log/plugins/$PLUGINNAME"
PIDFILE="/var/run/${PLUGINNAME}_node.pid"
DAEMON_DIR="$LBPPLUGINDIR/daemon"
NODE_BIN="${NODE_BIN:-/usr/bin/node}"

mkdir -p "$CONFIGDIR" "$LOGDIR"

export MAVOECONNECT_CONFIG="$CONFIGDIR/settings.json"
export MAVOECONNECT_LOGDIR="$LOGDIR"
export MAVOECONNECT_SECRET="$CONFIGDIR/api_token.txt"
export MAVOECONNECT_PLUGIN_DIR="$LBPPLUGINDIR"

service_start() {
  if [ -f "$PIDFILE" ]; then
    local oldpid
    oldpid=$(cat "$PIDFILE" 2>/dev/null || true)
    if [ -n "$oldpid" ] && kill -0 "$oldpid" 2>/dev/null; then
      echo "Maveo Connect daemon already running (pid $oldpid)"
      return 0
    fi
    rm -f "$PIDFILE"
  fi
  if [ ! -f "$DAEMON_DIR/dist/service.mjs" ]; then
    echo "Maveo Connect: missing $DAEMON_DIR/dist/service.mjs — rebuild plugin ZIP (bundled daemon)"
    return 1
  fi
  echo "$(date -Iseconds) Maveo Connect LOGSTART" >>"$LOGDIR/daemon.log"
  cd "$DAEMON_DIR" || return 1
  # Application log: Node writes leveled lines to daemon.log; keep shell quiet.
  nohup "$NODE_BIN" dist/service.mjs >/dev/null 2>&1 &
  echo $! >"$PIDFILE"
  echo "Maveo Connect daemon started pid $(cat "$PIDFILE")"
}

service_stop() {
  if [ ! -f "$PIDFILE" ]; then
    echo "Maveo Connect daemon not running (no pidfile)"
    return 0
  fi
  local pid
  pid=$(cat "$PIDFILE" 2>/dev/null || true)
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$PIDFILE"
  echo "$(date -Iseconds) Maveo Connect LOGEND" >>"$LOGDIR/daemon.log"
  echo "Maveo Connect daemon stopped"
}

case "$1" in
start) service_start ;;
stop) service_stop ;;
restart)
  service_stop
  sleep 1
  service_start
  ;;
status)
  if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "running pid $(cat "$PIDFILE")"
  else
    echo "stopped"
  fi
  ;;
*)
  echo "Usage: $0 {start|stop|restart|status}"
  exit 1
  ;;
esac
exit 0
