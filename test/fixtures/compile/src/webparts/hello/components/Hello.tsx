import * as React from 'react';
import { nestedReactVersion } from 'nested-react-user';
import type { IHelloProps } from './IHelloProps';

export function renderHello({ title }: IHelloProps): unknown {
  return <div title={title}>{nestedReactVersion()}</div>;
}
