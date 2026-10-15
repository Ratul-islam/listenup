import { FlexWidget, SvgWidget, TextWidget, type WidgetInfo, type WidgetRepresentation } from 'react-native-android-widget';

import type { WidgetSnapshot } from './widget-snapshot';

/** The widget's name in app.json */
export const WIDGET_NAME = 'Continue';

type HexColor = `#${string}`;

type Theme = Record<'surface' | 'foreground' | 'muted' | 'accent' | 'onAccent' | 'track' | 'label' | 'separator', HexColor>;

// The app's light and dark tokens (global.css)
const THEMES: Record<'light' | 'dark', Theme> = {
  light: { surface: '#ffffff', foreground: '#1b1c2e', muted: '#64657a', accent: '#6a55e0', onAccent: '#ffffff', track: '#efebff', label: '#4b3bb8', separator: '#e6e4f2' },
  dark: { surface: '#1a1b3a', foreground: '#eceaff', muted: '#a3a3c4', accent: '#a99bff', onAccent: '#10112a', track: '#2a2556', label: '#cfc6ff', separator: '#34356a' },
};

// Plus Jakarta Sans, bundled for the widget in app.json
const FONT = { medium: 'PlusJakartaSans_500Medium', bold: 'PlusJakartaSans_700Bold', heavy: 'PlusJakartaSans_800ExtraBold' };

// Below this height there's room for one row; from it, the digest row fits too
const COMPACT_BELOW = 100;
const DIGEST_FROM = 150;
const PADDING = 16;

const link = (path: string) => ({ clickAction: 'OPEN_URI', clickActionData: { uri: `listenup://${path}` } });

const playIcon = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.6-6.8c.6-.4.6-1.3 0-1.7L9.6 4.4C8.9 4 8 4.4 8 5.2z" fill="${color}"/></svg>`;
const sparkleIcon = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2.5l2 5.6 5.6 2-5.6 2-2 5.6-2-5.6-5.6-2 5.6-2zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" fill="${color}"/></svg>`;

