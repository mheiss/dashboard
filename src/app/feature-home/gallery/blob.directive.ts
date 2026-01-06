import { Directive, ElementRef, inject, input, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[blobSrc]',
})
export class BlobSrcDirective implements OnChanges, OnDestroy {
  readonly blobSrc = input.required<Blob | null>();
  readonly element = inject<ElementRef<HTMLImageElement>>(ElementRef);

  private objectUrl: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('blobSrc' in changes) {
      this.updateImage();
    }
  }

  private updateImage(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    const blob = this.blobSrc();
    if (blob) {
      this.objectUrl = URL.createObjectURL(blob);
      this.element.nativeElement.src = this.objectUrl;
    } else {
      this.element.nativeElement.src = '';
    }
  }

  ngOnDestroy(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }
}
