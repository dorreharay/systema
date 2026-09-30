import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { useDropdown } from '@/hooks/use-dropdown';

export type Doctor = {
  id: string;
  firstName: string;
  lastName: string;
  color: string;
  specialty?: string;
  avatarUrl?: string;
};

function getInitials(doctor: Doctor) {
  return `${doctor.firstName.charAt(0)}${doctor.lastName.charAt(0)}`.toUpperCase();
}

function pluralizeDoctors(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return 'лікар';
  }
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) {
    return 'лікарі';
  }
  return 'лікарів';
}

function Avatar({ doctor, size = 26 }: { doctor: Doctor; size?: number }) {
  if (doctor.avatarUrl) {
    return (
      <Image
        source={{ uri: doctor.avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ width: size, height: size, backgroundColor: doctor.color }}>
      <Text className="font-sans text-[8px] font-medium text-white">{getInitials(doctor)}</Text>
    </View>
  );
}

type DoctorSelectProps = {
  doctors: Doctor[];
  allId: string;
  allSelected: boolean;
  selectedIds: string[];
  onChangeSelected: (ids: string[]) => void;
  onToggleAll: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function DoctorSelect({
  doctors,
  allId,
  allSelected,
  selectedIds,
  onChangeSelected,
  onToggleAll,
  open,
  onOpenChange,
}: DoctorSelectProps) {
  const [query, setQuery] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) {
      setQuery('');
    }
  }
  const containerRef = useDropdown(open, onOpenChange);

  const allDoctor = doctors.find((doctor) => doctor.id === allId) ?? doctors[0];
  const realDoctors = doctors.filter((doctor) => doctor.id !== allId);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredDoctors = realDoctors
    .filter((doctor) => `${doctor.firstName} ${doctor.lastName}`.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => {
      const aSelected = selectedIds.includes(a.id) ? 0 : 1;
      const bSelected = selectedIds.includes(b.id) ? 0 : 1;
      return aSelected - bSelected;
    });

  const toggleDoctor = (id: string) => {
    if (allSelected) {
      onChangeSelected([id]);
      return;
    }
    onChangeSelected(
      selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]
    );
  };

  let triggerLabel: string;
  let triggerAvatarDoctor: Doctor = allDoctor;
  if (allSelected) {
    triggerLabel = 'Всі лікарі';
  } else if (selectedIds.length === 0) {
    triggerLabel = 'Лікарів не обрано';
  } else if (selectedIds.length === 1) {
    const only = realDoctors.find((doctor) => doctor.id === selectedIds[0]);
    triggerLabel = only ? `${only.firstName} ${only.lastName}` : '';
    triggerAvatarDoctor = only ?? allDoctor;
  } else {
    triggerLabel = `${selectedIds.length} ${pluralizeDoctors(selectedIds.length)}`;
  }

  return (
    <View ref={containerRef} className="relative z-30 h-14 justify-center bg-white">
      <View className="flex-row items-center px-3 h-full">
        <Pressable
          onPress={() => onOpenChange(!open)}
          className="cursor-pointer flex-row items-center gap-2 h-full">
          <Avatar doctor={triggerAvatarDoctor} />
          <Text
            className="font-sans text-sm font-medium text-[#000000] max-w-40"
            numberOfLines={1}>
            {triggerLabel}
          </Text>
        </Pressable>

        {!allSelected && (
          <Pressable className='w-6 h-full cursor-pointer items-center justify-center' onPress={() => { onToggleAll(); onOpenChange(false); }} hitSlop={6}>
            <Ionicons name="close-circle" size={16} color="#636976" />
          </Pressable>
        )}

        <Pressable className='w-6 h-full cursor-pointer items-center justify-center' onPress={() => onOpenChange(!open)} hitSlop={6}>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color="#636976" />
        </Pressable>
      </View>

      {open && (
        <View className="absolute top-14 right-0 w-64 rounded-lg border border-[#E1E1E1] bg-white">
          <View className="flex-row items-center gap-2 border-b border-b-[#E1E1E1] px-3 py-3">
            <Ionicons name="search-outline" size={14} color="#636976" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Пошук лікаря"
              placeholderTextColor="#636976"
              autoFocus
              className="font-sans flex-1 text-sm text-[#000000] outline-none"
            />
          </View>

          <Pressable
            onPress={onToggleAll}
            className="cursor-pointer flex-row items-center gap-2 border-b border-b-[#E1E1E1] px-3 py-2 hover:bg-[#F1F4F5]">
            <Ionicons
              name={allSelected ? 'checkbox' : 'square-outline'}
              size={18}
              color={allSelected ? '#388098' : '#636976'}
            />
            <Avatar doctor={allDoctor} size={22} />
            <Text className="font-sans text-sm font-medium text-[#000000]" numberOfLines={1}>
              Всі лікарі
            </Text>
          </Pressable>

          <ScrollView className="max-h-72" contentContainerClassName="py-1" nestedScrollEnabled>
            {filteredDoctors.length === 0 ? (
              <View className="px-3 py-2">
                <Text className="font-sans text-xs text-secondary">Нікого не знайдено</Text>
              </View>
            ) : (
              filteredDoctors.map((doctor) => {
                const selected = selectedIds.includes(doctor.id);
                return (
                  <Pressable
                    key={doctor.id}
                    onPress={() => toggleDoctor(doctor.id)}
                    className={`cursor-pointer flex-row items-center gap-2 px-3 py-2 ${
                      selected ? 'bg-[#38809822]' : 'hover:bg-[#F1F4F5]'
                    }`}>
                    <Ionicons
                      name={selected ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={selected ? '#388098' : '#636976'}
                    />
                    <Avatar doctor={doctor} size={22} />
                    <View className="flex-1">
                      <Text className="font-sans text-sm text-[#000000]" numberOfLines={1}>
                        {doctor.firstName} {doctor.lastName}
                      </Text>
                      {doctor.specialty && (
                        <Text className="font-sans text-xs text-secondary" numberOfLines={1}>
                          {doctor.specialty}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
