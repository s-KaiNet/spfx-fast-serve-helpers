import * as React from 'react';
import styles from './Badge.module.scss';

(globalThis as unknown as Record<string, string>).badgeVersion = 'v1';

export function Badge(): unknown {
  return <span className={styles.badge} />;
}
