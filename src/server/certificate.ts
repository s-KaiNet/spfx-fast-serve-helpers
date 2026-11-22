import { CertificateManager } from '@rushstack/debug-certificate-manager';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';
import { errorMessage } from '../shared/errors.js';

export interface HttpsCredentials {
  cert: string;
  key: string;
}

export async function loadDevCertificate(): Promise<HttpsCredentials> {
  const terminal = new Terminal(new ConsoleTerminalProvider());
  let certificate;
  try {
    certificate = await new CertificateManager().ensureCertificateAsync(false, terminal);
  } catch (error) {
    throw new Error(
      'No valid SPFx development certificate found. Run "npx heft trust-dev-cert" in the project once.\n' +
        `  (${errorMessage(error)})`,
      { cause: error },
    );
  }
  if (!certificate.pemCertificate || !certificate.pemKey) {
    throw new Error('The SPFx development certificate is incomplete. Run "npx heft trust-dev-cert" in the project.');
  }
  return { cert: certificate.pemCertificate, key: certificate.pemKey };
}
