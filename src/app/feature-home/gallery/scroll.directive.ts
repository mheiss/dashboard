import { Directive, HostListener, output } from '@angular/core';

@Directive({
  selector: '[infiniteScroll]',
})
export class InfiniteScrollDirective {
  readonly infiniteScroll = output();

  @HostListener('scroll', ['$event'])
  onScroll(e: Event) {
    const el = e.target as HTMLElement;

    const threshold = 150; // px from bottom
    const position = el.scrollTop + el.clientHeight;
    const height = el.scrollHeight;

    if (height - position < threshold) {
      this.infiniteScroll.emit();
    }
  }
}
