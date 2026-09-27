#!/bin/bash
# macOS local-hotspot preparation. Never enables Internet Sharing or edits Wi-Fi.
set -euo pipefail
SERVICE='Plane Co-op Local'
ADDRESS='10.10.10.1'
NAT='/Library/Preferences/SystemConfiguration/com.apple.nat.plist'
MODE=${1:-status}
case "$MODE" in status|prepare|undo) ;; *) echo 'Usage: bash scripts/mac-hotspot.sh [status|prepare|undo]' >&2; exit 2;; esac
if [[ $(/usr/bin/uname -s) != Darwin ]]; then echo 'This helper is for macOS only.' >&2; exit 1; fi
has_service() { /usr/sbin/networksetup -listallnetworkservices | /usr/bin/sed 's/^\*//' | /usr/bin/grep -Fxq "$SERVICE"; }
sharing_enabled() {
  if [[ ! -e "$NAT" ]]; then return 1; fi
  local enabled
  enabled=$(/usr/libexec/PlistBuddy -c 'Print :NAT:Enabled' "$NAT") || { echo 'Cannot read Internet Sharing state. Stop and inspect System Settings.' >&2; exit 1; }
  [[ "$enabled" == 1 || "$enabled" == true ]]
}
restore_localhost() {
  # Tahoe's networksetup can replace 127.0.0.1 when configuring lo0.
  # Restore it on success AND failure, without removing other aliases.
  /sbin/ifconfig lo0 alias 127.0.0.1 netmask 255.0.0.0
}
if [[ "$MODE" == status ]]; then
  if sharing_enabled; then echo 'Internet Sharing: ON (turn it OFF before preparation or undo).'; else echo 'Internet Sharing: OFF'; fi
  if has_service; then
    if /usr/sbin/networksetup -listallnetworkservices | /usr/bin/grep -Fxq "*$SERVICE"; then echo "Plane Co-op Local: disabled"; else echo "Plane Co-op Local: enabled"; fi
    /usr/sbin/networksetup -getinfo "$SERVICE"
  else echo 'Plane Co-op Local service: absent'; fi
  /sbin/ifconfig lo0 | /usr/bin/grep 'inet '
  exit 0
fi
if (( EUID != 0 )); then echo "Administrator access required: sudo /bin/bash scripts/mac-hotspot.sh $MODE" >&2; exit 1; fi
if sharing_enabled; then echo 'First turn OFF Internet Sharing in System Settings > General > Sharing. This script will not change it for you.' >&2; exit 1; fi
if has_service; then
  # Refuse to touch an unrelated service that happens to have the same name.
  if ! /usr/sbin/networksetup -listnetworkserviceorder | /usr/bin/awk -v name="$SERVICE" 'index($0,") " name)==length($0)-length(name)-1 {getline; if ($0 ~ /Device: lo0\)/) found=1} END {exit !found}'; then
    echo 'Existing Plane Co-op Local is not on lo0; refusing to modify it.' >&2; exit 1
  fi
fi
trap restore_localhost EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if [[ "$MODE" == prepare ]]; then
  if ! has_service; then
    # Do not overwrite another loopback service's configuration.
    if /usr/sbin/networksetup -listnetworkserviceorder | /usr/bin/grep -q 'Device: lo0)'; then echo 'Another loopback service exists. Inspect it manually first.' >&2; exit 1; fi
    /usr/sbin/networksetup -createnetworkservice "$SERVICE" lo0
  fi
  /usr/sbin/networksetup -setmanual "$SERVICE" "$ADDRESS" 255.255.255.255
  /usr/sbin/networksetup -setnetworkserviceenabled "$SERVICE" on
  echo 'Prepared. Internet Sharing is still OFF; your Wi-Fi connection is unchanged.'
  echo 'Later: share Plane Co-op Local to Wi-Fi in System Settings > General > Sharing.'
  echo 'Turning sharing ON will disconnect this Mac from airport/home Wi-Fi.'
else
  if has_service; then
    /usr/sbin/networksetup -setv4off "$SERVICE"
    /usr/sbin/networksetup -setnetworkserviceenabled "$SERVICE" off
  fi
  if /sbin/ifconfig lo0 | /usr/bin/grep -q "inet $ADDRESS "; then /sbin/ifconfig lo0 -alias "$ADDRESS"; fi
  echo 'Temporary service disabled and its IPv4 address removed; localhost restored on exit.'
  echo 'A disabled Plane Co-op Local entry may remain. This is intentional: macOS may refuse removal of the only service on lo0.'
  echo 'Reconnect to airport/home Wi-Fi from the Wi-Fi menu if needed.'
fi
