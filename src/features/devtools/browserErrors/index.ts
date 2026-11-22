import path from 'node:path';
import type { IncomingMessage } from 'node:http';
import { rspack, type Compiler, type RspackPluginInstance } from '@rspack/core';
import { BROWSER_ERRORS_PATH, publicPath, requestPath, sendJson, type ConfigContribution, type Feature, type FeatureContext, type ServerMiddleware } from '../../../bundler/featureApi/index.js';
import type { BrowserErrorReport, PageRuntimeConfig } from './contracts.js';
import { BrowserErrorReporter } from './reporter.js';
import { renderPageScript } from './pageScript.js';
import { BundleSourceMaps } from './sourceMaps.js';

export type { BrowserErrorKind, BrowserErrorReport, BrowserErrorResponse, OverlayContent, PageRuntimeConfig } from './contracts.js';
export { codeFrame, formatBrowserError, type DisplayFrame } from './format.js';
export { describeLoadError, type LoadErrorFacts } from './loadErrors.js';
export { renderPageScript } from './pageScript.js';
export { BrowserErrorReporter, errorSignature } from './reporter.js';
export { BundleSourceMaps, sourceFilePath } from './sourceMaps.js';
export { parseStackFrames, servedFile } from './stackFrames.js';

const MAX_REPORT_BYTES = 256 * 1024;
const PAGE_RUNTIME_ENTRY = path.join('temp', 'fast-serve', 'page-runtime', 'page-runtime.js');
const REPORT_KINDS = new Set(['error', 'unhandled-rejection', 'hot-update-error', 'console-error', 'load-error']);

export class BrowserErrorsPlugin implements RspackPluginInstance {
  readonly sourceMaps: BundleSourceMaps;
  compileFailed = false;
  private compiler: Compiler | undefined;

  constructor(root: string) {
    this.sourceMaps = new BundleSourceMaps(root, (file) => this.readOutput(file), () => this.mapsHaveColumns());
  }

  apply(compiler: Compiler): void {
    this.compiler = compiler;
    compiler.hooks.done.tap('fast-serve:browser-errors', (stats) => {
      this.compileFailed = stats.hasErrors();
      this.sourceMaps.forget();
    });
  }

  private mapsHaveColumns(): boolean {
    const devtool = this.compiler?.options.devtool;
    return typeof devtool !== 'string' || !devtool.includes('cheap');
  }

  private readOutput(file: string): Promise<string | undefined> {
    const compiler = this.compiler;
    const fileSystem = compiler?.outputFileSystem;
    if (compiler === undefined || !fileSystem) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      fileSystem.readFile(path.join(compiler.outputPath, file), (error, content) => {
        resolve(error || content === undefined ? undefined : content.toString());
      });
    });
  }
}

export const browserErrorsFeature: Feature = { name: 'browserErrors', contribute: browserErrorsContribution };

function browserErrorsContribution({ root, project, options, logger, page }: FeatureContext): ConfigContribution {
  const distUrl = publicPath(options.origin);
  const plugin = new BrowserErrorsPlugin(root);
  const reporter = new BrowserErrorReporter({
    root,
    codeRoots: project.codeRoots().map((codeRoot) => codeRoot.root),
    distUrl,
    overlay: options.overlay,
    logger,
    sourceMaps: plugin.sourceMaps,
    loadErrorFacts: () => ({ root, configExternals: project.configExternals(), libraries: project.libraries(), compileFailed: plugin.compileFailed }),
  });
  const pageConfig = (): PageRuntimeConfig => ({
    origin: options.origin,
    distUrl,
    reportUrl: `${options.origin}${BROWSER_ERRORS_PATH}`,
    overlay: options.overlay,
    bundles: Object.fromEntries(project.bundles().map((bundle) => [bundle.name, bundle.components.map((component) => component.manifest.id)])),
  });
  page.addPageScript(() => renderPageScript(pageConfig()));
  const pageRuntimeEntry = path.join(root, PAGE_RUNTIME_ENTRY);
  return {
    plugins: [
      plugin,
      new rspack.experiments.VirtualModulesPlugin({ [pageRuntimeEntry]: renderPageScript(pageConfig()) }),
      new rspack.EntryPlugin(root, pageRuntimeEntry, { name: undefined }),
    ],
    middlewares: [reportsMiddleware(reporter)],
  };
}

function reportsMiddleware(reporter: BrowserErrorReporter): ServerMiddleware {
  return {
    name: 'fast-serve:browser-errors',
    middleware: (req, res, next) => {
      if (req.method !== 'POST' || requestPath(req) !== BROWSER_ERRORS_PATH) {
        next();
        return;
      }
      readBody(req)
        .then(async (body) => {
          const report = parseReport(body);
          sendJson(res, report === undefined ? {} : await reporter.report(report));
        })
        .catch(() => {
          sendJson(res, {});
        });
    },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_REPORT_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      resolve(size <= MAX_REPORT_BYTES ? Buffer.concat(chunks).toString('utf8') : '');
    });
    req.on('error', reject);
  });
}

export function parseReport(body: string): BrowserErrorReport | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (typeof payload !== 'object' || payload === null) return undefined;
  const { kind, name, message, stack, callStack, bundle, requireType, requireModules } = payload as Record<string, unknown>;
  if (typeof kind !== 'string' || !REPORT_KINDS.has(kind)) return undefined;
  if (![name, message, stack, callStack].every((value) => typeof value === 'string')) return undefined;
  const report = { kind, name, message, stack, callStack } as BrowserErrorReport;
  if (typeof bundle === 'string') report.bundle = bundle;
  if (typeof requireType === 'string') report.requireType = requireType;
  if (Array.isArray(requireModules)) report.requireModules = requireModules.filter((module): module is string => typeof module === 'string');
  return report;
}

