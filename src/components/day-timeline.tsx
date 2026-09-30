import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import DoctorSelect, { Doctor } from '@/components/doctor-select';
import MonthCalendar, { CalendarViewMode } from '@/components/month-calendar';
import { useDropdown } from '@/hooks/use-dropdown';

export const START_HOUR = 7;
export const END_HOUR = 24;
export const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 32;
const MAX_VISIBLE_COLUMNS = 4;
const COLUMN_HEADER_HEIGHT = 40;

const SLOTS = Array.from({ length: ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES }, (_, i) => {
  const totalMinutes = START_HOUR * 60 + i * SLOT_MINUTES;
  return {
    minutes: totalMinutes,
    hour: Math.floor(totalMinutes / 60),
    minute: totalMinutes % 60,
  };
});

function formatTime(hour: number, minute: number) {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function snapMinutes(minutes: number) {
  return Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES;
}

const ANY_DOCTOR_ID = '__any__';

const PHONE_PREFIX = '+38';
const PHONE_NATIONAL_DIGITS = 10;

function formatPhoneUA(raw: string) {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('38')) {
    digits = digits.slice(2);
  }
  digits = digits.slice(0, PHONE_NATIONAL_DIGITS);

  if (digits.length === 0) {
    return PHONE_PREFIX;
  }

  const areaCode = digits.slice(0, 3);
  const part1 = digits.slice(3, 6);
  const part2 = digits.slice(6, 8);
  const part3 = digits.slice(8, 10);

  let result = `${PHONE_PREFIX} (${areaCode}`;
  if (areaCode.length === 3) {
    result += ')';
  }
  if (part1) {
    result += ` ${part1}`;
  }
  if (part2) {
    result += `-${part2}`;
  }
  if (part3) {
    result += `-${part3}`;
  }
  return result;
}

function clampSlotIndex(y: number) {
  'worklet';
  const index = Math.floor(y / SLOT_HEIGHT);
  return Math.max(0, Math.min(SLOTS.length - 1, index));
}

const START_TIME_OPTIONS = SLOTS.map((slot) => slot.minutes);
const END_TIME_OPTIONS = SLOTS.map((slot) => slot.minutes + SLOT_MINUTES);

type LaidOutAppointment = {
  id: string;
  startMinutes: number;
  durationMinutes: number;
  title: string;
  reason: string;
  phone?: string;
  color: string;
  column: number;
  columns: number;
};

type DoctorColumn = {
  doctorId: string;
  doctorLabel: string;
  specialty: string;
  color: string;
  events: LaidOutAppointment[];
};

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

type QuickBookService = {
  id: string;
  name: string;
  durationMinutes: number;
};

type QuickBookDoctor = {
  id: string;
  label: string;
  color: string;
  specialty: string;
  services: QuickBookService[];
};

function aggregateServices(doctors: QuickBookDoctor[]): QuickBookService[] {
  const byId = new Map<string, QuickBookService>();
  for (const doctor of doctors) {
    for (const service of doctor.services) {
      byId.set(service.id, service);
    }
  }
  return Array.from(byId.values());
}

type AvailableSlotEntry = {
  doctorId: string;
  startMinutes: number;
};

type AvailableDaySlots = {
  date: Date;
  slots: AvailableSlotEntry[];
};

type DayTimelineProps = {
  date: Date;
  doctors: DoctorColumn[];
  onAddSlot: (
    doctorId: string,
    startMinutes: number,
    durationMinutes: number,
    name: string,
    phone: string,
    reason: string
  ) => void;
  onRemoveEvent: (id: string) => void;
  onMoveEvent: (id: string, newStartMinutes: number) => void;
  onUpdateEvent: (
    id: string,
    updates: {
      title: string;
      phone: string;
      reason: string;
      startMinutes: number;
      durationMinutes: number;
    }
  ) => void;
  onSelectDate: (date: Date) => void;
  viewMode: CalendarViewMode;
  onViewModeChange: (mode: CalendarViewMode) => void;
  calendarOpen: boolean;
  onCalendarOpenChange: (open: boolean) => void;
  doctorSelect: DoctorSelectProps;
  knownPatients: { name: string; phone: string }[];
  allDoctors: QuickBookDoctor[];
  onFindAvailableSlots: (doctorIds: string[], durationMinutes: number) => AvailableDaySlots[];
};

type SlotFormState = {
  mode: 'create' | 'edit';
  id?: string;
  doctorId: string;
  doctorLabel: string;
  color: string;
  startMinutes: number;
  durationMinutes: number;
};

type TimelineEventProps = {
  event: LaidOutAppointment;
  top: number;
  height: number;
  rangeStartMinutes: number;
  rangeEndMinutes: number;
  accessibilityLabel: string;
  tooltip?: string;
  onPress: () => void;
  onMove: (newStartMinutes: number) => void;
  confirmPending: boolean;
  children: React.ReactNode;
};

function TimelineEvent({
  event,
  top,
  height,
  rangeStartMinutes,
  rangeEndMinutes,
  accessibilityLabel,
  tooltip,
  onPress,
  onMove,
  confirmPending,
  children,
}: TimelineEventProps) {
  const translateY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const [previewStart, setPreviewStart] = useState<number | null>(null);
  const [wasConfirmPending, setWasConfirmPending] = useState(confirmPending);
  if (confirmPending !== wasConfirmPending) {
    setWasConfirmPending(confirmPending);
    if (!confirmPending) {
      setPreviewStart(null);
    }
  }

  const clampStart = (rawStart: number) => {
    const maxStart = rangeEndMinutes - event.durationMinutes;
    return Math.max(rangeStartMinutes, Math.min(rawStart, maxStart));
  };

  const updatePreview = (rawDeltaMinutes: number) => {
    const nextStart = clampStart(event.startMinutes + snapMinutes(rawDeltaMinutes));
    setPreviewStart((current) => (current === nextStart ? current : nextStart));
  };

  const commitMove = (rawDeltaMinutes: number) => {
    const nextStart = clampStart(event.startMinutes + snapMinutes(rawDeltaMinutes));
    if (nextStart !== event.startMinutes) {
      // Keep the time tooltip visible until the move is confirmed or cancelled.
      setPreviewStart(nextStart);
      onMove(nextStart);
    } else {
      setPreviewStart(null);
    }
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(100)
    .onStart(() => {
      dragging.value = true;
      scheduleOnRN(setPreviewStart, event.startMinutes);
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
      scheduleOnRN(updatePreview, e.translationY);
    })
    .onEnd((e) => {
      dragging.value = false;
      translateY.value = 0;
      scheduleOnRN(commitMove, e.translationY);
    });

  const tap = Gesture.Tap().onEnd(() => {
    scheduleOnRN(onPress);
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    zIndex: dragging.value ? 30 : 0,
    opacity: dragging.value ? 0.97 : 1,
    borderTopWidth: dragging.value ? 2 : 1,
    borderRightWidth: dragging.value ? 2 : 1,
    borderBottomWidth: dragging.value ? 2 : 1,
    borderTopColor: dragging.value ? event.color : '#00000014',
    borderRightColor: dragging.value ? event.color : '#00000014',
    borderBottomColor: dragging.value ? event.color : '#00000014',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: dragging.value ? 0.35 : 0,
    shadowRadius: dragging.value ? 10 : 0,
    elevation: dragging.value ? 10 : 0,
  }));

  const previewEnd = previewStart === null ? null : previewStart + event.durationMinutes;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        {...(tooltip ? { title: tooltip } : {})}
        className="absolute cursor-pointer justify-center rounded-md px-2 py-1"
        style={[
          {
            top,
            height,
            left: `${(event.column / event.columns) * 100}%`,
            width: `${100 / event.columns}%`,
            backgroundColor: `${event.color}22`,
            borderLeftWidth: 4,
            borderLeftColor: event.color,
          },
          animatedStyle,
        ]}>
        {previewStart !== null && previewEnd !== null && (
          <View pointerEvents="none" className="absolute left-0 items-start pb-1" style={{ bottom: '100%' }}>
            <View className="rounded-md bg-[#111111] px-2 py-0.5">
              <Text
                className="font-sans text-[11px] font-medium text-white"
                numberOfLines={1}>
                {formatTime(Math.floor(previewStart / 60), previewStart % 60)}–
                {formatTime(Math.floor(previewEnd / 60), previewEnd % 60)}
              </Text>
            </View>
          </View>
        )}
        <View className="h-full w-full overflow-hidden justify-center">{children}</View>
      </Animated.View>
    </GestureDetector>
  );
}

