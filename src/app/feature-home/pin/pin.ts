import { DialogRef } from '@angular/cdk/dialog';
import { NgClass } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { OpenHABService } from '../../feature-openhab/openhab.service';
import { Popup } from '../../popup/popup';
import { confettiSequence } from '../../utils/confetti';
import { pinActor } from './pin.actor';
import { backspaceEvent, keyEvent, verifyResponse } from './pin.machine';
import { Key } from './pin.model';

@Component({
  selector: 'app-pin',
  templateUrl: './pin.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [Popup, NgClass],
})
export class Pin implements OnInit {
  readonly dialogRef = inject(DialogRef);
  readonly openHab = inject(OpenHABService);
  readonly destroyRef = inject(DestroyRef);

  readonly keys = signal(createKeys());
  readonly values = signal(['']);

  readonly pinActor = pinActor({
    verifyAction: (digits) => this.doVerifyPin(digits),
  });

  readonly pinActorState = signal('idle');
  readonly isValid = computed(() => this.pinActorState() === 'valid');
  readonly isInvalid = computed(() => this.pinActorState() === 'invalid');
  readonly isVerifying = computed(() => this.pinActorState() === 'verify');

  ngOnInit(): void {
    // Subscribe to events to update our internal data
    this.pinActor.subscribe((snapshot) => {
      this.pinActorState.set(snapshot.value);
      this.values.set(fillMissingDigits(snapshot.context.digits));
    });
    this.pinActor.start();

    // Close the popup when the security is turned off
    this.openHab.security.value$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      if (!value && this.isVerifying()) {
        this.pinActor.send(verifyResponse(true));
        this.dialogRef.close();
        confettiSequence();
      } else {
        this.pinActor.send(verifyResponse(false));
      }
    });
  }

  keyPressed(key: Key) {
    this.pinActor.send(key.event);
  }

  private doVerifyPin(digits: string[]) {
    const pinCode = digits.join('');
    this.openHab.pin.sendPinCode(pinCode);
  }
}

/**
 * Creates the keys of the PIN Code widget
 */
function createKeys(): Key[] {
  return [
    { text: '1', event: keyEvent('1') },
    { text: '2', event: keyEvent('2') },
    { text: '3', event: keyEvent('3') },
    { text: '4', event: keyEvent('4') },
    { text: '5', event: keyEvent('5') },
    { text: '6', event: keyEvent('6') },
    { text: '7', event: keyEvent('7') },
    { text: '8', event: keyEvent('8') },
    { text: '9', event: keyEvent('9') },
    { text: '0', event: keyEvent('0'), position: 'col-start-2' },
    { icon: 'backspace', event: backspaceEvent(), position: 'col-start-3' },
  ];
}

/**
 * Fills missing digits with nulls. Required for rendering.
 */
function fillMissingDigits(digits: string[]) {
  return digits.concat(Array(4 - digits.length).fill(null));
}
