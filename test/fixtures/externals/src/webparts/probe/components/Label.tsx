import * as React from 'react';
import * as strings from 'LabelStrings';

(globalThis as unknown as Record<string, string>).labelText = strings.Label;

export function Label(): unknown {
  return <span>{strings.Label}</span>;
}