type SlotColumnProps = {
  doctorId: string;
  color: string;
  coveredMinutes: Set<number>;
  onCreateSlot: (doctorId: string, startMinutes: number, durationMinutes: number) => void;
};

function SlotColumn({ doctorId, color, coveredMinutes, onCreateSlot }: SlotColumnProps) {
  const [dragRange, setDragRange] = useState<{ start: number; end: number } | null>(null);
  const dragStartIndex = useSharedValue(0);

  const setRange = (start: number, end: number) => {
    setDragRange((current) =>
      current && current.start === start && current.end === end ? current : { start, end }
    );
  };

  const commitRange = (start: number, end: number) => {
    setDragRange(null);
    const startIndex = Math.min(start, end);
    const endIndex = Math.max(start, end);
    onCreateSlot(doctorId, SLOTS[startIndex].minutes, (endIndex - startIndex + 1) * SLOT_MINUTES);
  };

  const pan = Gesture.Pan()
    .activateAfterLongPress(30)
    .onStart((e) => {
      const index = clampSlotIndex(e.y);
      dragStartIndex.value = index;
      scheduleOnRN(setRange, index, index);
    })
    .onUpdate((e) => {
      const index = clampSlotIndex(e.y);
      scheduleOnRN(setRange, dragStartIndex.value, index);
    })
    .onEnd((e) => {
      const index = clampSlotIndex(e.y);
      scheduleOnRN(commitRange, dragStartIndex.value, index);
    });

  const tap = Gesture.Tap().onEnd((e) => {
    const index = clampSlotIndex(e.y);
    scheduleOnRN(commitRange, index, index);
  });

  const gesture = Gesture.Exclusive(pan, tap);

  const previewTop = dragRange ? Math.min(dragRange.start, dragRange.end) * SLOT_HEIGHT : 0;
  const previewHeight = dragRange
    ? (Math.abs(dragRange.end - dragRange.start) + 1) * SLOT_HEIGHT
    : 0;
  const previewStartMinutes = dragRange
    ? SLOTS[Math.min(dragRange.start, dragRange.end)].minutes
    : 0;
  const previewEndMinutes = dragRange
    ? SLOTS[Math.max(dragRange.start, dragRange.end)].minutes + SLOT_MINUTES
    : 0;

  return (
    <GestureDetector gesture={gesture}>
      <View className="cursor-pointer">
        {SLOTS.map((slot) => (
          <View
            key={slot.minutes}
            className={`group items-center justify-center border-t-1 border-t-[#E1E1E1] ${
              slot.minute === 30 ? 'border-dashed' : ''
            }`}
            style={{ height: SLOT_HEIGHT }}>
            {!coveredMinutes.has(slot.minutes) && !dragRange && (
              <View className="opacity-0 group-hover:opacity-100 w-full h-full justify-center px-3">
                <Text className="font-sans text-xs text-[#000000BC]" numberOfLines={1}>
                  {formatTime(slot.hour, slot.minute)}
                </Text>
              </View>
            )}
          </View>
        ))}

        {dragRange && (
          <View
            pointerEvents="none"
            className="absolute inset-x-0 rounded-md border-2 border-dashed"
            style={{
              top: previewTop,
              height: previewHeight,
              borderColor: color,
              backgroundColor: `${color}22`,
            }}>
            <View className="absolute left-0 items-start pb-1" style={{ bottom: '100%' }}>
              <View className="rounded-md bg-[#111111] px-2 py-0.5">
                <Text className="font-sans text-[11px] font-medium text-white" numberOfLines={1}>
                  {formatTime(Math.floor(previewStartMinutes / 60), previewStartMinutes % 60)}–
                  {formatTime(Math.floor(previewEndMinutes / 60), previewEndMinutes % 60)}
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </GestureDetector>
  );
}

type TimeSelectProps = {
  minutes: number;
  options: number[];
  onChange: (minutes: number) => void;
};

function TimeSelect({ minutes, options, onChange }: TimeSelectProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useDropdown(open, setOpen);

  return (
    <View ref={containerRef} className="relative">
      <Pressable
        onPress={() => setOpen((current) => !current)}
        className="cursor-pointer flex-row items-center gap-1 rounded-md border border-[#E1E1E1] px-2 py-1">
        <Text className="w-11 text-center font-sans text-sm text-[#000000]">
          {formatTime(Math.floor(minutes / 60), minutes % 60)}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color="#636976" />
      </Pressable>

      {open && (
        <View className="absolute top-9 left-0 z-40 max-h-48 w-20 rounded-lg border border-[#E1E1E1] bg-white">
          <ScrollView className="max-h-48" nestedScrollEnabled>
            {options.map((value) => (
              <Pressable
                key={value}
                onPress={() => {
                  onChange(value);
                  setOpen(false);
                }}
                className={`cursor-pointer px-3 py-1.5 ${
                  value === minutes ? 'bg-[#38809822]' : 'hover:bg-[#F1F4F5]'
                }`}>
                <Text className="font-sans text-sm text-[#000000]">
                  {formatTime(Math.floor(value / 60), value % 60)}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

type SearchableSelectProps<T> = {
  items: T[];
  value: T | null;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string | undefined;
  placeholder: string;
  searchPlaceholder: string;
  onSelect: (item: T) => void;
  disabled?: boolean;
  showSubLabelInTrigger?: boolean;
  dropUp?: boolean;
};

function SearchableSelect<T>({
  items,
  value,
  getKey,
  getLabel,
  getSubLabel,
  placeholder,
  searchPlaceholder,
  onSelect,
  disabled = false,
  showSubLabelInTrigger = false,
  dropUp = false,
}: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useDropdown(open, setOpen);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = items.filter((item) =>
    getLabel(item).toLowerCase().includes(normalizedQuery)
  );
  const triggerSubLabel = showSubLabelInTrigger ? value && getSubLabel?.(value) : undefined;

  return (
    <View ref={containerRef} className="relative">
      <Pressable
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        className={`flex-row items-center justify-between rounded-lg border border-[#E1E1E1] px-3 py-2 ${
          disabled ? 'cursor-not-allowed bg-[#F1F4F5]' : 'cursor-pointer'
        }`}>
        <View className="flex-1">
          <Text
            className={`font-sans text-sm ${value ? 'text-[#000000]' : 'text-secondary'}`}
            numberOfLines={1}>
            {value ? getLabel(value) : placeholder}
          </Text>
          {triggerSubLabel && (
            <Text className="font-sans text-xs text-secondary" numberOfLines={1}>
              {triggerSubLabel}
            </Text>
          )}
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color="#636976" />
      </Pressable>

      {open && !disabled && (
        <View
          className={`absolute left-0 right-0 z-40 max-h-56 rounded-lg border border-[#E1E1E1] bg-white ${
            dropUp ? 'mb-2' : 'top-11'
          }`}
          style={dropUp ? { bottom: '100%' } : undefined}>
          <View className="flex-row items-center gap-2 border-b border-b-[#E1E1E1] px-3 py-2">
            <Ionicons name="search-outline" size={14} color="#636976" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor="#636976"
              autoFocus
              className="font-sans flex-1 text-sm text-[#000000] outline-none"
            />
          </View>
          <ScrollView className="max-h-44" nestedScrollEnabled>
            {filteredItems.length === 0 ? (
              <Text className="px-3 py-2 font-sans text-sm text-secondary">Нічого не знайдено</Text>
            ) : (
              filteredItems.map((item) => {
                const key = getKey(item);
                const selected = value !== null && getKey(value) === key;
                const subLabel = getSubLabel?.(item);
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      onSelect(item);
                      setQuery('');
                      setOpen(false);
                    }}
                    className={`cursor-pointer px-3 py-2 ${
                      selected ? 'bg-[#38809822]' : 'hover:bg-[#F1F4F5]'
                    }`}>
                    <Text className="font-sans text-sm text-[#000000]" numberOfLines={1}>
                      {getLabel(item)}
                    </Text>
                    {subLabel && (
                      <Text className="font-sans text-xs text-secondary" numberOfLines={1}>
                        {subLabel}
                      </Text>
                    )}
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

export default function DayTimeline({
  date,
  doctors,
  onAddSlot,
  onRemoveEvent,
  onMoveEvent,
  onUpdateEvent,
  onSelectDate,
  viewMode,
  onViewModeChange,
  calendarOpen,
  onCalendarOpenChange,
  doctorSelect,
  knownPatients,
  allDoctors,
  onFindAvailableSlots,
}: DayTimelineProps) {
  const [now, setNow] = useState(() => new Date());
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [slotForm, setSlotForm] = useState<SlotFormState | null>(null);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formReason, setFormReason] = useState('');
  const [patientResults, setPatientResults] = useState<{ name: string; phone: string }[] | null>(
    null
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveConfirm, setMoveConfirm] = useState<{
    id: string;
    reason: string;
    patientName: string;
    fromMinutes: number;
    toMinutes: number;
  } | null>(null);
  const [quickBookOpen, setQuickBookOpen] = useState(false);
  const [quickMode, setQuickMode] = useState<'specialty' | 'doctor'>('specialty');
  const [quickSpecialty, setQuickSpecialty] = useState('');
  const [quickDoctorId, setQuickDoctorId] = useState('');
  const [quickServiceId, setQuickServiceId] = useState('');
  const [quickResults, setQuickResults] = useState<AvailableDaySlots[] | null>(null);
  const [quickSelectedDate, setQuickSelectedDate] = useState<Date | null>(null);
  const [quickSelectedSlot, setQuickSelectedSlot] = useState<AvailableSlotEntry | null>(null);
  const [syncedDate, setSyncedDate] = useState(date);
  const verticalScrollRef = useRef<ScrollView>(null);
  const headerScrollRef = useRef<ScrollView>(null);
  const bodyScrollRef = useRef<ScrollView>(null);
  const calendarRef = useDropdown(calendarOpen, onCalendarOpenChange);
  const patientResultsRef = useDropdown(patientResults !== null, (open) => {
    if (!open) {
      setPatientResults(null);
    }
  });

  if (date !== syncedDate) {
    setSyncedDate(date);
    setScrollX(0);
  }

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const rangeStartMinutes = START_HOUR * 60;
  const rangeEndMinutes = END_HOUR * 60;

  useEffect(() => {
    bodyScrollRef.current?.scrollTo({ x: 0, animated: false });
    headerScrollRef.current?.scrollTo({ x: 0, animated: false });

    const current = new Date();
    if (!isSameDay(date, current)) {
      verticalScrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const currentMinutes = current.getHours() * 60 + current.getMinutes();
    if (currentMinutes < rangeStartMinutes || currentMinutes >= rangeEndMinutes) {
      verticalScrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }
    const offset = ((currentMinutes - rangeStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT;
    verticalScrollRef.current?.scrollTo({ y: Math.max(offset - SLOT_HEIGHT * 4, 0), animated: false });
  }, [date, rangeStartMinutes, rangeEndMinutes]);

  const dayLabel = date.toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine =
    isSameDay(date, now) && nowMinutes >= rangeStartMinutes && nowMinutes < rangeEndMinutes;
  const nowOffset = ((nowMinutes - rangeStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT;

  const columnCount = doctors.length;
  const columnWidth = containerWidth / Math.max(Math.min(columnCount, MAX_VISIBLE_COLUMNS), 1);
  const totalContentWidth = columnWidth * columnCount;
  const canScrollHorizontally = columnCount > MAX_VISIBLE_COLUMNS;
  const isScrolledToEnd = scrollX >= totalContentWidth - containerWidth - 4;
  const showScrollHint = canScrollHorizontally && containerWidth > 0 && !isScrolledToEnd;

  const handleBodyScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = event.nativeEvent.contentOffset.x;
    setScrollX(x);
    headerScrollRef.current?.scrollTo({ x, animated: false });
  };

  const resetPatientFormFields = () => {
    setFormName('');
    setFormPhone(formatPhoneUA(''));
    setFormReason('');
    setConfirmDelete(false);
    setPatientResults(null);
  };

  const handleSlotSelected = (doctorId: string, startMinutes: number, durationMinutes: number) => {
    const doctor = doctors.find((item) => item.doctorId === doctorId);
    setSlotForm({
      mode: 'create',
      doctorId,
      doctorLabel: doctor?.doctorLabel ?? '',
      color: doctor?.color ?? '#388098',
      startMinutes,
      durationMinutes,
    });
    resetPatientFormFields();
  };

  const handleEventSelected = (
    event: LaidOutAppointment,
    doctorId: string,
    doctorLabel: string
  ) => {
    setSlotForm({
      mode: 'edit',
      id: event.id,
      doctorId,
      doctorLabel,
      color: event.color,
      startMinutes: event.startMinutes,
      durationMinutes: event.durationMinutes,
    });
    setFormName(event.title);
    setFormPhone(formatPhoneUA(event.phone ?? ''));
    setFormReason(event.reason);
    setConfirmDelete(false);
    setPatientResults(null);
  };

  const canSubmitForm =
    formName.trim().length > 0 && formPhone.replace(/\D/g, '').length > 2;

  const handleSearchPatients = (phoneValue: string = formPhone) => {
    const digits = phoneValue.replace(/\D/g, '');
    if (digits.length <= 2) {
      setPatientResults([]);
      return;
    }
    const matches = knownPatients.filter((patient) =>
      patient.phone.replace(/\D/g, '').includes(digits)
    );
    setPatientResults(matches);
  };

  const handleSelectPatient = (patient: { name: string; phone: string }) => {
    setFormName(patient.name);
    setFormPhone(formatPhoneUA(patient.phone));
    setPatientResults(null);
  };

  const specialties = Array.from(new Set(allDoctors.map((doctor) => doctor.specialty))).sort(
    (a, b) => a.localeCompare(b, 'uk')
  );

  const anyDoctorOption: QuickBookDoctor = {
    id: ANY_DOCTOR_ID,
    label: 'Будь-який доступний лікар',
    color: '#9AA0A6',
    specialty: quickSpecialty,
    services: [],
  };
  const quickDoctorOptions: QuickBookDoctor[] = quickSpecialty
    ? [anyDoctorOption, ...allDoctors.filter((doctor) => doctor.specialty === quickSpecialty)]
    : [];
  const selectedQuickDoctor =
    quickDoctorOptions.find((doctor) => doctor.id === quickDoctorId) ?? null;
  const selectedQuickDirectDoctor =
    allDoctors.find((doctor) => doctor.id === quickDoctorId) ?? null;
  const specialtyDoctors = allDoctors.filter((doctor) => doctor.specialty === quickSpecialty);

  // The pool of doctors to search for slots, and the services offered across that pool.
  const quickServiceDoctorIds: string[] =
    quickMode === 'doctor'
      ? selectedQuickDirectDoctor
        ? [selectedQuickDirectDoctor.id]
        : []
      : quickDoctorId === ''
        ? []
        : quickDoctorId === ANY_DOCTOR_ID
          ? specialtyDoctors.map((doctor) => doctor.id)
          : [quickDoctorId];
  const quickServiceOptions: QuickBookService[] =
    quickMode === 'doctor'
      ? selectedQuickDirectDoctor?.services ?? []
      : quickDoctorId === ANY_DOCTOR_ID
        ? aggregateServices(specialtyDoctors)
        : selectedQuickDoctor?.services ?? [];
  const selectedQuickService =
    quickServiceOptions.find((service) => service.id === quickServiceId) ?? null;
  const selectedQuickDay =
    quickResults && quickSelectedDate
      ? quickResults.find((day) => isSameDay(day.date, quickSelectedDate)) ?? null
      : null;
  const quickDoctorsWithSlots: { doctor: QuickBookDoctor | undefined; slots: AvailableSlotEntry[] }[] =
    [];
  if (selectedQuickDay) {
    const order: string[] = [];
    const byDoctor = new Map<string, AvailableSlotEntry[]>();
    for (const slot of selectedQuickDay.slots) {
      if (!byDoctor.has(slot.doctorId)) {
        byDoctor.set(slot.doctorId, []);
        order.push(slot.doctorId);
      }
      byDoctor.get(slot.doctorId)!.push(slot);
    }
    for (const doctorId of order) {
      quickDoctorsWithSlots.push({
        doctor: allDoctors.find((item) => item.id === doctorId),
        slots: byDoctor.get(doctorId)!,
      });
    }
  }

  const handleOpenQuickBook = () => {
    setQuickMode('specialty');
    setQuickSpecialty('');
    setQuickDoctorId('');
    setQuickServiceId('');
    setQuickResults(null);
    setQuickSelectedDate(null);
    setQuickSelectedSlot(null);
    setQuickBookOpen(true);
  };

  const handleQuickModeChange = (mode: 'specialty' | 'doctor') => {
    setQuickMode(mode);
    setQuickSpecialty('');
    setQuickDoctorId('');
    setQuickServiceId('');
    setQuickResults(null);
    setQuickSelectedDate(null);
    setQuickSelectedSlot(null);
  };

  const handleQuickSpecialtySelected = (specialty: string) => {
    setQuickSpecialty(specialty);
    setQuickSelectedDate(null);
    setQuickSelectedSlot(null);
    setQuickServiceId('');
    setQuickDoctorId(ANY_DOCTOR_ID);
    // Wait for a service to be picked so the search uses its real duration.
    setQuickResults(null);
  };

  const handleQuickDoctorSelected = (doctor: QuickBookDoctor) => {
    setQuickDoctorId(doctor.id);
    setQuickSelectedDate(null);
    setQuickSelectedSlot(null);
    setQuickServiceId('');
    setQuickResults(null);
  };

  const handleQuickDirectDoctorSelected = (doctor: QuickBookDoctor) => {
    setQuickDoctorId(doctor.id);
    setQuickSelectedDate(null);
    setQuickSelectedSlot(null);
    setQuickServiceId('');
    setQuickResults(null);
  };

  const handleQuickServiceSelected = (service: QuickBookService) => {
    setQuickServiceId(service.id);
    setQuickSelectedSlot(null);
    if (quickServiceDoctorIds.length > 0) {
      const results = onFindAvailableSlots(quickServiceDoctorIds, service.durationMinutes);
      setQuickResults(results);
      setQuickSelectedDate(results.length > 0 ? results[0].date : null);
    } else {
      setQuickResults(null);
      setQuickSelectedDate(null);
    }
  };

  const handleQuickSlotSelected = (date: Date, slot: AvailableSlotEntry) => {
    const doctor = allDoctors.find((item) => item.id === slot.doctorId);
    onSelectDate(date);
    setQuickBookOpen(false);
    setSlotForm({
      mode: 'create',
      doctorId: slot.doctorId,
      doctorLabel: doctor?.label ?? '',
      color: doctor?.color ?? '#388098',
      startMinutes: slot.startMinutes,
      durationMinutes: selectedQuickService?.durationMinutes ?? SLOT_MINUTES,
    });
    resetPatientFormFields();
    if (selectedQuickService) {
      setFormReason(selectedQuickService.name);
    }
  };

  const handleQuickCreate = () => {
    if (!quickSelectedDate || !selectedQuickDay) {
      return;
    }
    const slot = quickSelectedSlot ?? selectedQuickDay.slots[0];
    if (!slot) {
      return;
    }
    handleQuickSlotSelected(quickSelectedDate, slot);
  };

  const handleSelectFormStart = (value: number) => {
    setSlotForm((current) =>
      current ? { ...current, startMinutes: value, durationMinutes: SLOT_MINUTES } : current
    );
  };

  const handleSelectFormEnd = (value: number) => {
    setSlotForm((current) =>
      current ? { ...current, durationMinutes: value - current.startMinutes } : current
    );
  };

  const formProcedureOptions =
    allDoctors.find((doctor) => doctor.id === slotForm?.doctorId)?.services ?? [];
  const selectedFormProcedure =
    formProcedureOptions.find((procedure) => procedure.name === formReason) ?? null;

  const handleFormProcedureSelected = (procedure: QuickBookService) => {
    setFormReason(procedure.name);
    setSlotForm((current) =>
      current ? { ...current, durationMinutes: procedure.durationMinutes } : current
    );
  };

  const handleSubmitForm = () => {
    if (!slotForm || !canSubmitForm) {
      return;
    }
    if (slotForm.mode === 'create') {
      onAddSlot(
        slotForm.doctorId,
        slotForm.startMinutes,
        slotForm.durationMinutes,
        formName.trim(),
        formPhone.trim(),
        formReason.trim()
      );
    } else if (slotForm.id) {
      onUpdateEvent(slotForm.id, {
        title: formName.trim(),
        phone: formPhone.trim(),
        reason: formReason.trim(),
        startMinutes: slotForm.startMinutes,
        durationMinutes: slotForm.durationMinutes,
      });
    }
    setSlotForm(null);
  };

  const handleDeleteForm = () => {
    if (slotForm?.id) {
      onRemoveEvent(slotForm.id);
    }
    setConfirmDelete(false);
    setSlotForm(null);
  };

  const handleModalClose = () => {
    if (confirmDelete) {
      setConfirmDelete(false);
      return;
    }
    setSlotForm(null);
  };

  const handleConfirmMove = () => {
    if (moveConfirm) {
      onMoveEvent(moveConfirm.id, moveConfirm.toMinutes);
    }
    setMoveConfirm(null);
  };

  const handleCancelMove = () => {
    setMoveConfirm(null);
  };

  return (
    <View className="flex-1">
      <View className="relative z-30 h-14 flex-row items-center gap-3 border-b-1 border-b-[#E1E1E1] bg-white px-6">
        <View ref={calendarRef} className="relative h-14 justify-center">
          <Pressable
            onPress={() => onCalendarOpenChange(!calendarOpen)}
            className="cursor-pointer flex-row items-center gap-2 rounded-lg border-1 border-[#E1E1E1] bg-[#E1E1E133] px-4 py-2">
            <Ionicons name="calendar-outline" size={16} color="#636976" />
            <Text
              className="font-sans text-sm font-semibold capitalize text-black"
              numberOfLines={1}>
              {dayLabel}
            </Text>
          </Pressable>

          {calendarOpen && (
            <View className="absolute top-14 left-0 z-30 w-80 rounded-lg border border-[#E1E1E1] bg-white p-4">
              <MonthCalendar
                selectedDate={date}
                onSelectDate={(selected) => {
                  onSelectDate(selected);
                  onCalendarOpenChange(false);
                }}
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
              />
              <Pressable
                onPress={() => {
                  onSelectDate(new Date());
                  onCalendarOpenChange(false);
                }}
                className="mt-3 w-fit cursor-pointer items-center justify-center self-start rounded-full border-1 border-[#E1E1E1] bg-[#E1E1E133] px-6 py-2">
                <Text className="font-sans text-sm font-medium text-black">Сьогодні</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Pressable
          onPress={handleOpenQuickBook}
          className="cursor-pointer flex-row items-center gap-2 rounded-lg bg-[#3C8D7A] px-4 py-2">
          <Ionicons name="flash-outline" size={16} color="#FFFFFF" />
          <Text className="font-sans text-sm font-semibold text-white" numberOfLines={1}>
            Швидкий запис
          </Text>
        </Pressable>

        <View className="flex-1" />

        <DoctorSelect
          doctors={doctorSelect.doctors}
          allId={doctorSelect.allId}
          allSelected={doctorSelect.allSelected}
          selectedIds={doctorSelect.selectedIds}
          onChangeSelected={doctorSelect.onChangeSelected}
          onToggleAll={doctorSelect.onToggleAll}
          open={doctorSelect.open}
          onOpenChange={doctorSelect.onOpenChange}
        />
      </View>

      <View className="flex-row px-6 pt-2" style={{ height: COLUMN_HEADER_HEIGHT + 8 }}>
        <View className="w-14" />
        <View
          className="relative flex-1"
          onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
          {containerWidth > 0 && (
            <ScrollView
              ref={headerScrollRef}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}>
              <View className="flex-row" style={{ width: totalContentWidth }}>
                {doctors.map((doctor) => (
                  <View
                    key={doctor.doctorId}
                    className="items-center justify-center border-b-1 border-b-[#E1E1E1] px-1"
                    style={{ width: columnWidth, height: COLUMN_HEADER_HEIGHT }}>
                    <Text className="font-sans text-xs font-semibold text-[#000000]" numberOfLines={1}>
                      {doctor.doctorLabel}
                    </Text>
                    {doctor.specialty && (
                      <Text className="font-sans text-[10px] text-secondary" numberOfLines={1}>
                        {doctor.specialty}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          {showScrollHint && (
            <View
              pointerEvents="none"
              className="absolute right-0 top-0 flex-row items-center gap-1 rounded-lg bg-white/90 px-2"
              style={{ height: COLUMN_HEADER_HEIGHT }}>
              <Text className="font-sans text-[11px] text-secondary">Далі</Text>
              <Ionicons name="chevron-forward" size={12} color="#636976" />
            </View>
          )}
        </View>
      </View>

      <ScrollView ref={verticalScrollRef} className="flex-1 py-6">
        <View className="flex-row px-6 py-2">
          <View className="w-14">
            {SLOTS.map((slot) => (
              <View key={slot.minutes} className="pt-0.5" style={{ height: SLOT_HEIGHT }}>
                {slot.minute === 0 && (
                  <Text className="-mt-2.5 font-sans text-xs text-secondary">
                    {formatTime(slot.hour, slot.minute)}
                  </Text>
                )}
              </View>
            ))}
          </View>

          <View className="relative flex-1">
            {containerWidth > 0 && (
              <ScrollView
                ref={bodyScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                onScroll={handleBodyScroll}
                scrollEventThrottle={16}>
                <View className="relative flex-row" style={{ width: totalContentWidth, height: SLOTS.length * SLOT_HEIGHT }}>
                  {showNowLine && (
                    <View
                      className="absolute left-1 right-0 z-10 flex-row items-center"
                      style={{ top: nowOffset }}>
                      <View className="-ml-1 h-2 w-2 rounded-full bg-red-700" />
                      <View className="h-[2px] flex-1 bg-red-700" />
                    </View>
                  )}

                  {doctors.map((doctor) => {
                    const coveredMinutes = new Set<number>();
                    for (const event of doctor.events) {
                      for (
                        let m = event.startMinutes;
                        m < event.startMinutes + event.durationMinutes;
                        m += SLOT_MINUTES
                      ) {
                        coveredMinutes.add(m);
                      }
                    }

                    return (
                      <View key={doctor.doctorId} className="relative" style={{ width: columnWidth }}>
                        <SlotColumn
                          doctorId={doctor.doctorId}
                          color={doctor.color}
                          coveredMinutes={coveredMinutes}
                          onCreateSlot={handleSlotSelected}
                        />

                        {doctor.events.map((event) => {
                          const top =
                            ((event.startMinutes - rangeStartMinutes) / SLOT_MINUTES) * SLOT_HEIGHT;
                          const height = (event.durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT;
                          const hasReason = event.reason.length > 0;
                          const isCompact = event.durationMinutes < 60;
                          const endMinutes = event.startMinutes + event.durationMinutes;
                          const timeRangeLabel = `${formatTime(
                            Math.floor(event.startMinutes / 60),
                            event.startMinutes % 60
                          )}–${formatTime(Math.floor(endMinutes / 60), endMinutes % 60)}`;
                          const accessibilityLabel = [event.title, timeRangeLabel, event.reason || null]
                            .filter(Boolean)
                            .join(', ');

                          return (
                            <TimelineEvent
                              key={event.id}
                              event={event}
                              top={top + 1}
                              height={height - 2}
                              rangeStartMinutes={rangeStartMinutes}
                              rangeEndMinutes={rangeEndMinutes}
                              accessibilityLabel={accessibilityLabel}
                              tooltip={hasReason ? event.reason : undefined}
                              confirmPending={moveConfirm?.id === event.id}
                              onPress={() =>
                                handleEventSelected(event, doctor.doctorId, doctor.doctorLabel)
                              }
                              onMove={(newStartMinutes) =>
                                setMoveConfirm({
                                  id: event.id,
                                  reason: event.reason,
                                  patientName: event.title,
                                  fromMinutes: event.startMinutes,
                                  toMinutes: newStartMinutes,
                                })
                              }>
                              {isCompact ? (
                                <View className="flex-row items-center gap-1">
                                  {hasReason && (
                                    <Text
                                      className="font-sans text-xs font-semibold text-[#000000]"
                                      numberOfLines={1}>
                                      {event.reason}
                                    </Text>
                                  )}
                                  <Text
                                    className="flex-1 font-sans text-xs text-[#4B4F58]"
                                    numberOfLines={1}>
                                    {hasReason ? '· ' : ''}
                                    {event.title}
                                  </Text>
                                </View>
                              ) : (
                                <>
                                  {hasReason && (
                                    <Text
                                      className="font-sans text-sm font-semibold leading-[18px] text-[#000000]"
                                      numberOfLines={2}
                                      ellipsizeMode="tail">
                                      {event.reason}
                                    </Text>
                                  )}
                                  <Text className="font-sans text-xs text-[#4B4F58]" numberOfLines={1}>
                                    {event.title}
                                  </Text>
                                </>
                              )}
                            </TimelineEvent>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </ScrollView>

      {doctors.length === 0 && (
        <View className="absolute inset-0 top-14 items-center justify-center">
          <Text className="font-sans text-sm text-secondary">Оберіть лікаря, щоб побачити розклад</Text>
        </View>
      )}

      <Modal
        visible={slotForm !== null}
        transparent
        animationType="fade"
        onRequestClose={handleModalClose}>
        <Pressable
          className="flex-1 cursor-pointer items-center justify-center bg-black/40"
          onPress={handleModalClose}>
          {slotForm && confirmDelete && (
            <Pressable onPress={() => {}} className="w-96 max-w-[90%] rounded-2xl bg-white p-5">
              <View className="mb-4 flex-row items-center gap-2">
                <Ionicons name="warning-outline" size={20} color="#C24545" />
                <Text
                  className="flex-1 font-sans text-lg font-semibold text-[#000000]"
                  numberOfLines={1}>
                  Видалити запис?
                </Text>
                <Pressable onPress={handleModalClose} hitSlop={8} className="cursor-pointer">
                  <Ionicons name="close" size={20} color="#636976" />
                </Pressable>
              </View>

              <Text className="mb-5 font-sans text-sm text-[#4B4F58]">
                Ви точно хочете видалити цей запис? Цю дію неможливо скасувати.
              </Text>

              <View className="gap-2">
                <Pressable
                  onPress={handleDeleteForm}
                  className="cursor-pointer items-center justify-center rounded-lg bg-[#C24545] py-2.5">
                  <Text className="font-sans text-sm font-semibold text-white">Видалити</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmDelete(false)}
                  className="cursor-pointer items-center justify-center rounded-lg bg-[#E1E1E133] py-2.5">
                  <Text className="font-sans text-sm font-semibold text-[#000000]">Скасувати</Text>
                </Pressable>
              </View>
            </Pressable>
          )}

          {slotForm && !confirmDelete && (
            <Pressable onPress={() => {}} className="w-96 max-w-[90%] rounded-2xl bg-white p-5">
              <View className="mb-4 flex-row items-center gap-2">
                <View className="h-3 w-3 rounded-full" style={{ backgroundColor: slotForm.color }} />
                <Text
                  className="flex-1 font-sans text-lg font-semibold text-[#000000]"
                  numberOfLines={1}>
                  {slotForm.mode === 'create' ? 'Новий запис' : 'Редагування запису'}
                </Text>
                <Pressable onPress={handleModalClose} hitSlop={8} className="cursor-pointer">
                  <Ionicons name="close" size={20} color="#636976" />
                </Pressable>
              </View>

              <View className="relative mb-4 gap-2">
                <View className="flex-row items-center gap-2">
                  <Ionicons name="person-outline" size={16} color="#636976" />
                  <Text className="font-sans text-sm text-[#000000]">{slotForm.doctorLabel}</Text>
                </View>
                <View className="flex-row items-center gap-2">
                  <Ionicons name="time-outline" size={16} color="#636976" />
                  <View className="flex-row items-center gap-1">
                    <TimeSelect
                      minutes={slotForm.startMinutes}
                      options={START_TIME_OPTIONS}
                      onChange={handleSelectFormStart}
                    />
                    <Text className="font-sans text-sm text-[#000000]">–</Text>
                    <TimeSelect
                      minutes={slotForm.startMinutes + slotForm.durationMinutes}
                      options={END_TIME_OPTIONS.filter(
                        (value) => value >= slotForm.startMinutes + SLOT_MINUTES
                      )}
                      onChange={handleSelectFormEnd}
                    />
                  </View>
                </View>
              </View>

              <View className="mb-5 gap-3">
                <View ref={patientResultsRef} className="relative z-30 gap-1">
                  <Text className="font-sans text-xs font-medium text-secondary">
                    Номер телефону *
                  </Text>
                  <View className="flex-row items-center gap-2">
                    <TextInput
                      value={formPhone}
                      onChangeText={(text) => {
                        const formatted = formatPhoneUA(text);
                        setFormPhone(formatted);
                        if (formatted.replace(/\D/g, '').length >= PHONE_NATIONAL_DIGITS + 2) {
                          handleSearchPatients(formatted);
                        } else {
                          setPatientResults(null);
                        }
                      }}
                      onSubmitEditing={() => handleSearchPatients()}
                      returnKeyType="search"
                      placeholder="+38 (0XX) XXX-XX-XX"
                      placeholderTextColor="#636976"
                      keyboardType="phone-pad"
                      autoFocus
                      className="flex-1 font-sans rounded-lg border border-[#E1E1E1] px-3 py-2 text-sm text-[#000000] outline-none"
                    />
                    <Pressable
                      onPress={() => handleSearchPatients()}
                      hitSlop={8}
                      accessibilityLabel="Пошук пацієнта за номером телефону"
                      className="cursor-pointer items-center justify-center rounded-lg border border-[#E1E1E1] p-2.5">
                      <Ionicons name="search" size={16} color="#636976" />
                    </Pressable>
                  </View>

                  {patientResults !== null && (
                    <View className="absolute left-0 right-0 top-[60px] z-40 max-h-48 rounded-lg border border-[#E1E1E1] bg-white">
                      <ScrollView className="max-h-48" nestedScrollEnabled>
                        {patientResults.length === 0 ? (
                          <Text className="px-3 py-2 font-sans text-sm text-secondary">
                            Людини не знайдено
                          </Text>
                        ) : (
                          patientResults.map((patient) => (
                            <Pressable
                              key={patient.phone}
                              onPress={() => handleSelectPatient(patient)}
                              className="cursor-pointer px-3 py-2 hover:bg-[#F1F4F5]">
                              <Text
                                className="font-sans text-sm font-medium text-[#000000]"
                                numberOfLines={1}>
                                {patient.name}
                              </Text>
                              <Text className="font-sans text-xs text-secondary" numberOfLines={1}>
                                {patient.phone}
                              </Text>
                            </Pressable>
                          ))
                        )}
                      </ScrollView>
                    </View>
                  )}
                </View>
                <View className="gap-1">
                  <Text className="font-sans text-xs font-medium text-secondary">Ім&apos;я *</Text>
                  <TextInput
                    value={formName}
                    onChangeText={setFormName}
                    placeholder="Ім'я пацієнта"
                    placeholderTextColor="#636976"
                    className="font-sans rounded-lg border border-[#E1E1E1] px-3 py-2 text-sm text-[#000000] outline-none"
                  />
                </View>
                <View className="relative gap-1" style={{ zIndex: 100 }}>
                  <Text className="font-sans text-xs font-medium text-secondary">
                    Процедура
                  </Text>
                  <SearchableSelect
                    items={formProcedureOptions}
                    value={selectedFormProcedure}
                    getKey={(procedure) => procedure.id}
                    getLabel={(procedure) => procedure.name}
                    getSubLabel={(procedure) => `${procedure.durationMinutes} хв`}
                    placeholder="Оберіть процедуру"
                    searchPlaceholder="Пошук процедури"
                    onSelect={handleFormProcedureSelected}
                    dropUp
                  />
                </View>
              </View>

              <View className="gap-2">
                <Pressable
                  disabled={!canSubmitForm}
                  onPress={handleSubmitForm}
                  className={`items-center justify-center rounded-lg py-2.5 ${
                    canSubmitForm ? 'cursor-pointer bg-[#3C8D7A]' : 'cursor-not-allowed bg-[#E1E1E1]'
                  }`}>
                  <Text
                    className={`font-sans text-sm font-semibold ${
                      canSubmitForm ? 'text-white' : 'text-secondary'
                    }`}>
                    {slotForm.mode === 'create' ? 'Створити запис' : 'Зберегти зміни'}
                  </Text>
                </Pressable>

                {slotForm.mode === 'edit' && (
                  <Pressable
                    onPress={() => setConfirmDelete(true)}
                    className="cursor-pointer items-center justify-center rounded-lg bg-[#FDEDED] py-2.5">
                    <Text className="font-sans text-sm font-semibold text-[#C24545]">
                      Видалити запис
                    </Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>

      <Modal
        visible={quickBookOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setQuickBookOpen(false)}>
        <Pressable
          className="flex-1 cursor-pointer items-center justify-center bg-black/40"
          onPress={() => setQuickBookOpen(false)}>
          <Pressable onPress={() => {}} className="w-96 max-w-[90%] rounded-2xl bg-white p-5 pb-2">
            <View className="mb-4 flex-row items-center gap-2">
              <Ionicons name="flash-outline" size={18} color="#3C8D7A" />
              <Text className="flex-1 font-sans text-lg font-semibold text-[#000000]" numberOfLines={1}>
                Швидкий запис
              </Text>
              <Pressable onPress={() => setQuickBookOpen(false)} hitSlop={8} className="cursor-pointer">
                <Ionicons name="close" size={20} color="#636976" />
              </Pressable>
            </View>

            <View className="mb-4 flex-row gap-1 rounded-lg bg-[#F1F4F5] p-1">
              <Pressable
                onPress={() => handleQuickModeChange('specialty')}
                className={`flex-1 cursor-pointer items-center rounded-md py-1.5 ${
                  quickMode === 'specialty' ? 'bg-white' : ''
                }`}>
                <Text
                  className={`font-sans text-sm font-medium ${
                    quickMode === 'specialty' ? 'text-[#000000]' : 'text-secondary'
                  }`}>
                  За спеціальністю
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handleQuickModeChange('doctor')}
                className={`flex-1 cursor-pointer items-center rounded-md py-1.5 ${
                  quickMode === 'doctor' ? 'bg-white' : ''
                }`}>
                <Text
                  className={`font-sans text-sm font-medium ${
                    quickMode === 'doctor' ? 'text-[#000000]' : 'text-secondary'
                  }`}>
                  За лікарем
                </Text>
              </Pressable>
            </View>

            {quickMode === 'specialty' ? (
              <>
                <View className="relative z-30 mb-4">
                  <SearchableSelect
                    items={specialties}
                    value={quickSpecialty || null}
                    getKey={(specialty) => specialty}
                    getLabel={(specialty) => specialty}
                    placeholder="Оберіть спеціальність"
                    searchPlaceholder="Пошук спеціальності"
                    onSelect={handleQuickSpecialtySelected}
                  />
                </View>

                <View className="relative z-20 mb-4">
                  <SearchableSelect
                    items={quickDoctorOptions}
                    value={selectedQuickDoctor}
                    getKey={(doctor) => doctor.id}
                    getLabel={(doctor) => doctor.label}
                    getSubLabel={(doctor) =>
                      doctor.id === ANY_DOCTOR_ID ? undefined : doctor.specialty
                    }
                    placeholder="Оберіть лікаря"
                    searchPlaceholder="Пошук лікаря"
                    onSelect={handleQuickDoctorSelected}
                    disabled={quickSpecialty === ''}
                  />
                </View>
              </>
            ) : (
              <View className="relative z-30 mb-4">
                <SearchableSelect
                  items={allDoctors}
                  value={selectedQuickDirectDoctor}
                  getKey={(doctor) => doctor.id}
                  getLabel={(doctor) => doctor.label}
                  getSubLabel={(doctor) => doctor.specialty}
                  placeholder="Оберіть лікаря"
                  searchPlaceholder="Пошук лікаря"
                  onSelect={handleQuickDirectDoctorSelected}
                  showSubLabelInTrigger
                />
              </View>
            )}

            <View className="relative z-10 mb-4">
              <SearchableSelect
                items={quickServiceOptions}
                value={selectedQuickService}
                getKey={(service) => service.id}
                getLabel={(service) => service.name}
                getSubLabel={(service) => `${service.durationMinutes} хв`}
                placeholder="Оберіть послугу"
                searchPlaceholder="Пошук послуги"
                onSelect={handleQuickServiceSelected}
                disabled={quickServiceDoctorIds.length === 0}
              />
            </View>

            {quickResults !== null && (
              <View className="mb-4 gap-2">
                {quickResults.length === 0 ? (
                  <Text className="px-1 py-2 font-sans text-sm text-secondary">
                    Вільних дат найближчим часом не знайдено
                  </Text>
                ) : (
                  <>
                    <Text className="font-sans text-xs font-medium text-secondary">
                      Доступні дати
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View className="flex-row gap-2">
                        {quickResults.map((day) => {
                          const selected =
                            quickSelectedDate !== null && isSameDay(day.date, quickSelectedDate);
                          return (
                            <Pressable
                              key={day.date.toDateString()}
                              onPress={() => {
                                setQuickSelectedDate(day.date);
                                setQuickSelectedSlot(null);
                              }}
                              className={`cursor-pointer items-center rounded-lg border px-3 py-2 ${
                                selected
                                  ? 'border-[#3C8D7A] bg-[#3C8D7A22]'
                                  : 'border-[#E1E1E1] hover:bg-[#F1F4F5]'
                              }`}>
                              <Text
                                className={`font-sans text-sm font-medium capitalize ${
                                  selected ? 'text-[#3C8D7A]' : 'text-[#000000]'
                                }`}
                                numberOfLines={1}>
                                {day.date.toLocaleDateString('uk-UA', {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short',
                                })}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </>
                )}
              </View>
            )}

            {selectedQuickDay && (
              <View className="mb-4 gap-3">
                <Text className="font-sans text-xs font-medium text-secondary">Доступні години</Text>
                {quickDoctorsWithSlots.map(({ doctor, slots }) => (
                  <View key={doctor?.id ?? 'unknown'} className="gap-1.5">
                    <View className="flex-row items-center gap-2">
                      <View
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: doctor?.color ?? '#388098' }}
                      />
                      <Text className="font-sans text-xs font-medium text-[#000000]" numberOfLines={1}>
                        {doctor?.label}
                      </Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View className="flex-row gap-2">
                        {slots.map((slot) => {
                          const selected =
                            quickSelectedSlot !== null &&
                            quickSelectedSlot.doctorId === slot.doctorId &&
                            quickSelectedSlot.startMinutes === slot.startMinutes;
                          return (
                            <Pressable
                              key={`${slot.doctorId}-${slot.startMinutes}`}
                              onPress={() => setQuickSelectedSlot(slot)}
                              className={`cursor-pointer items-center rounded-lg border px-2.5 py-1.5 ${
                                selected
                                  ? 'border-[#3C8D7A] bg-[#3C8D7A22]'
                                  : 'border-[#E1E1E1] hover:bg-[#F1F4F5]'
                              }`}>
                              <Text
                                className={`font-sans text-xs font-medium ${
                                  selected ? 'text-[#3C8D7A]' : 'text-[#000000]'
                                }`}
                                numberOfLines={1}>
                                {formatTime(Math.floor(slot.startMinutes / 60), slot.startMinutes % 60)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </View>
                ))}
              </View>
            )}

            <Pressable
              disabled={!quickSelectedDate}
              onPress={handleQuickCreate}
              className={`mb-3 mt-5 items-center justify-center rounded-lg py-2.5 ${
                quickSelectedDate ? 'cursor-pointer bg-[#3C8D7A]' : 'cursor-not-allowed bg-[#E1E1E1]'
              }`}>
              <Text
                className={`font-sans text-sm font-semibold ${
                  quickSelectedDate ? 'text-white' : 'text-secondary'
                }`}>
                Створити запис
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={moveConfirm !== null}
        transparent
        animationType="fade"
        onRequestClose={handleCancelMove}>
        <Pressable
          className="flex-1 cursor-pointer items-center justify-center bg-black/40"
          onPress={handleCancelMove}>
          {moveConfirm && (
            <Pressable onPress={() => {}} className="w-96 max-w-[90%] rounded-2xl bg-white p-5">
              <View className="mb-4 flex-row items-center gap-2">
                <Ionicons name="swap-vertical-outline" size={20} color="#3C8D7A" />
                <Text
                  className="flex-1 font-sans text-lg font-semibold text-[#000000]"
                  numberOfLines={1}>
                  Перемістити запис?
                </Text>
                <Pressable onPress={handleCancelMove} hitSlop={8} className="cursor-pointer">
                  <Ionicons name="close" size={20} color="#636976" />
                </Pressable>
              </View>

              <Text className="mb-1 font-sans text-sm font-medium text-[#000000]" numberOfLines={1}>
                {moveConfirm.reason || 'Без опису'} · {moveConfirm.patientName}
              </Text>
              <Text className="mt-2 mb-1 font-sans text-sm text-[#4B4F58]">
                Старий час:{' '}
                {formatTime(
                  Math.floor(moveConfirm.fromMinutes / 60),
                  moveConfirm.fromMinutes % 60
                )}
              </Text>

              <Text className="mb-5 font-sans text-sm text-[#4B4F58]">
                Новий час: {formatTime(Math.floor(moveConfirm.toMinutes / 60), moveConfirm.toMinutes % 60)}
              </Text>

              <View className="gap-2">
                <Pressable
                  onPress={handleConfirmMove}
                  className="cursor-pointer items-center justify-center rounded-lg bg-[#3C8D7A] py-2.5">
                  <Text className="font-sans text-sm font-semibold text-white">Перемістити</Text>
                </Pressable>
                <Pressable
                  onPress={handleCancelMove}
                  className="cursor-pointer items-center justify-center rounded-lg bg-[#E1E1E133] py-2.5">
                  <Text className="font-sans text-sm font-semibold text-[#000000]">Скасувати</Text>
                </Pressable>
              </View>
            </Pressable>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}
