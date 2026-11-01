import { useRef, useState } from 'react';
import { View } from 'react-native';

import AppButton from '@/components/ui/app-button';
import { FormError, Input, type InputRef } from '@/components/ui/input';
import Sheet from '@/components/ui/sheet';
import { useToast } from '@/components/ui/toast';
import { describeError, fieldError } from '@/lib/errors';
import { useI18n } from '@/lib/i18n';
import { useCreateClient, useUpdateClient } from '@/lib/queries';
import type { Client } from '@/lib/types';

type ClientFormSheetProps = {
  visible: boolean;
  onClose: () => void;
  // Editing this client; without it a new one is made.
  client?: Pick<Client, 'id' | 'name' | 'phone' | 'email' | 'notes'>;
  // What was typed into a search before choosing "new client".
  initialName?: string;
  onSaved?: (client: Client) => void;
};

function ClientForm({ client, initialName, onClose, onSaved }: Omit<ClientFormSheetProps, 'visible'>) {
  const { t } = useI18n();
  const toast = useToast();
  const create = useCreateClient();
  const update = useUpdateClient();
  const [name, setName] = useState(client?.name ?? initialName ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const phoneRef = useRef<InputRef>(null);
  const emailRef = useRef<InputRef>(null);
  const notesRef = useRef<InputRef>(null);

  const save = async () => {
    if (saving) return;
    const next = { name: name.trim() ? undefined : t('error_name_required') };
    setErrors(next);
    setFormError(undefined);
    if (next.name) return;

    setSaving(true);
    try {
      const input = { name, phone: phone || null, email: email || null, notes: notes || null };
      const saved = client
        ? await update.mutateAsync({ id: client.id, ...input })
        : await create.mutateAsync(input);
      toast.success(client ? t('client_saved') : t('client_added'));
      onClose();
      onSaved?.(saved);
    } catch (error) {
      const emailProblem = fieldError(error, 'email');
      if (emailProblem) setErrors({ email: t('error_email_invalid') });
      else setFormError(describeError(error, t));
      setSaving(false);
    }
  };

  return (
    <>
      <View className="gap-3 pt-2">
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
          label={`${t('field_phone')} · ${t('optional')}`}
          value={phone}
          onChangeText={setPhone}
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
      </View>
      <View className="pt-4">
        <AppButton
          large
          title={client ? t('save') : t('add_client')}
          onPress={save}
          loading={saving}
        />
      </View>
    </>
  );
}

// Add or edit a client. Only the name is needed: the rest can be filled in when it comes up.
export default function ClientFormSheet({ visible, onClose, ...rest }: ClientFormSheetProps) {
  const { t } = useI18n();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={rest.client ? t('edit_client') : t('add_client')}>
      <ClientForm onClose={onClose} {...rest} />
    </Sheet>
  );
}
