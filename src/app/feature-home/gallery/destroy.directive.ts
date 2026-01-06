import { Directive, Input, OnDestroy } from '@angular/core';

@Directive({
  selector: '[revokeOnDestroy]',
})
export class RevokeOnDestroyDirective implements OnDestroy {
  @Input('revokeOnDestroy') url: string | null;

  ngOnDestroy() {
    if (this.url) {
      URL.revokeObjectURL(this.url);
    }
  }
}
