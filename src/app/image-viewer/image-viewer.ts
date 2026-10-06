import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe, DatePipe } from '@angular/common';
import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  OnInit,
  OnDestroy,
  signal,
  untracked,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import Panzoom, { PanzoomObject } from '@panzoom/panzoom';
import { delay, first } from 'rxjs';
import { BlobSrcDirective } from './blob.directive';
import { ImageViewerData, ViewerImage } from './image-viewer.model';

@Component({
  selector: 'app-image-viewer',
  templateUrl: './image-viewer.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  host: { class: 'block h-full min-h-0 w-full' },
  imports: [DatePipe, AsyncPipe, BlobSrcDirective, ScrollingModule],
})
export class ImageViewerComponent implements OnInit, OnDestroy {
  readonly dialogRef = inject(DialogRef);
  readonly data: ImageViewerData = inject(DIALOG_DATA).data;
  readonly image = signal<ViewerImage>(this.data.image);
  readonly imageBlob = signal<Blob | null>(null);
  readonly images = this.data.images;
  readonly gallery = viewChild.required<CdkVirtualScrollViewport>('gallery');
  readonly imageElement = viewChild.required<ElementRef<HTMLImageElement>>('imageElement');
  readonly originalLoaded = signal<boolean>(false);

  panzoom: PanzoomObject;

  imageName = computed(() => {
    const suffix = this.originalLoaded() ? '' : '*';
    return this.image().name + suffix;
  });

  imageTakenAt = computed(() => this.image().takenAt);

  constructor() {
    effect((onCleanup) => {
      const image = this.image();

      this.imageBlob.set(null);
      this.originalLoaded.set(false);
      const origSub = image.original$.pipe(first(), delay(1000)).subscribe((original) => {
        this.imageBlob.set(original);
        this.originalLoaded.set(true);
      });
      const thumbSub = image.thumbnail$.pipe(first()).subscribe((thumbnail) => {
        const blob = untracked(() => this.imageBlob());
        if (!blob) {
          this.imageBlob.set(thumbnail);
        }
      });
      onCleanup(() => {
        origSub.unsubscribe();
        thumbSub.unsubscribe();
      });
    });
  }

  ngOnInit(): void {
    this.panzoom = Panzoom(this.imageElement().nativeElement, {
      maxScale: 5,
      minScale: 1,
    });
    setTimeout(() => this.showImage(this.image()), 0);
  }

  ngOnDestroy(): void {
    this.panzoom?.destroy();
  }

  hasNext() {
    return this.images().indexOf(this.image()) < this.images().length - 1;
  }

  hasPrevious() {
    return this.images().indexOf(this.image()) > 0;
  }

  showImage(image: ViewerImage) {
    // Reset scrolling as we do not have any other means to do it via UI
    this.panzoom.reset();

    // Display the image
    this.image.set(image);
    const index = this.images().indexOf(image);
    this.gallery().scrollToIndex(index - 5, 'smooth');

    // Trigger loading more if we reach the end
    const remaining = this.images().length - index;
    if (remaining <= 10) {
      this.data.loadMore();
    }
  }

  onNext() {
    const index = this.images().indexOf(this.image());
    this.showImage(this.images()[index + 1]);
  }

  onPrevious() {
    const index = this.images().indexOf(this.image());
    this.showImage(this.images()[index - 1]);
  }

  trackByImageId(_: number, item: ViewerImage) {
    return item.id;
  }
}