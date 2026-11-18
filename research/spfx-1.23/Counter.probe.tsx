import * as React from 'react';

export default function Counter(): React.ReactElement {
  const [count, setCount] = React.useState(0);
  return <button id="probe-counter" onClick={() => setCount(count + 1)}>probe v2: {count}</button>;
}
