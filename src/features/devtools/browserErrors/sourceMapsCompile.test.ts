import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyCompileFixture, evaluateAmd, type FixtureCopy } from '../../../testing/compileKit.js';
import { BundleSourceMaps } from './sourceMaps.js';

const CLASS_COMPONENT =
  "import * as React from 'react';\n" +
  "import type { IHelloProps } from './IHelloProps';\n" +
  '\n' +
  'declare function missingEscape(value: string): string;\n' +
  'class Component<P> {\n  constructor(public readonly props: P) {}\n}\n' +
  'export class Hello extends Component<IHelloProps> {\n' +
  '  public render(): unknown {\n' +
  '    return (\n' +
  '      <section>\n' +
  '        <div>\n' +
  '          <h2>Title</h2>\n' +
  '          <p>{missingEscape(this.props.title)}</p>\n' +
  '        </div>\n' +
  '      </section>\n' +
  '    );\n' +
  '  }\n' +
  '}\n' +
  '\n' +
  'export function renderHello(props: IHelloProps): unknown {\n' +
  '  return new Hello(props).render();\n' +
  '}\n';

describe('source maps of a compiled class component with multi-line JSX', () => {
  let fixture: FixtureCopy;
  let bundle: string;

  beforeAll(async () => {
    fixture = copyCompileFixture({ 'src/webparts/hello/components/Hello.tsx': CLASS_COMPONENT });
    bundle = (await fixture.compile()).bundle('single-web-part');
  }, 60_000);

  afterAll(() => {
    fixture.remove();
  });

  function thrownPosition(): { line: number; column: number } {
    const WebPart = evaluateAmd(bundle).exports.default as new () => { render(): unknown };
    try {
      new WebPart().render();
    } catch (error) {
      const position = /evalmachine\.<anonymous>:(\d+):(\d+)/.exec(String((error as Error).stack));
      if (position) return { line: Number(position[1]), column: Number(position[2]) };
    }
    throw new Error('render did not throw from the bundle');
  }

  it('maps a ReferenceError that V8 reports on a JSX development-only line to its source line', async () => {
    const { line, column } = thrownPosition();
    expect(bundle.split('\n')[line - 1]).not.toContain('missingEscape(');
    const sourceMaps = new BundleSourceMaps(fixture.root, (file) => Promise.resolve(readFileSync(path.join(fixture.root, 'out', file), 'utf8')), () => false);
    expect(await sourceMaps.originOf('single-web-part.js', line, column)).toEqual({ file: path.join(fixture.root, 'src/webparts/hello/components/Hello.tsx'), line: 14 });
  });
});
