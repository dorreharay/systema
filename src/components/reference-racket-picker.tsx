import { useState } from 'react';

import SearchPicker from '@/components/ui/search-picker';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { describeError } from '@/lib/errors';
import { racketName } from '@/lib/format';
import { useI18n } from '@/lib/i18n';
import { useCreateRacket, useReferenceRacketPages } from '@/lib/queries';
import type { ReferenceRacket } from '@/lib/types';

type ReferenceRacketPickerProps = {
  visible: boolean;
  // The picker was dismissed, or a racket was picked (and is being made the client's own).
  onClose: () => void;
  // The client that the racket is for.
  owner: { id: string };
  // The first row, for a racket that is not in the list: it is typed in. Gets what was typed in the search. The
  // picker is not closed by it: the one who asks closes it, and goes on to the form.
  onCreate: (name: string) => void;
};

/**
 * A racket for a client, picked from the reference list: the whole list, whatever the catalog has and whatever is in
 * stock, a page at a time as it is scrolled, and the part of it that fits what is typed. A tap on one makes it the
 * client's own racket at once.
 */
export default function ReferenceRacketPicker({ visible, onClose, owner, onCreate }: ReferenceRacketPickerProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const reference = useReferenceRacketPages(query, visible);
  const create = useCreateRacket();

  const add = async (item: ReferenceRacket) => {
    try {
      await create.mutateAsync({ client_id: owner.id, brand: item.brand, model: item.model });
      toast.success(t('racket_added'));
    } catch (error) {
      toast.error(describeError(error, t));
    }
  };

  return (
    <SearchPicker
      visible={visible}
      onClose={onClose}
      title={t('field_racket')}
      placeholder={t('rackets_search_placeholder')}
      items={reference.data?.pages.flatMap((page) => page.items) ?? []}
      keyOf={(item) => item.id}
      loading={reference.isPending}
      // The list comes a page at a time, as it is scrolled.
      loadingMore={reference.isFetchingNextPage}
      onEndReached={() => {
        if (reference.hasNextPage && !reference.isFetchingNextPage) void reference.fetchNextPage();
      }}
      error={reference.isError ? reference.error : undefined}
      onRetry={() => reference.refetch()}
      onQueryChange={setQuery}
      createLabel={() => t('add_racket')}
      onCreate={onCreate}
      renderItem={(item) => <Text className="text-base font-medium">{racketName(item)}</Text>}
      onSelect={(item) => {
        onClose();
        void add(item);
      }}
    />
  );
}
