import { Description, FieldError, Input, InputGroup, Label, TextField, useThemeColor } from 'heroui-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState, type ComponentProps } from 'react';
import { Controller, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { Pressable } from 'react-native';

type InputProps = Omit<
  ComponentProps<typeof Input>,
  'value' | 'defaultValue' | 'onChangeText' | 'onBlur' | 'secureTextEntry'
>;

interface FormTextFieldProps<T extends FieldValues> extends InputProps {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  /** Password field with a show/hide toggle */
  secure?: boolean;
}

/** react-hook-form bound text field: label, input, helper text and error */
export function FormTextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  secure,
  ...inputProps
}: FormTextFieldProps<T>) {
  const [revealed, setRevealed] = useState(false);
  const muted = useThemeColor('muted');

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const shared = {
          ref: field.ref,
          value: field.value,
          onChangeText: field.onChange,
          onBlur: field.onBlur,
          ...inputProps,
        };

        return (
          <TextField isInvalid={!!fieldState.error}>
            <Label>{label}</Label>
            {secure ? (
              <InputGroup>
                <InputGroup.Input
                  {...shared}
                  secureTextEntry={!revealed}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <InputGroup.Suffix>
                  <Pressable
                    onPress={() => setRevealed((v) => !v)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={revealed ? 'Hide password' : 'Show password'}
                    className="h-full justify-center px-3.5"
                  >
                    {revealed ? <EyeOff size={20} color={muted} /> : <Eye size={20} color={muted} />}
                  </Pressable>
                </InputGroup.Suffix>
              </InputGroup>
            ) : (
              <Input {...shared} />
            )}
            {description && !fieldState.error ? <Description>{description}</Description> : null}
            <FieldError>{fieldState.error?.message}</FieldError>
          </TextField>
        );
      }}
    />
  );
}
