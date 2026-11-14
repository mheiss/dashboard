import Panzoom from '@panzoom/panzoom';

interface CameraZoomOptions {
  pan?: boolean;
  touchAction?: 'none' | 'pan-y';
}

export function cameraZoom(element: HTMLElement, options: CameraZoomOptions = {}) {
  return Panzoom(element, {
    disablePan: !options.pan,
    maxScale: 5,
    minScale: 1,
    touchAction: options.touchAction ?? 'pan-y',
    handleStartEvent: (event) => {
      if (event instanceof MouseEvent && (!('pointerType' in event) || event.pointerType !== 'touch')) {
        event.preventDefault();
      }
      event.stopPropagation();
    },
  });
}
