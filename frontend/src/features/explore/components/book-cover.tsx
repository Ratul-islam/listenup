import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

import type { CatalogItem } from '../api/catalog.api';

// Deep, bookish two-tone covers; each title keeps the same one
const COVERS: [string, string][] = [
  ['#5b4bc4', '#8b7cf0'],
  ['#1f5f73', '#3f9bb3'],
  ['#8a2f45', '#cf6680'],
  ['#2f6343', '#5fa572'],
  ['#8c5a1c', '#d59a43'],
  ['#3c4266', '#6f78a6'],
  ['#6b2f7a', '#b06ac2'],
];

const coverFor = (id: string) => COVERS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % COVERS.length];

/**
 * A title's cover (a classic, or a listener's writing). With a picture, it's
 * the picture. Without one, the title's name and author set on a soft
 * gradient, like a cloth binding. A check in the corner when it's already on
 * the shelf.
 */
export function BookCover({
  item,
  width,
  added,
  imageUrl,
  glyph,
}: {
  item: Pick<CatalogItem, 'id' | 'title' | 'author'>;
  width: number;
  added?: boolean;
  imageUrl?: string | null;
  /** On a small drawn cover, a mark at its foot in place of the title (what kind of thing it is) */
  glyph?: ReactNode;
}) {
  const [from, to] = coverFor(item.id);
  const height = Math.round(width * 1.4);
  const small = width < 80;
  return (
    <View style={{ width, height, boxShadow: '0px 6px 16px rgba(40, 32, 90, 0.18)' }} className={`overflow-hidden ${small ? 'rounded-lg' : 'rounded-xl'}`}>
      {imageUrl ? (
        // The link is signed afresh each time it's sent, so the picture is kept under the part that stays the same
        <Image source={{ uri: imageUrl, cacheKey: imageUrl.split('?')[0] }} style={{ flex: 1, backgroundColor: from }} contentFit="cover" transition={150} accessibilityIgnoresInvertColors />
      ) : (
        <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: small ? 6 : 12 }}>
          {/* The spine's crease */}
          <View className="absolute inset-y-0 left-1.5 w-px bg-white/25" />
          {small && glyph ? (
            // Beside its title in a list, a small cover doesn't repeat it: its colour and its mark are enough
            <View className="flex-1 justify-end pl-1">{glyph}</View>
          ) : small ? (
            <Text className="pl-1 text-[9px] font-bold leading-[12px] text-white" numberOfLines={4}>
              {item.title}
            </Text>
          ) : (
            <View className="flex-1 justify-between pl-1.5">
              <Text className="font-bold text-white" style={{ fontSize: width > 140 ? 18 : 15, lineHeight: width > 140 ? 24 : 20 }} numberOfLines={5}>
                {item.title}
              </Text>
              <Text className="text-[11px] font-medium text-white/80" numberOfLines={2}>
                {item.author}
              </Text>
            </View>
          )}
        </LinearGradient>
      )}
      {added ? (
        <View className="absolute right-1.5 top-1.5 size-5 items-center justify-center rounded-full bg-white">
          <Check size={12} color={from} strokeWidth={3} />
        </View>
      ) : null}
    </View>
  );
}
