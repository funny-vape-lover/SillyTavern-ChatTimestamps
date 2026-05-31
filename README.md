# SillyTavern Chat Timestamps

Small SillyTavern extension that can temporarily add source timestamps to normal chat prompts sent to the model.

It does not edit saved chat messages. When enabled, matching in-context chat messages are sent to the model like:

```text
[Timestamp: May 31, 2026 2:10 PM]
User: message text
```

## Settings

- `Send timestamps to model`: enables or disables prompt timestamp injection.
- `Prevent timestamp headers in replies`: tells the model that timestamp lines are metadata and should not be copied into its response.
- `Timestamp newest message`: also timestamps the newest chat message. Leave this off if the model starts copying timestamp headers into replies.
- `Recent messages to timestamp`: timestamps only this many newest in-context messages. Use `0` for every in-context message.
