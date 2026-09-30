import { Link, usePathname } from 'expo-router';
import { LayoutGrid, Mail, Search, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

const INACTIVE_COLOR = '#636976';

export const SIDEBAR_SECTIONS = [
  {
    label: 'Головна',
    items: [
      { label: 'Запис', icon: LayoutGrid, href: '/' },
    ],
  },
  {
    label: 'Команда',
    items: [
      { label: 'Лікарі', icon: Users, href: '/team' },
      { label: 'Запрошення', icon: Mail, href: '/invites' },
    ],
  },
] as const;

export const SIDEBAR_ITEMS = SIDEBAR_SECTIONS.flatMap(
  (section): readonly { label: string; href: string }[] => section.items
);

export default function Sidebar() {
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();

  const visibleSections = SIDEBAR_SECTIONS.map((section) => ({
    label: section.label,
    items: section.items.filter((item) => item.label.toLowerCase().includes(normalizedQuery)),
  })).filter((section) => section.items.length > 0);

  return (
    <View className="h-full w-full gap-2 border-r-1 border-r-[#E1E1E1] bg-white pb-4 md:w-56">
      <View className="h-16 mb-3 px-7 border-b-1 border-b-[#E1E1E1]">
        <View className="flex-row items-center gap-3 h-full">
          <Search size={18} color="#00000099" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Пошук"
            placeholderTextColor={INACTIVE_COLOR}
            className="font-sans h-full flex-1 text-[1rem] text-[#000000] outline-none placeholder:text-[#00000066]"
          />
        </View>
      </View>

      {visibleSections.map((section) => (
        <View key={section.label} className="mb-1 pl-3 pr-3">
          <Text className="font-sans px-4 pb-2 text-[0.8rem] text-[#888888]">{section.label}</Text>

          <View className="gap-1">
            {section.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link key={item.label} href={item.href} asChild>
                  <Pressable
                    className={`group/button
                      h-10 flex-row items-center gap-3 rounded-lg border-[1.5px] border-transparent px-4 duration-100
                      ${active ? 'bg-[#38809811]' : 'hover:bg-[#38809811]'}`}>
                    <Icon size={18} color={active ? '#388098' : INACTIVE_COLOR} />
                    <Text
                      className={`
                        font-sans text-md font-medium
                        ${active ? 'text-[#000000]' : 'text-[#636976] group-hover/button:text-black'}`}>
                      {item.label}
                    </Text>
                  </Pressable>
                </Link>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
