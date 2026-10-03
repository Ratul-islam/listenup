import { PrimaryButton } from './primary-button';

interface SubmitButtonProps {
  label: string;
  onPress: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  className?: string;
}

/** Form submit: the primary pill, keeping its label visible while loading */
export function SubmitButton(props: SubmitButtonProps) {
  return <PrimaryButton {...props} />;
}
