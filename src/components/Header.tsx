import { Top } from '@toss/tds-mobile';

export function Header() {
  return (
    <Top
      title={<Top.TitleParagraph size={22}>찮은형의 국장은 지금</Top.TitleParagraph>}
      lowerGap={16}
    />
  );
}
