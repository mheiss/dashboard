import { NgClass, NgStyle } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Popup } from '../popup/popup';
import { pinActor } from './pin.actor';
import { digitEvent, verifyResponse } from './pin.machine';
import { DialogRef } from '@angular/cdk/dialog';

export interface Confetti {
  x: number;
  y: number;
  color: string;
  delay: number;
}

@Component({
  selector: 'app-pin',
  templateUrl: './pin.html',
  imports: [Popup, NgClass, NgStyle],
})
export class Pin implements OnInit {
  readonly dialogRef = inject(DialogRef);

  readonly keys = signal(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']);
  readonly confetti = signal<Confetti[]>([]);
  readonly values = signal(['']);
  readonly state = signal('');

  readonly isValid = computed(() => this.state() === 'valid');
  readonly isInvalid = computed(() => this.state() === 'invalid');
  readonly isVerifying = computed(() => this.state() === 'verify');

  readonly pinActor = pinActor({
    verifyAction: (digits) => this.doVerifyPin(digits),
  });

  ngOnInit(): void {
    this.pinActor.subscribe((snapshot) => {
      this.state.set(snapshot.value);

      // Fill missing digits with nulls for rendering
      const digits = snapshot.context.digits;
      const uiDigits = digits.concat(Array(4 - digits.length).fill(null));
      this.values.set(uiDigits);
    });
    this.pinActor.start();
  }

  keyPressed(key: string) {
    this.pinActor.send(digitEvent(key));
  }

  private doVerifyPin(digits: string[]) {
    const pin = digits.join('');
    console.log('Verify called: %s', pin);
    if (pin === '1234') {
      this.pinActor.send(verifyResponse(true));
      this.triggerConfetti();
    }
  }

  private triggerConfetti() {
    this.confetti.set(
      Array.from({ length: 200 }).map(() => ({
        x: Math.random() * 400,
        y: 50 + Math.random() * -50,
        color: `hsl(${Math.random() * 360}, 90%, 60%)`,
        delay: Math.random() * 80,
      })),
    );
    setTimeout(() => {
      this.confetti.set([]);
      this.dialogRef.close();
    }, 1500);
  }
}
