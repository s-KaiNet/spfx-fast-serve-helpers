import { objectSchema } from 'schema-kit';
import { messageField } from './messageField';

export interface ISavedLinksCopilotComponentProperties {
  message: string;
}

export default objectSchema({ message: messageField });
