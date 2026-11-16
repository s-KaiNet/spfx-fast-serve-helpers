import * as React from 'react';
import { Version } from '@microsoft/sp-core-library';

const LABEL = 'probe-v1';
export default function ProbeCounter(): React.ReactElement {
  const [n, setN] = React.useState(0);
  return (
    <button id="tla-probe-counter" onClick={() => setN(n + 1)}>
      {LABEL} count={n} Version={typeof Version}
    </button>
  );
}
