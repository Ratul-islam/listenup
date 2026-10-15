import { Platform, TurboModuleRegistry } from 'react-native';

import { writeWidgetSnapshot, type WidgetSnapshot } from './widget-snapshot';

/**
 * Whether this build has the widget's native part. Builds made before the
 * widget don't, and loading the widget library there would crash, so it's
 * only ever required after this check.
 */
export const hasWidgetSupport = () => Platform.OS === 'android' && TurboModuleRegistry.get('AndroidWidget') != null;

/** Saves what the widget should show and redraws any widget on the home screen */
export function updateHomeWidget(snapshot: WidgetSnapshot) {
  writeWidgetSnapshot(snapshot);
  if (!hasWidgetSupport()) return;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { requestWidgetUpdate } = require('react-native-android-widget') as typeof import('react-native-android-widget');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { renderContinueWidget, WIDGET_NAME } = require('./continue-widget') as typeof import('./continue-widget');
  void requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: (info) => renderContinueWidget(snapshot, info) }).catch(() => {
    // No widget on the home screen, or the launcher refused; it redraws from the saved snapshot next time
  });
}
