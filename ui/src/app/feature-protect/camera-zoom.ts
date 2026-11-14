import Panzoom from '@panzoom/panzoom';

export function cameraZoom(element: HTMLElement) {
  return Panzoom(element, {
    disablePan: true,
    maxScale: 5,
    minScale: 1,
    touchAction: 'pan-y',
    handleStartEvent: (event) => {
      if (event instanceof MouseEvent && (!('pointerType' in event) || event.pointerType !== 'touch')) {
        event.preventDefault();
      }
      event.stopPropagation();
    },
  });
}
