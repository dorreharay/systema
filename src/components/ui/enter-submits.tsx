import { View, type ViewProps } from 'react-native';

type EnterSubmitsProps = ViewProps & {
  className?: string;
  // What Enter does in a field of one line in here: presses the main button of the form (the web only; see enter-submits.web.tsx).
  onSubmit: () => void;
};

/**
 * The view that holds the fields of a form. On the phone it is a plain `View`: the keys of its keyboard do what they always did
 * (go to the next field, close the keyboard). On the web, Enter in a field of one line presses the form's main button, which is what
 * a keyboard at a desk expects of a form.
 */
export default function EnterSubmits({ onSubmit: _onSubmit, ...props }: EnterSubmitsProps) {
  return <View {...props} />;
}
