import { Tab } from '@toss/tds-mobile';
import type { MarketTab } from '../types/market';

interface TabSwitchProps {
  selected: MarketTab;
  onChange: (tab: MarketTab) => void;
}

const TABS: MarketTab[] = ['KOSPI', 'KOSDAQ'];

export function TabSwitch({ selected, onChange }: TabSwitchProps) {
  const selectedIndex = TABS.indexOf(selected);

  return (
    <Tab
      size="large"
      onChange={(index) => onChange(TABS[index])}
      ariaLabel="시장 선택"
    >
      {TABS.map((tab, index) => (
        <Tab.Item key={tab} selected={selectedIndex === index}>
          {tab}
        </Tab.Item>
      ))}
    </Tab>
  );
}
