import { CategoryIcon } from "@/components/signals/category-badge";
import { SignalCategory } from "@/components/signals/signal-types";

export function SignalIcon({
  category
}: {
  name: string;
  category: SignalCategory;
}) {
  return <CategoryIcon category={category} />;
}
