import { useToast } from 'heroui-native';

import { getErrorMessage } from '@/lib/api/api-error';

import { useHeart, usePublication } from '../hooks';
import { HeartButton } from './heart-button';

/** In the player, for a writing from Explore: ♥ it once you've heard enough (the server knows how much) */
export function CommunityHeart({ publicationId }: { publicationId: string }) {
  const { toast } = useToast();
  const detail = usePublication(publicationId);
  const heart = useHeart();
  const item = detail.data;
  if (!item || item.mine) return null;
  return (
    <HeartButton
      hearts={item.hearts}
      hearted={item.hearted}
      onPress={() => heart.mutate({ id: item.id, on: !item.hearted }, { onError: (e) => toast.show({ label: getErrorMessage(e) }) })}
    />
  );
}
