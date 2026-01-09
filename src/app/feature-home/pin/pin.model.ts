import { InputEvents } from './pin.machine';

/**
 * Represents a key in a PIN code pad.
 */
export class Key {
  text?: string;
  icon?: string;
  position?: string;
  event: InputEvents;
}
