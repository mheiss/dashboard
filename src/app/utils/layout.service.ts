import { BreakpointObserver } from '@angular/cdk/layout';
import { inject, Injectable } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly breakpoints = inject(BreakpointObserver);

  readonly mobile$ = this.observe('(max-width: 639px)');
  readonly tablet$ = this.observe('(min-width: 640px) and (max-width: 1023px)');
  readonly desktop$ = this.observe('(min-width: 1024px)');

  constructor() {}

  private observe(query: string) {
    return toSignal(this.breakpoints.observe(query).pipe(map((r) => r.matches)), { requireSync: true });
  }
}
