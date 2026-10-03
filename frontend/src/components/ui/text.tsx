import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

const text = tv({
  base: 'font-sans text-foreground',
  variants: {
    variant: {
      /** "ListenUp" wordmark size */
      display: 'text-[44px] font-extrabold leading-[52px] tracking-[-1.2px]',
      /** Screen titles: "Your Soundshelf" */
      h1: 'text-[32px] font-extrabold leading-[38px] tracking-[-0.9px]',
      /** Section heros: "Morning Synthesis", player title */
      h2: 'text-[24px] font-extrabold leading-[30px] tracking-[-0.5px]',
      /** Card titles */
      title: 'text-[17px] font-bold leading-[23px] tracking-[-0.2px]',
      lead: 'text-[16px] leading-[25px] text-muted',
      body: 'text-[15px] leading-[22px]',
      label: 'text-[14px] font-semibold leading-[19px]',
      caption: 'text-[13px] leading-[18px] text-muted',
    },
  },
  defaultVariants: { variant: 'body' },
});

export type TextProps = RNTextProps & VariantProps<typeof text> & { className?: string };

export function Text({ variant, className, ...props }: TextProps) {
  return <RNText className={text({ variant, className })} {...props} />;
}
