# Offline co-op on two MacBooks

## Read this before switching networks

**Hosting a Wi-Fi hotspot takes over the host Mac's Wi-Fi radio. The host will disconnect from airport/home Wi-Fi and this chat may stop.** The game does not need internet. Prepare everything first and switch the hotspot on yourself only when both players are ready.

We successfully created the local hotspot on this host running macOS Tahoe 26.6.2. The initial loopback setup replaced `127.0.0.1`; it was restored. The helper below explicitly restores localhost after preparation or undo, including when a command fails. These scripts do not enable Internet Sharing, alter the Wi-Fi password, disable the firewall, or modify unrelated network services.

## Host: prepare now, activate later

From the repository:

```sh
cd ~/dev/fluid-tower-defense
bash scripts/mac-hotspot.sh status
# Internet Sharing must be OFF first:
sudo /bin/bash scripts/mac-hotspot.sh prepare
```

Enter the administrator password in Terminal, never in chat. This creates/enables only `Plane Co-op Local` on `lo0`, with address `10.10.10.1/32`, and preserves the standard `127.0.0.1` loopback address. It leaves Internet Sharing OFF.

The game has already been built on this Mac. After code changes, run `npm run build` before going offline. No installation or download is required when starting the already-built game.

When ready to lose the host's internet connection:

1. Open **System Settings → General → Sharing → Internet Sharing → Configure/info**. Keep sharing OFF while configuring.
2. **Share your connection from:** `Plane Co-op Local`.
3. **To devices using:** select **Wi-Fi only**.
4. Open **Wi-Fi Options**. On our host, the existing name is **A Wing**, using its existing password and WPA2/WPA3 security. Keep that password or enter a new one yourself. Tell your partner the Wi-Fi name/password; they are not the game join code. The password is deliberately not stored in this repository.
5. Turn Internet Sharing ON and accept the macOS prompt. The host is now a local access point, not an airport Wi-Fi client. If a warning says the network has no internet, that is expected.
6. **Start/restart the game server after the hotspot is active**, so it discovers the new address:

   ```sh
   npm run play:lan
   ```

   If an old server is running in a terminal, stop it with Control-C first. If port 5173 is busy and you cannot find the old terminal, use `PORT=5174 npm run play:lan` and open `http://127.0.0.1:5174/`; this different port has separate browser saves. Do not kill every Node process.
7. Host opens **http://127.0.0.1:5173/** in Chrome (or a working WebGPU browser), clicks **HOST CO-OP**, and gives the complete displayed link to the partner. Use the actual port if changed. Keep this game visible and the host Mac awake.

The hotspot password controls joining Wi-Fi. The long code at the end of the game link controls joining the shared defense. Both are needed. The game is local HTTP, so use a trusted local network.

## Partner: no installation and no administrator setup

You do **not** need Node, Git, this repository, a hotspot script, or WebGPU to join as the partner.

1. Enable Wi-Fi on your Mac and join **A Wing** (or the host's chosen name).
2. Enter the host's Wi-Fi password. A “No Internet” indicator is normal. Stay on this network rather than switching back to airport Wi-Fi.
3. Open the **complete game join link from the host**, including its `#` room code, in your browser. Do not open `127.0.0.1` on the partner Mac: that means your own computer.
4. Wait for **Connected · shared defense** and a visible battlefield. Select a tower, then click the battlefield to place it. You share Metal and the base. You can start/pause waves, operate dam gates/floods, and slam crushers. The host handles upgrades, research, saves, and camera movement. The partner image updates about five times per second; it is not a full-rate second renderer.

If the page will not open, verify that both Macs are on the host's network, the server was restarted after switching networks, and you used the newly displayed join link. The host may need to allow Node's incoming connections when macOS asks. Do not disable the firewall. If the page opens but reports the host unavailable, the host must click HOST CO-OP and keep the game visible. A server restart changes the room code.

## Undo: return to ordinary Wi-Fi

1. On the host, click **STOP CO-OP** if sharing the game.
2. Turn **Internet Sharing OFF** in **System Settings → General → Sharing**. This is the step that releases the Wi-Fi radio.
3. Rejoin your airport/home Wi-Fi from the Wi-Fi menu. Complete its captive portal normally if prompted. The partner can rejoin their normal network too.
4. Optionally disable the temporary source service and remove its address:

   ```sh
   cd ~/dev/fluid-tower-defense
   sudo /bin/bash scripts/mac-hotspot.sh undo
   bash scripts/mac-hotspot.sh status
   ```

   This removes only `10.10.10.1` from `lo0`, disables only `Plane Co-op Local`, and preserves/restores `127.0.0.1`. The disabled service entry may remain because macOS refuses to remove the only network service on an interface. Do not delete system configuration plists or remove all loopback aliases to hide it. Running `prepare` again reuses it.
5. Stop the LAN game server with Control-C when finished, or restart with `npm run play` for localhost-only solo play.

Emergency localhost repair (only if `ifconfig lo0` no longer shows `127.0.0.1`):

```sh
sudo /sbin/ifconfig lo0 alias 127.0.0.1 netmask 255.0.0.0
```

No automatic network switcher or background task is installed by these helpers. Network settings persist until undone; check status after a reboot before relying on the hotspot.

## Verification

Run `npm run test:hotspot` for simulated macOS-command tests of setup, repeated setup/undo, localhost recovery on failure, refusal while sharing is active, and protection of unrelated services. These tests never modify real networking. `bash scripts/mac-hotspot.sh status` is a read-only check of this Mac.

## Instructions for agents

- Read `AGENTS.md` first. All normal repository/worktree rules still apply.
- Do not automatically activate Internet Sharing while relying on the user's internet connection. Prepare and verify first; let the user perform the final OFF→ON switch. Explain the resulting disconnection before they do it.
- Use `scripts/mac-hotspot.sh status` for inspection. `prepare` and `undo` need administrator execution by the user if the agent cannot authenticate. Never request an administrator or Wi-Fi password in chat.
- Never run broad third-party cleanup scripts, edit SystemConfiguration plists, remove unrelated network services/aliases, or disable the firewall to make this work.
- For recovery, check whether sharing is already OFF and internet/localhost already work before changing anything. Do not disconnect a working replacement connection merely to restore a particular SSID.
- The partner needs only the Wi-Fi password and full join URL. Do not install dependencies or run host setup on the partner's Mac.
- Restart the game server after the network changes, or its allowed addresses/join URLs may be stale. Stop only the identified game-server process, never all Node processes. Save state uses the browser origin; changing host or port can make saves appear missing.
- Distinguish verified local browser tests from a real two-device network test. Only the latter verifies the actual wireless link.

References: [Apple Internet Sharing](https://support.apple.com/guide/mac-help/mchlp1540/mac), [loopback-source workaround](https://gist.github.com/zhuhuilin/01656866b3e73a677a434c21183b40d2). We use a scoped helper rather than the gist's broad reset scripts.
