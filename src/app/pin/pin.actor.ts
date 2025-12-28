import { createActor } from 'xstate';
import { pinMachine } from './pin.machine';
import { signal } from '@angular/core';

export interface Actions {
  verifyAction: VerifyAction;
}

export type VerifyAction = (digits: string[]) => void;
export type InvalidAction = () => void;
export type ValidAction = () => void;

/**
 * Actor to enter and verify a PIN code.
 */
export const pinActor = (actions: Actions) => {
  const actor = createActor(
    pinMachine.provide({
      actions: {
        verifyAction: (args) => actions.verifyAction(args.context.digits),
      },
    }),
  );
  return actor;
};
