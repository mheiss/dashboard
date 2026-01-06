import { DIALOG_DATA } from '@angular/cdk/dialog';
import { AsyncPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ImageWithThumbnail } from '../../../ms-graph/image.model';
import { DetailViewerData } from '../gallery.model';

@Component({
  selector: 'app-detail-viewer',
  templateUrl: './detail-viewer.html',
  imports: [AsyncPipe],
})
export class DetailViewerComponent {
  readonly data: DetailViewerData = inject(DIALOG_DATA).data;
}
