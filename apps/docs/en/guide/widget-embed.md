# Widget Embed Guide

::: tip Translation in progress
The full English translation of this page isn't ready yet. In the meantime,
here's a quick summary — for complete details (CSP directives, SPA notes,
platform-specific caveats, and the `at_l` tracking parameter), please see the
**[Korean version of this page](/guide/widget-embed)**.
:::

## Install snippet

```html
<script>
  window.AideTalk = { workspaceId: "ws_xxx" };
</script>
<script async src="https://{host}/widget.js"></script>
```

`{host}` is the public address of your self-hosted AideTalk server
(`SERVER_URL`). This snippet is MIT-licensed — copy it into your site and
modify it freely.

## What to check next

- **CSP**: if your site enforces a Content-Security-Policy, you'll need
  `script-src {host}` and `connect-src {host} wss://{host}`.
- **SPA routing**: the widget stays mounted across client-side route changes;
  it doesn't need to be re-embedded on navigation.
- **Platform-specific notes** (Cafe24, Imweb, and other Korean site builders):
  still being validated against real sites (tracked in the roadmap). See the
  Korean page for the current guidance and caveats.
- **`at_l` tracking parameter**: used to estimate conversation-attributed
  revenue by tracking link clicks. See the Korean page for the full
  explanation.

For anything beyond this summary, the
[Korean guide](/guide/widget-embed) is the source of truth until this page is
fully translated.
