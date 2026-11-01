import { Text } from 'react-native';

type FormMessageProps = {
  message: string;
  tone?: 'error' | 'success';
};

// A sentence about the whole form: the server refused it, or the last step worked.
export default function FormMessage({ message, tone = 'error' }: FormMessageProps) {
  return (
    <Text
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      className={`text-center text-base ${tone === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
      {message}
    </Text>
  );
}
