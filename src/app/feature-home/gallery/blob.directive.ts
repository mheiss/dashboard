import { Directive, ElementRef, inject, input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[blobSrc]',
})
export class BlobSrcDirective implements OnChanges, OnDestroy {
  readonly blobSrc = input.required<Blob | null>();
  readonly element = inject<ElementRef<HTMLImageElement>>(ElementRef);

  private objectUrl: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if ('blobSrc' in changes) {
      const blobChanges = changes['blobSrc'];
      this.updateImage(blobChanges.currentValue);
    }
  }

  private updateImage(newBlob: Blob): void {
    // Keep the old value displayed until we have a new one set
    if (!newBlob) {
      return;
    }

    // Switch old and new
    const oldUrl = this.objectUrl;
    if (newBlob) {
      this.objectUrl = URL.createObjectURL(newBlob);
      this.element.nativeElement.src = this.objectUrl;
    } else {
      this.objectUrl = null;
      this.element.nativeElement.src = '';
    }

    // Cleanup old reference
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
    }
  }

  ngOnDestroy(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
  }
}
