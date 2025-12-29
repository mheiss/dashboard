import { DialogRef } from '@angular/cdk/dialog';
import { NgClass } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnDestroy, OnInit, signal } from '@angular/core';

import { Popup } from '../popup/popup';
import { confettiSequence } from '../utils/confetti';
import { pinActor } from './pin.actor';
import { digitEvent, verifyResponse } from './pin.machine';
import { OpenHABApi } from '../openhab/openhab.service';
import { pipe } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

export interface Confetti {
  x: number;
  y: number;
  color: string;
  delay: number;
}

@Component({
  selector: 'app-pin',
  templateUrl: './pin.html',
  imports: [Popup, NgClass],
})
export class Pin implements OnInit {
  readonly dialogRef = inject(DialogRef);
  readonly openHab = inject(OpenHABApi);
  readonly destroyRef = inject(DestroyRef);

  readonly keys = signal(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  readonly values = signal(['']);
  readonly state = signal('');

  readonly isValid = computed(() => this.state() === 'valid');
  readonly isInvalid = computed(() => this.state() === 'invalid');
  readonly isVerifying = computed(() => this.state() === 'verify');

  readonly pinActor = pinActor({
    verifyAction: (digits) => this.doVerifyPin(digits),
  });

  ngOnInit(): void {
    // Subscribe to events to update our internal data
    this.pinActor.subscribe((snapshot) => {
      this.state.set(snapshot.value);

      // Fill missing digits with nulls for rendering
      const digits = snapshot.context.digits;
      const uiDigits = digits.concat(Array(4 - digits.length).fill(null));
      this.values.set(uiDigits);
    });
    this.pinActor.start();

    // Close the popup when the security is turned off
    this.openHab.securityStatus$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      if (!value && this.isVerifying()) {
        this.pinActor.send(verifyResponse(true));
        this.dialogRef.close();
        confettiSequence();
      } else {
        this.pinActor.send(verifyResponse(false));
      }
    });
  }

  keyPressed(key: string) {
    this.pinActor.send(digitEvent(key));
  }

  private doVerifyPin(digits: string[]) {
    const pinCode = digits.join('');
    this.openHab.disarmSecurity(pinCode);
  }
}
