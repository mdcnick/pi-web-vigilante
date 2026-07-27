# PI WEB Telegram Gateway

A private, allowlisted bridge from Telegram chats to isolated PI WEB sessions.
It uses Telegram long polling, so PI WEB can remain on localhost or Tailscale and
needs no public webhook.

The package contains:

- `pi-web-plugin.js`: setup and launch panel.
- `gateway.mjs`: dependency-free Node.js gateway.
- `setup.mjs`: interactive BotFather/configuration wizard.

## Security model

- Deny unknown Telegram users by default.
- Keep one PI WEB session per Telegram user/chat.
- Prefer `TELEGRAM_BOT_TOKEN`; never commit the token.
- Keep PI WEB private on localhost or Tailscale.
- Restrict `/setcwd` to configured admins and assigned workspace paths.

## Install locally

PI WEB discovers local plugins in `$PI_WEB_DATA_DIR/plugins` when that variable
is configured, otherwise `~/.pi-web/plugins`.

```bash
export PI_WEB_DATA_DIR="${PI_WEB_DATA_DIR:-$HOME/.pi-web}"
mkdir -p "$PI_WEB_DATA_DIR/plugins"
ln -s /path/to/pi-web-plugins/telegram-gateway \
  "$PI_WEB_DATA_DIR/plugins/telegram-gateway"
```

Reload the browser and open the **Telegram** workspace tab.

## Setup

Run the wizard from the installed plugin directory:

```bash
node "$PI_WEB_DATA_DIR/plugins/telegram-gateway/setup.mjs"
```

It verifies the bot token, detects your Telegram user ID after `/start`, writes
configuration with mode `0600`, and can install the plugin symlink.

For manual setup, copy `config.example.json` to:

```text
$PI_WEB_DATA_DIR/telegram-gateway/config.json
```

Set the PI WEB URL, machine ID, default workspace, allowlisted Telegram IDs, and
optional per-user workspace routes. Start the bridge with:

```bash
TELEGRAM_BOT_TOKEN='123:abc' node \
  "$PI_WEB_DATA_DIR/plugins/telegram-gateway/gateway.mjs" \
  --config "$PI_WEB_DATA_DIR/telegram-gateway/config.json"
```

## Telegram commands

- `/start`, `/help`: show usage.
- `/status`: show mapped workspace and session.
- `/new`: create a fresh isolated session.
- `/setcwd /absolute/path`: admin-only workspace routing.

## Service notes

For a durable service, place the real token in a protected environment file,
point `ExecStart` at `gateway.mjs`, and restart on failure. Do not put the token
directly in a committed unit file. The gateway itself opens no listening port.
