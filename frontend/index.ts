// First, so a crash anywhere after it (the app, or the widget below) is reported
import './src/lib/crash-reports';
import 'expo-router/entry';

import { Platform, TurboModuleRegistry } from 'react-native';

// The home-screen widget draws itself through this task, also while the app is closed.
// Builds made before the widget have no native part for it, so it's loaded only when present.
if (Platform.OS === 'android' && TurboModuleRegistry.get('AndroidWidget') != null) {
  // Required here, not imported: importing loads the native part, which older builds lack
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerWidgetTaskHandler } = require('react-native-android-widget') as typeof import('react-native-android-widget');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { widgetTaskHandler } = require('./src/features/widget/widget-task-handler') as typeof import('./src/features/widget/widget-task-handler');
  registerWidgetTaskHandler(widgetTaskHandler);
}
