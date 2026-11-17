type BrowserErrorReport = import('./contracts.js').BrowserErrorReport;
type BrowserErrorKind = import('./contracts.js').BrowserErrorKind;

const BROWSER_ERROR_EVENT = 'fast-serve:browser-error';
const ALREADY_REPORTED_PREFIXES = ['[fast-serve] ', '[vite]'];
const MAX_MESSAGE_LENGTH = 4000;
const REPORTED_IN_TERMINAL = Symbol.for('fast-serve.reported-in-terminal');
const forwardedErrors = new WeakSet();

interface ErrorDetails {
  name: string;
  message: string;
  stack: string;
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

function errorDetails(value: unknown): ErrorDetails {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack ?? '' };
  if (typeof value === 'object' && value !== null) {
    const { name, message, stack } = value as { name?: unknown; message?: unknown; stack?: unknown };
    if (typeof message === 'string') {
      return { name: typeof name === 'string' ? name : 'Error', message, stack: typeof stack === 'string' ? stack : '' };
    }
  }
  return { name: 'Error', message: describeValue(value), stack: '' };
}

function sendReport(kind: BrowserErrorKind, details: ErrorDetails, callStack = ''): void {
  const report: BrowserErrorReport = { kind, ...details, message: details.message.slice(0, MAX_MESSAGE_LENGTH), callStack };
  import.meta.hot?.send(BROWSER_ERROR_EVENT, report);
}

function isAlreadyReportedMessage(args: readonly unknown[]): boolean {
  const [first] = args;
  return typeof first === 'string' && ALREADY_REPORTED_PREFIXES.some((prefix) => first.startsWith(prefix));
}

function claimError(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (forwardedErrors.has(value) || REPORTED_IN_TERMINAL in value) return false;
  forwardedErrors.add(value);
  return true;
}

function locationStack(event: ErrorEvent): string {
  return event.filename ? `    at ${event.filename}:${event.lineno}:${event.colno}` : '';
}

export function forwardBrowserErrors(): void {
  window.addEventListener('error', (event) => {
    if (event.error !== undefined && event.error !== null) {
      if (!claimError(event.error)) return;
      const details = errorDetails(event.error);
      sendReport('error', { ...details, stack: details.stack || locationStack(event) });
      return;
    }
    sendReport('error', { name: 'Error', message: event.message, stack: locationStack(event) });
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (!claimError(event.reason)) return;
    sendReport('unhandled-rejection', errorDetails(event.reason));
  });

  const consoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    consoleError(...args);
    if (isAlreadyReportedMessage(args)) return;
    const loggedError = args.find((arg) => arg instanceof Error);
    if (loggedError && !claimError(loggedError)) return;
    sendReport(
      'console-error',
      { name: 'console.error', message: args.map(describeValue).join(' '), stack: loggedError?.stack ?? '' },
      new Error('console.error call site').stack ?? '',
    );
  };
}

forwardBrowserErrors();
