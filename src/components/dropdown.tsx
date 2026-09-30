import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useDropdown } from '@/hooks/use-dropdown';

type DropdownOption<T extends string> = {
  value: T;
  label: string;
};

type DropdownProps<T extends string> = {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function Dropdown<T extends string>({
  value,
  options,
  onChange,
  open,
  onOpenChange,
}: DropdownProps<T>) {
  const selected = options.find((option) => option.value === value);
  const containerRef = useDropdown(open, onOpenChange);

  return (
    <View ref={containerRef} className="h-14 relative z-30 ">
      <Pressable
        onPress={() => onOpenChange(!open)}
        className="h-full flex-row items-center gap-2 px-6 -mr-6">
        <Text className="font-sans text-sm font-medium text-[#000000]">{selected?.label}</Text>
        {open ? (
          <ChevronUp size={14} color="#636976" />
        ) : (
          <ChevronDown size={14} color="#636976" />
        )}
      </Pressable>

      {open && (
        <View className="absolute top-13 right-0 w-30 border border-[#E1E1E1] bg-white">
          {options.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                onChange(option.value);
                onOpenChange(false);
              }}
              className={`px-6 py-2 ${
                option.value === value ? 'bg-[#38809822]' : 'hover:bg-[#F1F4F5]'
              }`}>
              <Text className="font-sans text-sm text-[#000000]">{option.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
