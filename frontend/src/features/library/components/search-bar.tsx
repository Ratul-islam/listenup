import { useToast } from 'heroui-native';
import { Mic, Search, X } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { getErrorMessage } from '@/lib/api/api-error';
import { useTokens } from '@/lib/use-tokens';
import { phoneVoice } from '@/modules/phone-voice';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export const SearchBar = forwardRef<TextInput, SearchBarProps>(function SearchBar({ value, onChange }, ref) {
  const t = useTokens();
  const { toast } = useToast();

  // Voice search with the phone's own speech recognition (free, works in every app language)
  const listen = async () => {
    try {
      const heard = await phoneVoice.recognize({ prompt: 'Say a title or topic' });
      if (heard) onChange(heard);
    } catch (e) {
      toast.show({ variant: 'danger', label: getErrorMessage(e) });
    }
  };

  return (
    <View className="h-12 flex-1 flex-row items-center gap-2.5 rounded-2xl bg-surface pl-3.5 pr-1.5 dark:border dark:border-border">
      <Search size={18} color={t.muted} />
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChange}
        placeholder="Search your shelf"
        placeholderTextColor={t.muted}
        returnKeyType="search"
        accessibilityLabel="Search your Soundshelf"
        className="flex-1 font-sans text-[15px] text-foreground"
      />
      {value ? (
        <Pressable onPress={() => onChange('')} hitSlop={8} accessibilityLabel="Clear search" className="size-9 items-center justify-center rounded-full active:bg-default">
          <X size={16} color={t.muted} />
        </Pressable>
      ) : phoneVoice.isAvailable ? (
        <Pressable onPress={() => void listen()} hitSlop={8} accessibilityLabel="Search by voice" className="size-9 items-center justify-center rounded-full active:bg-default">
          <Mic size={17} color={t.muted} />
        </Pressable>
      ) : null}
    </View>
  );
});
