import { spawn } from 'cross-spawn';

export async function spawnProcess(program: string, args: string[], env?: typeof process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(program, args, {
      stdio: 'inherit',
      env: env || process.env
    });

    process.on('SIGTERM', () => proc.kill('SIGTERM'))
    process.on('SIGINT', () => proc.kill('SIGINT'))
    process.on('SIGBREAK', () => proc.kill('SIGBREAK'))
    process.on('SIGHUP', () => proc.kill('SIGHUP'))

    proc.on('exit', (code, signal) => {
      let crossEnvExitCode = code
      if (crossEnvExitCode === null) {
        crossEnvExitCode = signal === 'SIGINT' ? 0 : 1
      }

      if (crossEnvExitCode == 1) {
        reject();
      } else {
        resolve();
      }
    });
  });
}