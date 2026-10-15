import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { renderContinueWidget, WIDGET_NAME } from './continue-widget';
import { readWidgetSnapshot } from './widget-snapshot';

/**
 * Runs when Android asks for the widget (added, resized, after a restart),
 * also while the app is closed: draws it from what the app last saved. Taps
 * are links into the app (listenup://listen…), so there's nothing to handle here.
 */
export async function widgetTaskHandler({ widgetInfo, widgetAction, renderWidget }: WidgetTaskHandlerProps) {
  if (widgetInfo.widgetName !== WIDGET_NAME) return;
  if (widgetAction === 'WIDGET_ADDED' || widgetAction === 'WIDGET_UPDATE' || widgetAction === 'WIDGET_RESIZED') {
    renderWidget(renderContinueWidget(readWidgetSnapshot(), widgetInfo));
  }
}
