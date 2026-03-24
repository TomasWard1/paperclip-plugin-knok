# paperclip-plugin-knok

Push desktop notifications via [Knok](https://github.com/TomasWard1/knok) when [Paperclip](https://github.com/paperclipai/paperclip) inbox events occur.

## Features

- Subscribes to 8 Paperclip domain events (approvals, agent runs, issues, comments)
- Maps each event to the appropriate Knok urgency level (whisper/nudge/knock/break)
- Per-event enable/disable toggles and level overrides via Paperclip plugin config
- Action buttons on approval notifications for quick review
- Stats tracking (sent/failed counts, recent notification history)
- Settings UI panel and dashboard health widget
- Test notification button for verifying connectivity

## Event Mapping

| Paperclip Event | Default Level | Description |
|----------------|---------------|-------------|
| `approval.created` | nudge | New approval request (includes Review action) |
| `approval.decided` | whisper | Approval resolved |
| `agent.run.failed` | knock | Agent run failed (red alert) |
| `agent.run.finished` | whisper | Agent run completed |
| `agent.status_changed` | nudge | Agent status transition |
| `issue.created` | whisper | New issue created |
| `issue.updated` | whisper | Issue updated |
| `issue.comment.created` | nudge | New comment on issue |

## Install

### From local path

```bash
curl -X POST http://localhost:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName":"/path/to/paperclip-plugin-knok","isLocalPath":true}'
```

### From npm (once published)

```bash
curl -X POST http://localhost:3100/api/plugins/install \
  -H "Content-Type: application/json" \
  -d '{"packageName":"paperclip-plugin-knok"}'
```

## Configuration

After installing, configure via the Paperclip plugin settings UI:

| Field | Description |
|-------|-------------|
| **Knok Endpoint** | URL to your Knok HTTP server (e.g. `http://100.x.x.x:9999`) |
| **Knok Auth Token** | Secret reference for the Knok Bearer token |
| **Default Level** | Fallback urgency level (default: `nudge`) |
| **Event Toggles** | Enable/disable notifications per event type |
| **Level Overrides** | Override the default level for specific events |

## Development

```bash
pnpm install
pnpm typecheck      # type checking
pnpm test           # run tests
pnpm build          # production build
pnpm dev            # watch mode
pnpm dev:ui         # UI dev server with hot-reload
```

## Release

Push a version tag to trigger the release workflow:

```bash
pnpm version patch   # or minor/major
git push --follow-tags
```

This runs CI checks and publishes to npm automatically.

## License

MIT
