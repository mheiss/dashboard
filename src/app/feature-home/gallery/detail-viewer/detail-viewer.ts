import { DIALOG_DATA } from '@angular/cdk/dialog';
import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import Panzoom, { PanzoomObject } from '@panzoom/panzoom';
import { ImageWithThumbnail } from '../../../ms-graph/image.model';
import { DetailViewerData } from '../gallery.model';

@Component({
  selector: 'app-detail-viewer',
  templateUrl: './detail-viewer.html',
  imports: [AsyncPipe, DatePipe],
})
export class DetailViewerComponent implements OnInit {
  readonly data: DetailViewerData = inject(DIALOG_DATA).data;
  readonly image = signal<ImageWithThumbnail>(this.data.image);
  readonly images = this.data.images;

  readonly imageElement = viewChild.required<ElementRef<HTMLImageElement>>('imageElement');
  panzoom: PanzoomObject;

  imageName = computed(() => {
    return this.image().image.name;
  });

  imageTakenAt = computed(() => {
    return new Date(this.image().image.takenAt);
  });

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
