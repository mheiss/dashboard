import { Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, fromEvent, interval, merge, Observable, OperatorFunction } from 'rxjs';
import { distinctUntilChanged, filter, map, pairwise, shareReplay, startWith, tap } from 'rxjs/operators';

/**
 * A service to track the visibility state of the application (e.g. if the screen is on or off).
 * It provides observables to react to visibility changes and a custom operator to skip emissions when the screen is off.
 */
@Injectable({ providedIn: 'root' })
export class VisibilityService {
  private readonly screenOnSubject = new BehaviorSubject<boolean>(this.getInitialScreenState());

  readonly screenOn$ = this.screenOnSubject.asObservable().pipe(shareReplay({ bufferSize: 1, refCount: true }));
  readonly screenOnAgain$: Observable<void>;
  readonly screenOffAgain$: Observable<void>;

  constructor() {
    const visibilityChange$ = fromEvent(document, 'visibilitychange').pipe(map(() => document.visibilityState === 'visible'));
    const focus$ = fromEvent(window, 'focus').pipe(map(() => true));
    const blur$ = fromEvent(window, 'blur').pipe(map(() => false));

    // Detect if the screen was turned on again after being off for a longer time (e.g. suspended)
    const suspendedRecovery$ = interval(1000).pipe(
      map(() => Date.now()),
      pairwise(),
      filter(([prev, now]) => now - prev > 3000),
      map(() => true),
    );

    // Merge all events that indicate the screen might be on or off and maintain the current state
    const state$ = merge(visibilityChange$, focus$, blur$, suspendedRecovery$).pipe(
      startWith(this.getInitialScreenState()),
      takeUntilDestroyed(),
      distinctUntilChanged(),
      this.logVisibilityChange(),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    state$.subscribe((on) => this.screenOnSubject.next(on));

    this.screenOnAgain$ = state$.pipe(
      filter((on) => on),
      map(() => undefined),
    );
    this.screenOffAgain$ = state$.pipe(
      filter((on) => !on),
      map(() => undefined),
    );
  }

  /**
   * A custom operator to skip emissions when the screen is off.
   */
  skipWhenHidden<T>(): OperatorFunction<T, T> {
    return filter(() => this.screenOnSubject.value);
  }

  /**
   * Logs visibility state changes to the console for debugging purposes.
   */
  logVisibilityChange(): OperatorFunction<boolean, boolean> {
    return tap((state: boolean) => {
      console.log(`Screen is ${state ? 'ON' : 'OFF'}.`);
    });
  }

  private getInitialScreenState(): boolean {
    if (typeof document !== 'undefined' && 'visibilityState' in document) {
      return document.visibilityState === 'visible';
    }
    return true;
  }
}