/** "12 min left", "1 h 5 min left" */
function timeLeft(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min left` : `${Math.floor(minutes / 60)} h ${minutes % 60} min left`;
}

function PlayButton({ theme, size, id }: { theme: Theme; size: number; id: string }) {
  const icon = Math.round(size * 0.45);
  return (
    <FlexWidget
      {...link(`listen?doc=${id}&play=1`)}
      accessibilityLabel="Play"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: theme.accent, justifyContent: 'center', alignItems: 'center' }}
    >
      <SvgWidget svg={playIcon(theme.onAccent)} style={{ width: icon, height: icon }} />
    </FlexWidget>
  );
}

function DigestRow({ theme }: { theme: Theme }) {
  return (
    <FlexWidget
      {...link('listen?digest=1')}
      accessibilityLabel="Play today's digest"
      style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.separator }}
    >
      <SvgWidget svg={sparkleIcon(theme.accent)} style={{ width: 16, height: 16 }} />
      <TextWidget text="Today's digest" style={{ fontFamily: FONT.bold, fontSize: 14, color: theme.foreground }} />
      <FlexWidget style={{ flex: 1 }} />
      <TextWidget text="Play ›" style={{ fontFamily: FONT.bold, fontSize: 14, color: theme.accent }} />
    </FlexWidget>
  );
}

/** Nothing to continue: signed out, or nothing played yet */
function Empty({ theme, snapshot, compact }: { theme: Theme; snapshot: WidgetSnapshot; compact: boolean }) {
  const title = snapshot.signedIn ? 'Nothing playing yet' : 'ListenUp';
  const caption = snapshot.signedIn ? 'Find a free classic in Explore' : 'Sign in to pick up where you left off';
  return (
    <FlexWidget
      {...(snapshot.signedIn ? link('explore') : { clickAction: 'OPEN_APP' })}
      accessibilityLabel={`${title}. ${caption}`}
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: theme.surface, borderRadius: 24, padding: compact ? 12 : PADDING, justifyContent: 'center' }}
    >
      <TextWidget text={title} maxLines={1} truncate="END" style={{ fontFamily: FONT.heavy, fontSize: compact ? 14 : 16, color: theme.foreground }} />
      <TextWidget text={caption} maxLines={1} truncate="END" style={{ fontFamily: FONT.medium, fontSize: 12, color: theme.muted }} />
    </FlexWidget>
  );
}

function ContinueWidget({ snapshot, info, theme }: { snapshot: WidgetSnapshot; info: Pick<WidgetInfo, 'width' | 'height'>; theme: Theme }) {
  const compact = info.height < COMPACT_BELOW;
  const item = snapshot.item;
  if (!snapshot.signedIn || !item) return <Empty theme={theme} snapshot={snapshot} compact={compact} />;
  const percent = `${Math.round(item.fraction * 100)}%`;
  const open = link(`listen?doc=${item.id}`);

  if (compact) {
    return (
      <FlexWidget
        {...open}
        accessibilityLabel={`Continue ${item.title}, ${percent}`}
        style={{ width: 'match_parent', height: 'match_parent', backgroundColor: theme.surface, borderRadius: 24, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', flexGap: 10 }}
      >
        <PlayButton theme={theme} size={36} id={item.id} />
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget text={item.title} maxLines={1} truncate="END" style={{ fontFamily: FONT.bold, fontSize: 14, color: theme.foreground }} />
          <TextWidget text={`${percent} · ${timeLeft(item.secondsLeft)}`} maxLines={1} style={{ fontFamily: FONT.medium, fontSize: 12, color: theme.muted }} />
        </FlexWidget>
      </FlexWidget>
    );
  }

  const play = 44;
  const barWidth = Math.max(40, info.width - PADDING * 2 - play - 14);
  return (
    <FlexWidget
      accessibilityLabel={`Continue ${item.title}`}
      style={{ width: 'match_parent', height: 'match_parent', backgroundColor: theme.surface, borderRadius: 24, padding: PADDING, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <FlexWidget {...open} style={{ width: 'match_parent', flexDirection: 'column', flexGap: 2 }}>
        <TextWidget text="CONTINUE LISTENING" style={{ fontFamily: FONT.bold, fontSize: 11, letterSpacing: 0.08, color: theme.label }} />
        <TextWidget text={item.title} maxLines={2} truncate="END" style={{ fontFamily: FONT.heavy, fontSize: 17, color: theme.foreground }} />
        <TextWidget
          text={item.author ? `${item.author} · ${timeLeft(item.secondsLeft)}` : timeLeft(item.secondsLeft)}
          maxLines={1}
          truncate="END"
          style={{ fontFamily: FONT.medium, fontSize: 12, color: theme.muted }}
        />
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 14 }}>
        <FlexWidget {...open} style={{ width: barWidth, height: 6, borderRadius: 3, backgroundColor: theme.track, flexDirection: 'row' }}>
          <FlexWidget style={{ width: Math.max(6, Math.round(barWidth * item.fraction)), height: 6, borderRadius: 3, backgroundColor: theme.accent }} />
        </FlexWidget>
        <PlayButton theme={theme} size={play} id={item.id} />
      </FlexWidget>
      {info.height >= DIGEST_FROM ? <DigestRow theme={theme} /> : null}
    </FlexWidget>
  );
}

/** The widget in both themes; the launcher picks the one matching the phone */
export function renderContinueWidget(snapshot: WidgetSnapshot, info: Pick<WidgetInfo, 'width' | 'height'>): WidgetRepresentation {
  return {
    light: <ContinueWidget snapshot={snapshot} info={info} theme={THEMES.light} />,
    dark: <ContinueWidget snapshot={snapshot} info={info} theme={THEMES.dark} />,
  };
}
