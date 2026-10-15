import { useMutation } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { Spinner, useToast } from 'heroui-native';
import { Captions, ChevronRight, Gauge, Hash, Timer } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/ui/action-sheet';
import { CloudBackground } from '@/components/ui/cloud-background';
import { GlassCard } from '@/components/ui/glass-card';
import { InlineAlert } from '@/components/ui/inline-alert';
import { PrimaryButton } from '@/components/ui/primary-button';
import { ScreenHeader } from '@/components/ui/settings';
import { Text } from '@/components/ui/text';
import type { DocumentSummary } from '@/features/library/types';
import { getErrorMessage } from '@/lib/api/api-error';
import { haptics } from '@/lib/haptics';
import { usePressScale } from '@/lib/use-press-scale';
import { useTokens } from '@/lib/use-tokens';

import { studioApi, type FormatId, type PageId, type PlatformId, type StudioCatalog } from '../api/studio.api';
import { PostSheet } from '../components/post-sheet';
import { ScriptChoice } from '../components/script-choice';
import { SubtitlesSheet } from '../components/subtitles-sheet';
import { useScripts } from '../hooks/use-scripts';
import { useStudioCatalog } from '../hooks/use-studio';
import { DarkRim, Glyph, lengthLabel, LOOKS, PlatformTile } from '../lib/platform-look';
import { formatClock } from '../lib/time';

type Format = StudioCatalog['formats'][number];

/**
 * Studio's page for social videos: pick the platform at the top (TikTok, Reels and Facebook,
 * YouTube) and below it change to that platform's narration styles (each starts a script, or
 * changes one you have), its tools (the post's caption, hashtags and title; subtitles in its
 * style), and your scripts made for it.
 */
export default function SocialScreen() {
  const { platform } = useLocalSearchParams<{ platform?: PageId }>();
  const insets = useSafeAreaInsets();
  const t = useTokens();
  const catalog = useStudioCatalog();
  const scripts = useScripts();
  const [chosen, setChosen] = useState<PageId | null>(null);
  const [format, setFormat] = useState<Format | null>(null);
  const [tool, setTool] = useState<'post' | 'subtitles' | null>(null);
  const c = catalog.data;
  const page = c?.pages.find((p) => p.id === (chosen ?? platform)) ?? c?.pages[0];

  if (!c || !page) {
    return (
      <CloudBackground>
        <View className="flex-1 items-center justify-center">
          <Spinner color={t.accent} />
        </View>
      </CloudBackground>
    );
  }

  const all = scripts.data?.items ?? [];
  const mine = all.filter((s) => s.studio?.platform && page.platforms.includes(s.studio.platform));
  // The page's own scripts first in the tools' pickers
  const forTools = [...mine, ...all.filter((s) => !mine.includes(s))];
  const formats = page.formats.flatMap((f) => c.formats.find((x) => x.id === f) ?? []);
  const platformLabel = (p: PlatformId) => c.platforms.find((x) => x.id === p)?.label ?? p;

  return (
    <CloudBackground>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 6, paddingBottom: insets.bottom + 40, paddingHorizontal: 20, gap: 22 }}>
        <View className="gap-1.5">
          <ScreenHeader title="Social videos" onBack={router.back} />
          <Text className="text-[15px] leading-[22px] text-muted">Pick where your video is going. Each platform has its own narration styles, captions and subtitles.</Text>
        </View>

        <PlatformSwitch pages={c.pages.map((p) => p.id)} value={page.id} onChange={setChosen} />

        <Animated.View key={page.id} entering={FadeInUp.duration(240)} style={{ gap: 22 }}>
          <Text variant="caption" className="-mt-2 px-1">{page.about}</Text>

          <Section title="Narration styles" note="Each one sets how the voice tells it, and starts you off with a template.">
            {formats.map((f) => (
              <GlassCard key={f.id} onPress={() => setFormat(f)} accessibilityLabel={`${f.label}. ${f.about}`} className="flex-row items-center gap-3 p-4">
                <View className="flex-1 gap-1">
                  <Text className="text-[16px] font-semibold">{f.label}</Text>
                  <Text variant="caption">{f.about}</Text>
                  <View className="flex-row gap-1.5 pt-1">
                    <Chip icon={<Timer size={12} color={t.accent} />} label={lengthLabel(f.lengthSec)} />
                    {page.platforms.length > 1 ? <Chip label={platformLabel(page.platforms.includes(f.platform) ? f.platform : page.platforms[0])} /> : null}
                    {f.speed !== 1 ? <Chip icon={<Gauge size={12} color={t.accent} />} label={`${f.speed}×`} /> : null}
                  </View>
                </View>
                <ChevronRight size={18} color={t.muted} />
              </GlassCard>
            ))}
          </Section>

          <Section title="Tools">
            <GlassCard className="p-1.5">
              <ToolRow icon={<Hash size={19} color={t.foreground} />} label="Caption, hashtags and title" detail={`Written for ${page.label} from your script`} onPress={() => setTool('post')} />
              <ToolRow icon={<Captions size={19} color={t.foreground} />} label="Subtitles" detail="Timed to your voiceover, in this platform’s style" onPress={() => setTool('subtitles')} />
            </GlassCard>
          </Section>

          <Section title={`Your ${page.label} scripts`}>
            {mine.length ? (
              <View className="gap-2">
                {mine.map((s) => (
                  <ScriptRow key={s.id} script={s} format={c.formats.find((f) => f.id === s.studio?.format)?.label ?? null} />
                ))}
              </View>
            ) : (
              <Text variant="caption" className="px-1">Scripts you start from a style here, or set to {page.label} in a script, show up here.</Text>
            )}
          </Section>
        </Animated.View>
      </ScrollView>

      <FormatSheet format={format} page={page} scripts={forTools} platformLabel={platformLabel} onClose={() => setFormat(null)} />
      <PostSheet visible={tool === 'post'} onClose={() => setTool(null)} scripts={forTools} platforms={page.platforms} catalog={c} />
      <SubtitlesSheet visible={tool === 'subtitles'} onClose={() => setTool(null)} scripts={forTools} platforms={page.platforms} catalog={c} />
    </CloudBackground>
  );
}

