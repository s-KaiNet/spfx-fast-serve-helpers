
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <title>Error</title>
            <script type="module">
              const error = {"message":"Failed to resolve import \"./moduleTypes\" from \"src/decoexp/enums/useDts.ts\". Does the file exist?","stack":"    at TransformPluginContext._formatLog (file:///home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/chunks/node.js:8865:39)\n    at TransformPluginContext.error (file:///home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/chunks/node.js:8862:14)\n    at resolveId (file:///home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/chunks/node.js:26552:18)\n    at async file:///home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/chunks/node.js:26651:23\n    at async Promise.all (index 0)\n    at async TransformPluginContext.transform (file:///home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/chunks/node.js:26624:4)\n    at async EnvironmentPluginContainer.transform (file:///home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/chunks/node.js:8636:14)\n    at async loadAndTransform (file:///home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/chunks/node.js:20112:26)\n    at async viteTransformMiddleware (file:///home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/chunks/node.js:20332:20)","id":"/home/sergei/Projects/spfx-rea/src/decoexp/enums/useDts.ts","frame":"1  |  import { DtsEnum } from \"./moduleTypes\";\n   |                           ^\n2  |  export const fromDts = { x: DtsEnum.X };\n3  |  ","plugin":"vite:import-analysis","pluginCode":"import { DtsEnum } from \"./moduleTypes\";\nexport const fromDts = { x: DtsEnum.X };\n","loc":{"file":"/home/sergei/Projects/spfx-rea/src/decoexp/enums/useDts.ts","line":1,"column":24}}
              try {
                const { ErrorOverlay } = await import("/@vite/client")
                document.body.appendChild(new ErrorOverlay(error))
              } catch {
                const h = (tag, text) => {
                  const el = document.createElement(tag)
                  el.textContent = text
                  return el
                }
                document.body.appendChild(h('h1', 'Internal Server Error'))
                document.body.appendChild(h('h2', error.message))
                document.body.appendChild(h('pre', error.stack))
                document.body.appendChild(h('p', '(Error overlay failed to load)'))
              }
            </script>
          </head>
          <body>
          </body>
        </html>
      