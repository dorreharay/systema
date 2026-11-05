import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Check } from '@/components/icons';
import PlusIcon from '@/components/icons/plus-icon';
import { colors } from '@/components/ui/colors';
import EnterSubmits from '@/components/ui/enter-submits';
import { FormError, Input, type InputRef } from '@/components/ui/input';
import Sheet from '@/components/ui/sheet';
import Shortcut from '@/components/ui/shortcut';
import { useToast } from '@/components/ui/toast';
import { describeError, fieldError, isApiError } from '@/lib/errors';
import { clientFromSearch } from '@/lib/format';
import { useI18n, type Translate } from '@/lib/i18n';
import { useCreateClient, useUpdateClient } from '@/lib/queries';
import type { Client } from '@/lib/types';

type ClientFormSheetProps = {
  visible: boolean;
  onClose: () => void;
  // Editing this client; without it a new one is made.
  client?: Pick<Client, 'id' | 'name' | 'phone' | 'email' | 'notes'>;
  // What was typed into a search before choosing "new client": a phone number goes into the phone, anything else into the name.
  search?: string;
  onSaved?: (client: Client) => void;
};

// What to say about a phone number the server refused: whose it is, when another client has it; otherwise that it is not one.
const phoneMessage = (error: unknown, t: Translate) =>
  isApiError(error, 'phone_taken') && error.data?.client
    ? t('error_phone_taken', { name: error.data.client.name })
    : t('error_phone_required');

function ClientForm({ client, search, onClose, onSaved }: Omit<ClientFormSheetProps, 'visible'>) {
  const { t } = useI18n();
  const toast = useToast();
  const create = useCreateClient();
  const update = useUpdateClient();
  const typed = clientFromSearch(search);
  const [name, setName] = useState(client?.name ?? typed.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? typed.phone ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [errors, setErrors] = useState<{ name?: string; phone?: string; email?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const phoneRef = useRef<InputRef>(null);
  const emailRef = useRef<InputRef>(null);
  const notesRef = useRef<InputRef>(null);

  const save = async () => {
    if (saving) return;
    const next = {
      name: name.trim() ? undefined : t('error_name_required'),
      phone: phone.trim() ? undefined : t('error_phone_required'),
    };
    setErrors(next);
    setFormError(undefined);
    if (next.name || next.phone) return;

    setSaving(true);
    try {
      const input = { name, phone, email: email || null, notes: notes || null };
      const saved = client
        ? await update.mutateAsync({ id: client.id, ...input })
        : await create.mutateAsync(input);
      toast.success(client ? t('client_saved') : t('client_added'));
      onClose();
      onSaved?.(saved);
    } catch (error) {
      const emailProblem = fieldError(error, 'email');
      const phoneProblem = fieldError(error, 'phone');
      if (emailProblem || phoneProblem) {
        setErrors({
          email: emailProblem ? t('error_email_invalid') : undefined,
          phone: phoneProblem ? phoneMessage(error, t) : undefined,
        });
      } else setFormError(describeError(error, t));
      setSaving(false);
    }
  };

  return (
    <>
      <EnterSubmits
        className="gap-3 pt-2"
        onSubmit={() => {
          if (!saving) void save();
        }}>
        <Input
          label={t('field_name')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            setErrors((current) => ({ ...current, name: undefined }));
          }}
          error={errors.name}
          autoFocus
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => phoneRef.current?.focus()}
        />
        <Input
          ref={phoneRef}
          label={t('field_phone')}
          value={phone}
          onChangeText={(value) => {
            setPhone(value);
            setErrors((current) => ({ ...current, phone: undefined }));
          }}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="tel"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => emailRef.current?.focus()}
        />
        <Input
          ref={emailRef}
          label={`${t('field_email')} · ${t('optional')}`}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
          error={errors.email}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => notesRef.current?.focus()}
        />
        <Input
          ref={notesRef}
          label={`${t('field_notes')} · ${t('optional')}`}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
        {formError ? <FormError message={formError} /> : null}
      </EnterSubmits>
      <View className="pt-4">
        <Shortcut
          compact
          icon={client ? Check : PlusIcon}
          label={client ? t('save') : t('add_client')}
          color={colors.primary} contentColor={colors.white}
          onPress={save}
          loading={saving}
        />
      </View>
    </>
  );
}

// Add or edit a client. The name and the phone are needed: the rest can be filled in when it comes up.
export default function ClientFormSheet({ visible, onClose, ...rest }: ClientFormSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      form
      title={rest.client ? t('edit_client') : t('add_client')}>
      <ClientForm onClose={onClose} {...rest} />
    </Sheet>
  );
}
