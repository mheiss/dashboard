import { DIALOG_DATA } from '@angular/cdk/dialog';
import { DatePipe, NgClass } from '@angular/common';
import { Component, computed, effect, ElementRef, inject, OnInit, signal, untracked, viewChild } from '@angular/core';
import Panzoom, { PanzoomObject } from '@panzoom/panzoom';
import { DriveImageExt } from '../../../ms-graph/image.model';
import { BlobSrcDirective } from '../blob.directive';
import { DetailViewerData } from '../gallery.model';
import { delay, first, Subscription } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-detail-viewer',
  templateUrl: './detail-viewer.html',
  imports: [NgClass, DatePipe, BlobSrcDirective],
})
export class DetailViewerComponent implements OnInit {
  readonly data: DetailViewerData = inject(DIALOG_DATA).data;
  readonly image = signal<DriveImageExt>(this.data.image);
  readonly imageBlob = signal<Blob | null>(null);
  readonly images = this.data.images;
  readonly imageElement = viewChild.required<ElementRef<HTMLImageElement>>('imageElement');
  readonly originalLoaded = signal<boolean>(false);

  panzoom: PanzoomObject;

  imageName = computed(() => {
    const suffix = this.originalLoaded() ? '' : '*';
    return this.image().image.name + suffix;
  });

  imageTakenAt = computed(() => {
    return new Date(this.image().image.takenAt);
  });

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
  }

  hasNext() {
    return this.images().indexOf(this.image()) < this.images().length;
  }

  hasPrevious() {
    return this.images().indexOf(this.image()) > 0;
  }

  onNext() {
    this.panzoom.reset();

    const index = this.images().indexOf(this.image());

    // Trigger loading more if we reach the end
    if (index == this.images().length - 2) {
      this.data.loadMore();
    }

    this.image.set(this.images()[index + 1]);
  }

  onPrevious() {
    this.panzoom.reset();

    const index = this.images().indexOf(this.image());
    this.image.set(this.images()[index - 1]);
  }
}