/** The platforms side by side; the chosen one filled with its own colours */
function PlatformSwitch({ pages, value, onChange }: { pages: PageId[]; value: PageId; onChange: (id: PageId) => void }) {
  return (
    <View className="flex-row gap-2.5" accessibilityRole="tablist">
      {pages.map((id) => (
        <SwitchTab
          key={id}
          id={id}
          active={id === value}
          onPress={() => {
            if (id === value) return;
            haptics.tap();
            onChange(id);
          }}
        />
      ))}
    </View>
  );
}

function SwitchTab({ id, active, onPress }: { id: PageId; active: boolean; onPress: () => void }) {
  const look = LOOKS[id];
  const press = usePressScale(0.95);
  const glow = look.colors[look.colors.length - 1];
  return (
    <Animated.View style={[press.style, { flex: 1 }]}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${look.name}, ${look.covers}`}
        className={`overflow-hidden rounded-3xl ${active ? '' : 'bg-surface dark:border dark:border-border'}`}
        style={active ? { boxShadow: `0px 10px 22px ${glow}59` } : undefined}
      >
        {active ? (
          <LinearGradient colors={look.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ alignItems: 'center', gap: 4, paddingTop: 14, paddingBottom: 13, paddingHorizontal: 4 }}>
            {look.edge ? <DarkRim radius={24} /> : null}
            <View className="mb-1 size-[38px] items-center justify-center rounded-xl bg-white/20">
              <Glyph page={id} size={19} />
            </View>
            <Text className="text-[15px] font-bold text-white">{look.name}</Text>
            <Text className="text-[11.5px] font-medium text-white/80" numberOfLines={1}>{look.covers}</Text>
          </LinearGradient>
        ) : (
          <View className="items-center gap-1 px-1 pb-[13px] pt-3.5">
            <View className="mb-1">
              <PlatformTile page={id} size={38} />
            </View>
            <Text className="text-[15px] font-semibold">{look.name}</Text>
            <Text variant="caption" className="text-[11.5px]" numberOfLines={1}>{look.covers}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/** A style up close: start a script in it, or give it to one you have */
function FormatSheet({
  format,
  page,
  scripts,
  platformLabel,
  onClose,
}: {
  format: Format | null;
  page: StudioCatalog['pages'][number];
  scripts: DocumentSummary[];
  platformLabel: (p: PlatformId) => string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [choosing, setChoosing] = useState(false);
  const platform = format && (page.platforms.includes(format.platform) ? format.platform : page.platforms[0]);
  const apply = useMutation({
    mutationFn: (script: DocumentSummary) => studioApi.update(script.id, { platform, format: format!.id as FormatId }),
    onSuccess: ({ partsChanged }, script) => {
      haptics.success();
      toast.show({ variant: 'success', label: `${script.title} is now ${format?.label}`, description: partsChanged ? 'Its parts are voiced again when you play or export it.' : undefined });
      close();
      router.push({ pathname: '/script/[id]', params: { id: script.id } });
    },
    onError: haptics.error,
  });
  const close = () => {
    setChoosing(false);
    onClose();
  };
  return (
    <ActionSheet visible={!!format} onClose={close} title={format?.label ?? ''}>
      {format && platform ? (
        <View className="gap-4">
          <Text className="text-[15px] leading-[22px] text-muted">{format.about}</Text>
          <Text variant="caption">
            {`For ${platformLabel(platform)} · usually ${lengthLabel(format.lengthSec)}${format.speed !== 1 ? ` · read at ${format.speed}×` : ''}. The template is in English and Bangla.`}
          </Text>
          {choosing ? (
            <>
              <ScriptChoice scripts={scripts} onPick={(s) => apply.mutate(s)} empty="You don’t have a script yet. Start one in this style instead." />
              <InlineAlert message={apply.error ? getErrorMessage(apply.error) : null} />
            </>
          ) : (
            <>
              <PrimaryButton
                label="Start a script"
                onPress={() => {
                  close();
                  router.push({ pathname: '/script/new', params: { platform, format: format.id } });
                }}
              />
              <PrimaryButton label="Use it on one of my scripts" variant="secondary" onPress={() => setChoosing(true)} />
            </>
          )}
        </View>
      ) : null}
    </ActionSheet>
  );
}

function ScriptRow({ script, format }: { script: DocumentSummary; format: string | null }) {
  const t = useTokens();
  return (
    <GlassCard onPress={() => router.push({ pathname: '/script/[id]', params: { id: script.id } })} accessibilityLabel={script.title} className="flex-row items-center gap-3 p-3.5">
      <View className="h-11 w-[60px] items-center justify-center rounded-2xl bg-accent-soft-bg">
        <Text className="text-[14px] font-bold text-accent-soft-fg" style={{ fontVariant: ['tabular-nums'] }}>{formatClock(script.estimatedDurationSec)}</Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-[15px] font-semibold" numberOfLines={1}>{script.title}</Text>
        {format ? <Text variant="caption">{format}</Text> : null}
      </View>
      <ChevronRight size={16} color={t.muted} />
    </GlassCard>
  );
}

function ToolRow({ icon, label, detail, onPress }: { icon: ReactNode; label: string; detail: string; onPress: () => void }) {
  const t = useTokens();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" className="min-h-[56px] flex-row items-center gap-3 rounded-2xl px-3 py-3 active:bg-default">
      {icon}
      <View className="flex-1 gap-0.5">
        <Text className="text-[16px] font-medium">{label}</Text>
        <Text variant="caption">{detail}</Text>
      </View>
      <ChevronRight size={18} color={t.muted} />
    </Pressable>
  );
}

function Chip({ icon, label }: { icon?: ReactNode; label: string }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-accent-soft-bg px-2 py-0.5">
      {icon}
      <Text className="text-[12px] font-medium text-accent-soft-fg">{label}</Text>
    </View>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View className="gap-2.5">
      <View className="gap-0.5 px-1">
        <Text variant="label" className="text-muted">{title}</Text>
        {note ? <Text variant="caption">{note}</Text> : null}
      </View>
      {children}
    </View>
  );
}
