---
title: Copilot components
type: feature
status: current
tags:
  - project-kb
  - copilot-components
  - manifests
---

# Copilot components

## Summary

SPFx 1.24 Copilot components (`componentType: "CopilotComponent"`) are built as ordinary bundles and listed in the debug `manifests.js` with heft's shape, including each tool's `propertiesSchema` evaluated to a JSON schema. They are tested in the tenant's Copilot Workbench with fast-serve's debug query; React views Fast Refresh inside the turn's iframe.

## Current Knowledge

### What heft does

- `heft start` builds a Copilot component bundle like any other and writes one debug manifest entry: the source manifest without `$schema`, `"version": "*"` replaced by the package version, `copilotType`, `capabilities`, `tools` kept, plus `loaderConfig`. Localized resources and libraries are listed like for web parts (`@microsoft/sp-copilot-component` is an SPFx library).
- The only Copilot-specific manifest step resolves each tool's `propertiesSchema` written as `{ "id": "$<path>:<export>;" }`: the path is relative to the manifest file and points into `lib/` (the TypeScript output); heft `require`s that compiled module in its own Node process and inlines the export (`toJSON()` honoured, objects as they are, primitives wrapped as `{ value }`). A failure is a warning plus a compile error and the reference stays.
- `heft start` also runs the Copilot agent step, which writes the Teams/Copilot app package to `teams/`; it is a deployment artifact, not served.
- The generator (`--component-type copilotComponent`) writes a separate bundle per component, a `zod` schema module exported as JSON schema, loc strings and a `copilot/` folder for the declarative agent.

### What fast-serve does

- Same bundle path as web parts: entry, externals, loc, styles, HMR. The manifest entry equals heft's apart from the generic differences of all components (React and localized resources are bundled, `@microsoft/sp-loader` is listed).
- `propertiesSchema` references are resolved without a `lib/` build: the `lib/…js` path maps to its source under `src/` (or an existing file outside `lib/`), which is bundled for Node with Rspack (packages stay external and resolve from the project), imported once, and its export converted like heft does. Results are cached and re-evaluated when the module or a local module it imports changes; resolution runs when `manifests.js` is requested. A missing source, a module that throws or a missing export gives one warning per broken state (`<alias>: tool "<name>" propertiesSchema "<id>" is not resolved, the debug manifest keeps the reference: <reason>`), and the reference stays.
- The schema module is usually imported by the component only as a type, so it is not part of the bundle: schema edits need a workbench reload, not a restart.
- Edits: React views hot-update with state kept; a component class edit reloads the turn's iframe, which renders the turn again with the same properties.

### Testing flow

Open `https://<tenant>.sharepoint.com/<site>/_layouts/15/copilotworkbench.aspx` with the printed debug query, choose **Load debug scripts**, pick the component, fill in the form generated from `propertiesSchema` and **Fire turn**. Each turn renders in its own iframe with its own bridge; the workbench lists components from the debug manifests.

## Links

- [SPFx component types](../concepts/spfx-component-types.md)
- [Dev server, debug manifests and debug URL](dev-server.md)
- [HMR and React Fast Refresh](hmr.md)
- [Localized strings](localization.md)

## Evidence

- Source: `@microsoft/spfx-heft-plugins` 1.24.2 manifest plugin and manifest reference resolver; `heft start` output on a project generated with `@microsoft/generator-sharepoint` 1.24.2 (Copilot component and web part in separate bundles): debug manifest entries compared with fast-serve's on a copy without `lib/` — identical apart from the generic React/loc/`sp-loader` differences. Unit tests (reference parsing, conversion, warnings), integration test with a real dev server (manifest shape, schema evaluated from `src` with a package import, re-evaluation after an imported module changes, warning and recovery, bundle with strings on a fake page, reload on a class edit).
- Live (2026-11-23, `1.24.0-beta.20`, SharePoint Online Copilot Workbench): component listed from fast-serve's manifests on a non-default port, form fields and descriptions from the evaluated schema, turn rendered with the entered properties, Fast Refresh in the turn iframe with React state kept, class edit reloaded the iframe and re-rendered the turn, an added schema field appeared after a workbench reload without a restart.
- Confidence: high
- Last checked: 2026-11-23
