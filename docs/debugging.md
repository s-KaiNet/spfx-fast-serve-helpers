# Debugging the web part in VS Code

`fast-serve` serves your source files with inline source maps. Every module is loaded from `https://localhost:4321/<path in the project>` (for example `https://localhost:4321/src/webparts/hello/components/Hello.tsx`), and its source map points to that same URL with the original TypeScript inside. So the browser's DevTools show your `.tsx` files, and VS Code only needs to know that `https://localhost:4321/` is the project folder.

## launch.json

1. Start `npm run serve` (VS Code doesn't start it for you).
2. Add `.vscode/launch.json` and replace the page URL and, if you changed it, the port:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "fast-serve: Edge",
      "type": "msedge",
      "request": "launch",
      "url": "https://contoso.sharepoint.com/sites/dev/SitePages/test.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true",
      "webRoot": "${workspaceFolder}",
      "pathMapping": { "https://localhost:4321/": "${workspaceFolder}/" },
      "sourceMapPathOverrides": { "https://localhost:4321/*": "${workspaceFolder}/*" },
      "outFiles": []
    },
    {
      "name": "fast-serve: Chrome",
      "type": "chrome",
      "request": "launch",
      "url": "https://contoso.sharepoint.com/sites/dev/SitePages/test.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true",
      "webRoot": "${workspaceFolder}",
      "pathMapping": { "https://localhost:4321/": "${workspaceFolder}/" },
      "sourceMapPathOverrides": { "https://localhost:4321/*": "${workspaceFolder}/*" },
      "outFiles": []
    }
  ]
}
```

3. Press F5, sign in to SharePoint in the browser window VS Code opened (the first time only: VS Code keeps a separate browser profile), click **Load debug scripts**, and allow local network access if the browser asks.
4. Set breakpoints in `src/**/*.ts(x)`. They bind when the module loads; reload the page to hit code that already ran (`render`, `onInit`).

Notes:

- The URL is the one `fast-serve` prints (`open: ...`). It must contain the debug query, otherwise SharePoint doesn't load your code.
- `chrome` / `msedge` are the current debugger types. Older configurations use `pwa-chrome` / `pwa-msedge`: they're the same debugger and work with the same settings.
- `pathMapping` and `sourceMapPathOverrides` map the dev server URLs to your files. They aren't needed when you only debug in the browser's DevTools.
- `"outFiles": []` stops VS Code from scanning `lib/`, `dist/` and `temp/` for heft's webpack source maps before it starts: `fast-serve` doesn't load those files.
- Old `webpack:///...` entries in `sourceMapPathOverrides` (from the SPFx template or the classic spfx-fast-serve) aren't used by `fast-serve`; keep them only if you still debug `heft start` with the same configuration.

## Attach to a running browser

To debug a browser you already use, start it with a debugging port, open the debug page there, and attach:

```sh
msedge --remote-debugging-port=9222
```

```json
{
  "name": "fast-serve: attach",
  "type": "msedge",
  "request": "attach",
  "port": 9222,
  "urlFilter": "https://contoso.sharepoint.com/*",
  "webRoot": "${workspaceFolder}",
  "pathMapping": { "https://localhost:4321/": "${workspaceFolder}/" },
  "sourceMapPathOverrides": { "https://localhost:4321/*": "${workspaceFolder}/*" },
  "outFiles": []
}
```

## Browser DevTools

Without VS Code: open DevTools on the SharePoint page, press Ctrl+P (Cmd+P) and type the file name (`HelloWorld.tsx`). Files are listed under `localhost:4321/src/...`.
