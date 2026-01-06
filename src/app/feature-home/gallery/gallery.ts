import { CdkVirtualScrollViewport, ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe } from '@angular/common';
import { AfterViewInit, Component, computed, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { ImageWithThumbnail } from '../../ms-graph/image.model';
import { PopupService } from '../../popup/popup.service';
import { RevokeOnDestroyDirective } from './destroy.directive';
import { DetailViewerComponent } from './detail-viewer/detail-viewer';
import { DetailViewerData } from './gallery.model';

@Component({
  selector: 'app-gallery',
  templateUrl: './gallery.html',
  imports: [ScrollingModule, RevokeOnDestroyDirective, AsyncPipe],
})
export class GalleryComponent implements OnInit, AfterViewInit {
  readonly dialog = inject(PopupService);

  readonly gallery = viewChild.required<CdkVirtualScrollViewport>('gallery');
  readonly columnWidth = 220;
  readonly gap = 8;

  /**
   * The images to display by the component
   */
  readonly images = input.required<ImageWithThumbnail[]>();

  /**
   * The total number of images
   */
  readonly imageCount = input.required<number>();

  /**
   * Event that will be triggered when more images shall be loaded.
   */
  readonly loadMore = output();

  /**
   * Signal with the viewport width
   */
  readonly viewportWidth = signal(0);

  /**
   * Computes the number of columns depending on the viewport size
   */
  readonly columns = computed(() => {
    const width = this.viewportWidth();
    if (width === 0) return 1;

    return Math.max(1, Math.floor(width / (this.columnWidth + this.gap)));
  });

  /**
   * Computes the rows based on the column count
   */
  readonly rows = computed(() => {
    const cols = this.columns();
    const items = this.images();
    const result: ImageWithThumbnail[][] = [];
    for (let i = 0; i < items.length; i += cols) {
      result.push(items.slice(i, i + cols));
    }
    return result;
  });

  ngOnInit() {
    this.loadMore.emit();
  }

  ngAfterViewInit() {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        this.viewportWidth.set(entry.contentRect.width);
      }
    });

    const scrollViewport = this.gallery().elementRef.nativeElement;
    observer.observe(scrollViewport);
  }

  openDetailView(image: ImageWithThumbnail) {
    this.dialog.open(DetailViewerComponent, {
      data: {
        image: image,
        imageCount: this.imageCount(),
        images: this.images,
        loadMore: () => this.loadMore.emit(),
      } as DetailViewerData,
      disableClose: false,
      width: '85%',
    });
  }
}
